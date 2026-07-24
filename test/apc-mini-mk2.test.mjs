import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APC_MINI_MK2,
  miniGridLedMessages,
  miniNoteForPad,
  miniPadForMessage,
  miniRecordButtonForMessage,
  miniSelectedSessionForRecordColumn
} from '../src/main/apc-mini-mk2.mjs'

test('maps the APC mini mk2 8x8 grid from physical top-left downward', () => {
  assert.equal(miniNoteForPad(0), 56)
  assert.equal(miniNoteForPad(7), 63)
  assert.equal(miniNoteForPad(56), 0)
  assert.equal(miniNoteForPad(63), 7)
  assert.equal(miniPadForMessage([0x90, 56, 127]), 0)
  assert.equal(miniPadForMessage([0x90, 0, 127]), 56)
})

test('renders 64 APC mini mk2 pads with AgentBase state colors', () => {
  const messages = miniGridLedMessages([
    { state: 'running' },
    { state: 'attention', unseen: true },
    { state: 'idle' }
  ])
  assert.equal(messages.length, 64)
  assert.deepEqual(messages[0], [0x96, 56, APC_MINI_MK2.COLOR.GREEN])
  assert.deepEqual(messages[1], [0x9E, 57, APC_MINI_MK2.COLOR.RED])
  assert.deepEqual(messages[2], [0x96, 58, APC_MINI_MK2.COLOR.BLUE])
  assert.deepEqual(messages[63], [0x96, 7, APC_MINI_MK2.COLOR.OFF])
})

test('uses APC mini track buttons as column push-to-talk controls', () => {
  assert.deepEqual(miniRecordButtonForMessage([0x90, 0x64, 127]), { column: 0, pressed: true })
  assert.deepEqual(miniRecordButtonForMessage([0x80, 0x6B, 64]), { column: 7, pressed: false })
  assert.equal(miniRecordButtonForMessage([0x90, 0x70, 127]), null)
  const sessions = Array.from({ length: 10 }, (_, index) => ({ id: `s${index}` }))
  assert.equal(miniSelectedSessionForRecordColumn(sessions, 's9', 1)?.id, 's9')
  assert.equal(miniSelectedSessionForRecordColumn(sessions, 's9', 0), null)
})
