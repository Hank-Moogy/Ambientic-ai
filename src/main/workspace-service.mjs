import { EventEmitter } from 'node:events'
import { spawn, execFile } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonRpcProcess } from './json-rpc-process.mjs'

const PROVIDER_LABELS = { codex: 'Codex', claude: 'Claude Code', hermes: 'Hermes' }

// Prefix of the synthetic seed message written when a Claude thread is
// auto-compacted. Used both to build the seed and to hide it from the
// rendered transcript on reload.
const COMPACTION_HEADER = 'You are resuming a conversation that exceeded the model'
const COMPACTION_BUDGET = 24000

function textContent (value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map((part) => part?.text || part?.content || '').filter(Boolean).join('\n')
}

function message (role, text, extra = {}) {
  return { id: extra.id || randomUUID(), role, text: String(text || ''), ...extra }
}

function codexItem (item) {
  if (!item) return null
  if (item.type === 'userMessage') return message('user', textContent(item.content), { id: item.id })
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
      const text = textContent(row.message?.content)
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
  const value = textContent(row.message?.content).replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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
  constructor (store, getConnectors, { aliases = {}, onAliasesChange } = {}) {
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
    // Auto-compaction: when a Claude thread's history overflows the context
    // window, we start a fresh, compacted Claude session and remap the UI
    // thread id -> the new session id so the user continues in place.
    this.claudeRemap = new Map()
    this.claudeAttempts = new Map()
    this.history = new Map()
    this.historyRefreshedAt = 0
    this.aliases = new Map(Object.entries(aliases || {}).filter(([, title]) => String(title || '').trim()))
    this.onAliasesChange = onAliasesChange
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
      } catch (error) { console.error('[agentbase] Hermes history discovery failed:', error.message) }
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
    return [...merged.values()].map((session) => {
      const alias = this.aliases.get(session.id)
      return alias ? { ...session, task: alias, taskSource: 'user' } : session
    }).sort((left, right) => (right.updatedAt || right.lastSeen || 0) - (left.updatedAt || left.lastSeen || 0))
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
      nativeAvailable: Boolean(session.deepLink || session.tty),
      managed: ['codex', 'claude', 'hermes'].includes(session.agent)
    }
  }

  emitSnapshot (snapshot) {
    snapshot.artifacts = [...new Map(snapshot.messages.flatMap((entry) => (entry.files || []).map((path) => [path, { path, name: basename(path), kind: 'file' }]))).values()]
    snapshot.approvals = [...this.pendingApprovals.values()].filter((approval) => approval.sessionId === snapshot.id)
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

  // The single source of truth for a thread's UI state. Precedence:
  // running > blocked-on-user (approval/error) > finished(idle) > history >
  // hook-driven store lifecycle (for sessions with no managed snapshot yet).
  effectiveState (session, snapshot) {
    const id = session?.id ?? snapshot?.id
    if (this.isRunning(id, snapshot)) return 'running'
    if (snapshot?.error) return 'attention'
    if (this.hasPendingApproval(id)) return 'attention'
    if (snapshot) return session?.history ? 'history' : 'idle'
    return session?.history ? 'history' : (session?.state || 'idle')
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
        const activeTurnId = codexActiveTurnId(result.thread)
        if (snapshot.running && activeTurnId) this.activeTurns.set(id, activeTurnId)
        else if (!snapshot.running) this.activeTurns.delete(id)
      } else if (session.agent === 'claude') {
        snapshot.transcriptPath = this.claudeTranscriptFor(session)
        const disk = claudeMessages(snapshot.transcriptPath).filter((entry) => !isCompactionSeed(entry))
        if (disk.length) snapshot.messages = disk
      } else if (session.agent === 'hermes') {
        snapshot.messages = await this.hermesMessages(session.id)
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
      rpc.on('exit', () => { this.codex = null; this.codexReady = null })
      rpc.start()
      await rpc.request('initialize', { clientInfo: { name: 'agentbase', title: 'AgentBase', version: '0.8.1' } })
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

  async hermesClient () {
    if (this.hermesReady) return this.hermesReady
    this.hermesReady = (async () => {
      const path = this.connector('hermes')?.path || join(homedir(), '.local', 'bin', 'hermes')
      const rpc = new JsonRpcProcess(path, ['acp'])
      rpc.on('notification', (event) => this.hermesNotification(event))
      rpc.on('request', (request) => this.providerApproval('hermes', rpc, request))
      rpc.on('exit', () => { this.hermes = null; this.hermesReady = null })
      rpc.start()
      await rpc.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'AgentBase', version: '0.8.1' } })
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
      options: request.params?.options || []
    }
    this.pendingApprovals.set(id, { ...approval, rpc, requestId: request.id })
    const snapshot = this.snapshots.get(sessionId)
    // The approval is now pending, so emitSnapshot derives "attention".
    if (snapshot) this.emitSnapshot({ ...snapshot })
  }

  async resolveApproval (approvalId, allow, remember = false) {
    const approval = this.pendingApprovals.get(approvalId)
    if (!approval) return false
    if (approval.provider === 'hermes') {
      const option = approval.options.find((item) => allow ? /allow|approve/i.test(`${item.kind} ${item.name}`) : /reject|deny/i.test(`${item.kind} ${item.name}`)) || approval.options[allow ? 0 : approval.options.length - 1]
      approval.rpc.respond(approval.requestId, { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } })
    } else {
      approval.rpc.respond(approval.requestId, { decision: allow ? (remember ? 'acceptForSession' : 'accept') : 'decline' })
    }
    this.pendingApprovals.delete(approvalId)
    const snapshot = this.snapshots.get(approval.sessionId)
    if (snapshot) this.emitSnapshot({ ...snapshot })
    return true
  }

  async send (id, text) {
    if (!this.history.size) await this.list()
    const session = this.sessionFor(id)
    if (!session) throw new Error('This session is no longer available.')
    const snapshot = await this.read(id)
    snapshot.messages = [...snapshot.messages, message('user', text)]
    snapshot.running = true
    snapshot.updatedAt = Date.now()
    this.emitSnapshot(snapshot)
    if (!session.history) this.store.ingest({ event: 'prompt', session_id: id, agent: session.agent, cwd: session.cwd })
    if (session.agent === 'codex') {
      const rpc = await this.codexClient()
      const threadId = this.codexThreadId(session)
      await rpc.request('thread/resume', { threadId })
      const activeTurnId = this.activeTurns.get(id)
      if (activeTurnId) {
        await rpc.request('turn/steer', {
          threadId,
          expectedTurnId: activeTurnId,
          input: [{ type: 'text', text, text_elements: [] }]
        })
      } else {
        const result = await rpc.request('turn/start', { threadId, input: [{ type: 'text', text, text_elements: [] }] })
        this.activeTurns.set(id, result.turn?.id || result.id)
      }
    } else if (session.agent === 'hermes') {
      const rpc = await this.hermesClient()
      await rpc.request('session/resume', { sessionId: id, cwd: session.cwd || homedir(), mcpServers: [] })
      this.activeTurns.set(id, id)
      void rpc.request('session/prompt', { sessionId: id, prompt: [{ type: 'text', text }] }, 60 * 60 * 1000).then(() => this.finish(id)).catch((error) => this.fail(id, error))
    } else if (session.agent === 'claude') {
      this.runClaude(session, text)
    } else throw new Error(`Managed prompts are not supported for ${session.agent}.`)
    return this.emitSnapshot(snapshot)
  }

  async create ({ provider, cwd, prompt }) {
    const workingDirectory = cwd || homedir()
    if (provider === 'codex') {
      const rpc = await this.codexClient()
      const result = await rpc.request('thread/start', { cwd: workingDirectory })
      const thread = result.thread
      this.store.ingest({ event: 'session_start', session_id: thread.id, agent: 'codex', project: basename(workingDirectory), cwd: workingDirectory, summary: thread.name || thread.preview || 'New Codex task' })
      if (prompt) await this.send(thread.id, prompt)
      return thread.id
    }
    if (provider === 'hermes') {
      const rpc = await this.hermesClient()
      const result = await rpc.request('session/new', { cwd: workingDirectory, mcpServers: [] })
      const id = result.sessionId
      this.store.ingest({ event: 'session_start', session_id: id, agent: 'hermes', project: basename(workingDirectory), cwd: workingDirectory, summary: 'New Hermes task' })
      if (prompt) await this.send(id, prompt)
      return id
    }
    if (provider === 'claude') {
      if (this.connector('claude')?.manageable === false) throw new Error('Claude Code is not logged in. Run `claude /login` in a terminal, then refresh AgentBase connectors.')
      const id = randomUUID()
      this.store.ingest({ event: 'session_start', session_id: id, agent: 'claude', project: basename(workingDirectory), cwd: workingDirectory, summary: 'New Claude task' })
      if (prompt) await this.send(id, prompt)
      return id
    }
    throw new Error('Choose Codex, Claude Code, or Hermes.')
  }

  runClaude (session, prompt, { compacted = false } = {}) {
    const path = this.connector('claude')?.path || 'claude'
    // Resume only once Claude has actually persisted this session's transcript.
    // A brand-new managed task carries a fresh UUID that Claude has never seen,
    // so its first turn must CREATE the session with --session-id. Using
    // --resume on an id that doesn't exist yet fails with "No conversation
    // found with session ID" and exits non-zero ("Claude exited with code 1").
    const claudeId = this.claudeSessionId(session)
    const started = Boolean(this.claudeTranscriptFor(session))
    const args = ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--permission-mode', 'acceptEdits']
    args.push(started ? '--resume' : '--session-id', claudeId)
    this.claudeAttempts.set(session.id, { prompt, compacted, resultError: '' })
    const child = spawn(path, args, { cwd: session.cwd || homedir(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
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
        return void this.compactClaudeAndRetry(session.id, attempt.prompt)
      }
      this.claudeAttempts.delete(session.id)
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
      if (attempt) attempt.resultError = event.result || 'Claude returned an error'
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
    return `${COMPACTION_HEADER}'s context window, so its history was compressed by AgentBase. ${note}the most recent exchanges are preserved verbatim below. Treat them as authoritative context and continue seamlessly without mentioning this compression.\n\n=== Recent conversation ===\n${kept.join('\n\n')}\n=== End of recent conversation ===`
  }

  // Start a fresh Claude session seeded with the compacted history, remap the UI
  // thread to it, and re-run the user's prompt so the thread continues in place.
  compactClaudeAndRetry (id, prompt) {
    const session = this.sessionFor(id)
    if (!session) { this.claudeAttempts.delete(id); return this.fail(id, new Error('This conversation is no longer available to compact.')) }
    const summary = this.compactClaudeContext(session)
    this.claudeRemap.set(id, randomUUID())
    const snapshot = this.snapshots.get(id)
    if (snapshot) {
      snapshot.messages.push(message('activity', 'This conversation grew past the model context window. AgentBase compressed its history so you can keep going in this thread.', { kind: 'system', title: 'Auto-compacted conversation' }))
      this.emitSnapshot({ ...snapshot, running: true })
    }
    this.runClaude(session, `${summary}\n\n=== The user's next message (respond to this) ===\n${prompt}`, { compacted: true })
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
      const index = snapshot.messages.findIndex((entry) => entry.id === mapped.id)
      if (index >= 0) snapshot.messages[index] = mapped
      else snapshot.messages.push(mapped)
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
      : message(row.role === 'assistant' ? 'assistant' : 'user', row.content || '', { id: `hermes:${row.id}` }))
      .filter((entry) => entry.role === 'activity' || entry.text.trim())
  }

  interrupt (id) {
    const active = this.activeTurns.get(id)
    if (!active) return false
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
      // never leave the completed AgentBase transcript showing only its tail.
      if (session?.agent === 'hermes') {
        try {
          const diskMessages = await this.hermesMessages(id)
          if (diskMessages.length) snapshot.messages = diskMessages
        } catch (error) {
          console.error('[agentbase] Hermes transcript reconciliation failed:', error.message)
        }
      }
      if (session?.agent === 'codex') {
        try {
          const rpc = await this.codexClient()
          const result = await rpc.request('thread/read', { threadId: this.codexThreadId(session), includeTurns: true })
          snapshot.messages = codexThreadMessages(result.thread)
          snapshot.title = result.thread?.name || result.thread?.preview || snapshot.title
        } catch (error) {
          console.error('[agentbase] Codex transcript reconciliation failed:', error.message)
        }
      }
      for (const entry of snapshot.messages) delete entry.streaming
      snapshot.updatedAt = Date.now()
      this.emitSnapshot({ ...snapshot, running: false })
    }
    // A finished turn is only "needs you" when the agent is actually blocked on
    // a pending approval; otherwise it is simply idle/done, not red.
    if (session) this.store.ingest({ event: this.hasPendingApproval(id) ? 'notification' : 'stop_idle', session_id: id, agent: session.agent, cwd: session.cwd })
    return true
  }

  fail (id, error) {
    this.activeTurns.delete(id)
    const snapshot = this.snapshots.get(id)
    if (snapshot) this.emitSnapshot({ ...snapshot, running: false, error: error.message })
    const session = this.store.list().find((item) => item.id === id)
    if (session) this.store.ingest({ event: 'notification', session_id: id, agent: session.agent, cwd: session.cwd })
  }

  stop () {
    this.codex?.stop()
    this.hermes?.stop()
    for (const active of this.activeTurns.values()) if (typeof active.kill === 'function') active.kill('SIGTERM')
  }
}
