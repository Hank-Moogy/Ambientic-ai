import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HandoverService, providerRisk, renderHandover } from '../src/main/handover-service.mjs'

test('flags a provider when any quota window reaches the handover threshold', () => {
  const risk = providerRisk({
    providers: { codex: { windows: [{ label: '5h', usedPercent: 61 }, { period: 'week', usedPercent: 88, resetAt: 123 }] } }
  }, 'codex')
  assert.equal(risk.nearLimit, true)
  assert.equal(risk.usedPercent, 88)
  assert.equal(risk.resetAt, 123)
})

test('renders a bounded provider-neutral handover without tool-log clutter', () => {
  const body = renderHandover({
    session: { agent: 'codex', project: 'Ambientic', cwd: '/tmp/agentbase', task: 'Build continuity' },
    snapshot: {
      title: 'Build continuity',
      messages: [
        { role: 'activity', text: 'huge tool payload' },
        { role: 'user', text: 'Make handovers systematic.' },
        { role: 'assistant', text: 'Implemented the first service.' }
      ],
      artifacts: [{ path: '/tmp/agentbase/src/main/handover-service.mjs' }]
    },
    readme: '## Long-term vision\nUnify agent providers.\n\n## Architecture\nElectron main and React renderer.\n\n## Not included yet\nCloud sync.',
    git: { recent: 'abc Add service', status: ' M README.md', diff: ' README.md | 2 +' },
    risk: { usedPercent: 88, label: 'Weekly limit' },
    generatedAt: 0
  })
  assert.match(body, /88% used/)
  assert.match(body, /Make handovers systematic/)
  assert.doesNotMatch(body, /huge tool payload/)
  assert.match(body, /do not ask for the prior chat/i)
})

test('provider handoff preserves the canonical Ambientic context binding', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ambientic-handoff-'))
  try {
    const source = { id: 'source', agent: 'codex', project: 'Ambientic', cwd }
    let createOptions
    const workspace = {
      sessionFor: () => source,
      list: async () => [source],
      read: async () => ({ title: 'Continue Ambientic', messages: [], artifacts: [] }),
      contextBindingFor: () => ({ projectId: 'project-1', goalId: 'goal-1', taskId: 'task-1' }),
      create: async (options) => { createOptions = options; return 'target' }
    }
    const service = new HandoverService({ workspace, usage: { getState: () => ({ providers: {} }) } })
    const result = await service.continueWith('source', 'claude')
    assert.equal(result.targetSessionId, 'target')
    assert.deepEqual(createOptions.contextBinding, { projectId: 'project-1', goalId: 'goal-1', taskId: 'task-1' })
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('provider handoff uses the canonical bound project instead of a broad session cwd', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ambientic-bound-handoff-'))
  try {
    const source = { id: 'source', agent: 'claude', project: 'Home', cwd: '/Users/person' }
    let createOptions
    const workspace = {
      sessionFor: () => source,
      list: async () => [source],
      read: async () => ({ title: 'Continue Ambientic', messages: [], artifacts: [] }),
      handoverContextFor: () => ({ eligible: true, root: cwd, source: 'project-binding', projectName: 'Ambientic' }),
      contextBindingFor: () => ({ projectId: 'project-1' }),
      create: async (options) => { createOptions = options; return 'target' }
    }
    const service = new HandoverService({ workspace, usage: { getState: () => ({ providers: {} }) } })
    const result = await service.continueWith('source', 'codex')
    assert.equal(result.cwd, cwd)
    assert.equal(result.project, 'Ambientic')
    assert.equal(createOptions.cwd, cwd)
    assert.equal(createOptions.contextBinding.projectId, 'project-1')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('provider handoff explains how to repair a thread without a safe project root', async () => {
  const source = { id: 'source', agent: 'claude', project: 'Home', cwd: '/Users/person' }
  const workspace = {
    sessionFor: () => source,
    handoverContextFor: () => ({ eligible: false, root: '', reason: 'Choose a specific project folder before handing this thread off.' })
  }
  const service = new HandoverService({ workspace, usage: { getState: () => ({ providers: {} }) } })
  await assert.rejects(() => service.continueWith('source', 'codex'), /Choose a specific project folder/i)
})

test('thread handoff UI surfaces failures and refreshes eligibility after rebinding', () => {
  const workspace = readFileSync(new URL('../src/renderer/Workspace.jsx', import.meta.url), 'utf8')
  const context = readFileSync(new URL('../src/renderer/ContextMemory.jsx', import.meta.url), 'utf8')
  assert.match(workspace, /className="handover-error" role="alert"/)
  assert.match(workspace, /Choose project to hand off/)
  assert.match(workspace, /catch \(error\)[\s\S]*setHandoffError/)
  assert.match(workspace, /chooseProjectFolder\(\)[\s\S]*upsertProject[\s\S]*context\.rebind/)
  assert.match(context, /onBindingUpdated\?\.\(value\)/)
})
