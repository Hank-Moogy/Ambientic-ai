import test from 'node:test'
import assert from 'node:assert/strict'
import { createMidiController } from '../src/main/midi-controller.js'

function fakeMidiModule () {
  const counts = { inputs: 0, outputs: 0 }
  class Input {
    constructor () { counts.inputs += 1 }
    getPortCount () { return 0 }
    getPortName () { return '' }
    ignoreTypes () {}
    on () {}
    openPort () {}
    closePort () {}
  }
  class Output {
    constructor () { counts.outputs += 1 }
    getPortCount () { return 0 }
    getPortName () { return '' }
    openPort () {}
    closePort () {}
    sendMessage () {}
  }
  return { module: { Input, Output }, counts }
}

test('reuses one native MIDI client pair across disconnected reconnects', () => {
  const fake = fakeMidiModule()
  const controller = createMidiController({ list: () => [] }, { midiModule: fake.module })
  controller.start()
  controller.reconnect()
  controller.reconnect()
  assert.equal(fake.counts.inputs, 1)
  assert.equal(fake.counts.outputs, 1)
  controller.stop()
})
