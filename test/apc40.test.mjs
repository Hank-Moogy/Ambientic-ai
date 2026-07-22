import test from 'node:test'
import assert from 'node:assert/strict'
import { APC40, gridSessions, ledForSession, padForMessage } from '../src/main/apc40.mjs'

test('accepts clip-grid note-on presses only', () => {
  assert.equal(padForMessage([0x90, 0, 127]), 0)
  assert.equal(padForMessage([0x9F, 39, 127]), 39)
  assert.equal(padForMessage([0x90, 40, 127]), null)
  assert.equal(padForMessage([0x90, 1, 0]), null)
  assert.equal(padForMessage([0x80, 1, 127]), null)
})

test('maps session state to APC40 colour and animation', () => {
  assert.deepEqual(ledForSession({ state: 'running' }), { channel: 0, color: APC40.COLOR.GREEN })
  assert.deepEqual(ledForSession({ state: 'attention' }), { channel: 9, color: APC40.COLOR.YELLOW })
  assert.deepEqual(ledForSession({ state: 'waiting', unseen: true }), { channel: 14, color: APC40.COLOR.RED })
  assert.deepEqual(ledForSession({ state: 'waiting', unseen: false }), { channel: 0, color: APC40.COLOR.RED })
  assert.deepEqual(ledForSession({ state: 'running' }, true), { channel: 0, color: APC40.COLOR.BLUE })
  assert.deepEqual(ledForSession(null), { channel: 0, color: APC40.COLOR.OFF })
})

test('limits a controller page to the 40 physical pads', () => {
  const sessions = Array.from({ length: 45 }, (_, id) => ({ id }))
  assert.equal(gridSessions(sessions).length, 40)
  assert.equal(gridSessions(sessions).at(-1).id, 39)
})
