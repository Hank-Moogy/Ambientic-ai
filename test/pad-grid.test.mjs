import test from 'node:test'
import assert from 'node:assert/strict'
import { padGridSessions } from '../src/renderer/pad-grid.mjs'
import { padLightForSession, PAD_MOTION, PAD_TONE } from '../src/shared/pad-light.mjs'

test('recent history and live threads share fixed provider columns, newest first', () => {
  const sessions = [
    { id: 'older', agent: 'claude', updatedAt: 100, history: true },
    { id: 'new', agent: 'claude', updatedAt: 900 },
    { id: 'codex', agent: 'codex', updatedAt: 500 },
    { id: 'placeholder', agent: 'claude', discovered: true, updatedAt: 1000 }
  ]
  const grid = padGridSessions(sessions)
  assert.deepEqual(grid.slice(0, 4).map((s) => s?.id), ['new', 'older', 'codex', undefined])
  assert.equal(grid.filter(Boolean).length, 3)
})

test('caps each provider at ten without filling another provider columns', () => {
  const sessions = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, agent: 'claude', updatedAt: i }))
  const grid = padGridSessions(sessions, 64)
  assert.equal(grid.filter(Boolean).length, 10)
  assert.equal(grid[0].id, 'c11')
  assert.equal(grid[33].id, 'c2')
  assert.equal(grid[2], null)
  assert.equal(grid[40], null)
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
