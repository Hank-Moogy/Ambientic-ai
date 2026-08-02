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

test('falls back to an input-only generic MIDI device and exposes each input for selection', () => {
  let listener = null
  const controls = []
  class Input {
    getPortCount () { return 2 }
    getPortName (index) { return ['MIDI Keyboard', 'Pad Controller'][index] }
    ignoreTypes () {}
    on (_event, callback) { listener = callback }
    openPort () {}
    closePort () {}
  }
  class Output {
    getPortCount () { return 0 }
    getPortName () { return '' }
    openPort () {}
    closePort () {}
    sendMessage () {}
  }
  const controller = createMidiController({ list: () => [] }, { midiModule: { Input, Output }, onControl: (control) => { controls.push(control); return true } })
  controller.start()
  assert.equal(controller.getStatus().activeProfile, 'generic-midi')
  assert.equal(controller.getStatus().device, 'MIDI Keyboard')
  assert.ok(controller.getStatus().profiles.some((profile) => profile.label === 'Pad Controller'))
  listener(0, [0x90, 36, 127])
  assert.equal(controls[0].key, 'note:0:36')
  controller.stop()
})

test('custom APC templates replace stale session LEDs with assignment feedback', () => {
  const messages = []
  class Input {
    getPortCount () { return 1 }
    getPortName () { return 'Akai APC40 mkII' }
    ignoreTypes () {}
    on () {}
    openPort () {}
    closePort () {}
  }
  class Output {
    getPortCount () { return 1 }
    getPortName () { return 'Akai APC40 mkII' }
    openPort () {}
    closePort () {}
    sendMessage (message) { messages.push(message) }
  }
  const controller = createMidiController({ list: () => [{ state: 'running' }] }, {
    midiModule: { Input, Output },
    getFeedback: () => ({ 'note:0:36': 'cyan', 'note:0:37': 'red' })
  })
  controller.start()
  assert.ok(messages.some((message) => message.length === 3 && message[1] === 36 && message[2] === 45))
  assert.ok(messages.some((message) => message.length === 3 && message[1] === 37 && message[2] === 5))
  assert.ok(messages.some((message) => message.length === 3 && message[1] === 0 && message[2] === 0))
  controller.stop()
})
