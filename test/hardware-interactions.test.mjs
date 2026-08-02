import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workspace = readFileSync(new URL('../src/renderer/Workspace.jsx', import.meta.url), 'utf8')
const hardware = readFileSync(new URL('../src/renderer/HardwareWorkspace.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/renderer/hardware.css', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../src/preload/index.js', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')

test('Hardware is a first-class workspace with library, views, modes, and pad inspector', () => {
  assert.match(workspace, />Hardware</)
  assert.match(workspace, /<HardwareWorkspace/)
  assert.match(hardware, /Local library/)
  assert.match(hardware, /Create linked view from this pad/)
  assert.match(hardware, /\['play', 'edit', 'map', 'test'\]/)
  assert.match(hardware, /Pad inspector/)
  assert.match(hardware, /Edit deck/)
  assert.match(hardware, /Edit view/)
  assert.match(hardware, /Delete view/)
})

test('hardware learn accepts MIDI and computer keyboard input with visible arrival truth', () => {
  assert.match(hardware, /hardwareKeyInput/)
  assert.match(hardware, /Listening… press a MIDI pad, MIDI key, or computer key/)
  assert.match(hardware, /MIDI online/)
  assert.match(preload, /hardware-learn-pad/)
  assert.match(main, /onControl: \(control\) => hardwareProfiles/)
})

test('mapped thread actions resolve the same live and historical index shown by the inspector', () => {
  assert.match(main, /liveSession \|\| workspace\?\.sessionFor\(id\)/)
  assert.match(main, /workspace\?\.sessionFor\(targetId\)/)
  assert.match(main, /await workspace\.list\(\)/)
})

test('consequential hardware actions share an explicit confirmation boundary', () => {
  assert.match(main, /definition\?\.permission === 'confirm'/)
  assert.match(main, /hardware-confirmation/)
  assert.match(workspace, /Hardware confirmation/)
  assert.match(preload, /hardwareConfirmAction/)
  assert.match(main, /Confirmation expired/)
  assert.match(preload, /onHardwareConfirmationExpired/)
})

test('hardware visual system is responsive and reduced-motion safe', () => {
  assert.match(styles, /\.hardware-grid\{/)
  assert.match(styles, /\.hardware-pad\{/)
  assert.match(styles, /@media\(max-width:1180px\)/)
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/)
  assert.match(styles, /hardware-field-float/)
})

test('isolated hardware smokes choose their state before logging and single-instance locking', () => {
  const statePath = main.indexOf("app.setPath('userData', explicitStateDirectory)")
  assert.ok(statePath >= 0)
  assert.ok(statePath < main.indexOf('initFileLogging()'))
  assert.ok(statePath < main.indexOf('app.requestSingleInstanceLock()'))
  assert.match(main, /port: explicitStateDirectory \? 0 : undefined/)
})
