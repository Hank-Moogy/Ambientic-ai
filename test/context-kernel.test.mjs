import test from 'node:test'
import assert from 'node:assert/strict'
import { ContextStore } from '../src/main/context-store.mjs'
import { ContextEngine, estimateTokens, redactSecrets } from '../src/main/context-engine.mjs'

function fixture () {
  let clock = 1_700_000_000_000
  let sequence = 0
  const store = new ContextStore({
    file: ':memory:',
    now: () => ++clock,
    id: () => `id-${++sequence}`
  })
  const goals = {
    list: () => ({
      goals: [{
        id: 'goal-1',
        projectId: 'project-1',
        title: 'Ship memory',
        outcome: 'Every agent knows the project context.',
        successCriteria: 'Claude decisions can be recalled in Codex.',
        status: 'active',
        updatedAt: 10,
        tasks: [{ id: 'task-1', goalId: 'goal-1', projectId: 'project-1', title: 'Build context kernel', status: 'in_progress', acceptanceCriteria: 'Capsules are frozen.' }]
      }]
    })
  }
  const engine = new ContextEngine({ store, goals, now: () => ++clock, id: () => `engine-${++sequence}` })
  store.upsertProject({ id: 'project-1', rootPath: '/tmp/ambientic', name: 'Ambientic', brief: 'Provider-neutral memory and tools.' })
  return { store, engine }
}

test('migrations are idempotent and FTS recalls consented session messages', () => {
  const { store, engine } = fixture()
  store.migrate()
  const prepared = engine.prepareSession({ provider: 'claude', providerSessionId: 'claude-1', cwd: '/tmp/ambientic' })
  engine.observeTurn({
    provider: 'claude',
    providerSessionId: 'claude-1',
    messages: [{ id: 'message-1', role: 'assistant', text: 'The gateway uses capability tokens for session attribution.' }]
  })
  const hits = engine.recall({ query: 'capability tokens' }, prepared.binding)
  assert.equal(hits[0].type, 'episode')
  assert.match(hits[0].content, /session attribution/)
  store.close()
})

test('capsules bind inferred project, goal, and task and remain frozen after rebinding', () => {
  const { store, engine } = fixture()
  engine.remember({ scope: 'user', kind: 'preference', content: 'User prefers concise implementation updates.' })
  const prepared = engine.prepareSession({ provider: 'codex', providerSessionId: 'codex-1', cwd: '/tmp/ambientic', prompt: 'Build the context kernel.' })
  assert.equal(prepared.binding.projectId, 'project-1')
  assert.equal(prepared.binding.goalId, 'goal-1')
  assert.equal(prepared.binding.taskId, 'task-1')
  assert.match(prepared.capsule.text, /User prefers concise/)
  assert.match(prepared.capsule.text, /Build context kernel/)
  assert.match(prepared.capsule.text, /Goal closeout protocol/)
  assert.match(prepared.capsule.text, /goalId "goal-1"/)
  assert.match(prepared.capsule.text, /linked task is "task-1"/)
  assert.ok(estimateTokens(prepared.capsule.text) <= 1200)

  const original = prepared.binding.capsuleHash
  const rebound = engine.rebind(prepared.binding.id, { goalId: '', taskId: '' })
  assert.equal(rebound.capsuleHash, original)
  assert.equal(rebound.correctedByUser, true)
  store.close()
})

test('one launch cannot mix a project context with an unrelated workspace', () => {
  const { store, engine } = fixture()
  try {
    assert.throws(() => engine.prepareSession({
      provider: 'codex',
      providerSessionId: 'mixed-context',
      cwd: '/tmp/unrelated',
      projectId: 'project-1'
    }), /linked to \/tmp\/ambientic/)

    const nested = engine.prepareSession({
      provider: 'codex',
      providerSessionId: 'nested-workspace',
      cwd: '/tmp/ambientic/packages/desktop',
      projectId: 'project-1'
    })
    assert.equal(nested.binding.projectId, 'project-1')
  } finally { store.close() }
})

test('prompt inference never imports a goal from another project', () => {
  const { store, engine } = fixture()
  try {
    store.upsertProject({ id: 'project-2', rootPath: '/tmp/other', name: 'Other' })
    const prepared = engine.prepareSession({
      provider: 'claude',
      providerSessionId: 'project-scoped-prompt',
      cwd: '/tmp/other',
      prompt: 'Build the context kernel and freeze its capsules.'
    })
    assert.equal(prepared.binding.projectId, 'project-2')
    assert.equal(prepared.binding.goalId, '')
    assert.equal(prepared.binding.taskId, '')
  } finally { store.close() }
})

test('folderless projects keep durable context while execution uses an isolated workspace', () => {
  const { store, engine } = fixture()
  try {
    store.upsertProject({ id: 'project-notes', name: 'Research notes', brief: 'A non-code research project.' })
    const prepared = engine.prepareSession({
      provider: 'hermes',
      providerSessionId: 'folderless-project',
      cwd: '/tmp/ambientic-private-workspace',
      projectId: 'project-notes'
    })
    assert.equal(prepared.binding.projectId, 'project-notes')
    assert.match(prepared.capsule.text, /Research notes/)
    assert.match(prepared.capsule.text, /non-code research project/)
  } finally { store.close() }
})

test('linked work turns require an explicit goal reconciliation and audit skipped closeout', () => {
  const { store, engine } = fixture()
  try {
    engine.prepareSession({ provider: 'codex', providerSessionId: 'codex-closeout', cwd: '/tmp/ambientic' })
    engine.beginGoalReconciliation('codex', 'codex-closeout')
    assert.deepEqual(engine.finishGoalReconciliation('codex', 'codex-closeout'), { required: true, completed: false })
    assert.equal(store.listAudit({ eventType: 'goal.reconciliation.missing' }).length, 1)

    const binding = engine.bindingFor('codex', 'codex-closeout')
    engine.beginGoalReconciliation('codex', 'codex-closeout')
    assert.throws(() => engine.confirmGoalReconciliation(binding, 'Skipped the read.'), /Read the latest linked goal/)
    engine.recordGoalRead(binding)
    engine.confirmGoalReconciliation(binding, 'Acceptance criteria checked; ticket remains in review.')
    assert.deepEqual(engine.finishGoalReconciliation('codex', 'codex-closeout'), { required: true, completed: true })
    assert.equal(store.listAudit({ eventType: 'goal.reconciliation.completed' })[0].resultSummary, 'Acceptance criteria checked; ticket remains in review.')
  } finally { store.close() }
})

test('explicit memories promote immediately while inferred constraints remain candidates', () => {
  const { store, engine } = fixture()
  engine.prepareSession({ provider: 'claude', providerSessionId: 'claude-1', cwd: '/tmp/ambientic' })
  engine.observeTurn({ provider: 'claude', providerSessionId: 'claude-1', messages: [
    { id: 'one', role: 'user', text: 'Remember that releases need an installed-app smoke test.' },
    { id: 'two', role: 'user', text: 'Never put access tokens into agent prompts.' }
  ] })
  const records = store.listMemory({ limit: 10 })
  assert.equal(records.find((item) => /releases need/.test(item.content)).status, 'active')
  assert.equal(records.find((item) => /Never put/.test(item.content)).status, 'candidate')
  store.close()
})

test('candidate promotion requires corroboration from a second session', () => {
  const { store, engine } = fixture()
  engine.prepareSession({ provider: 'claude', providerSessionId: 'claude-1', cwd: '/tmp/ambientic' })
  engine.prepareSession({ provider: 'codex', providerSessionId: 'codex-2', cwd: '/tmp/ambientic' })
  const statement = 'Never publish a release without an installed-app smoke test.'
  engine.observeTurn({ provider: 'claude', providerSessionId: 'claude-1', messages: [{ id: 'first', role: 'user', text: statement }] })
  assert.equal(store.searchMemory('installed-app')[0].status, 'candidate')
  engine.observeTurn({ provider: 'claude', providerSessionId: 'claude-1', messages: [{ id: 'repeat', role: 'user', text: statement }] })
  assert.equal(store.searchMemory('installed-app')[0].corroborationCount, 1)
  engine.observeTurn({ provider: 'codex', providerSessionId: 'codex-2', messages: [{ id: 'second', role: 'user', text: statement }] })
  assert.equal(store.searchMemory('installed-app')[0].status, 'active')
  store.close()
})

test('recall never leaks another project\'s scoped memory into an unbound or differently-bound session', () => {
  const { store, engine } = fixture()
  store.upsertProject({ id: 'project-2', rootPath: '/tmp/other-project', name: 'Other', brief: 'Unrelated project.' })
  engine.remember({ scope: 'project', scopeId: 'project-2', kind: 'decision', content: 'Other project uses a private staging database.' })
  engine.remember({ scope: 'user', kind: 'preference', content: 'User prefers concise implementation updates.' })

  const unbound = engine.prepareSession({ provider: 'claude', providerSessionId: 'claude-unbound', cwd: '/tmp/unknown-project' })
  assert.equal(unbound.binding.projectId, '')
  const hitsFromUnbound = engine.recall({ query: 'staging database' }, unbound.binding)
  assert.equal(hitsFromUnbound.length, 0)
  assert.equal(engine.recall({ query: 'concise implementation' }, unbound.binding).length, 1)

  const otherProject = engine.prepareSession({ provider: 'codex', providerSessionId: 'codex-project-1', cwd: '/tmp/ambientic' })
  assert.equal(otherProject.binding.projectId, 'project-1')
  assert.equal(engine.recall({ query: 'staging database' }, otherProject.binding).length, 0)
  store.close()
})

test('secret-like content is redacted from transcripts and rejected from durable memory', () => {
  const { store, engine } = fixture()
  const redacted = redactSecrets('api_key=secret-value-123456789')
  assert.equal(redacted.sensitive, true)
  assert.doesNotMatch(redacted.text, /secret-value/)
  assert.throws(() => engine.remember({ content: 'api_key=secret-value-123456789' }), /credential or secret/)
  store.close()
})

test('forget removes content while retaining a content-free audit event', () => {
  const { store, engine } = fixture()
  const memory = engine.remember({ scope: 'project', scopeId: 'project-1', kind: 'decision', content: 'Use one MCP gateway.' })
  assert.equal(engine.forget(memory.id), true)
  assert.equal(store.getMemory(memory.id), null)
  const event = store.listAudit({ eventType: 'memory.forgotten' })[0]
  assert.equal(event.eventType, 'memory.forgotten')
  assert.doesNotMatch(event.resultSummary, /one MCP gateway/)
  store.close()
})

test('project provider exclusions stop transcript ingestion', () => {
  const value = fixture()
  try {
    const project = value.store.upsertProject({ id: 'private-project', rootPath: '/tmp/private', name: 'Private', exclusions: ['provider:claude'] })
    value.engine.prepareSession({ provider: 'claude', providerSessionId: 'excluded-session', projectId: project.id })
    const result = value.engine.observeTurn({ provider: 'claude', providerSessionId: 'excluded-session', messages: [{ id: 'm1', role: 'user', text: 'Remember that this should never be indexed.' }] })
    assert.equal(result.skipped, 'project_exclusion')
    assert.equal(value.store.searchMessages('indexed').length, 0)
  } finally { value.store.close() }
})

test('sensitive personal assertions remain review-only and out of recall', () => {
  const value = fixture()
  try {
    const prepared = value.engine.prepareSession({ provider: 'codex', providerSessionId: 'sensitive-session', cwd: '/tmp/context-project' })
    const record = value.engine.remember({ content: 'The user has a medical diagnosis that affects scheduling.', kind: 'fact', scope: 'project' }, prepared.binding)
    assert.equal(record.status, 'candidate')
    assert.equal(record.sensitive, true)
    assert.equal(value.engine.recall({ query: 'diagnosis' }, prepared.binding).length, 0)
  } finally { value.store.close() }
})

test('reconnecting an MCP server never silently reinstates auto-approval over a human denial', () => {
  const { store } = fixture()
  try {
    store.upsertConnection({ id: 'conn-1', name: 'Test server', transport: 'stdio', config: { command: 'true' } })
    store.replaceCapabilities('conn-1', [{ name: 'list_files', description: 'List files in a folder.', permission: 'read' }])
    const initial = store.getCapability('conn-1:list_files')
    assert.equal(initial.permissionMode, 'auto')

    store.updateCapabilityPolicy('conn-1:list_files', 'deny')
    assert.equal(store.getCapability('conn-1:list_files').permissionMode, 'deny')

    // Reconnect: the server re-reports the same read-only tool.
    store.replaceCapabilities('conn-1', [{ name: 'list_files', description: 'List files in a folder.', permission: 'read' }])
    assert.equal(store.getCapability('conn-1:list_files').permissionMode, 'deny')

    // A capability a human explicitly allowed to auto-run must fall back to
    // requiring approval if the server later reclassifies it as write/destructive.
    store.updateCapabilityPolicy('conn-1:list_files', 'auto')
    store.replaceCapabilities('conn-1', [{ name: 'list_files', description: 'Delete files in a folder.', permission: 'destructive' }])
    const escalated = store.getCapability('conn-1:list_files')
    assert.equal(escalated.permission, 'destructive')
    assert.equal(escalated.permissionMode, 'ask')
  } finally { store.close() }
})
