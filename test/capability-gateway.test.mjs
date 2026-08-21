import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { ContextStore } from '../src/main/context-store.mjs'
import { ContextEngine } from '../src/main/context-engine.mjs'
import { CapabilityGateway, callGatewaySocket } from '../src/main/capability-gateway.mjs'

function fixture ({ start = true, requestApproval } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ambientic-gateway-'))
  const store = new ContextStore({ file: join(directory, 'context.db') })
  const goals = {
    list: () => ({ goals: [
      { id: 'goal-1', title: 'Ship', tasks: [{ id: 'task-1', goalId: 'goal-1', title: 'Test', status: 'ready' }] },
      { id: 'goal-2', title: 'Other', tasks: [{ id: 'task-2', goalId: 'goal-2', title: 'Unrelated', status: 'ready' }] }
    ] }),
    updateTask: (id, patch) => ({ id, ...patch })
  }
  const contextEngine = new ContextEngine({ store, goals })
  const prepared = contextEngine.prepareSession({ provider: 'codex', providerSessionId: 'thread-1', cwd: '/tmp/project', goalId: 'goal-1', taskId: 'task-1' })
  const approvals = []
  const careerUpdates = []
  const discoveryCalls = []
  const career = {
    list: () => ({ profile: { status: 'needs_review', headline: 'AI Product Leader' }, opportunities: [{ id: 'opportunity-1', company: 'Acme', roleTitle: 'Head of Product' }], dailyQueue: { items: [{ opportunityId: 'opportunity-1' }] } }),
    updateProfile: (input) => { careerUpdates.push({ action: 'profile', input }); return { status: 'needs_review', ...input } },
    upsertOpportunity: (input) => { careerUpdates.push({ action: 'upsert', input }); return { id: 'opportunity-1', ...input } },
    updateOpportunity: (id, patch) => { careerUpdates.push({ action: 'status', id, patch }); return { id, ...patch } },
    passOpportunity: (id, reason) => { careerUpdates.push({ action: 'pass', id, reason }); return { id, status: 'Archived' } },
    addInterview: (id, input) => { careerUpdates.push({ action: 'interview', id, input }); return { id: 'interview-1', opportunityId: id } },
    recordMarketScan: (input) => { careerUpdates.push({ action: 'market_scan', input }); return input }
  }
  const gateway = new CapabilityGateway({
    store,
    contextEngine,
    goals,
    career,
    jobDiscovery: async (input) => { discoveryCalls.push(input); return { source: { id: input.source }, jobs: [{ company: 'Remote Co', roleTitle: 'Product Lead' }] } },
    socketPath: join(directory, 'gateway.sock'),
    requestApproval: requestApproval || (async (request) => { approvals.push(request); return true })
  })
  if (start) gateway.start()
  const session = gateway.issueSession(prepared.binding.id)
  return { directory, store, contextEngine, gateway, session, approvals, careerUpdates, discoveryCalls }
}

test('gateway tokens scope native tools and mutations are audited', async () => {
  const value = fixture({ start: false })
  try {
    const listed = await value.gateway.handleRequest({ token: value.session.token, method: 'tools/list' })
    assert.ok(listed.tools.some((tool) => tool.name === 'ambientic_recall'))

    const context = await value.gateway.invoke({ token: value.session.token, tool: 'ambientic_context_get' })
    assert.equal(context.providerSessionId, 'thread-1')

    await assert.rejects(value.gateway.invoke({ token: value.session.token, tool: 'ambientic_task_update', arguments: { taskId: 'task-1', status: 'done' } }), /Read the latest linked goal/)
    const goal = await value.gateway.invoke({ token: value.session.token, tool: 'ambientic_goals', arguments: { action: 'get' } })
    assert.equal(goal.id, 'goal-1')

    const updated = await value.gateway.invoke({
      token: value.session.token,
      tool: 'ambientic_task_update',
      arguments: { taskId: 'task-1', status: 'done', idempotencyKey: 'task-update-1' }
    })
    assert.equal(updated.status, 'done')
    assert.equal(value.approvals.length, 1)
    assert.ok(value.store.listAudit().some((event) => event.tool === 'ambientic_task_update'))

    const closeout = await value.gateway.invoke({ token: value.session.token, tool: 'ambientic_goals', arguments: { action: 'reconcile', note: 'Ticket status checked against acceptance criteria.' } })
    assert.equal(closeout.reconciled, true)
    assert.equal(value.store.listAudit({ eventType: 'goal.reconciliation.completed' }).length, 1)
    await assert.rejects(value.gateway.invoke({ token: value.session.token, tool: 'ambientic_task_update', arguments: { taskId: 'task-2', status: 'done' } }), /only tickets in its linked goal/)

    value.gateway.revokeBinding(context.id)
    await assert.rejects(value.gateway.invoke({ token: value.session.token, tool: 'ambientic_context_get' }), /invalid, expired, or revoked/)
  } finally {
    value.gateway.stop()
    value.store.close()
    rmSync(value.directory, { recursive: true, force: true })
  }
})

test('gateway enforces capability scopes and remembers only session-scoped approvals', async () => {
  const approvals = []
  const value = fixture({
    start: false,
    requestApproval: async (request) => { approvals.push(request); return { allowed: true, remember: true } }
  })
  try {
    await value.gateway.invoke({ token: value.session.token, tool: 'ambientic_goals', arguments: { action: 'get' } })
    await value.gateway.invoke({ token: value.session.token, tool: 'ambientic_task_update', arguments: { taskId: 'task-1', status: 'in_progress' } })
    await value.gateway.invoke({ token: value.session.token, tool: 'ambientic_task_update', arguments: { taskId: 'task-1', status: 'review' } })
    assert.equal(approvals.length, 1)

    const restricted = value.gateway.issueSession(value.session.bindingId, { scopes: ['context:read'] })
    await assert.rejects(value.gateway.invoke({ token: restricted.token, tool: 'ambientic_recall', arguments: { query: 'test' } }), /not authorized for memory:read/)
    assert.equal((await value.gateway.handleRequest({ token: restricted.token, method: 'tools/list' })).tools.length, 1)
  } finally {
    value.gateway.stop()
    value.store.close()
    rmSync(value.directory, { recursive: true, force: true })
  }
})

test('Career OS tools are hidden from ordinary sessions and available to scoped pack sessions', async () => {
  const value = fixture({ start: false })
  try {
    const ordinary = await value.gateway.handleRequest({ token: value.session.token, method: 'tools/list' })
    assert.equal(ordinary.tools.some((tool) => tool.name.startsWith('ambientic_career_')), false)
    assert.equal(ordinary.tools.some((tool) => tool.name === 'ambientic_jobs_discover'), false)
    const careerSession = value.gateway.issueSession(value.session.bindingId, { scopes: ['career:read', 'career:discover', 'career:write'] })
    const listed = await value.gateway.handleRequest({ token: careerSession.token, method: 'tools/list' })
    assert.deepEqual(listed.tools.map((tool) => tool.name), ['ambientic_career_read', 'ambientic_jobs_discover', 'ambientic_career_update'])
    const queue = await value.gateway.invoke({ token: careerSession.token, tool: 'ambientic_career_read', arguments: { action: 'daily_queue' } })
    assert.equal(queue.items[0].opportunityId, 'opportunity-1')
    const profile = await value.gateway.invoke({ token: careerSession.token, tool: 'ambientic_career_read', arguments: { action: 'profile' } })
    assert.equal(profile.headline, 'AI Product Leader')
    const built = await value.gateway.invoke({ token: careerSession.token, tool: 'ambientic_career_update', arguments: { action: 'profile', profile: { headline: 'Product Executive' } } })
    assert.equal(built.headline, 'Product Executive')
    const created = await value.gateway.invoke({ token: careerSession.token, tool: 'ambientic_career_update', arguments: { action: 'upsert', opportunity: { company: 'Acme', roleTitle: 'Head of Product' } } })
    assert.equal(created.id, 'opportunity-1')
    assert.equal(value.careerUpdates.length, 2)
    const discovered = await value.gateway.invoke({ token: careerSession.token, tool: 'ambientic_jobs_discover', arguments: { action: 'discover', source: 'himalayas', query: 'product' } })
    assert.equal(discovered.jobs[0].company, 'Remote Co')
    assert.equal(value.discoveryCalls.length, 1)
    assert.ok(value.store.listAudit().some((event) => event.tool === 'ambientic_career_update' && event.permission === 'write'))
    assert.ok(value.store.listAudit().some((event) => event.tool === 'ambientic_jobs_discover' && event.permission === 'read'))
  } finally {
    value.gateway.stop()
    value.store.close()
    rmSync(value.directory, { recursive: true, force: true })
  }
})

const socketTest = process.env.AMBIENTIC_SOCKET_TESTS === '1' ? test : test.skip

socketTest('gateway Unix socket carries scoped native tool calls', async () => {
  const value = fixture()
  try {
    const listed = await callGatewaySocket({ socketPath: value.session.socketPath, token: value.session.token, method: 'tools/list' })
    assert.ok(listed.tools.some((tool) => tool.name === 'ambientic_recall'))

    const context = await callGatewaySocket({
      socketPath: value.session.socketPath,
      token: value.session.token,
      method: 'tools/call',
      params: { name: 'ambientic_context_get', arguments: {} }
    })
    assert.equal(context.providerSessionId, 'thread-1')

    await callGatewaySocket({
      socketPath: value.session.socketPath,
      token: value.session.token,
      method: 'tools/call',
      params: { name: 'ambientic_goals', arguments: { action: 'get' } }
    })

    const updated = await callGatewaySocket({
      socketPath: value.session.socketPath,
      token: value.session.token,
      method: 'tools/call',
      params: { name: 'ambientic_task_update', arguments: { taskId: 'task-1', status: 'done', idempotencyKey: 'task-update-1' } }
    })
    assert.equal(updated.status, 'done')
    assert.equal(value.approvals.length, 1)
    assert.ok(value.store.listAudit().some((event) => event.tool === 'ambientic_task_update'))

    value.gateway.revokeBinding(context.id)
    await assert.rejects(callGatewaySocket({ socketPath: value.session.socketPath, token: value.session.token, method: 'tools/call', params: { name: 'ambientic_context_get', arguments: {} } }), /invalid, expired, or revoked/)
  } finally {
    value.gateway.stop()
    value.store.close()
    rmSync(value.directory, { recursive: true, force: true })
  }
})

socketTest('stdio MCP shim exposes the gateway tools without credentials in the protocol', async () => {
  const value = fixture()
  try {
    const child = spawn(process.execPath, ['resources/ambientic-mcp-shim.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, AMBIENTIC_GATEWAY_SOCKET: value.session.socketPath, AMBIENTIC_GATEWAY_TOKEN: value.session.token },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const lines = createInterface({ input: child.stdout })
    const responses = []
    lines.on('line', (line) => responses.push(JSON.parse(line)))
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })}\n`)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('shim timed out')), 5000)
      const poll = setInterval(() => {
        if (responses.some((item) => item.id === 2)) {
          clearInterval(poll); clearTimeout(timeout); resolve()
        }
      }, 10)
    })
    assert.equal(responses.find((item) => item.id === 1).result.serverInfo.name, 'ambientic')
    assert.ok(responses.find((item) => item.id === 2).result.tools.length >= 6)
    child.kill('SIGTERM')
  } finally {
    value.gateway.stop()
    value.store.close()
    rmSync(value.directory, { recursive: true, force: true })
  }
})
