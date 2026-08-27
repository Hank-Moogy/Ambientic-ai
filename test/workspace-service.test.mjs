import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService, claudeApprovalScopes, claudePermissionsForScope, codexApprovalScopes, createPrivateTaskWorkspace, describeApprovalRequest } from '../src/main/workspace-service.mjs'

test('managed tasks reject unsafe or unavailable explicit project folders', async () => {
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  await assert.rejects(service.create({ provider: 'codex', cwd: homedir() }), /not your whole home/)
  await assert.rejects(service.create({ provider: 'codex', cwd: '/path/that/does/not/exist' }), /not available/)
})

test('creates a private task workspace when no project is selected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ambientic-task-'))
  try {
    const root = join(directory, 'workspaces')
    const workspace = createPrivateTaskWorkspace(root, 'Send Ambientic to a friend', '12345678-aaaa')
    assert.equal(workspace, join(root, 'send-ambientic-to-a-friend-12345678'))
    assert.equal(statSync(workspace).isDirectory(), true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('reads Codex models and their supported reasoning levels from the provider', async () => {
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  service.codexClient = async () => ({
    request: async (method) => {
      assert.equal(method, 'model/list')
      return {
        data: [{
          id: 'model-id',
          model: 'gpt-test',
          displayName: 'GPT Test',
          description: 'Test model',
          isDefault: true,
          defaultReasoningEffort: 'high',
          supportedReasoningEfforts: [
            { reasoningEffort: 'medium', description: 'Balanced' },
            { reasoningEffort: 'high', description: 'Deeper' }
          ]
        }],
        nextCursor: null
      }
    }
  })

  const options = await service.taskOptions('codex')

  assert.equal(options.models[0].id, 'gpt-test')
  assert.equal(options.models[0].defaultEffort, 'high')
  assert.deepEqual(options.models[0].efforts.map((item) => item.id), ['medium', 'high'])
})

test('creates a Codex task with its chosen model, effort, and explicit project context', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ambientic-project-'))
  try {
    const requests = []
    let sent = null
    const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
    service.codexClient = async () => ({
      request: async (method, params) => {
        requests.push({ method, params })
        if (method === 'thread/start') return { thread: { id: 'new-thread' } }
        return {}
      }
    })
    service.send = async (...args) => { sent = args }

    const id = await service.create({ provider: 'codex', cwd: directory, prompt: 'Fix the task flow.', model: 'gpt-test', effort: 'high' })

    assert.equal(id, 'new-thread')
    assert.equal(requests[0].params.model, 'gpt-test')
    assert.equal(requests[0].params.approvalPolicy, 'on-request')
    assert.equal(requests[0].params.approvalsReviewer, 'user')
    assert.equal(sent[0], 'new-thread')
    assert.equal(sent[2].model, 'gpt-test')
    assert.equal(sent[2].effort, 'high')
    assert.deepEqual(sent[2].projectContext, { cwd: directory, name: directory.split('/').at(-1) })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('offers real recent projects but not private task workspaces or protected folders', () => {
  const home = homedir()
  const taskWorkspaceRoot = join(home, '.ambientic', 'workspaces')
  const service = new WorkspaceService({
    list: () => [
      { cwd: join(home, 'AgentBase'), project: 'AgentBase', updatedAt: 30 },
      { cwd: join(taskWorkspaceRoot, 'new-task-1234'), project: 'new-task-1234', updatedAt: 40 },
      { cwd: join(home, 'Documents', 'private-project'), project: 'Private', updatedAt: 50 }
    ],
    ingest: () => {}
  }, () => [], { taskWorkspaceRoot })
  assert.deepEqual(service.recentProjects(), [{ cwd: join(home, 'AgentBase'), name: 'AgentBase' }])
})

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

test('a Codex turn that ends by asking the user a question surfaces as needing you', async () => {
  const session = { id: 'codex-question', agent: 'codex', cwd: '/tmp/project', state: 'running' }
  const ingested = []
  const service = new WorkspaceService({
    list: () => [session],
    ingest: (event) => ingested.push(event)
  }, () => [])
  service.snapshots.set(session.id, {
    id: session.id, provider: 'codex', messages: [], artifacts: [], approvals: [], running: true, state: 'running'
  })
  service.codexClient = async () => ({
    request: async () => ({
      thread: {
        id: 'thread-question',
        turns: [{
          id: 'turn-1',
          status: 'completed',
          items: [
            { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'Rename the button.' }] },
            { id: 'agent-1', type: 'agentMessage', text: 'Should the new label be "Submit" or "Continue"?' }
          ]
        }]
      }
    })
  })
  const events = []
  service.on('change', (snapshot) => events.push(snapshot))

  await service.finish(session.id)

  assert.equal(events.at(-1).state, 'attention')
  assert.equal(ingested.at(-1).event, 'notification')
})

test('a Codex turn that finishes ordinary work without a question stays idle', async () => {
  const session = { id: 'codex-done', agent: 'codex', cwd: '/tmp/project', state: 'running' }
  const ingested = []
  const service = new WorkspaceService({
    list: () => [session],
    ingest: (event) => ingested.push(event)
  }, () => [])
  service.snapshots.set(session.id, {
    id: session.id, provider: 'codex', messages: [], artifacts: [], approvals: [], running: true, state: 'running'
  })
  service.codexClient = async () => ({
    request: async () => ({
      thread: {
        id: 'thread-done',
        turns: [{
          id: 'turn-1',
          status: 'completed',
          items: [
            { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'Rename the button.' }] },
            { id: 'agent-1', type: 'agentMessage', text: 'Done — renamed the button to "Submit".' }
          ]
        }]
      }
    })
  })
  const events = []
  service.on('change', (snapshot) => events.push(snapshot))

  await service.finish(session.id)

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
  // a separate passive Codex app-server cannot demote a real Desktop turn
  assert.equal(service.effectiveState(
    { id: 'desktop', state: 'running', externalSource: 'codex-desktop' },
    { id: 'desktop', running: false, turnStateKnown: true }
  ), 'running')
  // with no managed snapshot, the store's hook-driven lifecycle state is honored
  assert.equal(service.effectiveState({ id: 'x', state: 'waiting' }, null), 'waiting')
})

test('reading a Codex Desktop thread never writes a false idle lifecycle', async () => {
  const session = {
    id: 'codex-desktop:thread-live',
    threadId: 'thread-live',
    agent: 'codex',
    cwd: '/tmp/project',
    state: 'running',
    externalSource: 'codex-desktop'
  }
  const ingested = []
  const service = new WorkspaceService({
    list: () => [session],
    ingest: (event) => ingested.push(event)
  }, () => [{ id: 'codex', label: 'Codex', path: '/tmp/codex' }])
  service.historyRefreshedAt = Date.now()
  service.codexClient = async () => ({
    request: async () => ({
      thread: { id: 'thread-live', status: { type: 'idle' }, turns: [] }
    })
  })

  const snapshot = await service.read(session.id)

  assert.equal(snapshot.running, false)
  assert.equal(snapshot.turnStateKnown, true)
  assert.equal(snapshot.state, 'running')
  assert.deepEqual(ingested, [])
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

test('bridges Claude thread approval through an in-memory provider permission', async () => {
  const session = { id: 'claude-terminal', agent: 'claude', cwd: '/tmp/project', state: 'attention', tty: '/dev/ttys1' }
  const ingested = []
  const service = new WorkspaceService({
    list: () => [session],
    ingest: (event) => {
      ingested.push(event)
      session.state = event.event === 'tool' ? 'running' : session.state
      return session
    }
  }, () => [])
  service.snapshots.set(session.id, { ...service.baseSnapshot(session), messages: [] })
  const suggestion = { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination: 'localSettings' }
  const decisionPromise = service.requestExternalApproval('claude', {
    session_id: session.id,
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    permission_suggestions: [suggestion]
  }, session.id)
  const [approvalId, pending] = [...service.pendingApprovals.entries()][0]

  assert.equal(pending.canRemember, true)
  assert.equal(service.snapshots.get(session.id).approvals[0].resolve, undefined)
  assert.equal(service.snapshots.get(session.id).state, 'attention')

  await service.resolveApproval(approvalId, true, 'session')
  assert.deepEqual(await decisionPromise, {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow', updatedPermissions: [{ ...suggestion, destination: 'session' }] }
    }
  })
  assert.equal(ingested.at(-1).event, 'tool')
})

test('provider approval scopes only advertise decisions the provider can honor', () => {
  const suggestion = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'localSettings' }
  assert.deepEqual(claudeApprovalScopes([suggestion]), ['once', 'session', 'always'])
  assert.deepEqual(claudePermissionsForScope([suggestion], 'session'), [{ ...suggestion, destination: 'session' }])
  assert.deepEqual(claudePermissionsForScope([suggestion], 'always'), [suggestion])

  assert.deepEqual(codexApprovalScopes({ params: {} }), ['once', 'session'])
  assert.deepEqual(codexApprovalScopes({ params: { proposedExecpolicyAmendment: ['prefix_rule(pattern=["npm", "test"], decision="allow")'] } }), ['once', 'session', 'always'])
  assert.deepEqual(codexApprovalScopes({ params: { proposedNetworkPolicyAmendments: [{ host: 'example.com', action: 'allow' }] } }), ['once', 'session', 'always'])
  assert.deepEqual(codexApprovalScopes({ params: { availableDecisions: ['accept', 'decline'] } }), ['once'])
})

test('Codex persistent approval uses its proposed exec-policy amendment', async () => {
  const session = { id: 'thread-policy', agent: 'codex', cwd: '/tmp/project', state: 'running' }
  const responses = []
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.snapshots.set(session.id, { ...service.baseSnapshot(session), messages: [] })
  const amendment = ['prefix_rule(pattern=["npm", "test"], decision="allow")']
  service.providerApproval('codex', { respond: (id, result) => responses.push({ id, result }) }, {
    id: 41,
    method: 'item/commandExecution/requestApproval',
    params: { threadId: session.id, command: 'npm test', proposedExecpolicyAmendment: amendment }
  })
  const [approvalId, approval] = [...service.pendingApprovals.entries()][0]
  assert.deepEqual(approval.scopes, ['once', 'session', 'always'])

  await service.resolveApproval(approvalId, true, 'always')
  assert.deepEqual(responses[0], {
    id: 41,
    result: { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } } }
  })
})

test('Codex permission-profile approvals grant only the requested profile for the chosen scope', async () => {
  const session = { id: 'thread-permissions', agent: 'codex', cwd: '/tmp/project', state: 'running' }
  const responses = []
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.snapshots.set(session.id, { ...service.baseSnapshot(session), messages: [] })
  const permissions = { fileSystem: { write: ['/tmp/shared'] }, network: null }
  service.providerApproval('codex', { respond: (id, result) => responses.push({ id, result }) }, {
    id: 42,
    method: 'item/permissions/requestApproval',
    params: { threadId: session.id, reason: 'Use the shared fixture', permissions }
  })
  const [approvalId] = [...service.pendingApprovals.keys()]

  await service.resolveApproval(approvalId, true, 'session')
  assert.deepEqual(responses[0], { id: 42, result: { permissions, scope: 'session' } })
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

  assert.equal(session.task, 'Use the newer screenshot')
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
    model: 'gpt-test',
    effort: 'high',
    attachments: [{ path: '/tmp' }]
  })

  const start = requests.find((entry) => entry.method === 'turn/start').params
  assert.deepEqual(start.input[1], { type: 'mention', name: 'tmp', path: '/tmp' })
  assert.equal(start.collaborationMode.mode, 'plan')
  assert.equal(start.collaborationMode.settings.model, 'gpt-test')
  assert.equal(start.collaborationMode.settings.reasoning_effort, 'high')
  assert.match(start.input[0].text, /Project context: you are working on tmp at \/tmp/)
  assert.ok(start.clientUserMessageId)
  assert.equal(start.approvalPolicy, 'on-request')
  assert.equal(start.approvalsReviewer, 'user')
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
  assert.deepEqual(await service.rename(session.id, '  Ambientic  '), { id: session.id, title: 'Ambientic' })
  assert.deepEqual(renamed, { id: session.id, title: 'Ambientic', source: 'user' })
  assert.equal(saved['codex:thread-123'], 'Ambientic')
  assert.equal(saved[session.id], undefined)
  assert.equal((await service.list()).find((item) => item.id === session.id).task, 'Ambientic')
  assert.equal(service.baseSnapshot(session).title, 'Ambientic')
})

test('a Codex provider read cannot overwrite a manual Ambientic name', async () => {
  const session = { id: 'codex-desktop:thread-123', threadId: 'thread-123', agent: 'codex', task: 'Provider title', project: 'Codex', cwd: '/Users/test', state: 'idle', externalSource: 'codex-desktop' }
  const service = new WorkspaceService({ list: () => [session], updateTask: () => {} }, () => [], {
    aliases: { 'codex:thread-123': 'My Ambientic name' }
  })
  service.codexClient = async () => ({
    request: async () => ({ thread: { id: 'thread-123', name: '<ambientic-context mode="build"> raw provider title', status: { type: 'idle' }, turns: [] } })
  })
  assert.equal((await service.read(session.id)).title, 'My Ambientic name')
})

// An approval card must say what is being requested, not just which tool wants
// to run — the title is the whole basis for allowing or denying.
test('approval titles describe the actual request, not just the tool name', () => {
  assert.equal(describeApprovalRequest('Bash', { command: 'git push origin main', description: 'Push the branch' }), 'Run: Push the branch')
  assert.equal(describeApprovalRequest('Bash', { command: 'rm -rf build' }), 'Run: rm -rf build')
  assert.equal(describeApprovalRequest('Write', { file_path: '/tmp/a/b/c/notes.md' }), 'Write \u2026/c/notes.md')
  assert.equal(describeApprovalRequest('WebFetch', { url: 'https://example.com/a/b?x=1' }), 'Fetch example.com')
  assert.equal(describeApprovalRequest('WebSearch', { query: 'electron pty' }), 'Web search: electron pty')
  assert.equal(describeApprovalRequest('Grep', { pattern: 'TODO', path: '/tmp/x/src' }), 'Search for TODO in \u2026/x/src')
})

test('approval titles handle MCP tools and unknown tools without losing meaning', () => {
  assert.equal(describeApprovalRequest('mcp__github__create_issue', {}), 'github: create issue')
  assert.equal(describeApprovalRequest('SomeNewTool', { path: '/tmp/thing' }), 'SomeNewTool: /tmp/thing')
  assert.equal(describeApprovalRequest('', {}), 'Claude Code tool')
})

test('approval titles stay short enough for the card', () => {
  const title = describeApprovalRequest('Bash', { command: 'echo ' + 'x'.repeat(500) })
  assert.ok(title.length <= 120, `title was ${title.length} chars`)
  assert.ok(title.endsWith('\u2026'))
})

test('a task launched without a project can still discover and reach the others', async () => {
  const spawned = []
  const session = { id: 'thread-1', agent: 'claude', cwd: '/tmp/scratch', project: 'scratch' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [], {
    spawnProcess: (path, args) => {
      spawned.push(args)
      return { stdout: { on () {} }, stderr: { on () {} }, on () {} }
    }
  })
  service.claudeTranscriptFor = () => ''
  service.ensureContext = () => null
  service.read = async () => ({ id: 'thread-1', messages: [], artifacts: [], approvals: [] })
  service.recentProjects = () => [
    { cwd: '/Users/person/projects/ambientic', name: 'Ambientic' },
    { cwd: '/Users/person/projects/memoli', name: 'Memoli' }
  ]
  service.emitSnapshot = (snapshot) => snapshot
  service.ingestLifecycle = () => {}

  await service.send('thread-1', 'Fix the router in memoli.')

  // Scope is no longer pre-granted through the sandbox; the agent is told what
  // exists and the broker decides each request. Naming them is what makes them
  // reachable at all, so that is what this asserts.
  const args = spawned[0]
  assert.equal(args.includes('--add-dir'), false)
  const prompt = args[args.indexOf('-p') + 1]
  assert.match(prompt, /Memoli: \/Users\/person\/projects\/memoli/)
  assert.match(prompt, /Ambientic: \/Users\/person\/projects\/ambientic/)
})

test('a failed turn reports why, even when Claude sends an empty result', () => {
  const failures = []
  const session = { id: 'thread-1', agent: 'claude', cwd: '/tmp/project' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [], {
    spawnProcess: () => ({ stdout: { on () {} }, stderr: { on () {} }, on () {} })
  })
  service.claudeTranscriptFor = () => ''
  service.ensureContext = () => null
  service.fail = (id, error) => failures.push(error.message)
  service.snapshots.set('thread-1', { id: 'thread-1', messages: [] })

  service.runClaude(session, 'Do it.', {})
  service.claudeEvent('thread-1', JSON.stringify({
    type: 'result',
    is_error: true,
    result: '',
    api_error_status: 429,
    subtype: 'error_during_execution',
    permission_denials: [{ tool_name: 'Read' }]
  }))

  const detail = service.claudeAttempts.get('thread-1').resultError
  assert.match(detail, /API status 429/)
  assert.match(detail, /subtype error_during_execution/)
  assert.match(detail, /denied Read/)
})

function brokerService (session, projects = []) {
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.recentProjects = () => projects
  service.emitSnapshot = (snapshot) => snapshot
  service.baseSnapshot = () => ({ id: session.id, messages: [] })
  return service
}

test('a terminal session is never brokered, so it can never wait on Ambientic', async () => {
  const terminal = { id: 'sess-1', agent: 'claude', cwd: '/Users/person/projects/app', tty: 'ttys004' }
  const service = brokerService(terminal)
  assert.equal(await service.requestToolPermission({ sessionId: 'sess-1', tool: 'Read', input: { file_path: '/etc/hosts' } }), null)

  const history = { id: 'sess-2', agent: 'claude', cwd: '/Users/person/projects/app', history: true }
  assert.equal(await brokerService(history).requestToolPermission({ sessionId: 'sess-2', tool: 'Read', input: { file_path: '/etc/hosts' } }), null)
})

test('a managed thread is answered at once for anything already in scope', async () => {
  const managed = { id: 'sess-3', agent: 'claude', cwd: '/Users/person/projects/app' }
  const service = brokerService(managed)
  const verdict = await service.requestToolPermission({
    sessionId: 'sess-3', tool: 'Read', input: { file_path: '/Users/person/projects/app/src/index.js' }
  })
  assert.equal(verdict.decision, 'allow')
  assert.equal(service.pendingApprovals.size, 0)
})

test('an out-of-scope tool asks, waits for the answer, and remembers the folder', async () => {
  const managed = { id: 'sess-4', agent: 'claude', cwd: '/Users/person/projects/app' }
  const service = brokerService(managed)
  const asked = await service.requestToolPermission({
    sessionId: 'sess-4', tool: 'Read', input: { file_path: '/Users/person/notes/spec.md' }
  })
  assert.equal(asked.decision, 'ask')
  assert.equal(service.pendingApprovals.size, 1)

  const waiting = service.awaitToolPermission(asked.id)
  await service.resolveApproval(asked.id, true, true)
  assert.equal((await waiting).decision, 'allow')

  // A bare `true` is the older boolean caller and still means "this thread".
  assert.deepEqual(service.listGrants().map((grant) => [grant.scope, grant.root]), [['session', '/Users/person/notes']])
  const second = await service.requestToolPermission({
    sessionId: 'sess-4', tool: 'Read', input: { file_path: '/Users/person/notes/other.md' }
  })
  assert.equal(second.decision, 'allow')
})

test('an approval nobody is holding open resolves instead of hanging the caller', async () => {
  const service = brokerService({ id: 'sess-5', agent: 'claude', cwd: '/tmp/x' })
  assert.equal(await service.awaitToolPermission('tool:does-not-exist'), null)
})

test('the hardware light follows pending approvals without each call site saying so', async () => {
  const session = { id: 'sess-6', agent: 'claude', cwd: '/Users/person/projects/app' }
  const flags = []
  const service = new WorkspaceService({
    list: () => [session],
    ingest: () => {},
    setApprovalPending: (id, pending) => flags.push({ id, pending })
  }, () => [])
  service.recentProjects = () => []
  service.emitSnapshot = (snapshot) => snapshot
  service.baseSnapshot = () => ({ id: session.id, messages: [] })

  const asked = await service.requestToolPermission({
    sessionId: 'sess-6', tool: 'Read', input: { file_path: '/Users/person/elsewhere/x.md' }
  })
  assert.deepEqual(flags.at(-1), { id: 'sess-6', pending: true })

  await service.resolveApproval(asked.id, true, false)
  assert.deepEqual(flags.at(-1), { id: 'sess-6', pending: false })
})

test('a file the user attached is not then asked about', async () => {
  const session = { id: 'sess-7', agent: 'claude', cwd: '/Users/person/projects/app' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [], {
    spawnProcess: () => ({ stdout: { on () {} }, stderr: { on () {} }, on () {} })
  })
  service.claudeTranscriptFor = () => ''
  service.ensureContext = () => null
  service.recentProjects = () => []
  service.read = async () => ({ id: 'sess-7', messages: [], artifacts: [], approvals: [] })
  service.emitSnapshot = (snapshot) => snapshot
  service.baseSnapshot = () => ({ id: 'sess-7', messages: [] })
  service.ingestLifecycle = () => {}

  // Attachments are stat-checked before they are trusted, so this needs a file
  // that is really there.
  const directory = mkdtempSync(join(tmpdir(), 'ambientic-attach-'))
  const attached = join(directory, 'spec.md')
  writeFileSync(attached, 'spec')
  try {
    await service.send('sess-7', 'Compare this.', { attachments: [{ path: attached }] })
    // Attaching is the user choosing it, so reading it is already decided.
    const verdict = await service.requestToolPermission({
      sessionId: 'sess-7', tool: 'Read', input: { file_path: attached }
    })
    assert.equal(verdict.decision, 'allow')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Always allow survives into other threads; Allow for this thread does not', async () => {
  const persisted = []
  const session = { id: 'sess-8', agent: 'claude', cwd: '/Users/person/projects/app' }
  const other = { id: 'sess-9', agent: 'claude', cwd: '/Users/person/projects/app' }
  const service = new WorkspaceService({ list: () => [session, other], ingest: () => {} }, () => [], {
    onGrantsChange: (list) => persisted.push(list.length)
  })
  service.recentProjects = () => []
  service.emitSnapshot = (snapshot) => snapshot
  service.baseSnapshot = (s) => ({ id: s.id, messages: [] })

  const read = { tool: 'Read', input: { file_path: '/Users/person/notes/spec.md' } }
  const first = await service.requestToolPermission({ sessionId: 'sess-8', ...read })
  await service.resolveApproval(first.id, true, 'session')
  assert.equal((await service.requestToolPermission({ sessionId: 'sess-8', ...read })).decision, 'allow')
  // A thread grant is that thread's alone.
  assert.equal((await service.requestToolPermission({ sessionId: 'sess-9', ...read })).decision, 'ask')
  assert.deepEqual(persisted, [], 'a thread grant must never be written to disk')

  const second = await service.requestToolPermission({ sessionId: 'sess-9', ...read })
  await service.resolveApproval(second.id, true, 'always')
  assert.equal((await service.requestToolPermission({ sessionId: 'sess-9', ...read })).decision, 'allow')
  assert.deepEqual(persisted, [1], 'an always grant is persisted once')
})

test('a shell command stops asking once allowed, which is what made it unbearable', async () => {
  const session = { id: 'sess-10', agent: 'claude', cwd: '/Users/person/projects/app' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.recentProjects = () => []
  service.emitSnapshot = (snapshot) => snapshot
  service.baseSnapshot = () => ({ id: 'sess-10', messages: [] })

  const bash = { tool: 'Bash', input: { command: 'npm test' } }
  const asked = await service.requestToolPermission({ sessionId: 'sess-10', ...bash })
  assert.equal(asked.decision, 'ask')
  // The card has to offer a way to remember, or the answer cannot stick.
  assert.equal(service.pendingApprovals.get(asked.id).canRemember, true)
  await service.resolveApproval(asked.id, true, 'session')
  assert.equal((await service.requestToolPermission({ sessionId: 'sess-10', ...bash })).decision, 'allow')
})

test('revoking a standing permission takes effect immediately', async () => {
  const session = { id: 'sess-11', agent: 'claude', cwd: '/Users/person/projects/app' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])
  service.recentProjects = () => []
  service.emitSnapshot = (snapshot) => snapshot
  service.baseSnapshot = () => ({ id: 'sess-11', messages: [] })

  const read = { tool: 'Read', input: { file_path: '/Users/person/notes/spec.md' } }
  const asked = await service.requestToolPermission({ sessionId: 'sess-11', ...read })
  await service.resolveApproval(asked.id, true, 'always')
  const [grant] = service.listGrants()
  assert.equal(service.revokeGrant(grant.id), true)
  assert.equal((await service.requestToolPermission({ sessionId: 'sess-11', ...read })).decision, 'ask')
})
