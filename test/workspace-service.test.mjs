import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkspaceService } from '../src/main/workspace-service.mjs'

test('reconciles a partial Hermes ACP stream with the completed database transcript', async () => {
  const session = { id: 'hermes-session', agent: 'hermes', cwd: '/tmp/project', state: 'running' }
  const events = []
  const ingested = []
  const service = new WorkspaceService({
    list: () => [session],
    ingest: (event) => ingested.push(event)
  }, () => [])

  service.snapshots.set(session.id, {
    id: session.id,
    provider: 'hermes',
    messages: [{ id: 'partial', role: 'assistant', text: 'only the streamed tail', streaming: true }],
    artifacts: [],
    approvals: [],
    running: true,
    state: 'running'
  })
  service.hermesMessages = async () => [
    { id: 'full', role: 'assistant', text: 'The complete saved Hermes response.' }
  ]
  service.on('change', (snapshot) => events.push(snapshot))

  await service.finish(session.id)

  assert.equal(events.at(-1).messages.length, 1)
  assert.equal(events.at(-1).messages[0].text, 'The complete saved Hermes response.')
  assert.equal(events.at(-1).messages[0].streaming, undefined)
  assert.equal(events.at(-1).running, false)
  // A completed turn with no pending approval is idle/done, not red "needs you".
  assert.equal(events.at(-1).state, 'idle')
  assert.equal(ingested.at(-1).event, 'stop_idle')
})

test('a completed turn blocked on a pending approval stays "attention"', async () => {
  const session = { id: 'claude-blocked', agent: 'claude', cwd: '/tmp/project', state: 'running' }
  const ingested = []
  const service = new WorkspaceService({
    list: () => [session],
    ingest: (event) => ingested.push(event)
  }, () => [])
  service.snapshots.set(session.id, {
    id: session.id, provider: 'claude', messages: [], artifacts: [], approvals: [], running: true, state: 'running'
  })
  service.pendingApprovals.set('approval-1', { sessionId: session.id })
  const events = []
  service.on('change', (snapshot) => events.push(snapshot))

  await service.finish(session.id)

  assert.equal(events.at(-1).state, 'attention')
  assert.equal(ingested.at(-1).event, 'notification')
})

test('effectiveState is the single source of truth with clear precedence', () => {
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  // running is shown only when no stronger user-required signal exists
  assert.equal(service.effectiveState({ id: 'x' }, { id: 'x', running: true }), 'running')
  // an active turn counts as running even without snapshot.running
  service.activeTurns.set('y', {})
  assert.equal(service.effectiveState({ id: 'y' }, { id: 'y' }), 'running')
  service.activeTurns.delete('y')
  // error and pending approval both mean "needs you"
  assert.equal(service.effectiveState({ id: 'x' }, { id: 'x', error: 'boom' }), 'attention')
  service.pendingApprovals.set('a', { sessionId: 'x' })
  assert.equal(service.effectiveState({ id: 'x' }, { id: 'x' }), 'attention')
  service.activeTurns.set('x', {})
  assert.equal(service.effectiveState({ id: 'x' }, { id: 'x', running: true }), 'attention')
  service.activeTurns.delete('x')
  service.pendingApprovals.clear()
  // a finished managed snapshot is idle; a history record is history
  assert.equal(service.effectiveState({ id: 'x' }, { id: 'x' }), 'idle')
  assert.equal(service.effectiveState({ id: 'x', history: true }, { id: 'x' }), 'history')
  // live terminal hooks remain authoritative even after a passive transcript read
  assert.equal(service.effectiveState({ id: 'live', state: 'running', tty: '/dev/ttys1' }, { id: 'live', running: false }), 'running')
  assert.equal(service.effectiveState({ id: 'live', state: 'waiting', tty: '/dev/ttys1' }, { id: 'live', running: true }), 'waiting')
  // with no managed snapshot, the store's hook-driven lifecycle state is honored
  assert.equal(service.effectiveState({ id: 'x', state: 'waiting' }, null), 'waiting')
})

test('resolving an approval clears the "attention" state instead of sticking', async () => {
  const session = { id: 'codex-approve', agent: 'codex', cwd: '/tmp/project' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.snapshots.set(session.id, { id: session.id, provider: 'codex', messages: [], artifacts: [], approvals: [], running: false })
  service.pendingApprovals.set('ap-1', { sessionId: session.id, provider: 'codex', options: [], rpc: { respond: () => {} }, requestId: 1 })
  const events = []
  service.on('change', (snapshot) => events.push(snapshot))

  service.emitSnapshot({ ...service.snapshots.get(session.id) })
  assert.equal(events.at(-1).state, 'attention')

  await service.resolveApproval('ap-1', true)
  assert.equal(events.at(-1).state, 'idle')
})

test('ignores a stale Codex completion event for a different active turn', async () => {
  const session = { id: 'codex-desktop:thread-1', threadId: 'thread-1', agent: 'codex', cwd: '/tmp/project', state: 'running' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  const snapshot = { id: session.id, provider: 'codex', messages: [], artifacts: [], approvals: [], running: true, state: 'running' }
  service.snapshots.set(session.id, snapshot)
  service.activeTurns.set(session.id, 'current-turn')

  service.codexNotification({
    method: 'turn/completed',
    params: { threadId: 'thread-1', turn: { id: 'stale-turn', status: 'completed' } }
  })

  assert.equal(service.activeTurns.get(session.id), 'current-turn')
  assert.equal(service.snapshots.get(session.id).running, true)
  assert.equal(service.snapshots.get(session.id).state, 'running')
})

test('steers the exact active Codex turn instead of starting a second turn', async () => {
  const session = { id: 'codex-desktop:thread-1', threadId: 'thread-1', agent: 'codex', cwd: '/tmp/project', state: 'running' }
  const requests = []
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.history.set(session.id, session)
  service.activeTurns.set(session.id, 'active-turn')
  service.read = async () => ({
    id: session.id, provider: 'codex', messages: [], artifacts: [], approvals: [],
    running: true, state: 'running'
  })
  service.codexClient = async () => ({
    request: async (method, params) => {
      requests.push({ method, params })
      return method === 'turn/steer' ? { turnId: 'active-turn' } : {}
    }
  })

  await service.send(session.id, 'Use the newer screenshot.')

  assert.deepEqual(requests.map((entry) => entry.method), ['thread/resume', 'turn/steer'])
  assert.equal(requests[1].params.expectedTurnId, 'active-turn')
  assert.equal(requests[1].params.input[0].text, 'Use the newer screenshot.')
})

test('replaces the optimistic Codex user row when the canonical item arrives', () => {
  const session = { id: 'codex-desktop:thread-1', threadId: 'thread-1', agent: 'codex', cwd: '/tmp/project', state: 'running' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.snapshots.set(session.id, {
    id: session.id,
    provider: 'codex',
    messages: [{
      id: 'local-message',
      role: 'user',
      text: 'Only show this once.',
      pendingProvider: true,
      mode: 'plan',
      files: ['/tmp/reference.md']
    }],
    artifacts: [],
    approvals: [],
    running: true,
    state: 'running'
  })

  service.codexNotification({
    method: 'item/started',
    params: {
      threadId: 'thread-1',
      item: { id: 'provider-message', type: 'userMessage', content: [{ type: 'text', text: 'Only show this once.' }] }
    }
  })

  const messages = service.snapshots.get(session.id).messages
  assert.equal(messages.length, 1)
  assert.equal(messages[0].id, 'provider-message')
  assert.equal(messages[0].pendingProvider, undefined)
  assert.equal(messages[0].mode, 'plan')
  assert.deepEqual(messages[0].files, ['/tmp/reference.md'])
})

test('sends Codex folders as native mentions and uses its native plan preset', async () => {
  const session = { id: 'codex-desktop:thread-plan', threadId: 'thread-plan', agent: 'codex', cwd: '/tmp', state: 'idle' }
  const requests = []
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.history.set(session.id, session)
  service.read = async () => ({
    id: session.id, provider: 'codex', messages: [], artifacts: [], approvals: [],
    running: false, state: 'idle'
  })
  service.codexClient = async () => ({
    request: async (method, params) => {
      requests.push({ method, params })
      if (method === 'collaborationMode/list') return { data: [{ name: 'Plan', mode: 'plan', model: 'test-model', reasoning_effort: 'medium' }] }
      if (method === 'turn/start') return { turn: { id: 'turn-plan' } }
      return {}
    }
  })

  await service.send(session.id, 'Review this folder.', {
    mode: 'plan',
    attachments: [{ path: '/tmp' }]
  })

  const start = requests.find((entry) => entry.method === 'turn/start').params
  assert.deepEqual(start.input[1], { type: 'mention', name: 'tmp', path: '/tmp' })
  assert.equal(start.collaborationMode.mode, 'plan')
  assert.equal(start.collaborationMode.settings.model, 'test-model')
  assert.ok(start.clientUserMessageId)
})

test('orders the workspace by latest message activity across providers', async () => {
  const older = { id: 'claude-old', agent: 'claude', history: true, updatedAt: 100, cwd: '/tmp/old' }
  const newer = { id: 'hermes-new', agent: 'hermes', history: true, updatedAt: 200, cwd: '/tmp/new' }
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  service.history = new Map([[older.id, older], [newer.id, newer]])
  service.historyRefreshedAt = Date.now()
  service.snapshots.set(older.id, {
    id: older.id,
    provider: 'claude',
    title: 'Recently continued',
    updatedAt: 300,
    messages: [],
    artifacts: [],
    approvals: [],
    running: false
  })

  const result = await service.list()
  assert.deepEqual(result.map((session) => session.id), ['claude-old', 'hermes-new'])
  assert.equal(result[0].updatedAt, 300)
})

test('starts the official Codex ChatGPT browser login without a terminal', async () => {
  const requests = []
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  service.codexClient = async () => ({
    request: async (method, params) => {
      requests.push({ method, params })
      return { type: 'chatgpt', loginId: 'login-1', authUrl: 'https://chatgpt.com/auth' }
    }
  })

  const result = await service.connectCodexAccount()

  assert.deepEqual(requests, [{
    method: 'account/login/start',
    params: { type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'chatgpt' }
  }])
  assert.deepEqual(result, {
    provider: 'codex',
    mode: 'browser',
    loginId: 'login-1',
    authUrl: 'https://chatgpt.com/auth'
  })
})

test('reports an explicit Codex browser-login result', () => {
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  const events = []
  service.on('provider-auth', (event) => events.push(event))

  service.codexNotification({
    method: 'account/login/completed',
    params: { loginId: 'login-1', success: true, error: null }
  })

  assert.deepEqual(events, [{
    provider: 'codex',
    status: 'connected',
    loginId: 'login-1',
    error: ''
  }])
})

test('reads the authenticated Codex account as a login fallback', async () => {
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  service.codexClient = async () => ({
    request: async (method, params) => {
      assert.equal(method, 'account/read')
      assert.deepEqual(params, { refreshToken: false })
      return { account: { type: 'chatgpt', email: 'sam@example.com', planType: 'plus' }, requiresOpenaiAuth: true }
    }
  })

  assert.deepEqual(await service.codexAccountStatus(), {
    connected: true,
    accountType: 'chatgpt',
    email: 'sam@example.com',
    planType: 'plus'
  })
})
test('applies a persistent user alias to workspace lists and snapshots', async () => {
  const session = { id: 'codex-desktop:thread-123', agent: 'codex', task: 'New project', project: 'Codex', cwd: '/Users/test', state: 'idle' }
  let renamed = null
  let saved = null
  const store = {
    list: () => [session],
    updateTask: (id, title, _fingerprint, source) => { renamed = { id, title, source }; session.task = title }
  }
  const service = new WorkspaceService(store, () => [], {
    aliases: {},
    onAliasesChange: (aliases) => { saved = aliases }
  })
  assert.deepEqual(await service.rename(session.id, '  AgentBase  '), { id: session.id, title: 'AgentBase' })
  assert.deepEqual(renamed, { id: session.id, title: 'AgentBase', source: 'user' })
  assert.equal(saved[session.id], 'AgentBase')
  assert.equal((await service.list()).find((item) => item.id === session.id).task, 'AgentBase')
  assert.equal(service.baseSnapshot(session).title, 'AgentBase')
})
