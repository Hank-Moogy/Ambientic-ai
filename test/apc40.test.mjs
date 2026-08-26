import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APC40,
  gridLedMessages,
  gridSessions,
  ledForSession,
  noteForPad,
  padForMessage,
  recordArmForMessage,
  recordButtonForMessage,
  selectedSessionForRecordColumn
} from '../src/main/apc40.mjs'

test('accepts clip-grid presses in physical top-row-first order', () => {
  assert.equal(padForMessage([0x90, 32, 127]), 0)
  assert.equal(padForMessage([0x90, 39, 127]), 7)
  assert.equal(padForMessage([0x90, 0, 127]), 32)
  assert.equal(padForMessage([0x9F, 7, 127]), 39)
  assert.equal(padForMessage([0x90, 40, 127]), null)
  assert.equal(padForMessage([0x90, 1, 0]), null)
  assert.equal(padForMessage([0x80, 1, 127]), null)
})

test('maps session state to APC40 colour and animation', () => {
  assert.deepEqual(ledForSession({ state: 'running' }), { channel: 0, color: APC40.COLOR.GREEN })
  assert.deepEqual(ledForSession({ state: 'attention', unseen: true }), { channel: 14, color: APC40.COLOR.RED })
  assert.deepEqual(ledForSession({ state: 'attention', unseen: false }), { channel: 0, color: APC40.COLOR.RED })
  assert.deepEqual(ledForSession({ state: 'waiting', unseen: true }), { channel: 14, color: APC40.COLOR.RED })
  assert.deepEqual(ledForSession({ state: 'waiting', unseen: false }), { channel: 0, color: APC40.COLOR.BLUE })
  assert.deepEqual(ledForSession({ state: 'idle' }), { channel: 0, color: APC40.COLOR.BLUE })
  assert.deepEqual(ledForSession(null), { channel: 0, color: APC40.COLOR.OFF })
})

test('maps logical pad order from the APC40 MKII top row downward', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, pad) => noteForPad(pad)), [32, 33, 34, 35, 36, 37, 38, 39])
  assert.deepEqual(Array.from({ length: 8 }, (_, column) => noteForPad(32 + column)), [0, 1, 2, 3, 4, 5, 6, 7])
})

test('recognizes the APC40 MKII Record button press', () => {
  assert.equal(recordButtonForMessage([0x90, APC40.NOTE.RECORD, 127]), true)
  assert.equal(recordButtonForMessage([0x90, APC40.NOTE.RECORD, 0]), false)
  assert.equal(recordButtonForMessage([0x80, APC40.NOTE.RECORD, 127]), false)
})

test('maps per-column Record Arm press and release for push-to-talk', () => {
  assert.deepEqual(recordArmForMessage([0x90, APC40.NOTE.RECORD_ARM, 127]), { column: 0, pressed: true })
  assert.deepEqual(recordArmForMessage([0x97, APC40.NOTE.RECORD_ARM, 127]), { column: 7, pressed: true })
  assert.deepEqual(recordArmForMessage([0x87, APC40.NOTE.RECORD_ARM, 64]), { column: 7, pressed: false })
  assert.deepEqual(recordArmForMessage([0x93, APC40.NOTE.RECORD_ARM, 0]), { column: 3, pressed: false })
  assert.equal(recordArmForMessage([0x98, APC40.NOTE.RECORD_ARM, 127]), null)
  assert.equal(recordArmForMessage([0x90, 0x31, 127]), null)
})

test('Record Arm only targets the selected agent in its physical column', () => {
  const sessions = Array.from({ length: 18 }, (_, id) => ({ id: `session-${id}` }))
  assert.equal(selectedSessionForRecordColumn(sessions, 'session-10', 2)?.id, 'session-10')
  assert.equal(selectedSessionForRecordColumn(sessions, 'session-10', 1), null)
  assert.equal(selectedSessionForRecordColumn(sessions, 'missing', 2), null)
})

test('keeps physical top-left pad 1 assigned and colored from session state', () => {
  const messages = gridLedMessages([
    { state: 'running' },
    { state: 'idle' },
    { state: 'waiting', unseen: false }
  ])
  assert.deepEqual(messages[0], [0x90, 32, APC40.COLOR.GREEN])
  assert.deepEqual(messages[1], [0x90, 33, APC40.COLOR.BLUE])
  assert.deepEqual(messages[2], [0x90, 34, APC40.COLOR.BLUE])
  assert.deepEqual(messages[3], [0x90, 35, APC40.COLOR.OFF])
})

test('limits a controller page to the 40 physical pads', () => {
  const sessions = Array.from({ length: 45 }, (_, id) => ({ id }))
  assert.equal(gridSessions(sessions).length, 40)
  assert.equal(gridSessions(sessions).at(-1).id, 39)
})

test('a thread waiting on the user lights orange, whatever it was doing underneath', () => {
  for (const state of ['running', 'idle', 'waiting', 'attention']) {
    const led = ledForSession({ state, awaitingApproval: true })
    assert.equal(led.color, APC40.COLOR.ORANGE)
    // Held, not blinking: a question waiting patiently is not an alarm.
    assert.equal(led.channel, APC40.ANIMATION.SOLID)
  }
  // Unseen attention still blinks red once the approval is answered.
  assert.equal(ledForSession({ state: 'attention', unseen: true }).color, APC40.COLOR.RED)
})
