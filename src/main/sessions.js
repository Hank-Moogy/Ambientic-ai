import { EventEmitter } from 'node:events'
import { basename } from 'node:path'

// Pad states. `attention` and `waiting` both mean "needs me" — split so the UI
// can tell "blocked on a permission" (amber) from "finished its turn" (red).
export const STATE = {
  RUNNING: 'running', // agent is actively working
  WAITING: 'waiting', // Stop fired — turn finished, your move
  ATTENTION: 'attention', // Notification fired — blocked on permission / idle nudge
  IDLE: 'idle', // session alive, nothing happening
  ENDED: 'ended' // session closed — removed
}

const PRIORITY = { attention: 2, waiting: 2, idle: 2, running: 1, ended: -1 }

// How a raw lifecycle event moves the pad's state.
const TRANSITION = {
  session_start: STATE.IDLE,
  prompt: STATE.RUNNING,
  tool: STATE.RUNNING,
  notification: STATE.ATTENTION,
  stop: STATE.WAITING, // terminal turn finished — "your move" (hook-driven sessions)
  stop_idle: STATE.IDLE, // managed turn finished with nothing blocked on you
  session_end: STATE.ENDED
}

// Sessions untouched for this long are reaped (terminal closed without a clean
// SessionEnd, machine slept, etc.).
const STALE_MS = 1000 * 60 * 60 * 4
// A hook-backed provider can be interrupted or killed before its Stop hook
// runs. Process discovery proves the terminal is alive, not that a turn is
// still executing, so expire only stale RUNNING states while retaining the
// session and any WAITING/ATTENTION signal that genuinely needs the user.
const STALE_RUNNING_MS = 1000 * 60 * 15
const MAX_HARDWARE_PADS = 64
const ACTIVITY_EVENTS = new Set(['prompt', 'tool', 'notification', 'stop', 'stop_idle'])

function isTransientAgentCwd (cwd) {
  const value = String(cwd || '')
  return value.includes('/.codex/plugins/cache/') ||
    value.includes('/.claude/plugins/cache/') ||
    value.includes('/.kimi-code/plugins/cache/') ||
    value.includes('/.hermes/plugins/')
}

let SEQ = 0

export class SessionStore extends EventEmitter {
  constructor () {
    super()
    this.map = new Map()
    this.taskCache = new Map()
    this.aliases = new Map()
    // Rebuilt on every app launch, then held stable for that launch. The first
    // eligible sessions are the most recently active ones; later sessions fill
    // vacated pads without moving anything already under the user's hand.
    this.padOrder = []
    this._reaper = setInterval(() => this.reap(), 30_000)
    if (this._reaper.unref) this._reaper.unref()
  }

  keyFor (e) {
    return e.session_id || `${e.agent || 'agent'}:${e.cwd || ''}:${e.tty || ''}`
  }

  taskKeyFor (s) {
    return s?.tty ? `tty:${s.tty}` : (s?.id ? `session:${s.id}` : '')
  }

  taskRecordMatches (record, s) {
    if (!record || !s) return false
    // TTY is already the cache key. Keep its task when the previous cwd was a
    // known transient plugin folder, but retain the cwd guard for genuine TTY
    // reuse by another project.
    if (record.cwd && s.cwd && record.cwd !== s.cwd && !isTransientAgentCwd(record.cwd)) return false
    if (record.agent && s.agent && record.agent !== s.agent) return false
    return true
  }

  applyCachedTask (s) {
    const record = this.taskCache.get(this.taskKeyFor(s))
    if (!this.taskRecordMatches(record, s)) return false
    s.task = record.label
    s.taskFingerprint = record.fingerprint || ''
    s.taskSource = record.source || 'cache'
    // A live terminal rediscovered after launch can reclaim a pad from the last
    // real prompt that named it. Project-only placeholders have no cache record
    // and therefore remain dark.
    s.activityAt = Math.max(Number(s.activityAt) || 0, Number(record.updatedAt) || 0)
    return true
  }

  aliasKeysFor (s) {
    const id = String(s?.id || '')
    const providerId = s?.agent === 'codex' ? String(s.threadId || id).replace(/^codex-desktop:/, '') : ''
    return [...new Set([
      providerId ? `codex:${providerId}` : '',
      id,
      providerId,
      providerId ? `codex-desktop:${providerId}` : ''
    ].filter(Boolean))]
  }

  applyAlias (s) {
    for (const key of this.aliasKeysFor(s)) {
      const label = String(this.aliases.get(key) || '').trim()
      if (!label) continue
      s.task = label.slice(0, 80)
      s.taskFingerprint = ''
      s.taskSource = 'user'
      return true
    }
    return false
  }

  hydrateAliases (records = {}) {
    this.aliases = new Map(Object.entries(records || {}).filter(([, title]) => String(title || '').trim()))
    let changed = false
    for (const s of this.map.values()) if (this.applyAlias(s)) changed = true
    if (changed) this.emit('change', this.list())
  }

  hydrateTasks (records = {}) {
    this.taskCache = new Map(Object.entries(records))
    let changed = false
    for (const s of this.map.values()) {
      if (!s.task && this.applyCachedTask(s)) changed = true
    }
    if (changed) this.emit('change', this.list())
  }

  ingest (e) {
    if (!e || !e.event) return null
    const id = this.keyFor(e)
    const now = Date.now()
    let s = this.map.get(id)

    // One pad represents one terminal surface. Replace a discovery placeholder
    // (or a stale prior agent session) when a real hook identifies that TTY.
    // SessionEnd is excluded so a late shutdown hook cannot delete a newer
    // session that has already taken over the same terminal.
    if (!s && e.event !== 'session_end' && e.tty) {
      for (const [otherId, other] of this.map) {
        if (otherId !== id && other.tty === e.tty) this.map.delete(otherId)
      }
    }

    if (!s) {
      s = {
        id,
        seq: SEQ++, // stable pad position — pads never reshuffle, only recolor
        agent: e.agent || 'claude',
        project: e.project || basename(e.cwd || '') || 'session',
        cwd: e.cwd || '',
        terminalCwd: '',
        tty: e.tty || '',
        term_program: e.term_program || '',
        term_app: e.term_app || '',
        term_pid: e.term_pid || null,
        agent_pid: e.agent_pid || null,
        transcriptPath: e.transcript_path || '',
        state: STATE.IDLE,
        since: now,
        lastSeen: now,
        summary: '',
        task: '',
        contextText: '',
        taskFingerprint: '',
        taskSource: '',
        unseen: false,
        awaitingApproval: false,
        activityAt: 0,
        discovered: false
      }
      this.map.set(id, s)
      this.applyCachedTask(s)
      this.applyAlias(s)
    }

    // Refresh focus/context fields whenever the hook re-reports them.
    // Agent hooks can temporarily report a skill/plugin cache cwd while tools
    // execute, so never let that transient value replace a terminal cwd
    // learned by process discovery.
    if (e.cwd && !s.terminalCwd) { s.cwd = e.cwd; if (!e.project) s.project = basename(e.cwd) || s.project }
    if (e.project && !s.terminalCwd) s.project = e.project
    if (e.tty) s.tty = e.tty
    if (e.term_program) s.term_program = e.term_program
    if (e.term_app) s.term_app = e.term_app
    if (e.term_pid) s.term_pid = e.term_pid
    if (e.agent_pid) s.agent_pid = e.agent_pid
    if (e.transcript_path) s.transcriptPath = String(e.transcript_path).slice(0, 1000)
    if (e.summary) s.summary = String(e.summary).slice(0, 200)
    s.lastSeen = now
    if (ACTIVITY_EVENTS.has(e.event)) {
      s.activityAt = Math.max(Number(s.activityAt) || 0, Number(e.ts) || now)
      s.updatedAt = s.activityAt
    }

    const next = TRANSITION[e.event]
    if (next === undefined) { this.emit('change', this.list()); return s }

    if (next === STATE.ENDED) {
      this.map.delete(id)
      this.emit('change', this.list())
      return null
    }

    if (next !== s.state) {
      s.state = next
      s.since = now
      // Freshly needs-me: flag it so the UI can pulse until you focus it.
      if (next === STATE.WAITING || next === STATE.ATTENTION) s.unseen = true
    }
    // Any forward progress clears the "needs me" flag.
    if (next === STATE.RUNNING) s.unseen = false

    this.emit('change', this.list())
    return s
  }

  syncDiscovered (terminals) {
    const now = Date.now()
    const liveDiscoveryIds = new Set(terminals.map((t) => t.id))
    const liveTtys = new Set(terminals.map((t) => t.tty).filter(Boolean))
    let changed = false

    for (const t of terminals) {
      // A hook-backed entry for this TTY is authoritative for state, while the
      // scanner continuously refreshes its focus metadata.
      const existing = [...this.map.values()].find((s) => s.tty && s.tty === t.tty)
      if (existing) {
        if (t.cwd && (existing.cwd !== t.cwd || existing.terminalCwd !== t.cwd)) {
          existing.cwd = t.cwd
          existing.terminalCwd = t.cwd
          existing.project = t.project
          changed = true
        }
        if (t.term_pid && existing.term_pid !== t.term_pid) { existing.term_pid = t.term_pid; changed = true }
        if (t.term_program && existing.term_program !== t.term_program) { existing.term_program = t.term_program; changed = true }
        if (t.term_app && existing.term_app !== t.term_app) { existing.term_app = t.term_app; changed = true }
        if (t.agent_pid && existing.agent_pid !== t.agent_pid) { existing.agent_pid = t.agent_pid; changed = true }
        if (existing.discovered) {
          if (existing.agent !== t.agent) { existing.agent = t.agent; changed = true }
          existing.lastSeen = now
        }
        if (!existing.task && this.applyCachedTask(existing)) changed = true
        continue
      }

      this.map.set(t.id, {
        ...t,
        terminalCwd: t.cwd || '',
        seq: SEQ++,
        state: STATE.IDLE,
        since: now,
        lastSeen: now,
        summary: 'Detected from the live terminal process; waiting for its next lifecycle event.',
        transcriptPath: '',
        task: '',
        contextText: '',
        taskFingerprint: '',
        taskSource: '',
        unseen: false,
        activityAt: 0,
        discovered: true
      })
      this.applyCachedTask(this.map.get(t.id))
      this.applyAlias(this.map.get(t.id))
      changed = true
    }

    for (const [id, s] of this.map) {
      // Discovery is authoritative for terminal liveness even after a hook has
      // replaced the original discovered id. A session whose agent process no
      // longer owns this TTY is a dead pad and should disappear immediately.
      const missingDiscoveredEntry = s.discovered && !liveDiscoveryIds.has(id)
      const missingHookTerminal = !s.discovered && s.tty && !liveTtys.has(s.tty)
      if (missingDiscoveredEntry || missingHookTerminal) {
        this.map.delete(id)
        changed = true
      }
    }

    if (this.reconcileStaleRunning(now)) changed = true

    if (changed) this.emit('change', this.list())
  }

  reconcileStaleRunning (now = Date.now()) {
    let changed = false
    for (const session of this.map.values()) {
      if (session.discovered || session.externalSource || !session.tty) continue
      if (session.state !== STATE.RUNNING || now - session.lastSeen <= STALE_RUNNING_MS) continue
      session.state = STATE.IDLE
      session.since = now
      session.unseen = false
      changed = true
    }
    return changed
  }

  syncExternal (source, sessions) {
    const now = Date.now()
    const liveIds = new Set(sessions.map((session) => session.id))
    let changed = false

    for (const incoming of sessions) {
      let existing = this.map.get(incoming.id)
      // A Codex thread started through Ambientic is keyed by the provider's raw
      // thread id. Desktop discovery sees that same provider thread with a
      // `codex-desktop:` prefix. Merge the discovery metadata into the managed
      // record instead of lighting two pads for one conversation.
      if (source === 'codex-desktop' && incoming.threadId) {
        const managed = [...this.map.values()].find((candidate) =>
          candidate !== existing &&
          candidate.agent === 'codex' &&
          !candidate.tty &&
          (candidate.threadId || candidate.id) === incoming.threadId
        )
        if (managed) {
          if (existing) this.map.delete(incoming.id)
          existing = managed
          changed = true
        }
      }
      if (!existing) {
        const created = {
          ...incoming,
          seq: SEQ++,
          since: incoming.updatedAt || now,
          lastSeen: now,
          activityAt: Number(incoming.updatedAt) || now,
          terminalCwd: incoming.cwd || '',
          transcriptPath: incoming.rolloutPath || '',
          contextText: '',
          taskFingerprint: '',
          taskSource: 'provider-index',
          unseen: incoming.state === STATE.WAITING || incoming.state === STATE.ATTENTION,
          discovered: false,
          externalSource: source
        }
        this.map.set(incoming.id, created)
        this.applyCachedTask(created)
        this.applyAlias(created)
        changed = true
        continue
      }

      const previousState = existing.state
      for (const [key, value] of Object.entries(incoming)) {
        if (key === 'id') continue
        // A thread receives one Ambientic name. Provider indexes are useful for
        // the initial label, but a later refresh must not rename the same pad —
        // especially after an explicit user rename.
        if (key === 'task' && String(existing.task || '').trim()) continue
        if (existing[key] !== value) { existing[key] = value; changed = true }
      }
      existing.lastSeen = now
      this.applyAlias(existing)
      existing.activityAt = Math.max(Number(existing.activityAt) || 0, Number(incoming.updatedAt) || 0)
      // Only provider-index records are owned by provider discovery. A managed
      // thread enriched above must not disappear merely because it falls out of
      // the desktop index's bounded recent list.
      if (existing.id === incoming.id) existing.externalSource = source
      if (previousState !== existing.state) {
        existing.since = incoming.updatedAt || now
        existing.unseen = existing.state === STATE.WAITING || existing.state === STATE.ATTENTION
      }
    }

    for (const [id, session] of this.map) {
      if (session.externalSource === source && !liveIds.has(id)) {
        this.map.delete(id)
        changed = true
      }
    }

    if (changed) this.emit('change', this.list())
  }

  // Focusing a thread consumes a completed-turn notification. Keep the raw
  // WAITING lifecycle state in the map so an unchanged provider refresh cannot
  // re-arm it; list() presents that acknowledged completion as idle. Genuine
  // ATTENTION remains actionable until its approval or reply is resolved.
  acknowledge (id) {
    const s = this.map.get(id)
    if (!s || !s.unseen) return false
    s.unseen = false
    this.emit('change', this.list())
    return true
  }

  updateTask (id, task, fingerprint = '', source = 'model') {
    const s = this.map.get(id)
    const next = String(task || '').trim().slice(0, 80)
    if (!s || !next) return
    // A delayed inference result or provider refresh must never race past an
    // explicit rename. Only another user rename may replace a user title.
    if (s.taskSource === 'user' && source !== 'user') return
    const nextFingerprint = String(fingerprint || '')
    const changed = s.task !== next || s.taskFingerprint !== nextFingerprint || s.taskSource !== source
    s.task = next
    s.taskFingerprint = nextFingerprint
    s.taskSource = source

    const key = this.taskKeyFor(s)
    if (key) {
      this.taskCache.set(key, {
        label: next,
        fingerprint: nextFingerprint,
        source,
        cwd: s.cwd || '',
        agent: s.agent || '',
        updatedAt: Date.now()
      })
      this.emit('task-cache', this.taskCacheSnapshot())
    }
    if (changed) this.emit('change', this.list())
  }

  updateContext (id, text) {
    const s = this.map.get(id)
    const next = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
    if (!s || !next || s.contextText === next) return
    s.contextText = next
    this.emit('change', this.list())
  }

  // An approval is a question addressed to the person, not a state the agent
  // moved through, so it rides alongside the lifecycle state rather than
  // replacing it: the pad still knows whether the thread was running or idle
  // underneath.
  setApprovalPending (id, pending) {
    const s = this.map.get(id)
    if (!s) return false
    const next = Boolean(pending)
    if (s.awaitingApproval === next) return false
    s.awaitingApproval = next
    this.emit('change', this.list())
    return true
  }

  taskName (id) {
    return this.map.get(id)?.task || ''
  }

  taskFingerprint (id) {
    return this.map.get(id)?.taskFingerprint || ''
  }

  taskCacheSnapshot () {
    return Object.fromEntries(this.taskCache)
  }

  sessionIdForTty (tty) {
    return [...this.map.values()].find((s) => s.tty === tty)?.id || ''
  }

  remove (id) {
    if (this.map.delete(id)) this.emit('change', this.list())
  }

  reap () {
    const now = Date.now()
    let changed = this.reconcileStaleRunning(now)
    for (const [id, s] of this.map) {
      if (now - s.lastSeen > STALE_MS) { this.map.delete(id); changed = true }
    }
    if (changed) this.emit('change', this.list())
  }

  list () {
    this.syncPadAssignments()
    return [...this.map.values()]
      .sort((a, b) => a.seq - b.seq)
      .map((session) => session.state === STATE.WAITING && !session.unseen
        ? { ...session, state: STATE.IDLE }
        : session)
  }

  syncPadAssignments () {
    const eligible = [...this.map.values()].filter((session) => {
      if (!session || session.history || session.state === STATE.ENDED) return false
      if (session.awaitingApproval || [STATE.RUNNING, STATE.WAITING, STATE.ATTENTION].includes(session.state)) return true
      // An idle discovery placeholder has no verified conversation activity.
      // This is the empty "Hermes · AgentBase" pad that used to consume space.
      return (Number(session.activityAt) || 0) > 0
    })
    const byId = new Map(eligible.map((session) => [session.id, session]))
    const retained = this.padOrder.filter((id) => byId.has(id))
    const retainedIds = new Set(retained)
    const candidates = eligible
      .filter((session) => !retainedIds.has(session.id))
      .sort((left, right) => {
        const urgency = (session) => session.awaitingApproval || [STATE.ATTENTION, STATE.WAITING].includes(session.state) ? 2 : session.state === STATE.RUNNING ? 1 : 0
        return urgency(right) - urgency(left) ||
          (Number(right.activityAt || right.updatedAt) || 0) - (Number(left.activityAt || left.updatedAt) || 0) ||
          left.seq - right.seq
      })
    this.padOrder = [...retained, ...candidates.map((session) => session.id)].slice(0, MAX_HARDWARE_PADS)
    const indexById = new Map(this.padOrder.map((id, index) => [id, index]))
    for (const session of this.map.values()) session.padIndex = indexById.has(session.id) ? indexById.get(session.id) : null
  }

  hardwareList (limit = MAX_HARDWARE_PADS) {
    this.syncPadAssignments()
    return this.padOrder
      .slice(0, Math.max(0, Math.min(MAX_HARDWARE_PADS, Number(limit) || MAX_HARDWARE_PADS)))
      .map((id) => this.map.get(id))
      .filter(Boolean)
      .map((session) => session.state === STATE.WAITING && !session.unseen
        ? { ...session, state: STATE.IDLE }
        : session)
  }

  // Aggregate for the menu-bar light.
  summary () {
    let worst = null
    let needy = 0
    for (const s of this.list()) {
      if (!worst || PRIORITY[s.state] > PRIORITY[worst]) worst = s.state
      if (s.state !== STATE.RUNNING) needy++
    }
    return { worst: worst || STATE.IDLE, needy, total: this.map.size }
  }
}
