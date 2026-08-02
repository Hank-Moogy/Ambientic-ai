import test from 'node:test'
import assert from 'node:assert/strict'
import { midiControlForMessage, midiEventForMessage, normalizeMappings, bindingLabel } from '../src/main/midi-mappings.mjs'

test('recognizes APC40 MKII note-on and CC controls', () => {
  assert.deepEqual(midiControlForMessage([0x91, 64, 127]), {
    key: 'note:1:64', type: 'note', channel: 2, number: 64
  })
  assert.deepEqual(midiControlForMessage([0xB0, 16, 88]), {
    key: 'cc:0:16', type: 'cc', channel: 1, number: 16, value: 88
  })
})

test('ignores releases and unsupported MIDI messages', () => {
  assert.equal(midiControlForMessage([0x90, 12, 0]), null)
  assert.equal(midiControlForMessage([0x80, 12, 127]), null)
  assert.equal(midiControlForMessage([0xF0, 0x47, 0x7F]), null)
})

test('normalized hardware events retain press and release semantics', () => {
  assert.equal(midiEventForMessage([0x90, 12, 100]).pressed, true)
  assert.deepEqual(midiEventForMessage([0x80, 12, 0]), {
    key: 'note:0:12', type: 'note', channel: 1, number: 12, value: 0, pressed: false
  })
  assert.equal(midiEventForMessage([0xB0, 18, 20]).pressed, false)
})

test('keeps only known Ambientic actions and valid controls', () => {
  assert.deepEqual(normalizeMappings({
    'note:0:64': 'focus-next',
    'cc:0:16': 'launch-hermes',
    'note:0:65': 'delete-everything',
    nope: 'focus-next'
  }), {
    'note:0:64': 'focus-next',
    'cc:0:16': 'launch-hermes'
  })
})

test('formats learned controls for the mapping interface', () => {
  assert.equal(bindingLabel('note:0:64'), 'Note 64 · Ch 1')
  assert.equal(bindingLabel('cc:7:16'), 'CC 16 · Ch 8')
})
