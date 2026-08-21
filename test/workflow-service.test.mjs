import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkflowService, nextScheduleAt, workflowExecutionPrompt } from '../src/main/workflow-service.mjs'
import { CAREER_OS_PACK } from '../src/shared/career-os-pack.mjs'

function fixture (overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ambientic-workflows-'))
  let sequence = 0
  let now = new Date('2026-07-30T07:00:00').getTime()
  const service = createWorkflowService({
    file: join(root, 'workflows.json'),
    id: () => `id-${++sequence}`,
    now: () => now,
    connectors: () => [{ id: 'codex', installed: true, manageable: true, taskCapable: true }],
    executeAgentStep: async () => ({ output: 'Real provider result' }),
    ...overrides
  })
  return { service, root, setNow: (value) => { now = value } }
}

function workflowInput (nodes = [
  { id: 'schedule', kind: 'schedule', label: 'Every weekday', detail: 'Every weekday · 08:30', action: 'trigger.schedule', x: 20, y: 20 },
  { id: 'agent', kind: 'agent', label: 'Ask an agent', detail: 'Summarize the signals', action: 'agent.run', provider: 'auto', x: 280, y: 20 }
]) {
  return {
    name: 'Morning brief',
    description: 'A real recurring brief',
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `edge-${index}`, from: nodes[index].id, to: node.id }))
  }
}

async function flush (rounds = 6) {
  for (let index = 0; index < rounds; index++) await new Promise((resolve) => setImmediate(resolve))
}

test('persists multiple workflows and supports duplicate, update, and delete', () => {
  const { service, root } = fixture()
  const first = service.create(workflowInput())
  const second = service.create({ ...workflowInput(), name: 'Weekly review' })
  const duplicate = service.duplicate(first.id)
  service.update(second.id, { name: 'Friday review' })
  assert.deepEqual(service.list().workflows.map((workflow) => workflow.name).sort(), ['Friday review', 'Morning brief', 'Morning brief copy'])
  assert.equal(service.remove(duplicate.id), true)
  assert.equal(service.list().workflows.length, 2)
  assert.equal(JSON.parse(readFileSync(join(root, 'workflows.json'), 'utf8')).workflows.length, 2)
})

test('ordinary workflow creation cannot claim an installed pack identity', () => {
  const { service } = fixture()
  const workflow = service.create({ ...workflowInput(), packId: CAREER_OS_PACK.id, packRole: 'scout' })
  assert.equal(workflow.packId, '')
  assert.equal(workflow.packRole, '')
})

test('calculates daily, weekday, weekly, and monthly schedule boundaries', () => {
  const fridayAfternoon = new Date('2026-07-31T16:00:00').getTime()
  assert.equal(new Date(nextScheduleAt('Every weekday · 08:30', fridayAfternoon)).getDay(), 1)
  assert.equal(new Date(nextScheduleAt('Every day · 18:00', fridayAfternoon)).getHours(), 18)
  assert.equal(nextScheduleAt('Every week · 09:00', fridayAfternoon) - new Date('2026-08-07T09:00:00').getTime(), 0)
  assert.equal(new Date(nextScheduleAt('Every month · 10:00', fridayAfternoon)).getMonth(), 7)
  assert.equal(nextScheduleAt('Choose a recurrence', fridayAfternoon), null)
})

test('runs provider-neutral steps through a connected managed provider', async () => {
  const calls = []
  const { service } = fixture({
    executeAgentStep: async (input) => {
      calls.push(input)
      return { output: 'Fresh web signals' }
    }
  })
  const workflow = service.create(workflowInput([
    { id: 'web', kind: 'web', label: 'Check the web', detail: 'Find product news', action: 'web.search' },
    { id: 'agent', kind: 'agent', label: 'Summarize', detail: 'Write three bullets', action: 'agent.run', provider: 'auto' }
  ]))
  await service.startRun(workflow.id)
  await flush()
  const run = service.list().runs[0]
  assert.equal(run.status, 'completed')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].provider, 'codex')
  assert.match(calls[0].prompt, /Use live web access/)
  assert.match(calls[1].prompt, /Previous result 1:\nFresh web signals/)
})

test('pauses for human approval before consequential provider tool actions', async () => {
  let executions = 0
  const { service } = fixture({
    executeAgentStep: async () => {
      executions++
      return { output: 'Email sent with provider confirmation.' }
    }
  })
  const workflow = service.create(workflowInput([
    { id: 'inbox', kind: 'inbox', label: 'Send email', detail: 'Send the approved brief', action: 'inbox.send' }
  ]))
  const run = await service.startRun(workflow.id)
  await flush()
  assert.equal(service.list().runs[0].status, 'awaiting_approval')
  assert.equal(executions, 0)
  assert.equal(service.approve(run.id, true), true)
  await flush()
  assert.equal(executions, 1)
  assert.equal(service.list().runs[0].status, 'completed')
})

test('links a managed provider thread and resumes after its final snapshot', async () => {
  const { service } = fixture({
    executeAgentStep: async () => ({ sessionId: 'thread-1' })
  })
  const workflow = service.create(workflowInput([
    { id: 'agent', kind: 'agent', label: 'Run agent', detail: 'Do the work', action: 'agent.run', provider: 'auto' }
  ]))
  await service.startRun(workflow.id)
  await flush()
  assert.equal(service.list().runs[0].status, 'running')
  service.handleThread({
    id: 'thread-1',
    state: 'idle',
    running: false,
    turnStateKnown: true,
    messages: [{ role: 'assistant', content: 'Managed task finished.' }],
    approvals: [],
    error: ''
  })
  await flush()
  const run = service.list().runs[0]
  assert.equal(run.status, 'completed')
  assert.equal(run.steps[0].output, 'Managed task finished.')
})

test('execution prompts refuse to simulate missing action tools', () => {
  const prompt = workflowExecutionPrompt({
    workflow: { name: 'Inbox triage' },
    node: { kind: 'inbox', label: 'Send reply', detail: 'Reply to Sam', action: 'inbox.send' }
  })
  assert.match(prompt, /Do not claim success unless the tool confirms/)
  assert.match(prompt, /which connection is missing/)
})

test('installs a workflow pack once and keeps private setup out of portable workflow definitions', async () => {
  const calls = []
  const { service, root } = fixture({ executeAgentStep: async (input) => { calls.push(input); return { output: 'Done' } } })
  const setup = {
    careerProfile: 'AI product leader', careerContext: '', targetRoles: ['Head of Product'], stretchRoles: [],
    careerObjective: 'Become a CPO', country: 'France', workAuthorization: 'EU citizen',
    locationPolicy: 'Remote EU', minimumCompensation: '€100k', targetCompensation: '€130k',
    priorities: ['Technical / AI depth'], tradeoffs: '', sources: ['Public ATS feeds'],
    routineMinutes: '45', routineTime: '09:15', maxDailyOpportunities: '5'
  }
  const installed = service.installPack(CAREER_OS_PACK, setup)
  service.installPack(CAREER_OS_PACK, setup)
  const snapshot = service.list()
  assert.equal(snapshot.packs.length, 1)
  assert.equal(snapshot.workflows.filter((workflow) => workflow.packId === CAREER_OS_PACK.id).length, 4)
  assert.equal(installed.workflowIds.length, 4)
  assert.equal('privateContext' in snapshot.packs[0], false)
  assert.equal('setup' in snapshot.packs[0], false)
  assert.equal('privateContext' in installed, false)
  assert.equal('setup' in installed, false)
  assert.equal(snapshot.packs[0].summary.routineMinutes, '45')
  assert.equal(snapshot.workflows.find((workflow) => workflow.packRole === 'scout').nodes[0].detail, 'Every weekday · 08:15')
  assert.equal(JSON.stringify(snapshot.workflows).includes('AI product leader'), false)
  assert.match(readFileSync(join(root, 'workflows.json'), 'utf8'), /AI product leader/)
  assert.equal(service.packSetup(CAREER_OS_PACK.id).careerProfile, 'AI product leader')

  const daily = snapshot.workflows.find((workflow) => workflow.packRole === 'daily')
  await service.startRun(daily.id)
  await flush()
  assert.match(calls[0].prompt, /Private local setup supplied by the user/)
  assert.match(calls[0].prompt, /AI product leader/)
  assert.match(calls[0].prompt, /ambientic_career_update/)
})
