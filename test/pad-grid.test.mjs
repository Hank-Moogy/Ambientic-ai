import test from 'node:test'
import assert from 'node:assert/strict'
import { connectedPadProviders, providerColumnLayout, validColumnWidths, resizeProviderColumns } from '../src/shared/recent-thread-grid.mjs'
import { padGridSessions } from '../src/renderer/pad-grid.mjs'
import { padLightForSession, PAD_MOTION, PAD_TONE } from '../src/shared/pad-light.mjs'

test('recent history and live threads share fixed provider columns, newest first', () => {
  const sessions = [
    { id: 'older', agent: 'claude', updatedAt: 100, history: true },
    { id: 'new', agent: 'claude', updatedAt: 900 },
    { id: 'codex', agent: 'codex', updatedAt: 500 },
    { id: 'placeholder', agent: 'claude', discovered: true, updatedAt: 1000 }
  ]
  const grid = padGridSessions(sessions, 40, providerColumnLayout(['claude', 'codex']))
  assert.deepEqual(grid.slice(0, 5).map((s) => s?.id), ['new', 'older', undefined, undefined, 'codex'])
  assert.equal(grid.filter(Boolean).length, 3)
})

test('fills the allocated capacity instead of capping a provider at ten', () => {
  const sessions = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, agent: 'claude', updatedAt: i }))
  const layout = providerColumnLayout(['claude', 'codex'])
  const grid = padGridSessions(sessions, 40, layout)
  assert.equal(grid.filter(Boolean).length, 20)
  assert.equal(grid[0].id, 'c39')
  assert.equal(grid[35].id, 'c20')
  assert.equal(grid[4], null)
  assert.equal(padGridSessions(sessions, 64, layout).filter(Boolean).length, 32)
})

test('only authenticated task-capable connections receive columns', () => {
  assert.deepEqual(connectedPadProviders([
    { id: 'claude', installed: true, manageable: true },
    { id: 'codex', installed: true, manageable: false },
    { id: 'hermes', checking: true, installed: true, manageable: true },
    { id: 'kimi', installed: true, manageable: true, taskCapable: false }
  ]), ['claude'])
  assert.deepEqual(providerColumnLayout([]), [])
  assert.equal(padGridSessions([{ id: 'old', agent: 'claude' }]).filter(Boolean).length, 0)
})

test('automatic allocation uses all eight columns and handles uneven division', () => {
  for (const count of [1, 2, 3, 4]) {
    const layout = providerColumnLayout(['claude', 'codex', 'hermes', 'kimi'].slice(0, count))
    assert.equal(layout.reduce((n, group) => n + group.columns, 0), 8)
    assert.ok(Math.max(...layout.map((g) => g.columns)) - Math.min(...layout.map((g) => g.columns)) <= 1)
  }
  assert.deepEqual(providerColumnLayout(['claude', 'codex']).map((g) => g.columns), [4, 4])
})

test('manual resizing preserves neighbours, total capacity, and at least one column', () => {
  const layout = providerColumnLayout(['claude', 'codex', 'hermes'])
  assert.deepEqual(resizeProviderColumns(layout, 0, 1), { claude: 4, codex: 2, hermes: 2 })
  assert.deepEqual(resizeProviderColumns(layout, 0, 100), { claude: 5, codex: 1, hermes: 2 })
  assert.deepEqual(resizeProviderColumns(layout, 0, -100), { claude: 1, codex: 5, hermes: 2 })
  assert.equal(validColumnWidths(['claude', 'codex'], { claude: 5, codex: 3 }), true)
  for (const invalid of [{ claude: 8, codex: 0 }, { claude: 4, codex: 3 }, { claude: 4.5, codex: 3.5 }, { claude: 4, codex: 4, hermes: 0 }]) {
    assert.equal(validColumnWidths(['claude', 'codex'], invalid), false)
  }
  assert.deepEqual(providerColumnLayout(['claude', 'codex'], { claude: 5, codex: 3 }).map((g) => [g.start, g.columns]), [[0, 5], [5, 3]])
})

test('the grid is always exactly as long as the device has pads', () => {
  assert.equal(padGridSessions([], 40).length, 40)
  assert.equal(padGridSessions(Array.from({ length: 90 }, (_, i) => ({ id: `s${i}`, padIndex: i })), 64).length, 64)
})

test('a pad on screen says exactly what the pad on the desk says', () => {
  assert.equal(padLightForSession(null).tone, PAD_TONE.EMPTY)
  assert.equal(padLightForSession({ state: 'running' }).tone, PAD_TONE.RUNNING)
  // An approval outranks whatever the thread was doing underneath it.
  assert.equal(padLightForSession({ state: 'running', awaitingApproval: true }).tone, PAD_TONE.APPROVAL)
  assert.equal(padLightForSession({ state: 'running', awaitingApproval: true }).motion, PAD_MOTION.STILL)
  assert.equal(padLightForSession({ state: 'idle', standby: true }).tone, PAD_TONE.STANDBY)
  assert.equal(padLightForSession({ state: 'idle', standby: true }).motion, PAD_MOTION.STILL)
  assert.equal(padLightForSession({ state: 'idle' }).tone, PAD_TONE.IDLE)
  assert.equal(padLightForSession({ state: 'attention', unseen: true }).motion, PAD_MOTION.BLINK)
  assert.equal(padLightForSession({ state: 'attention' }).motion, PAD_MOTION.STILL)
})
