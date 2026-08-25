import { EventEmitter } from 'node:events'
import { spawn, execFile } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonRpcProcess } from './json-rpc-process.mjs'
import { providerSpawnEnv } from './env-path.mjs'
import { DISCOVERY_ROOT_LIMIT, additionalToolRoots, canInspectProjectRoot, discoveryToolRoots, isBroadProjectRoot } from './project-scope.mjs'
import { assembleProviderPrompt, stripAmbienticContext } from './context-assembler.mjs'

const PROVIDER_LABELS = { codex: 'Codex', claude: 'Claude Code', hermes: 'Hermes' }

// Prefix of the synthetic seed message written when a Claude thread is
// auto-compacted. Used both to build the seed and to hide it from the
// rendered transcript on reload.
const COMPACTION_HEADER = 'You are resuming a conversation that exceeded the model'
const COMPACTION_BUDGET = 24000
const CHAT_MODES = new Set(['build', 'plan', 'ask'])
// Aliases Claude Code's `--model` accepts, plus the union of effort labels the
// supported provider surfaces currently expose. Codex's exact per-model subset
// is discovered from app-server instead of being inferred from this set.
const CLAUDE_MODELS = new Set(['opus', 'sonnet', 'haiku'])
const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

const CLAUDE_TASK_OPTIONS = {
  provider: 'claude',
  models: [
    { id: '', label: 'Claude default', description: 'Use the model configured by Claude Code.', isDefault: true },
    { id: 'opus', label: 'Opus', description: 'Highest-capability Claude model.' },
    { id: 'sonnet', label: 'Sonnet', description: 'Balanced Claude model.' },
    { id: 'haiku', label: 'Haiku', description: 'Fastest Claude model.' }
  ],
  efforts: [
    { id: '', label: 'Claude default', description: 'Use Claude Code\'s configured effort.', isDefault: true },
    ...['low', 'medium', 'high', 'xhigh', 'max'].map((id) => ({ id, label: id === 'xhigh' ? 'X-high' : `${id[0].toUpperCase()}${id.slice(1)}` }))
  ]
}

const PROVIDER_DEFAULT_TASK_OPTIONS = {
  codex: {
    provider: 'codex',
    models: [{ id: '', label: 'Codex default', description: 'Use the model configured by Codex.', isDefault: true }],
    efforts: [{ id: '', label: 'Codex default', description: 'Use the model\'s default reasoning level.', isDefault: true }]
  },
  claude: CLAUDE_TASK_OPTIONS,
  hermes: {
    provider: 'hermes',
    models: [{ id: '', label: 'Hermes default', description: 'Hermes selects its configured model.', isDefault: true }],
    efforts: []
  }
}

function taskWorkspaceSlug (prompt) {
  return String(prompt || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'new-task'
}

export function createPrivateTaskWorkspace (root, prompt = '', id = randomUUID()) {
  const base = String(root || '').trim()
  if (!isAbsolute(base) || isBroadProjectRoot(base)) throw new Error('Ambientic private workspace location is invalid.')
  mkdirSync(base, { recursive: true, mode: 0o700 })
  const directory = join(base, `${taskWorkspaceSlug(prompt)}-${String(id).slice(0, 8)}`)
  mkdirSync(directory, { mode: 0o700 })
  return directory
}

function textContent (value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map((part) => part?.text || part?.content || '').filter(Boolean).join('\n')
}

function message (role, text, extra = {}) {
  return { id: extra.id || randomUUID(), role, text: String(text || ''), ...extra }
}

// Claude's PermissionRequest hook reports only the tool name and its raw input,
// so an approval card titled "Bash" or "Edit" never says what is actually being
// asked for. Build a one-line, human-readable request title — the thing the user
// reads to decide yes or no — from the tool's own input fields. Values are
// truncated (never parsed or executed) so a long command or file list cannot
// blow out the card.
const APPROVAL_TITLE_LIMIT = 120

function shortPath (value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const home = homedir()
  const tidy = text.startsWith(home) ? `~${text.slice(home.length)}` : text
  // Keep the final two segments: enough to identify the file without the noise
  // of a deep absolute path.
  const parts = tidy.split('/').filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : tidy
}

function clip (value, limit = APPROVAL_TITLE_LIMIT) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

export function describeApprovalRequest (toolName, toolInput = {}) {
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
      return clip(`Edit ${shortPath(input.file_path)}${files > 1 ? ` (${files} changes)` : ''}` )
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

export function reconcileProviderMessage (messages, incoming) {
  const list = [...(messages || [])]
  let index = list.findIndex((entry) => entry.id === incoming.id)
  if (index < 0 && incoming.role === 'user') {
    const cleanIncoming = stripAmbienticContext(incoming.text)
    index = list.findLastIndex((entry) => (
      entry.role === 'user' &&
      entry.pendingProvider &&
      stripAmbienticContext(entry.text) === cleanIncoming
    ))
  }
  if (index >= 0) {
    const optimistic = list[index]
    list[index] = {
      ...incoming,
      ...(optimistic.files?.length && !incoming.files?.length ? { files: optimistic.files } : {}),
      ...(optimistic.mode && !incoming.mode ? { mode: optimistic.mode } : {})
    }
  }
  else list.push(incoming)
  return list
}

// A Claude result event can report failure with an empty `result`. These are
// the fields that still say why, in the order they are worth reading.
function claudeErrorDetail (event = {}) {
  const parts = [
    event.api_error_status ? `API status ${event.api_error_status}` : '',
    event.subtype && event.subtype !== 'success' ? `subtype ${event.subtype}` : '',
    event.terminal_reason && event.terminal_reason !== 'completed' ? `terminal reason ${event.terminal_reason}` : '',
    event.stop_reason ? `stop reason ${event.stop_reason}` : '',
    Array.isArray(event.permission_denials) && event.permission_denials.length
      ? `denied ${event.permission_denials.map((item) => item?.tool_name || 'tool').join(', ')}`
      : ''
  ].filter(Boolean)
  return parts.length ? `Claude returned an error (${parts.join('; ')})` : 'Claude returned an error with no detail'
}

function normalizePromptOptions (options = {}, provider = '') {
  const mode = CHAT_MODES.has(options.mode) ? options.mode : 'build'
  // Model and effort come from the renderer's composer. Validate against the
  // values the provider CLIs actually accept — an unknown one is dropped rather
  // than forwarded, so a stale UI can never make a turn fail to launch.
  const requestedModel = String(options.model || '').trim()
  const model = provider === 'claude'
    ? (CLAUDE_MODELS.has(requestedModel) ? requestedModel : '')
    : (provider === 'codex' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(requestedModel) ? requestedModel : '')
  const effort = EFFORT_LEVELS.has(options.effort) ? options.effort : ''
  const projectContext = options.projectContext && isAbsolute(String(options.projectContext.cwd || ''))
    ? {
        cwd: String(options.projectContext.cwd),
        name: String(options.projectContext.name || basename(String(options.projectContext.cwd))).replace(/\s+/g, ' ').trim().slice(0, 100)
      }
    : null
  const attachments = []
  for (const item of Array.isArray(options.attachments) ? options.attachments.slice(0, 12) : []) {
    const path = String(item?.path || '')
    if (!isAbsolute(path)) continue
    try {
      const stats = statSync(path)
      attachments.push({
        path,
        name: basename(path),
        kind: stats.isDirectory() ? 'folder' : 'file'
      })
    } catch {}
  }
  const knownProjects = []
  for (const item of Array.isArray(options.knownProjects) ? options.knownProjects.slice(0, 12) : []) {
    const projectRoot = String(item?.cwd || '')
    if (!isAbsolute(projectRoot)) continue
    knownProjects.push({ cwd: projectRoot, name: String(item?.name || basename(projectRoot)).replace(/\s+/g, ' ').trim().slice(0, 100) })
  }
  return { mode, attachments, model, effort, projectContext, knownProjects }
}

function codexInputs (text, attachments) {
  const input = [{ type: 'text', text, text_elements: [] }]
  for (const item of attachments) {
    if (item.kind === 'file' && IMAGE_EXTENSIONS.has(extname(item.path).toLowerCase())) {
      input.push({ type: 'localImage', path: item.path, detail: 'auto' })
    } else {
      input.push({ type: 'mention', name: item.name, path: item.path })
    }
  }
  return input
}

function codexItem (item) {
  if (!item) return null
  if (item.type === 'userMessage') return message('user', stripAmbienticContext(textContent(item.content)), { id: item.id })
  if (item.type === 'agentMessage') return message('assistant', item.text, { id: item.id })
  if (item.type === 'reasoning') return message('activity', textContent(item.summary || item.content), { id: item.id, kind: 'reasoning', title: 'Reasoning' })
  if (item.type === 'commandExecution') return message('activity', item.aggregatedOutput || item.command || '', { id: item.id, kind: 'command', title: item.command || 'Command', status: item.status })
  if (item.type === 'fileChange') {
    const files = (item.changes || []).map((change) => change.path).filter(Boolean)
    return message('activity', files.join('\n') || 'File changes', { id: item.id, kind: 'files', title: 'Files changed', files, status: item.status })
  }
  if (item.type === 'webSearch') return message('activity', item.query || '', { id: item.id, kind: 'web', title: 'Web search' })
  return null
}

function codexThreadMessages (thread) {
  return (thread?.turns || []).flatMap((turn) => (turn.items || []).map(codexItem).filter(Boolean))
}

function codexActiveTurnId (thread) {
  return [...(thread?.turns || [])].reverse().find((turn) => turn.status === 'inProgress')?.id || ''
}

// Codex has no distinct protocol signal for "the agent is asking the user
// something and stopped to wait for a reply" — a clarifying question ends the
// turn exactly like a completed task does. When the turn's last item is an
// agent message ending in a question, this is that case, and the thread
// should surface as needing you rather than going quietly idle.
function codexAwaitsReply (thread) {
  const last = thread?.turns?.at(-1)?.items?.at(-1)
  if (last?.type !== 'agentMessage') return false
  const text = String(last.text || '').replace(/[\s*_"'`)\]]+$/, '')
  return /\?$/.test(text)
}

function codexEventTurnId (event) {
  return event?.params?.turn?.id || event?.params?.turnId || ''
}

function codexStatusIsRunning (status) {
  return (status?.type || status) === 'active'
}

function claudeMessages (path) {
  if (!path || !existsSync(path)) return []
  const output = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (row.type === 'user') {
      const text = stripAmbienticContext(textContent(row.message?.content))
      if (text && !text.startsWith('<task-notification>')) output.push(message('user', text, { id: row.uuid }))
    } else if (row.type === 'assistant') {
      for (const part of row.message?.content || []) {
        if (part.type === 'text' && part.text) output.push(message('assistant', part.text, { id: `${row.uuid}:text` }))
        if (part.type === 'tool_use') {
          const files = [part.input?.file_path, part.input?.path].filter(Boolean)
          output.push(message('activity', JSON.stringify(part.input || {}, null, 2), { id: part.id, kind: 'tool', title: part.name || 'Tool', files }))
        }
      }
    }
  }
  return output.slice(-300)
}

// The auto-compaction seed is one long synthetic user message. Hide it from the
// rendered transcript so a compacted thread still reads naturally.
function isCompactionSeed (entry) {
  return entry?.role === 'user' && String(entry.text || '').startsWith(COMPACTION_HEADER)
}

function findClaudeTranscript (session) {
  if (session.transcriptPath && existsSync(session.transcriptPath)) return session.transcriptPath
  const id = String(session.id || '').split(':').at(-1)
  if (!/^[0-9a-f-]{30,}$/i.test(id)) return ''
  const root = join(homedir(), '.claude', 'projects')
  try {
    for (const folder of readdirSync(root, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue
      const candidate = join(root, folder.name, `${id}.jsonl`)
      if (existsSync(candidate)) return candidate
    }
  } catch {}
  return ''
}

function readFileSlice (path, position, length) {
  let handle
  try {
    const size = statSync(path).size
    const start = position < 0 ? Math.max(0, size + position) : Math.min(position, size)
    const bytes = Math.min(length, size - start)
    const buffer = Buffer.alloc(bytes)
    handle = openSync(path, 'r')
    readSync(handle, buffer, 0, bytes, start)
    let text = buffer.toString('utf8')
    if (start > 0) text = text.slice(text.indexOf('\n') + 1)
    return text
  } catch { return '' } finally { if (handle !== undefined) closeSync(handle) }
}

function meaningfulClaudeUserText (row) {
  if (row?.type !== 'user') return ''
  const value = stripAmbienticContext(textContent(row.message?.content)).replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!value || value.startsWith('<') || /^\/?(?:clear|compact|help)$/i.test(value)) return ''
  return value
}

function parseJsonLines (text) {
  const rows = []
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch {}
  }
  return rows
}

function claudeHistorySessions () {
  const root = join(homedir(), '.claude', 'projects')
  const sessions = []
  try {
    for (const projectFolder of readdirSync(root, { withFileTypes: true })) {
      if (!projectFolder.isDirectory()) continue
      const folder = join(root, projectFolder.name)
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        const transcriptPath = join(folder, entry.name)
        const info = statSync(transcriptPath)
        const firstRows = parseJsonLines(readFileSlice(transcriptPath, 0, 384 * 1024))
        const tailRows = parseJsonLines(readFileSlice(transcriptPath, -256 * 1024, 256 * 1024))
        const rows = [...firstRows, ...tailRows]
        const sessionId = rows.find((row) => row.sessionId)?.sessionId
        const cwd = rows.find((row) => row.cwd)?.cwd || ''
        const firstPrompt = rows.map(meaningfulClaudeUserText).find(Boolean)
        const lastPrompt = rows.map(meaningfulClaudeUserText).filter(Boolean).at(-1)
        const id = sessionId || entry.name.slice(0, -6)
        if (!id) continue
        const rawTask = firstPrompt || lastPrompt || 'Claude Code task'
        const task = rawTask.length < 12 && cwd ? `${rawTask} — ${basename(cwd)}` : rawTask
        sessions.push({
          id, agent: 'claude', project: basename(cwd) || 'Claude Code', cwd,
          task: task.slice(0, 100),
          summary: (lastPrompt || firstPrompt || '').slice(0, 240),
          transcriptPath, updatedAt: info.mtimeMs, state: 'history', history: true
        })
      }
    }
  } catch {}
  return sessions.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 40)
}

function execJson (file, args) {
  return new Promise((resolve, reject) => execFile(file, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error(String(stderr || error.message).trim()))
    else { try { resolve(JSON.parse(stdout || '[]')) } catch (parseError) { reject(parseError) } }
  }))
}

export class WorkspaceService extends EventEmitter {
  constructor (store, getConnectors, {
    aliases = {},
    onAliasesChange,
    taskWorkspaceRoot = join(homedir(), '.ambientic', 'workspaces'),
    contextEngine = null,
    capabilityGateway = null,
    gatewayExecutable = process.execPath,
    gatewayShimPath = '',
    contextArtifactRoot = join(homedir(), '.ambientic', 'context-sessions'),
    spawnProcess = spawn
  } = {}) {
    super()
    this.store = store
    this.getConnectors = getConnectors
    this.snapshots = new Map()
    this.pendingApprovals = new Map()
    this.codex = null
    this.hermes = null
    this.codexReady = null
    this.hermesReady = null
    this.activeTurns = new Map()
    this.codexCollaborationModes = undefined
    // Auto-compaction: when a Claude thread's history overflows the context
    // window, we start a fresh, compacted Claude session and remap the UI
    // thread id -> the new session id so the user continues in place.
    this.claudeRemap = new Map()
    this.claudeAttempts = new Map()
    this.history = new Map()
    this.historyRefreshedAt = 0
    this.aliases = new Map(Object.entries(aliases || {}).filter(([, title]) => String(title || '').trim()))
    this.onAliasesChange = onAliasesChange
    this.taskWorkspaceRoot = taskWorkspaceRoot
    this.contextEngine = contextEngine
    this.capabilityGateway = capabilityGateway
    this.gatewayExecutable = gatewayExecutable
    this.gatewayShimPath = gatewayShimPath
    this.contextArtifactRoot = contextArtifactRoot
    this.spawnProcess = spawnProcess
    this.gatewayRuntime = new Map()
    // Memory-export sessions are deliberately isolated from Ambientic's own
    // context so an import can never echo the local capsule back into itself.
    this.contextSuppressedSessions = new Set()
    // Threads started by this app-server process. Codex only writes a thread's
    // rollout file once its first turn runs, so 'thread/resume' fails with "no
    // rollout found" until then. A thread we started is already in the running
    // process's memory and needs no resume; cleared when that process exits.
    this.codexStartedThreads = new Set()
  }

  connector (id) { return this.getConnectors().find((item) => item.id === id) }
  codexThreadId (session) { return session.threadId || String(session.id || '').replace(/^codex-desktop:/, '') }
  // The Claude session id backing a UI thread: the compacted replacement if the
  // thread has been auto-compacted, otherwise the thread's own id.
  claudeSessionId (session) { return this.claudeRemap.get(session.id) || String(session.id || '').split(':').at(-1) }
  claudeTranscriptFor (session) {
    return this.claudeRemap.has(session.id) ? findClaudeTranscript({ id: this.claudeSessionId(session) }) : findClaudeTranscript(session)
  }
  uiSessionId (provider, providerId) {
    return this.store.list().find((item) => item.agent === provider && (provider === 'codex' ? this.codexThreadId(item) : item.id) === providerId)?.id ||
      [...this.history.values()].find((item) => item.agent === provider && item.id === providerId)?.id || providerId
  }

  sessionFor (id) { return this.store.list().find((item) => item.id === id) || this.history.get(id) }

  providerSessionId (session) {
    if (session.agent === 'codex') return this.codexThreadId(session)
    if (session.agent === 'claude') return this.claudeSessionId(session)
    return session.id
  }

  prepareContext ({ provider, providerSessionId, cwd = '', prompt = '', contextBinding = {} }) {
    if (!this.contextEngine) return null
    const prepared = this.contextEngine.prepareSession({
      provider,
      providerSessionId,
      cwd,
      prompt,
      projectId: contextBinding.projectId,
      goalId: contextBinding.goalId,
      taskId: contextBinding.taskId
    })
    return this.contextFiles(prepared.binding)
  }

  ensureContext (session, { prompt = '', contextBinding = {} } = {}) {
    if (!this.contextEngine) return null
    const providerSessionId = this.providerSessionId(session)
    const existing = this.contextEngine.bindingFor(session.agent, providerSessionId)
    if (existing) return this.contextFiles(existing)
    return this.prepareContext({ provider: session.agent, providerSessionId, cwd: session.cwd || '', prompt, contextBinding })
  }

  contextFiles (binding) {
    if (!binding || !this.capabilityGateway || !this.gatewayShimPath) return binding ? { binding, capsule: binding.capsuleText, mcp: null } : null
    let runtime = this.gatewayRuntime.get(binding.id)
    if (!runtime) {
      // Starting a fresh shim runtime reauthorizes this binding. Revoke any
      // token left by an earlier app process before issuing the replacement.
      this.capabilityGateway.revokeBinding(binding.id)
      const session = this.capabilityGateway.issueSession(binding.id)
      const mcp = this.capabilityGateway.configurationFor(session, { executable: this.gatewayExecutable, shimPath: this.gatewayShimPath })
      mkdirSync(this.contextArtifactRoot, { recursive: true, mode: 0o700 })
      const safeId = String(binding.id).replace(/[^a-zA-Z0-9._-]/g, '_')
      const capsulePath = join(this.contextArtifactRoot, `${safeId}.md`)
      const mcpConfigPath = join(this.contextArtifactRoot, `${safeId}.mcp.json`)
      // The provider must receive the exact bytes represented by capsuleHash.
      // Adding even a trailing newline makes the audit hash misleading.
      writeFileSync(capsulePath, binding.capsuleText, { mode: 0o600 })
      writeFileSync(mcpConfigPath, `${JSON.stringify({ mcpServers: { ambientic: mcp } }, null, 2)}\n`, { mode: 0o600 })
      runtime = { binding, session, mcp, capsulePath, mcpConfigPath }
      this.gatewayRuntime.set(binding.id, runtime)
    } else runtime.binding = binding
    return { ...runtime, capsule: binding.capsuleText }
  }

  contextBindingFor (sessionOrId) {
    const session = typeof sessionOrId === 'string' ? this.sessionFor(sessionOrId) : sessionOrId
    if (!session || !this.contextEngine) return {}
    const binding = this.contextEngine.bindingFor(session.agent, this.providerSessionId(session))
    return binding ? { projectId: binding.projectId || '', goalId: binding.goalId || '', taskId: binding.taskId || '' } : {}
  }

  recentProjects (limit = 4) {
    const projects = new Map()
    for (const session of [...this.store.list(), ...this.history.values()].sort((left, right) => (right.updatedAt || right.lastSeen || 0) - (left.updatedAt || left.lastSeen || 0))) {
      const cwd = String(session.cwd || '').trim()
      if (!cwd || projects.has(cwd) || !canInspectProjectRoot(cwd)) continue
      // Automatic task workspaces are a default implementation detail, not
      // useful "existing project" shortcuts.
      if (cwd === this.taskWorkspaceRoot || cwd.startsWith(`${this.taskWorkspaceRoot}/`)) continue
      projects.set(cwd, {
        cwd,
        name: session.project || basename(cwd) || 'Local project'
      })
      if (projects.size >= Math.max(1, Math.min(DISCOVERY_ROOT_LIMIT, limit))) break
    }
    return [...projects.values()]
  }

  // The projects this machine already works in, offered to a task as somewhere
  // to look rather than something the user had to nominate up front. Returned
  // as name + root so the same list can be granted and described: telling an
  // agent about a folder it cannot read is worse than telling it nothing.
  discoverableProjects (cwd = '') {
    const registered = (this.contextEngine?.store?.listProjects?.() || [])
      .map((project) => ({ cwd: project.rootPath, name: project.name }))
    const named = new Map()
    for (const item of [...this.recentProjects(DISCOVERY_ROOT_LIMIT), ...registered]) {
      const root = String(item?.cwd || '').trim()
      if (!root || !isAbsolute(root)) continue
      const key = resolve(root)
      if (!named.has(key)) named.set(key, item.name || basename(key) || 'Local project')
    }
    return discoveryToolRoots(cwd, [...named.keys()].map((root) => ({ cwd: root })))
      .map((root) => ({ cwd: root, name: named.get(root) }))
  }

  async list ({ force = false } = {}) {
    if (force || Date.now() - this.historyRefreshedAt > 30_000) {
      const histories = claudeHistorySessions()
      try {
        const db = join(homedir(), '.hermes', 'state.db')
        if (existsSync(db)) {
          const rows = await execJson('/usr/bin/sqlite3', ['-readonly', '-json', db, `
            select s.id,
              coalesce(nullif(s.title, ''), nullif(s.display_name, ''),
                (select substr(replace(m.content, char(10), ' '), 1, 100) from messages m where m.session_id=s.id and m.role='user' and m.active=1 order by m.timestamp asc limit 1),
                'Hermes task') as task,
              coalesce(s.cwd, '') as cwd,
              coalesce(s.ended_at, s.started_at) * 1000 as updatedAt,
              s.message_count as messageCount
            from sessions s where coalesce(s.archived, 0)=0 order by coalesce(s.ended_at, s.started_at) desc limit 40
          `])
          histories.push(...rows.map((row) => ({
            id: row.id, agent: 'hermes', project: basename(row.cwd || '') || 'Hermes', cwd: row.cwd || '',
            task: row.task || 'Hermes task', summary: `${row.messageCount || 0} messages`,
            updatedAt: Number(row.updatedAt) || 0, state: 'history', history: true
          })))
        }
      } catch (error) { console.error('[ambientic] Hermes history discovery failed:', error.message) }
      this.history = new Map(histories.map((session) => [session.id, session]))
      this.historyRefreshedAt = Date.now()
    }

    const merged = new Map(this.history)
    for (const session of this.store.list()) merged.set(session.id, session)
    for (const [id, snapshot] of this.snapshots) {
      const session = merged.get(id)
      if (session) merged.set(id, {
        ...session,
        state: this.effectiveState(session, snapshot),
        task: snapshot.title || session.task,
        updatedAt: Math.max(Number(session.updatedAt || session.lastSeen || 0), Number(snapshot.updatedAt || 0))
      })
    }
    const sessions = [...merged.values()].map((session) => {
      const alias = this.aliases.get(session.id)
      return alias ? { ...session, task: alias, taskSource: 'user' } : session
    }).sort((left, right) => (right.updatedAt || right.lastSeen || 0) - (left.updatedAt || left.lastSeen || 0))
    this.contextEngine?.backfillProjects(sessions.filter((session) => {
      const cwd = String(session.cwd || '').trim()
      return cwd && canInspectProjectRoot(cwd) && cwd !== this.taskWorkspaceRoot && !cwd.startsWith(`${this.taskWorkspaceRoot}/`)
    }))
    return sessions
  }

  baseSnapshot (session) {
    const title = this.aliases.get(session.id) || session.task || session.project || `${PROVIDER_LABELS[session.agent] || 'Agent'} session`
    return {
      id: session.id,
      provider: session.agent,
      providerLabel: PROVIDER_LABELS[session.agent] || session.agent,
      title,
      project: session.project || basename(session.cwd || '') || 'Local session',
      cwd: session.cwd || '',
      state: session.state || 'idle',
      updatedAt: Number(session.updatedAt || session.lastSeen || 0),
      messages: [], artifacts: [], approvals: [], running: false, error: '',
      turnStateKnown: false,
      nativeAvailable: Boolean(session.deepLink || session.tty),
      managed: ['codex', 'claude', 'hermes'].includes(session.agent)
    }
  }

  emitSnapshot (snapshot) {
    snapshot.artifacts = [...new Map(snapshot.messages.flatMap((entry) => (entry.files || []).map((path) => [path, { path, name: basename(path), kind: 'file' }]))).values()]
    snapshot.approvals = [...this.pendingApprovals.values()]
      .filter((approval) => approval.sessionId === snapshot.id)
      .map(({ rpc: _rpc, resolve: _resolve, timer: _timer, requestId: _requestId, suggestions: _suggestions, ...approval }) => approval)
    // State has one owner. Callers set `running`/`error`/`messages`; the state
    // is always derived here so live snapshots and list()/read() cannot diverge.
    snapshot.state = this.effectiveState(this.sessionFor(snapshot.id), snapshot)
    this.snapshots.set(snapshot.id, snapshot)
    this.emit('change', snapshot)
    return snapshot
  }

  // True when the agent has paused waiting for the user to approve something —
  // the only case in which a not-running thread genuinely "needs you".
  hasPendingApproval (id) {
    for (const approval of this.pendingApprovals.values()) if (approval.sessionId === id) return true
    return false
  }

  isRunning (id, snapshot) {
    return Boolean(snapshot?.running) || this.activeTurns.has(id)
  }

  // The single source of truth for a thread's UI state. Explicit user-required
  // signals win over process liveness: a provider can keep its process alive
  // while blocked on approval/input. Live hook lifecycle remains authoritative
  // for passive terminal snapshots that cannot inspect the provider turn.
  effectiveState (session, snapshot) {
    const id = session?.id ?? snapshot?.id
    if (snapshot?.error) return 'attention'
    if (this.hasPendingApproval(id)) return 'attention'
    if (snapshot?.awaitingReply) return 'attention'
    if (session?.state === 'attention' || session?.state === 'waiting') return session.state
    // Codex Desktop and hook-backed terminals own their provider process in a
    // different runtime from Ambientic's passive transcript reader. A
    // thread/read response from Ambientic's app-server can therefore be idle
    // while the real Codex Desktop turn is working. Treat both live signals as
    // a union: either one may promote to running, but a passive read may not
    // demote an authoritative provider lifecycle.
    const hasAuthoritativeExternalLifecycle = Boolean(session?.tty) || session?.externalSource === 'codex-desktop'
    if (hasAuthoritativeExternalLifecycle && (this.isRunning(id, snapshot) || session?.state === 'running')) return 'running'
    if (hasAuthoritativeExternalLifecycle && snapshot?.turnStateKnown) return session?.history ? 'history' : (session?.state || 'idle')
    if (snapshot?.turnStateKnown) return this.isRunning(id, snapshot) ? 'running' : (session?.history ? 'history' : 'idle')
    if (this.isRunning(id, snapshot) || session?.state === 'running') return 'running'
    if (snapshot) return session?.history ? 'history' : 'idle'
    return session?.history ? 'history' : (session?.state || 'idle')
  }

  ingestLifecycle (id, event) {
    const session = this.sessionFor(id)
    if (!session || !this.store?.ingest) return
    this.store.ingest({
      event,
      session_id: id,
      agent: session.agent,
      project: session.project,
      cwd: session.cwd,
      tty: session.tty
    })
  }

  async rename (id, value) {
    const session = this.sessionFor(id)
    if (!session) throw new Error('This thread is no longer available.')
    const title = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!title) throw new Error('Enter a thread name.')
    this.aliases.set(id, title)
    this.store.updateTask(id, title, '', 'user')
    this.onAliasesChange?.(Object.fromEntries(this.aliases))
    const snapshot = this.snapshots.get(id)
    if (snapshot) this.emitSnapshot({ ...snapshot, title })
    return { id, title }
  }

  async read (id) {
    if (!this.history.size) await this.list()
    const session = this.sessionFor(id)
    if (!session) throw new Error('This session is no longer available.')
    const snapshot = { ...this.baseSnapshot(session), ...(this.snapshots.get(id) || {}) }
    snapshot.title = this.aliases.get(id) || session.task || snapshot.title
    snapshot.cwd = session.cwd || snapshot.cwd
    try {
      if (session.agent === 'codex') {
        const rpc = await this.codexClient()
        const result = await rpc.request('thread/read', { threadId: this.codexThreadId(session), includeTurns: true })
        snapshot.messages = codexThreadMessages(result.thread)
        snapshot.title = result.thread?.name || result.thread?.preview || snapshot.title
        snapshot.running = codexStatusIsRunning(result.thread?.status)
        snapshot.awaitingReply = !snapshot.running && codexAwaitsReply(result.thread)
        snapshot.turnStateKnown = true
        const activeTurnId = codexActiveTurnId(result.thread)
        if (snapshot.running && activeTurnId) this.activeTurns.set(id, activeTurnId)
        else if (!snapshot.running) this.activeTurns.delete(id)
        // Reading dormant history must not promote it onto the live hardware
        // surface. A genuinely active provider turn is promoted immediately;
        // existing live sessions are also corrected back to idle — unless
        // Codex ended its last turn by asking the user a question, which
        // still needs a reply to move forward.
        if (snapshot.running) this.ingestLifecycle(id, 'tool')
        else if (!session.history && !session.tty && session.externalSource !== 'codex-desktop') {
          this.ingestLifecycle(id, snapshot.awaitingReply ? 'notification' : 'stop_idle')
        }
      } else if (session.agent === 'claude') {
        snapshot.transcriptPath = this.claudeTranscriptFor(session)
        const disk = claudeMessages(snapshot.transcriptPath).filter((entry) => !isCompactionSeed(entry))
        if (disk.length) snapshot.messages = disk
      } else if (session.agent === 'hermes') {
        snapshot.messages = await this.hermesMessages(session.id)
      }
      if (!this.contextSuppressedSessions.has(id)) {
        const context = this.ensureContext(session)
        if (context?.binding) snapshot.contextBinding = context.binding
        this.contextEngine?.observeTurn({
          provider: session.agent,
          providerSessionId: this.providerSessionId(session),
          messages: snapshot.messages.filter((entry) => ['user', 'assistant'].includes(entry.role))
        })
      }
      snapshot.error = ''
    } catch (error) {
      snapshot.error = error.message
    }
    return this.emitSnapshot(snapshot)
  }

  async codexClient () {
    if (this.codexReady) return this.codexReady
    this.codexReady = (async () => {
      const path = this.connector('codex')?.path || '/Applications/ChatGPT.app/Contents/Resources/codex'
      const rpc = new JsonRpcProcess(path, ['app-server', '--stdio'])
      rpc.on('notification', (event) => this.codexNotification(event))
      rpc.on('request', (request) => this.providerApproval('codex', rpc, request))
      rpc.on('exit', () => {
        this.codex = null
        this.codexReady = null
        this.codexCollaborationModes = undefined
        this.codexStartedThreads.clear()
      })
      rpc.start()
      await rpc.request('initialize', { clientInfo: { name: 'ambientic', title: 'Ambientic', version: '0.8.1' } })
      rpc.notify('initialized')
      this.codex = rpc
      return rpc
    })()
    return this.codexReady
  }

  async connectCodexAccount () {
    const rpc = await this.codexClient()
    const result = await rpc.request('account/login/start', {
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
      appBrand: 'chatgpt'
    })
    if (!result?.authUrl) throw new Error('Codex did not return a ChatGPT sign-in URL.')
    return { provider: 'codex', mode: 'browser', loginId: result.loginId || '', authUrl: result.authUrl }
  }

  async codexAccountStatus () {
    const rpc = await this.codexClient()
    const result = await rpc.request('account/read', { refreshToken: false })
    return {
      connected: Boolean(result?.account),
      accountType: result?.account?.type || '',
      email: result?.account?.email || '',
      planType: result?.account?.planType || ''
    }
  }

  async taskOptions (provider) {
    if (provider !== 'codex') return PROVIDER_DEFAULT_TASK_OPTIONS[provider] || { provider, models: [], efforts: [] }
    try {
      const rpc = await this.codexClient()
      const models = []
      let cursor = null
      do {
        const result = await rpc.request('model/list', { cursor, limit: 100, includeHidden: false }, 10_000)
        models.push(...(Array.isArray(result?.data) ? result.data : []))
        cursor = result?.nextCursor || null
      } while (cursor && models.length < 300)
      if (!models.length) return PROVIDER_DEFAULT_TASK_OPTIONS.codex
      const normalized = models.map((item) => ({
        id: String(item.model || item.id || ''),
        label: String(item.displayName || item.model || item.id || 'Codex model'),
        description: String(item.description || ''),
        isDefault: Boolean(item.isDefault),
        defaultEffort: String(item.defaultReasoningEffort || ''),
        efforts: (Array.isArray(item.supportedReasoningEfforts) ? item.supportedReasoningEfforts : [])
          .map((option) => ({
            id: String(option.reasoningEffort || ''),
            label: String(option.reasoningEffort || '').replace(/^./, (value) => value.toUpperCase()),
            description: String(option.description || '')
          }))
          .filter((option) => option.id)
      })).filter((item) => item.id)
      return {
        provider: 'codex',
        models: normalized,
        efforts: normalized.find((item) => item.isDefault)?.efforts || normalized[0]?.efforts || []
      }
    } catch {
      return PROVIDER_DEFAULT_TASK_OPTIONS.codex
    }
  }

  async codexCollaborationMode (rpc, requestedMode, requestedEffort = '', requestedModel = '') {
    if (this.codexCollaborationModes === undefined) {
      try {
        const result = await rpc.request('collaborationMode/list', {})
        this.codexCollaborationModes = Array.isArray(result?.data) ? result.data : []
      } catch {
        this.codexCollaborationModes = []
      }
    }
    const desired = requestedMode === 'build' ? 'default' : 'plan'
    const preset = this.codexCollaborationModes.find((item) => item.mode === desired && item.model)
    if (!preset) return null
    return {
      mode: desired,
      settings: {
        model: requestedModel || preset.model,
        // The composer's effort choice overrides the preset's own reasoning_effort.
        reasoning_effort: requestedEffort || preset.reasoning_effort || null,
        developer_instructions: null
      }
    }
  }

  async hermesClient () {
    if (this.hermesReady) return this.hermesReady
    this.hermesReady = (async () => {
      const path = this.connector('hermes')?.path || join(homedir(), '.local', 'bin', 'hermes')
      const rpc = new JsonRpcProcess(path, ['acp'])
      rpc.on('notification', (event) => this.hermesNotification(event))
      rpc.on('request', (request) => this.providerApproval('hermes', rpc, request))
      rpc.on('exit', () => { this.hermes = null; this.hermesReady = null })
      rpc.start()
      await rpc.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'Ambientic', version: '0.8.1' } })
      this.hermes = rpc
      return rpc
    })()
    return this.hermesReady
  }

  providerApproval (provider, rpc, request) {
    const providerSessionId = request.params?.sessionId || request.params?.threadId || request.params?.conversationId || ''
    const sessionId = this.uiSessionId(provider, providerSessionId)
    const id = `${provider}:${request.id}`
    const approval = {
      id, provider, sessionId, method: request.method,
      title: request.params?.reason || request.params?.toolCall?.title || request.params?.command || 'Permission requested',
      detail: request.params?.command || request.params?.toolCall?.rawInput || request.params?.reason || '',
      options: request.params?.options || [],
      canRemember: provider === 'codex'
    }
    this.pendingApprovals.set(id, { ...approval, rpc, requestId: request.id })
    this.ingestLifecycle(sessionId, 'notification')
    const snapshot = this.snapshots.get(sessionId)
    // The approval is now pending, so emitSnapshot derives "attention".
    if (snapshot) this.emitSnapshot({ ...snapshot })
  }

  requestExternalApproval (provider, event, explicitSessionId = '') {
    const providerSessionId = explicitSessionId || event.session_id || ''
    const sessionId = this.uiSessionId(provider, providerSessionId)
    const session = this.sessionFor(sessionId)
    if (!session) return Promise.resolve(null)
    const id = `${provider}:${randomUUID()}`
    const suggestions = Array.isArray(event.permission_suggestions) ? event.permission_suggestions : []
    const toolInput = event.tool_input && typeof event.tool_input === 'object' ? event.tool_input : {}
    const detail = toolInput.command || toolInput.file_path || toolInput.path || toolInput.url || toolInput
    const approval = {
      id,
      provider,
      sessionId,
      method: 'PermissionRequest',
      title: describeApprovalRequest(event.tool_name, toolInput),
      tool: String(event.tool_name || ''),
      detail,
      options: [],
      canRemember: suggestions.length > 0
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.pendingApprovals.has(id)) return
        this.pendingApprovals.delete(id)
        const current = this.snapshots.get(sessionId)
        if (current) this.emitSnapshot({ ...current })
        resolve(null)
      }, 9 * 60 * 1000)
      timer.unref?.()
      this.pendingApprovals.set(id, { ...approval, suggestions, resolve, timer })
      const snapshot = this.snapshots.get(sessionId) || this.baseSnapshot(session)
      this.emitSnapshot({ ...snapshot })
    })
  }

  requestGatewayApproval ({ binding, tool, connection, permission = 'write', arguments: args = {}, title = '' }) {
    const sessionId = this.uiSessionId(binding.provider, binding.providerSessionId)
    const session = this.sessionFor(sessionId)
    if (!session) return Promise.resolve(false)
    const id = `ambientic:${randomUUID()}`
    const approval = {
      id,
      provider: 'ambientic',
      providerLabel: binding.provider,
      sessionId,
      method: 'GatewayToolCall',
      title: title || `${connection?.name || 'Ambientic'}: ${tool}`,
      tool,
      connection: connection?.name || 'Ambientic',
      project: binding.project?.name || '',
      goal: binding.goal?.title || '',
      task: binding.task?.title || '',
      permission,
      destructive: permission === 'destructive',
      detail: args,
      options: [],
      canRemember: permission !== 'destructive'
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.pendingApprovals.has(id)) return
        this.pendingApprovals.delete(id)
        const current = this.snapshots.get(sessionId)
        if (current) this.emitSnapshot({ ...current })
        resolve({ allowed: false, remember: false, outcome: 'timed out' })
      }, 9 * 60 * 1000)
      timer.unref?.()
      this.pendingApprovals.set(id, { ...approval, resolve, timer })
      const snapshot = this.snapshots.get(sessionId) || this.baseSnapshot(session)
      this.emitSnapshot({ ...snapshot })
    })
  }

  cancelGatewayApprovals (sessionId, outcome = 'cancelled') {
    let cancelled = 0
    for (const [approvalId, approval] of this.pendingApprovals) {
      if (approval.provider !== 'ambientic' || approval.sessionId !== sessionId) continue
      if (approval.timer) clearTimeout(approval.timer)
      approval.resolve({ allowed: false, remember: false, outcome })
      this.pendingApprovals.delete(approvalId)
      cancelled += 1
    }
    return cancelled
  }

  async resolveApproval (approvalId, allow, remember = false) {
    const approval = this.pendingApprovals.get(approvalId)
    if (!approval) return false
    if (approval.provider === 'ambientic') {
      if (approval.timer) clearTimeout(approval.timer)
      approval.resolve({ allowed: Boolean(allow), remember: Boolean(allow && remember && !approval.destructive), outcome: allow ? 'approved' : 'rejected' })
    } else if (approval.provider === 'hermes') {
      const option = approval.options.find((item) => allow ? /allow|approve/i.test(`${item.kind} ${item.name}`) : /reject|deny/i.test(`${item.kind} ${item.name}`)) || approval.options[allow ? 0 : approval.options.length - 1]
      approval.rpc.respond(approval.requestId, { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } })
    } else if (approval.provider === 'claude') {
      if (approval.timer) clearTimeout(approval.timer)
      const decision = allow
        ? {
            hookSpecificOutput: {
              hookEventName: 'PermissionRequest',
              decision: {
                behavior: 'allow',
                ...(remember && approval.suggestions?.length ? { updatedPermissions: approval.suggestions } : {})
              }
            }
          }
        : {
            hookSpecificOutput: {
              hookEventName: 'PermissionRequest',
              decision: {
                behavior: 'deny',
                message: 'The user denied this request in Ambientic.'
              }
            }
          }
      approval.resolve(decision)
    } else {
      approval.rpc.respond(approval.requestId, { decision: allow ? (remember ? 'acceptForSession' : 'accept') : 'decline' })
    }
    this.pendingApprovals.delete(approvalId)
    this.ingestLifecycle(approval.sessionId, ((approval.provider === 'claude' || approval.provider === 'ambientic') && allow) || this.activeTurns.has(approval.sessionId) ? 'tool' : 'stop_idle')
    const snapshot = this.snapshots.get(approval.sessionId)
    if (snapshot) this.emitSnapshot({ ...snapshot })
    return true
  }

  async send (id, text, options = {}) {
    if (!this.history.size) await this.list()
    const session = this.sessionFor(id)
    if (!session) throw new Error('This session is no longer available.')
    const contextSuppressed = Boolean(options.skipAmbienticContext || this.contextSuppressedSessions.has(id))
    if (contextSuppressed) this.contextSuppressedSessions.add(id)
    const snapshot = await this.read(id)
    const promptOptions = normalizePromptOptions(options, session.agent)
    const context = contextSuppressed ? null : this.ensureContext(session, { prompt: text, contextBinding: options.contextBinding || {} })
    const startsTurn = !this.activeTurns.has(id)
    if (startsTurn && !contextSuppressed) this.contextEngine?.beginGoalReconciliation?.(session.agent, this.providerSessionId(session))
    const hasConversation = snapshot.messages.some((entry) => entry.role === 'user' || entry.role === 'assistant')
    const cwd = String(session.cwd || '')
    if (!promptOptions.projectContext && !hasConversation && !this.activeTurns.has(id) && cwd && canInspectProjectRoot(cwd) && cwd !== this.taskWorkspaceRoot && !cwd.startsWith(`${this.taskWorkspaceRoot}/`)) {
      promptOptions.projectContext = { cwd, name: session.project || basename(cwd) }
    }
    // Granted on every turn, described once. The grant has to be re-issued each
    // turn because the provider is re-spawned; the description rides the opening
    // turn and stays in the conversation from there.
    const discoverable = contextSuppressed ? [] : this.discoverableProjects(cwd)
    if (!hasConversation && !promptOptions.knownProjects.length) promptOptions.knownProjects = discoverable
    const pending = message('user', text, {
      pendingProvider: true,
      mode: promptOptions.mode,
      files: promptOptions.attachments.map((item) => item.path)
    })
    snapshot.messages = [...snapshot.messages, pending]
    snapshot.running = true
    snapshot.turnStateKnown = true
    snapshot.updatedAt = Date.now()
    this.ingestLifecycle(id, 'prompt')
    this.emitSnapshot(snapshot)
    if (session.agent === 'codex') {
      const rpc = await this.codexClient()
      const threadId = this.codexThreadId(session)
      // A thread this process started already carries its instructions and MCP
      // config from 'thread/start', and resuming it before its first turn fails
      // because Codex has not written a rollout for it yet.
      if (!this.codexStartedThreads.has(threadId)) {
        await rpc.request('thread/resume', {
          threadId,
          ...(context?.binding?.capsuleText ? { developerInstructions: context.binding.capsuleText } : {}),
          ...(context?.mcp ? { config: { mcp_servers: { ambientic: context.mcp } } } : {})
        })
      }
      const activeTurnId = this.activeTurns.get(id)
      const collaborationMode = activeTurnId ? null : await this.codexCollaborationMode(rpc, promptOptions.mode, promptOptions.effort, promptOptions.model)
      const providerText = collaborationMode && promptOptions.mode !== 'ask'
        ? (promptOptions.projectContext ? assembleProviderPrompt(text, { ...promptOptions, mode: 'build', attachments: [] }) : text)
        : assembleProviderPrompt(text, promptOptions)
      const input = codexInputs(providerText, promptOptions.attachments)
      if (activeTurnId) {
        await rpc.request('turn/steer', {
          threadId,
          expectedTurnId: activeTurnId,
          input
        })
      } else {
        const result = await rpc.request('turn/start', {
          threadId,
          input,
          clientUserMessageId: pending.id,
          ...(collaborationMode
            ? { collaborationMode }
            : {
                ...(promptOptions.model ? { model: promptOptions.model } : {}),
                ...(promptOptions.effort ? { effort: promptOptions.effort } : {})
              })
        })
        this.activeTurns.set(id, result.turn?.id || result.id)
      }
    } else if (session.agent === 'hermes') {
      const rpc = await this.hermesClient()
      await rpc.request('session/resume', { sessionId: id, cwd: session.cwd || homedir(), mcpServers: context?.mcp ? [{ name: 'ambientic', ...context.mcp }] : [] })
      this.activeTurns.set(id, id)
      const hermesText = hasConversation || !context?.binding?.capsuleText
        ? assembleProviderPrompt(text, promptOptions)
        : `${context.binding.capsuleText}\n\n${assembleProviderPrompt(text, promptOptions)}`
      void rpc.request('session/prompt', { sessionId: id, prompt: [{ type: 'text', text: hermesText }] }, 60 * 60 * 1000).then(() => this.finish(id)).catch((error) => this.fail(id, error))
    } else if (session.agent === 'claude') {
      this.runClaude(session, assembleProviderPrompt(text, promptOptions), { mode: promptOptions.mode, model: promptOptions.model, effort: promptOptions.effort, context, additionalRoots: [...new Set([...additionalToolRoots(cwd, promptOptions.attachments), ...discoverable.map((item) => item.cwd)])] })
    } else throw new Error(`Managed prompts are not supported for ${session.agent}.`)
    return this.emitSnapshot(snapshot)
  }

  async create ({ provider, cwd, prompt, model = '', effort = '', mode = 'build', contextBinding = {}, skipAmbienticContext = false }) {
    const requestedDirectory = String(cwd || '').trim()
    const workingDirectory = requestedDirectory || createPrivateTaskWorkspace(this.taskWorkspaceRoot, prompt)
    if (!isAbsolute(workingDirectory)) throw new Error('The selected project folder is not available.')
    if (isBroadProjectRoot(workingDirectory)) {
      throw new Error('Choose a project folder inside your home directory, not your whole home or filesystem.')
    }
    try {
      if (!statSync(workingDirectory).isDirectory()) throw new Error('not a directory')
    } catch {
      throw new Error('The selected project folder is not available.')
    }
    if (provider === 'codex') {
      const rpc = await this.codexClient()
      const normalized = normalizePromptOptions({ model, effort, mode }, provider)
      const context = skipAmbienticContext ? null : this.prepareContext({ provider, providerSessionId: `pending:${randomUUID()}`, cwd: workingDirectory, prompt, contextBinding })
      const result = await rpc.request('thread/start', {
        cwd: workingDirectory,
        ...(normalized.model ? { model: normalized.model } : {}),
        ...(context?.binding?.capsuleText ? { developerInstructions: context.binding.capsuleText } : {}),
        ...(context?.mcp ? { config: { mcp_servers: { ambientic: context.mcp } } } : {})
      })
      const thread = result.thread
      this.codexStartedThreads.add(thread.id)
      if (skipAmbienticContext) this.contextSuppressedSessions.add(thread.id)
      if (context?.binding) this.contextFiles(this.contextEngine.bindProviderSession(context.binding.id, thread.id))
      this.store.ingest({ event: 'session_start', session_id: thread.id, agent: 'codex', project: basename(workingDirectory), cwd: workingDirectory, summary: thread.name || thread.preview || 'New Codex task' })
      if (prompt) await this.send(thread.id, prompt, { ...normalized, contextBinding, skipAmbienticContext, projectContext: requestedDirectory ? { cwd: workingDirectory, name: basename(workingDirectory) } : null })
      else if (normalized.effort) await rpc.request('thread/settings/update', { threadId: thread.id, effort: normalized.effort })
      return thread.id
    }
    if (provider === 'hermes') {
      const rpc = await this.hermesClient()
      const context = skipAmbienticContext ? null : this.prepareContext({ provider, providerSessionId: `pending:${randomUUID()}`, cwd: workingDirectory, prompt, contextBinding })
      const result = await rpc.request('session/new', { cwd: workingDirectory, mcpServers: context?.mcp ? [{ name: 'ambientic', ...context.mcp }] : [] })
      const id = result.sessionId
      if (skipAmbienticContext) this.contextSuppressedSessions.add(id)
      if (context?.binding) this.contextFiles(this.contextEngine.bindProviderSession(context.binding.id, id))
      this.store.ingest({ event: 'session_start', session_id: id, agent: 'hermes', project: basename(workingDirectory), cwd: workingDirectory, summary: 'New Hermes task' })
      if (prompt) await this.send(id, prompt, { mode, model, effort, contextBinding, skipAmbienticContext, projectContext: requestedDirectory ? { cwd: workingDirectory, name: basename(workingDirectory) } : null })
      return id
    }
    if (provider === 'claude') {
      if (this.connector('claude')?.manageable === false) throw new Error('Claude Code is not logged in. Run `claude /login` in a terminal, then refresh Ambientic connectors.')
      const id = randomUUID()
      if (skipAmbienticContext) this.contextSuppressedSessions.add(id)
      else this.prepareContext({ provider, providerSessionId: id, cwd: workingDirectory, prompt, contextBinding })
      this.store.ingest({ event: 'session_start', session_id: id, agent: 'claude', project: basename(workingDirectory), cwd: workingDirectory, summary: 'New Claude task' })
      if (prompt) await this.send(id, prompt, { mode, model, effort, contextBinding, skipAmbienticContext, projectContext: requestedDirectory ? { cwd: workingDirectory, name: basename(workingDirectory) } : null })
      return id
    }
    throw new Error('Choose Codex, Claude Code, or Hermes.')
  }

  runClaude (session, prompt, { compacted = false, mode = 'build', model = '', effort = '', context = null, additionalRoots = [] } = {}) {
    const path = this.connector('claude')?.path || 'claude'
    // Resume only once Claude has actually persisted this session's transcript.
    // A brand-new managed task carries a fresh UUID that Claude has never seen,
    // so its first turn must CREATE the session with --session-id. Using
    // --resume on an id that doesn't exist yet fails with "No conversation
    // found with session ID" and exits non-zero ("Claude exited with code 1").
    const claudeId = this.claudeSessionId(session)
    const started = Boolean(this.claudeTranscriptFor(session))
    const permissionMode = mode === 'build' ? 'acceptEdits' : 'plan'
    const args = ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--permission-mode', permissionMode]
    if (!this.contextSuppressedSessions.has(session.id)) context ||= this.ensureContext(session, { prompt })
    if (context?.capsulePath) args.push('--append-system-prompt-file', context.capsulePath)
    if (context?.mcpConfigPath) args.push('--mcp-config', context.mcpConfigPath, '--strict-mcp-config')
    // Claude confines its file tools to the working directory. Anything the user
    // attached from outside it is otherwise named in the prompt but unreadable,
    // and -p mode has no way to ask for access, so the turn just reports failure.
    for (const root of additionalRoots) args.push('--add-dir', root)
    // Only forward these when the user picked something; omitting them lets
    // Claude Code apply its own configured defaults.
    if (model) args.push('--model', model)
    if (effort) args.push('--effort', effort)
    args.push(started ? '--resume' : '--session-id', claudeId)
    this.claudeAttempts.set(session.id, { prompt, compacted, mode, model, effort, additionalRoots, resultError: '' })
    const child = this.spawnProcess(path, args, { cwd: session.cwd || homedir(), env: providerSpawnEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    this.activeTurns.set(session.id, child)
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n'); buffer = lines.pop() || ''
      for (const line of lines) this.claudeEvent(session.id, line)
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-8000) })
    child.on('exit', (code) => {
      const attempt = this.claudeAttempts.get(session.id) || {}
      const errorText = attempt.resultError || (code !== 0 ? (stderr.trim() || `Claude exited with code ${code}`) : '')
      if (!errorText) { this.claudeAttempts.delete(session.id); return this.finish(session.id) }
      // First time a resume overflows the context window, compact and retry once
      // so the user keeps going in the same thread instead of hitting a wall.
      if (/prompt is too long|too many tokens|context (?:window|length|too long)/i.test(errorText) && !attempt.compacted) {
        return void this.compactClaudeAndRetry(session.id, attempt.prompt, { mode: attempt.mode, model: attempt.model, effort: attempt.effort, additionalRoots: attempt.additionalRoots })
      }
      this.claudeAttempts.delete(session.id)
      // A failed turn is the single most common bug report ("chat just fails"),
      // and the binary plus Claude's own error text are what make it diagnosable.
      console.error(`[claude] turn failed (exit ${code}) via ${path}: ${String(errorText).slice(0, 500)}`)
      this.fail(session.id, new Error(this.claudeResultError(session.id, errorText)))
    })
  }

  claudeEvent (id, line) {
    let event
    try { event = JSON.parse(line) } catch { return }
    const snapshot = this.snapshots.get(id)
    if (!snapshot) return
    if (event.type === 'assistant') {
      for (const part of event.message?.content || []) {
        if (part.type === 'text') snapshot.messages.push(message('assistant', part.text))
        if (part.type === 'tool_use') snapshot.messages.push(message('activity', JSON.stringify(part.input || {}, null, 2), { kind: 'tool', title: part.name, files: [part.input?.file_path, part.input?.path].filter(Boolean) }))
      }
      snapshot.updatedAt = Date.now()
      this.emitSnapshot({ ...snapshot })
    } else if (event.type === 'result' && event.is_error) {
      // Record the failure; the process 'exit' handler decides whether to
      // compact-and-retry (context overflow) or surface the error.
      const attempt = this.claudeAttempts.get(id)
      // `result` is empty on whole classes of failure — API errors, refusals,
      // limits — and "Claude returned an error" then hides the only fields that
      // say what happened, leaving a bug report with nothing in it.
      if (attempt) attempt.resultError = event.result || claudeErrorDetail(event)
      else this.fail(id, new Error(this.claudeResultError(id, event.result)))
    }
  }

  // Build a compacted, tail-preserving text of a Claude conversation that fits
  // comfortably inside the context window. Keeps the most recent user/assistant
  // exchanges verbatim and notes how many older messages were dropped.
  compactClaudeContext (session, budget = COMPACTION_BUDGET) {
    const convo = claudeMessages(findClaudeTranscript(session))
      .filter((entry) => (entry.role === 'user' || entry.role === 'assistant') && String(entry.text || '').trim() && !isCompactionSeed(entry))
    const kept = []
    let total = 0
    for (let i = convo.length - 1; i >= 0; i -= 1) {
      const line = `${convo[i].role === 'user' ? 'User' : 'Assistant'}: ${String(convo[i].text).trim()}`.slice(0, budget)
      if (kept.length && total + line.length > budget) break
      kept.unshift(line)
      total += line.length
    }
    const omitted = Math.max(0, convo.length - kept.length)
    const note = omitted ? `${omitted} earlier message(s) were omitted; ` : ''
    return `${COMPACTION_HEADER}'s context window, so its history was compressed by Ambientic. ${note}the most recent exchanges are preserved verbatim below. Treat them as authoritative context and continue seamlessly without mentioning this compression.\n\n=== Recent conversation ===\n${kept.join('\n\n')}\n=== End of recent conversation ===`
  }

  // Start a fresh Claude session seeded with the compacted history, remap the UI
  // thread to it, and re-run the user's prompt so the thread continues in place.
  compactClaudeAndRetry (id, prompt, { mode = 'build', model = '', effort = '', additionalRoots = [] } = {}) {
    const session = this.sessionFor(id)
    if (!session) { this.claudeAttempts.delete(id); return this.fail(id, new Error('This conversation is no longer available to compact.')) }
    const summary = this.compactClaudeContext(session)
    const previousProviderId = this.claudeSessionId(session)
    const nextProviderId = randomUUID()
    this.claudeRemap.set(id, nextProviderId)
    const binding = this.contextEngine?.bindingFor('claude', previousProviderId)
    if (binding) this.contextFiles(this.contextEngine.bindProviderSession(binding.id, nextProviderId))
    const snapshot = this.snapshots.get(id)
    if (snapshot) {
      snapshot.messages.push(message('activity', 'This conversation grew past the model context window. Ambientic compressed its history so you can keep going in this thread.', { kind: 'system', title: 'Auto-compacted conversation' }))
      this.emitSnapshot({ ...snapshot, running: true })
    }
    this.runClaude(session, `${summary}\n\n=== The user's next message (respond to this) ===\n${prompt}`, { compacted: true, mode, model, effort, additionalRoots })
  }

  // Turn known Claude -p failures into guidance the user can act on. A resumed
  // conversation whose history exceeds the model context window returns
  // "Prompt is too long"; -p mode cannot auto-compact the way interactive
  // Claude Code does, so point the user at the ways forward.
  claudeResultError (id, result) {
    const text = String(result || 'Claude returned an error')
    if (/prompt is too long|too many tokens|context (?:window|length|too long)/i.test(text)) {
      const cwd = this.sessionFor(id)?.cwd || ''
      return `This conversation is too long for Claude to resume — its history exceeds the model's context window, and non-interactive turns can't compact it. Start a new task${cwd ? ` in ${cwd}` : ''}, or resume it in a terminal (\`claude --resume ${id}\`) and run /compact, then continue here.`
    }
    return text
  }

  codexNotification (event) {
    if (event.method === 'account/login/completed') {
      this.emit('provider-auth', {
        provider: 'codex',
        status: event.params?.success ? 'connected' : 'failed',
        loginId: event.params?.loginId || '',
        error: event.params?.error || ''
      })
      return
    }
    if (event.method === 'account/updated') {
      this.emit('provider-auth', {
        provider: 'codex',
        status: event.params?.authMode ? 'connected' : 'disconnected',
        accountType: event.params?.authMode || '',
        planType: event.params?.planType || ''
      })
      return
    }
    const providerId = event.params?.threadId || event.params?.thread?.id
    if (!providerId) return
    const id = this.uiSessionId('codex', providerId)
    if (event.method === 'turn/started') {
      const turnId = codexEventTurnId(event)
      if (turnId) this.activeTurns.set(id, turnId)
      this.ingestLifecycle(id, 'tool')
      const snapshot = this.snapshots.get(id)
      if (snapshot) this.emitSnapshot({ ...snapshot, running: true })
      return
    }
    if (event.method === 'turn/completed') {
      const turnId = codexEventTurnId(event)
      if (!turnId || this.activeTurns.get(id) !== turnId) return
      return void this.finish(id, turnId)
    }
    if (event.method === 'thread/status/changed') {
      const snapshot = this.snapshots.get(id)
      const running = codexStatusIsRunning(event.params?.status)
      if (snapshot) this.emitSnapshot({ ...snapshot, running })
      return
    }
    const item = event.params?.item
    const mapped = codexItem(item)
    const snapshot = this.snapshots.get(id)
    if (mapped && snapshot) {
      snapshot.messages = reconcileProviderMessage(snapshot.messages, mapped)
      snapshot.updatedAt = Date.now()
      this.emitSnapshot({ ...snapshot })
    }
  }

  hermesNotification (event) {
    if (event.method !== 'session/update') return
    const { sessionId: id, update } = event.params || {}
    const snapshot = this.snapshots.get(id)
    if (!snapshot || !update) return
    const type = update.sessionUpdate
    if (type === 'agent_message_chunk') {
      const text = update.content?.text || ''
      const previous = snapshot.messages.at(-1)
      if (previous?.role === 'assistant' && previous.streaming) previous.text += text
      else snapshot.messages.push(message('assistant', text, { streaming: true }))
    } else if (type === 'tool_call') snapshot.messages.push(message('activity', JSON.stringify(update.rawInput || {}, null, 2), { id: update.toolCallId, kind: 'tool', title: update.title || 'Tool' }))
    else if (type === 'tool_call_update') {
      const item = snapshot.messages.find((entry) => entry.id === update.toolCallId)
      if (item) item.status = update.status
    }
    snapshot.updatedAt = Date.now()
    this.emitSnapshot({ ...snapshot })
  }

  async hermesMessages (id) {
    const db = join(homedir(), '.hermes', 'state.db')
    if (!existsSync(db)) return []
    const escaped = String(id).replaceAll("'", "''")
    const rows = await execJson('/usr/bin/sqlite3', ['-json', db, `select id,role,content,tool_name,tool_calls,timestamp from messages where session_id='${escaped}' and active=1 order by timestamp asc limit 300`])
    return rows.map((row) => row.tool_name
      ? message('activity', row.content || row.tool_calls || '', { id: `hermes:${row.id}`, kind: 'tool', title: row.tool_name })
      : message(row.role === 'assistant' ? 'assistant' : 'user', row.role === 'assistant' ? (row.content || '') : stripAmbienticContext(row.content || ''), { id: `hermes:${row.id}` }))
      .filter((entry) => entry.role === 'activity' || entry.text.trim())
  }

  interrupt (id) {
    const active = this.activeTurns.get(id)
    const cancelledApprovals = this.cancelGatewayApprovals(id)
    if (!active) return cancelledApprovals > 0
    const session = this.sessionFor(id)
    if (session?.agent === 'codex') this.codex?.request('turn/interrupt', { threadId: this.codexThreadId(session), turnId: active }).catch(() => {})
    else if (session?.agent === 'hermes') this.hermes?.request('session/cancel', { sessionId: id }).catch(() => {})
    else if (typeof active.kill === 'function') active.kill('SIGINT')
    this.finish(id)
    return true
  }

  async finish (id, expectedTurnId = '') {
    if (expectedTurnId && this.activeTurns.get(id) !== expectedTurnId) return false
    this.activeTurns.delete(id)
    const snapshot = this.snapshots.get(id)
    const session = this.sessionFor(id)
    if (snapshot) {
      // Hermes ACP emits best-effort chunks around tool calls, but the final
      // canonical assistant message is persisted to state.db before
      // session/prompt resolves. Reconcile here so a dropped/partial chunk can
      // never leave the completed Ambientic transcript showing only its tail.
      if (session?.agent === 'hermes') {
        try {
          const diskMessages = await this.hermesMessages(id)
          if (diskMessages.length) snapshot.messages = diskMessages
        } catch (error) {
          console.error('[ambientic] Hermes transcript reconciliation failed:', error.message)
        }
      }
      let awaitingReply = false
      if (session?.agent === 'codex') {
        try {
          const rpc = await this.codexClient()
          const result = await rpc.request('thread/read', { threadId: this.codexThreadId(session), includeTurns: true })
          snapshot.messages = codexThreadMessages(result.thread)
          snapshot.title = result.thread?.name || result.thread?.preview || snapshot.title
          awaitingReply = codexAwaitsReply(result.thread)
          snapshot.awaitingReply = awaitingReply
        } catch (error) {
          console.error('[ambientic] Codex transcript reconciliation failed:', error.message)
        }
      }
      for (const entry of snapshot.messages) delete entry.streaming
      snapshot.updatedAt = Date.now()
      if (!this.contextSuppressedSessions.has(id)) {
        this.contextEngine?.observeTurn({
          provider: session?.agent,
          providerSessionId: session ? this.providerSessionId(session) : id,
          messages: snapshot.messages.filter((entry) => ['user', 'assistant'].includes(entry.role))
        })
        this.contextEngine?.finishGoalReconciliation?.(session?.agent, session ? this.providerSessionId(session) : id)
      }
      this.ingestLifecycle(id, this.hasPendingApproval(id) || awaitingReply ? 'notification' : 'stop_idle')
      this.emitSnapshot({ ...snapshot, running: false, turnStateKnown: true })
    }
    // A finished turn is only "needs you" when the agent is actually blocked on
    // a pending approval, or Codex ended the turn by asking a clarifying
    // question; otherwise it is simply idle/done, not red.
    return true
  }

  fail (id, error) {
    this.activeTurns.delete(id)
    this.ingestLifecycle(id, 'notification')
    const snapshot = this.snapshots.get(id)
    if (snapshot) this.emitSnapshot({ ...snapshot, running: false, turnStateKnown: true, error: error.message })
  }

  stop () {
    for (const session of new Set([...this.pendingApprovals.values()].filter((item) => item.provider === 'ambientic').map((item) => item.sessionId))) this.cancelGatewayApprovals(session, 'cancelled because Ambientic stopped')
    this.codex?.stop()
    this.hermes?.stop()
    for (const active of this.activeTurns.values()) if (typeof active.kill === 'function') active.kill('SIGTERM')
  }
}
