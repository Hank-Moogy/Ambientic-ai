import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { visibleUserText } from '../shared/conversation-messages.mjs'
import { stripAmbienticContext } from './context-assembler.mjs'

// Claude Code's JSONL transcript is a machine log, not a conversation. Roughly
// nine out of ten rows typed `user` were never typed by the user: tool results,
// hook output, system reminders, Ambientic's own injected context capsule, and
// the "continue" nudges Claude writes to itself. Rendering those as the user's
// own messages is what makes an Ambientic thread read as noise.
//
// This module is the single place that decides what a Claude row becomes:
//   conversation — the user's real prompts and Claude's prose (always shown)
//   activity     — tool calls with their results and thinking (collapsed)
//   nothing      — machinery the user has no reason to read
// Pure and dependency-light so the mapping is directly testable.

const TITLE_LIMIT = 120
const OUTPUT_LIMIT = 4000
const TRANSCRIPT_LIMIT = 300

// Wrapper tags Claude and its hooks write into `user` rows. Text made up
// entirely of these is plumbing; text that merely contains one keeps the human
// part and drops the tag.
const MACHINE_BLOCKS = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<task-notification>[\s\S]*?<\/task-notification>/g,
  /<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g,
  /<command-name>[\s\S]*?<\/command-name>/g,
  /<command-message>[\s\S]*?<\/command-message>/g,
  /<command-args>[\s\S]*?<\/command-args>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g
]

function textContent (value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .filter((part) => !part?.type || part.type === 'text')
    .map((part) => (typeof part === 'string' ? part : part?.text || ''))
    .filter(Boolean)
    .join('\n')
}

function shortPath (value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const home = homedir()
  const tidy = text.startsWith(home) ? `~${text.slice(home.length)}` : text
  const parts = tidy.split('/').filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : tidy
}

function clip (value, limit = TITLE_LIMIT) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

// One human-readable line describing what a tool call is doing. Used both for
// approval cards ("do you allow this?") and for collapsed activity rows ("what
// did it just do?") so the same action is named the same way in both places.
export function describeToolCall (toolName, toolInput = {}) {
  const name = String(toolName || '').trim()
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const files = Array.isArray(input.edits) ? input.edits.length : 0
  switch (name) {
    case 'Bash':
    case 'BashOutput':
      // Claude supplies its own short `description` for Bash; prefer it and keep
      // the command itself for the detail line beneath the title.
      return clip(input.description ? `Run: ${input.description}` : `Run: ${input.command || 'a shell command'}`)
    case 'Edit':
      return clip(`Edit ${shortPath(input.file_path)}${files > 1 ? ` (${files} changes)` : ''}`)
    case 'MultiEdit':
      return clip(`Edit ${shortPath(input.file_path)}${files ? ` (${files} changes)` : ''}`)
    case 'Write':
      return clip(`Write ${shortPath(input.file_path)}`)
    case 'NotebookEdit':
      return clip(`Edit notebook ${shortPath(input.notebook_path || input.file_path)}`)
    case 'Read':
      return clip(`Read ${shortPath(input.file_path)}`)
    case 'Glob':
      return clip(`Find files matching ${input.pattern || ''}`)
    case 'Grep':
      return clip(`Search for ${input.pattern || ''}${input.path ? ` in ${shortPath(input.path)}` : ''}`)
    case 'WebFetch': {
      let host = ''
      try { host = new URL(String(input.url)).hostname } catch { host = String(input.url || '') }
      return clip(`Fetch ${host}`)
    }
    case 'WebSearch':
      return clip(`Web search: ${input.query || ''}`)
    case 'Task':
      return clip(`Run ${input.subagent_type || 'an'} agent: ${input.description || ''}`)
    case 'KillShell':
      return clip('Stop a running shell')
    case 'TodoWrite':
      return clip('Update the task list')
    default:
      break
  }
  // MCP tools arrive as mcp__<server>__<tool>; surface both halves plainly.
  const mcp = name.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/)
  if (mcp) return clip(`${mcp[1]}: ${mcp[2].replace(/_/g, ' ')}`)
  // Unknown tool: fall back to the name plus the most identifying input value.
  const hint = input.command || input.file_path || input.path || input.url || input.query || input.pattern
  if (name && hint) return clip(`${name}: ${typeof hint === 'string' ? hint : ''}`)
  return clip(name || 'Claude Code tool')
}

// The second line of an expanded activity row: the exact thing that ran, when
// the title had to paraphrase it. Empty when the title already says everything.
export function describeToolDetail (toolName, toolInput = {}) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  switch (String(toolName || '')) {
    case 'Bash':
    case 'BashOutput':
      return input.description ? String(input.command || '') : ''
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return String(input.file_path || '')
    case 'Task':
      return String(input.prompt || '')
    default:
      return ''
  }
}

// Which glyph the collapsed row wears. Kept coarse on purpose: readers scan for
// "did it touch my files?" far more than for the exact tool.
export function toolGlyph (toolName) {
  const name = String(toolName || '')
  if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name)) return 'files'
  if (['Bash', 'BashOutput', 'KillShell'].includes(name)) return 'command'
  if (['WebFetch', 'WebSearch'].includes(name)) return 'web'
  if (['Read', 'Glob', 'Grep'].includes(name)) return 'read'
  if (name === 'Task') return 'agent'
  return 'tool'
}

function toolResultText (content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part?.type === 'text') return part.text || ''
      if (part?.type === 'image') return '[image]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function trimOutput (value) {
  const text = String(value || '').replace(/\s+$/, '')
  if (text.length <= OUTPUT_LIMIT) return text
  return `${text.slice(0, OUTPUT_LIMIT)}\n… (${text.length - OUTPUT_LIMIT} more characters)`
}

// True when this `user` row is Claude talking to itself rather than the person.
export function isSyntheticUserRow (row) {
  if (!row || row.type !== 'user') return false
  if (row.isMeta || row.isSidechain || row.isCompactSummary || row.isVisibleInTranscriptOnly) return true
  const content = row.message?.content
  return !conversationalText(content)
}

// The part of a `user` row an actual person typed, with injected context,
// system reminders, and hook output removed.
export function conversationalText (content) {
  let text = stripAmbienticContext(textContent(content))
  for (const pattern of MACHINE_BLOCKS) text = text.replace(pattern, '')
  return visibleUserText(text)
}

function entry (role, text, extra = {}) {
  return { id: extra.id || randomUUID(), role, text: String(text || ''), ...extra }
}

// Turn one assistant content part into a rendered entry, or null to drop it.
export function assistantPartMessage (part, { uuid = '' } = {}) {
  if (part?.type === 'text' && part.text?.trim()) return entry('assistant', part.text, { id: uuid ? `${uuid}:text` : undefined })
  if (part?.type === 'thinking' && String(part.thinking || '').trim()) {
    return entry('activity', part.thinking, { id: uuid ? `${uuid}:thinking` : undefined, kind: 'reasoning', title: 'Thought about this', status: 'done' })
  }
  if (part?.type === 'tool_use') {
    const files = [part.input?.file_path, part.input?.path, part.input?.notebook_path].filter(Boolean)
    return entry('activity', '', {
      id: part.id,
      kind: toolGlyph(part.name),
      tool: part.name || 'Tool',
      title: describeToolCall(part.name, part.input),
      detail: describeToolDetail(part.name, part.input),
      files,
      status: 'running'
    })
  }
  return null
}

// Fold a tool_result back onto the activity row for the call it answers, so one
// collapsed row carries both "what ran" and "what came back".
function applyToolResult (byToolId, part, row) {
  const target = byToolId.get(part?.tool_use_id)
  if (!target) return
  const failed = Boolean(part.is_error || row?.toolUseResult?.is_error)
  target.text = trimOutput(toolResultText(part.content))
  target.status = failed ? 'failed' : 'done'
}

// Map raw transcript rows to the entries Ambientic renders. `rows` is the
// parsed JSONL in file order.
export function claudeTranscriptMessages (rows) {
  const output = []
  const byToolId = new Map()
  for (const row of rows || []) {
    if (!row || row.isSidechain) continue
    if (row.type === 'user') {
      const content = row.message?.content
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type === 'tool_result') applyToolResult(byToolId, part, row)
        }
      }
      if (isSyntheticUserRow(row)) continue
      output.push(entry('user', conversationalText(content), { id: row.uuid }))
    } else if (row.type === 'assistant') {
      for (const part of row.message?.content || []) {
        const item = assistantPartMessage(part, { uuid: row.uuid })
        if (!item) continue
        if (item.role === 'activity' && item.kind !== 'reasoning') byToolId.set(part.id, item)
        output.push(item)
      }
    }
  }
  // Keep the tail: a long thread's beginning is history, its end is the work.
  return output.slice(-TRANSCRIPT_LIMIT)
}

export function parseClaudeTranscript (contents) {
  const rows = []
  for (const line of String(contents || '').split('\n')) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { continue }
  }
  return claudeTranscriptMessages(rows)
}
