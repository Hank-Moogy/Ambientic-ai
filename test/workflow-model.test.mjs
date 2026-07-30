import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createStarterWorkflow,
  draftWorkflowFromPrompt,
  removeWorkflowNode,
  toPortableManifest
} from '../src/renderer/workflow-model.mjs'

test('drafts a recurring provider-neutral workflow from natural language', () => {
  const workflow = draftWorkflowFromPrompt('Every weekday check the web, summarize with an agent, let me review, then email it')
  assert.deepEqual(workflow.nodes.map((node) => node.kind), ['schedule', 'web', 'agent', 'approval', 'inbox'])
  assert.equal(workflow.nodes[0].detail, 'Every weekday')
  assert.equal(workflow.nodes.find((node) => node.kind === 'agent').provider, 'auto')
})

test('portable manifests expose permissions without private canvas state', () => {
  const manifest = toPortableManifest(createStarterWorkflow())
  assert.equal(manifest.schema, 'ambientic.workflow')
  assert.equal(manifest.runtime.providerPolicy, 'best_available')
  assert.equal(manifest.privacy.containsCredentials, false)
  assert.ok(manifest.steps.some((step) => step.action === 'inbox.send' && step.permission === 'Inbox · write'))
  assert.ok(manifest.steps.every((step) => step.config.instruction))
  assert.ok(manifest.requirements.actions.includes('agent.run'))
  assert.equal('x' in manifest.steps[0], false)
})

test('drafts an approval gate before consequential inbox and calendar actions', () => {
  const workflow = draftWorkflowFromPrompt('Every day summarize my inbox and book a calendar event')
  const kinds = workflow.nodes.map((node) => node.kind)
  assert.ok(kinds.indexOf('approval') < kinds.indexOf('inbox'))
  assert.ok(kinds.indexOf('approval') < kinds.indexOf('calendar'))
})

test('removing a middle node reconnects the surrounding flow', () => {
  const workflow = createStarterWorkflow()
  const removed = workflow.nodes[2]
  const result = removeWorkflowNode(workflow, removed.id)
  assert.equal(result.nodes.length, workflow.nodes.length - 1)
  assert.ok(result.edges.some((edge) => edge.from === workflow.nodes[1].id && edge.to === workflow.nodes[3].id))
})
