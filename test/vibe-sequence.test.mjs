import test from 'node:test'
import assert from 'node:assert/strict'
import { VIBE_SEQUENCE, VIBE_VARIANTS, vibeLedMessages, vibePalette } from '../src/main/vibe-sequence.mjs'

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
  assert.ok(VIBE_SEQUENCE.frameIntervalMs >= 80)
  assert.ok(VIBE_SEQUENCE.frameCount * VIBE_SEQUENCE.frameIntervalMs >= 4_000)
})

test('provides four distinct cold and hot compositions', () => {
  assert.deepEqual(VIBE_VARIANTS.map((variant) => variant.id), ['center-wave', 'cold-orbit', 'life', 'illumination'])
  const signatures = VIBE_VARIANTS.map((variant) => vibeLedMessages('apc-mini-mk2', 12, variant.id).map((message) => message[2]).join(','))
  assert.equal(new Set(signatures).size, 4)
  assert.ok(vibePalette('apc-mini-mk2', 'hot').includes(5))
  assert.ok(vibeLedMessages('apc-mini-mk2', 12, 'life').some((message) => message[2] === 0))
  assert.ok(vibeLedMessages('apc-mini-mk2', 12, 'illumination').some((message) => message[2] === 0))
})
