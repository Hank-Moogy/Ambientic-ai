import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { asList, bindingInput, contextApi, contextLabel, memoryOrigin, riskLabel } from '../src/renderer/context-ui.mjs'

test('context renderer accepts wrapped and direct preload collections', () => {
  assert.deepEqual(asList([{ id: 'one' }], ['records']), [{ id: 'one' }])
  assert.deepEqual(asList({ records: [{ id: 'two' }] }, ['records']), [{ id: 'two' }])
  assert.deepEqual(asList(null, ['records']), [])
})

test('context renderer remains safe before the optional preload contract is available', () => {
  assert.deepEqual(contextApi({}), { context: {}, memory: {}, tools: {}, audit: {} })
  const memory = { list: () => [] }
  assert.equal(contextApi({ ambientic: { memory } }).memory, memory)
})

test('binding presentation supports nested and denormalized backend records', () => {
  const nested = { project: { id: 'p1', name: 'Ambientic' }, goal: { id: 'g1', outcome: 'Shared agent memory' }, task: { id: 't1', title: 'Build kernel' } }
  assert.deepEqual(bindingInput(nested), { projectId: 'p1', goalId: 'g1', taskId: 't1' })
  assert.equal(contextLabel(nested), 'Ambientic · Shared agent memory · Build kernel')
  assert.equal(contextLabel({}), 'No linked context yet')
})

test('memory and tool labels keep inference and risk boundaries explicit', () => {
  assert.equal(memoryOrigin({ status: 'candidate' }), 'Inferred candidate')
  assert.equal(memoryOrigin({ origin: 'deterministic' }), 'Observed')
  assert.equal(riskLabel('destructive'), 'Destructive')
  assert.equal(riskLabel('write'), 'Changes data')
  assert.equal(riskLabel('read'), 'Read only')
})

test('workspace exposes context, Settings memory, and shared tool surfaces without experimental dynamic tools', () => {
  const workspace = readFileSync(new URL('../src/renderer/Workspace.jsx', import.meta.url), 'utf8')
  const context = readFileSync(new URL('../src/renderer/ContextMemory.jsx', import.meta.url), 'utf8')
  assert.match(workspace, /<b>Memory<\/b>/)
  assert.match(workspace, /section === 'memory' \? <MemoryWorkspace/)
  assert.doesNotMatch(workspace, /setView\('memory'\)/)
  assert.match(workspace, /Build my memory/)
  assert.match(workspace, /Step \$\{step \+ 1\} of 5/)
  assert.match(workspace, /startMemoryBootstrap/)
  assert.match(workspace, /<AppsToolsSettings/)
  assert.match(workspace, /<ThreadContextPanel/)
  assert.match(workspace, /contextBinding/)
  assert.match(context, /Context update recorded\. The original capsule remains unchanged\./)
  assert.match(context, /Credentials remain outside provider agents/)
  assert.doesNotMatch(context, /dynamicTools/)
})
