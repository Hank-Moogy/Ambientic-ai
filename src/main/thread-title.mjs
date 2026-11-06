// One thread-naming rule for every provider.
//
// Claude, Codex CLI, Codex Desktop and Hermes each hand Ambientic a different
// raw string for "what is this thread about": a transcript row, a thread
// preview, a database column. All of them can carry machinery the user never
// typed — injected context capsules, system reminders, slash-command wrappers,
// hook output, or a tool result that happens to be the first user-role row.
// Naming a thread after that machinery is what makes the sidebar read like a
// stack trace, so every provider path funnels its raw value through
// `threadTitle` and falls back to something human when nothing survives.

const CONTEXT_BLOCK = /<(?:ambientic|agentbase)-context\b[^>]*>[\s\S]*?<\/(?:ambientic|agentbase)-context>\s*/gi
// Paired tags with a matching name: <system-reminder>…</system-reminder>,
// <command-name>…</command-name>, <local-command-stdout>…</local-command-stdout>.
const TAGGED_BLOCK = /<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>\s*/gi
const LOOSE_TAG = /<\/?[a-z][\w-]*\b[^>]*>/gi
// Claude Code's local-command preamble is plain prose, so no tag strip catches it.
const CAVEAT = /^\s*caveat:[\s\S]*?do not respond to these messages\.?/i
const SLASH_ONLY = /^\/[\w:-]*(?:\s+[\w:-]+)?$/
const BUILTIN_COMMAND = /^\/?(?:clear|compact|help|init|resume|exit|quit|cost|status|login|logout)$/i

const TITLE_LIMIT = 80
// Below this a candidate is too short to identify a thread, so the next
// sentence is pulled in alongside it.
const MIN_TITLE_LENGTH = 12

// Content parts that represent something the user actually typed. A
// `tool_result` part lives on a user-role row but holds raw command output, and
// its payload sits in `content` rather than `text` — reading that field is what
// turns a resumed session's name into a JSON blob.
export function promptText (content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part?.type && part.type !== 'text') return ''
      return typeof part?.text === 'string' ? part.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

// True when a transcript row is a genuine user prompt rather than a tool
// result, a compaction seed, or an internal bookkeeping row.
export function isUserPromptRow (row) {
  if (row?.type !== 'user') return false
  if (row.isMeta || row.isCompactSummary || row.isVisibleInTranscriptOnly) return false
  if (row.toolUseResult !== undefined) return false
  const content = row.message?.content
  if (Array.isArray(content) && content.some((part) => part?.type === 'tool_result')) return false
  return true
}

// Machine output that would read as gibberish in the thread list.
function looksLikeMachineOutput (value) {
  if (/^[[{]/.test(value)) return true
  if (/^(?:diff --git|--- |\+\+\+ |@@ |\$ |> )/.test(value)) return true
  if (/^[\w.$/-]+:\d+(?::\d+)?\b/.test(value)) return true
  if (/^(?:[A-Za-z]:)?[/~][\w.@ /-]*$/.test(value)) return true
  if (/^(?:error|warning|traceback|exception|npm err|fatal)\b/i.test(value)) return true
  // A long line of mostly punctuation, hashes, or identifiers is a dump, not a
  // sentence. Short values are left alone — "Bug #1234" and "API v2" are names
  // someone chose, and the ratio cannot tell them from noise.
  const letters = (value.match(/\p{L}/gu) || []).length
  if (value.length >= 24 && letters / value.length < 0.4) return true
  // Needs at least one real word to be a name a person would recognise.
  return !/\p{L}{3,}/u.test(value)
}

export function stripPromptMachinery (value) {
  let text = String(value || '')
  text = text.replace(CONTEXT_BLOCK, ' ')
  // Provider indexes can truncate a capsule before its closing tag.
  text = text.replace(/<(?:ambientic|agentbase)-context\b[\s\S]*$/gi, ' ')
  // Nested wrappers need more than one pass; bound it so a pathological input
  // cannot spin here.
  for (let pass = 0; pass < 4; pass++) {
    const next = text.replace(TAGGED_BLOCK, ' ')
    if (next === text) break
    text = next
  }
  return text.replace(LOOSE_TAG, ' ').replace(CAVEAT, ' ')
}

// Turn any provider's raw "what is this about" string into a thread name, or
// '' when nothing human survives and the caller should use its own fallback.
export function threadTitle (raw, { limit = TITLE_LIMIT } = {}) {
  const stripped = stripPromptMachinery(raw)
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`*#>-]+/, '')
    .trim()
  if (!stripped) return ''

  // A thread is named after its opening intent, not the whole prompt. A very
  // short first sentence ("Go.", "Quick one:") is not recognisable on its own,
  // so keep taking sentences until there is enough to read — rather than
  // falling back to the entire prompt, which is what turned a short opener into
  // an 80-character run-on name.
  let candidate = ''
  for (const sentence of stripped.split(/(?<=[.!?])\s+/)) {
    candidate = candidate ? `${candidate} ${sentence}` : sentence
    if (candidate.length >= MIN_TITLE_LENGTH) break
  }
  candidate = candidate.trim()
  if (!candidate) return ''
  if (BUILTIN_COMMAND.test(candidate) || SLASH_ONLY.test(candidate)) return ''
  if (looksLikeMachineOutput(candidate)) return ''

  if (candidate.length <= limit) return candidate
  const clipped = candidate.slice(0, limit).replace(/\s+\S*$/, '')
  return `${clipped || candidate.slice(0, limit)}…`
}

// The name shown when no prompt text is usable — never a raw identifier.
export function fallbackTitle (providerLabel, project) {
  const name = String(project || '').trim()
  const provider = String(providerLabel || 'Agent').trim() || 'Agent'
  return name ? `${provider} · ${name}` : `${provider} session`
}
