import test from 'node:test'
import assert from 'node:assert/strict'
import { padGridSessions } from '../src/renderer/pad-grid.mjs'
import { padLightForSession, PAD_MOTION, PAD_TONE } from '../src/shared/pad-light.mjs'

test('pads hold their assigned position rather than reshuffling by recency', () => {
  const sessions = [
    { id: 'c', padIndex: 2, updatedAt: 900 },
    { id: 'a', padIndex: 0, updatedAt: 100 },
    { id: 'b', padIndex: 1, updatedAt: 500 }
  ]
  assert.deepEqual(padGridSessions(sessions, 4).map((item) => item ? item.id : null), ['a', 'b', 'c', null])
})

test('sessions without a hardware assignment get no pad', () => {
  const sessions = [{ id: 'live', padIndex: 0 }, { id: 'old', history: true, padIndex: null }]
  assert.deepEqual(padGridSessions(sessions, 2).map((item) => item ? item.id : null), ['live', null])
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
  assert.equal(padLightForSession({ state: 'idle' }).tone, PAD_TONE.IDLE)
  assert.equal(padLightForSession({ state: 'attention', unseen: true }).motion, PAD_MOTION.BLINK)
  assert.equal(padLightForSession({ state: 'attention' }).motion, PAD_MOTION.STILL)
})
