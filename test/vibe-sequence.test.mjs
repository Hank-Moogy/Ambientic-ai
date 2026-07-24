import test from 'node:test'
import assert from 'node:assert/strict'
import { VIBE_SEQUENCE, VIBE_VARIANTS, changedVibeMessages, vibeLedMessages, vibePalette } from '../src/main/vibe-sequence.mjs'

test('fills the native APC grids with a cool multi-color vibe frame', () => {
  const mini = vibeLedMessages('apc-mini-mk2', 7)
  const apc40 = vibeLedMessages('apc40-mkii', 7)
  assert.equal(mini.length, 64)
  assert.equal(apc40.length, 40)
  assert.ok(new Set(mini.map((message) => message[2])).size >= 4)
  assert.ok(new Set(apc40.map((message) => message[2])).size >= 4)
  assert.ok(vibePalette('apc-mini-mk2').includes(21))
  assert.ok(vibePalette('apc-mini-mk2').includes(45))
  assert.ok(vibePalette('apc-mini-mk2').includes(49))
})

test('changes the water field over time at a MIDI-safe refresh rate', () => {
  assert.notDeepEqual(vibeLedMessages('apc-mini-mk2', 0), vibeLedMessages('apc-mini-mk2', 1))
  assert.ok(VIBE_SEQUENCE.frameCount * VIBE_SEQUENCE.frameIntervalMs >= 4_000)
})

test('provides two distinct cold compositions with delta-frame smoothing', () => {
  assert.deepEqual(VIBE_VARIANTS.map((variant) => variant.id), ['center-wave', 'cold-orbit'])
  const signatures = VIBE_VARIANTS.map((variant) => vibeLedMessages('apc-mini-mk2', 12, variant.id).map((message) => message[2]).join(','))
  assert.equal(new Set(signatures).size, 2)
  const first = vibeLedMessages('apc-mini-mk2', 20, 'center-wave')
  const next = vibeLedMessages('apc-mini-mk2', 21, 'center-wave')
  assert.ok(changedVibeMessages(first, next).length < next.length)
})
