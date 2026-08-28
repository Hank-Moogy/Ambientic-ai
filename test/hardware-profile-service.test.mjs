import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHardwareProfileService, portableHardwareTemplate } from '../src/main/hardware-profile-service.mjs'

function serviceFixture (invoke = async () => true) {
  const root = mkdtempSync(join(tmpdir(), 'ambientic-hardware-'))
  let sequence = 0
  return {
    file: join(root, 'hardware-profiles.json'),
    service: createHardwareProfileService({ file: join(root, 'hardware-profiles.json'), id: () => `id-${++sequence}`, now: () => 1000 + sequence, invoke })
  }
}

test('creates and restores a durable multi-view hardware template', () => {
  const { service, file } = serviceFixture()
  const template = service.create({ name: 'Builder deck', rows: 2, columns: 3 })
  const child = service.addView(template.id, { name: 'Review', fromViewId: 'home', fromSlotId: 'pad-1-1' })
  assert.equal(service.snapshot().templates.length, 2)
  assert.equal(service.template(template.id).views[0].assignments['pad-1-1'].targetId, child.id)
  assert.equal(service.template(template.id).views[1].assignments['pad-2-3'].actionId, 'hardware.view.back')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).activeTemplateId, template.id)

  const restored = createHardwareProfileService({ file })
  assert.equal(restored.active().name, 'Builder deck')
  assert.equal(restored.active().views.length, 2)
})

test('learns MIDI and keyboard controls once at the logical slot layer', async () => {
  const invoked = []
  const { service } = serviceFixture(async (value) => { invoked.push(value); return true })
  const template = service.create({ name: 'Keys', rows: 1, columns: 2 })
  service.assign(template.id, 'home', 'pad-1-1', { actionId: 'ambientic.overview', label: 'Overview' })
  service.learn(template.id, 'pad-1-1')
  assert.equal(service.handleInput({ key: 'note:0:36', type: 'note', number: 36 }), true)
  assert.equal(service.active().bindings['note:0:36'], 'pad-1-1')
  service.setMode('play')
  assert.equal(service.handleInput({ key: 'note:0:36', type: 'note', number: 36 }), true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(invoked[0].assignment.actionId, 'ambientic.overview')
})

test('view navigation maintains a bounded back stack', async () => {
  const { service } = serviceFixture()
  const template = service.create({ name: 'Views', rows: 1, columns: 2 })
  const child = service.addView(template.id, { name: 'Second', fromViewId: 'home', fromSlotId: 'pad-1-1' })
  await service.triggerSlot('pad-1-1')
  assert.equal(service.snapshot().activeViewId, child.id)
  await service.triggerSlot('pad-1-2')
  assert.equal(service.snapshot().activeViewId, 'home')
})

test('portable export removes bindings and private local targets', () => {
  const { service } = serviceFixture()
  const template = service.create({ name: 'Private deck', rows: 1, columns: 1 })
  service.assign(template.id, 'home', 'pad-1-1', { actionId: 'thread.send-prompt', targetId: 'private-thread', targetLabel: 'Secret task', prompt: 'Private instructions' })
  service.learn(template.id, 'pad-1-1')
  service.handleInput({ key: 'key:Meta+KeyK', type: 'key' })
  const exported = portableHardwareTemplate(service.active())
  assert.deepEqual(exported.bindings, {})
  assert.equal(exported.views[0].assignments['pad-1-1'].targetId, '')
  assert.equal(exported.views[0].assignments['pad-1-1'].targetLabel, 'Choose thread during setup')
  assert.equal(exported.views[0].assignments['pad-1-1'].prompt, '')
  assert.equal(exported.views[0].assignments['pad-1-1'].needsSetup, true)
  assert.deepEqual(exported.requirements.actionIds, ['thread.send-prompt'])
  assert.equal(exported.requirements.setupRequired, 1)
  assert.doesNotMatch(JSON.stringify(exported), /Secret task|Private instructions|private-thread/)
})

test('exchanges a sanitized multi-view bundle between clean profiles and restores it', async () => {
  const source = serviceFixture().service
  const template = source.create({ name: 'Shared review deck', rows: 2, columns: 2 })
  const child = source.addView(template.id, { name: 'Review', fromViewId: 'home', fromSlotId: 'pad-1-1' })
  source.assign(template.id, child.id, 'pad-1-1', { actionId: 'goal.open', targetId: 'private-goal-id', targetLabel: 'Client release', label: 'Open release goal' })
  source.learn(template.id, 'pad-2-1')
  source.handleInput({ key: 'note:0:36', type: 'note', pressed: true })
  const portable = source.exportTemplate(template.id)

  const destinationFixture = serviceFixture()
  const imported = destinationFixture.service.importTemplate(JSON.parse(JSON.stringify(portable)))
  assert.deepEqual(imported.bindings, {})
  assert.equal(imported.views.length, 2)
  assert.equal(imported.views[1].assignments['pad-1-1'].needsSetup, true)
  assert.equal(imported.views[1].assignments['pad-1-1'].targetId, '')
  assert.doesNotMatch(JSON.stringify(imported), /private-goal-id|Client release|note:0:36/)

  const restarted = createHardwareProfileService({ file: destinationFixture.file })
  assert.equal(restarted.active().name, 'Shared review deck')
  assert.equal(restarted.active().views.length, 2)
  assert.equal(await restarted.triggerSlot('pad-1-1'), true)
  assert.equal(restarted.activeViewId(), child.id)
  assert.equal(await restarted.triggerSlot('pad-2-2'), true)
  assert.equal(restarted.activeViewId(), 'home')
})

test('rejects malformed or incompatible imported view graphs', () => {
  const { service } = serviceFixture()
  const base = { schema: 'ambientic.hardware-template', version: 1, name: 'Bad deck', rows: 1, columns: 1, rootViewId: 'home', views: [{ id: 'home', name: 'Home', assignments: {} }] }
  assert.throws(() => service.importTemplate({ ...base, version: 2 }), /not supported/i)
  assert.throws(() => service.importTemplate({ ...base, rootViewId: 'missing' }), /root view/i)
  assert.throws(() => service.importTemplate({ ...base, views: [{ ...base.views[0], assignments: { 'pad-1-1': { actionId: 'hardware.view.open', targetId: 'missing' } } }] }), /missing view/i)
})

test('tracks consequential actions as pending until confirmation resolves', async () => {
  const { service } = serviceFixture(async () => ({ pending: true }))
  const template = service.create({ name: 'Safe deck', rows: 1, columns: 1 })
  service.assign(template.id, 'home', 'pad-1-1', { actionId: 'thread.send-prompt', targetId: 'thread-1', prompt: 'Run the release checks', label: 'Run release checks' })
  await service.triggerSlot('pad-1-1')
  assert.equal(service.snapshot().lastResult.pending, true)
  assert.equal(service.snapshot().lastResult.message, 'Waiting for confirmation')
  service.resolveConfirmation('pad-1-1', false)
  assert.equal(service.snapshot().lastResult.pending, false)
  assert.equal(service.snapshot().lastResult.message, 'Action cancelled')
})

test('derives setup state from required local targets and saved prompts', () => {
  const { service } = serviceFixture()
  const template = service.create({ name: 'Setup deck', rows: 1, columns: 1 })
  const incomplete = service.assign(template.id, 'home', 'pad-1-1', { actionId: 'thread.send-prompt', label: 'Send' })
  assert.equal(incomplete.needsSetup, true)
  const ready = service.assign(template.id, 'home', 'pad-1-1', { actionId: 'thread.send-prompt', targetId: 'thread-1', prompt: 'Continue', label: 'Send', needsSetup: false })
  assert.equal(ready.needsSetup, false)
})

test('reports control conflicts when learning moves a physical binding', () => {
  const { service } = serviceFixture()
  const template = service.create({ name: 'Conflict deck', rows: 1, columns: 2 })
  service.learn(template.id, 'pad-1-1')
  service.handleInput({ key: 'note:0:36', type: 'note', pressed: true })
  service.learn(template.id, 'pad-1-2')
  service.handleInput({ key: 'note:0:36', type: 'note', pressed: true })
  assert.equal(service.active().bindings['note:0:36'], 'pad-1-2')
  assert.match(service.snapshot().lastResult.message, /moved from pad-1-1/)
})

test('built-in APC template remains protected and forkable', () => {
  const { service } = serviceFixture()
  assert.throws(() => service.update('ambientic-native-sessions', { name: 'Changed' }), /forked/i)
  const fork = service.duplicate('ambientic-native-sessions')
  assert.equal(fork.builtIn, false)
  assert.match(fork.name, /copy/)
})

test('release and hold triggers do not fire as ordinary presses', async () => {
  const invoked = []
  const { service } = serviceFixture(async (value) => { invoked.push(value); return true })
  const template = service.create({ name: 'Gestures', rows: 1, columns: 1 })
  service.assign(template.id, 'home', 'pad-1-1', { actionId: 'ambientic.overview', trigger: 'release' })
  service.learn(template.id, 'pad-1-1')
  service.handleInput({ key: 'note:0:40', type: 'note', pressed: true })
  service.setMode('play')
  service.handleInput({ key: 'note:0:40', type: 'note', pressed: true })
  assert.equal(invoked.length, 0)
  service.handleInput({ key: 'note:0:40', type: 'note', pressed: false })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(invoked.length, 1)

  service.assign(template.id, 'home', 'pad-1-1', { actionId: 'ambientic.overview', trigger: 'hold' })
  service.handleInput({ key: 'note:0:40', type: 'note', pressed: true })
  service.handleInput({ key: 'note:0:40', type: 'note', pressed: false })
  await new Promise((resolve) => setTimeout(resolve, 680))
  assert.equal(invoked.length, 1)
})

test('projects active-view assignment tones back onto learned hardware controls', () => {
  const { service } = serviceFixture()
  const template = service.create({ name: 'Light deck', rows: 1, columns: 1 })
  service.assign(template.id, 'home', 'pad-1-1', { actionId: 'goal.open', targetId: 'goal-1', feedback: 'green' })
  service.learn(template.id, 'pad-1-1')
  service.handleInput({ key: 'note:0:36', type: 'note', pressed: true })
  assert.deepEqual(service.feedback(), { 'note:0:36': 'green' })
  service.activate('ambientic-native-sessions')
  assert.equal(service.feedback(), null)
})

test('ignores retired hardware assignments while preserving supported mappings', () => {
  const { file } = serviceFixture()
  const serialized = `${JSON.stringify({
    version: 1,
    activeTemplateId: 'legacy-deck',
    updatedAt: 1000,
    templates: [{
      id: 'legacy-deck',
      schema: 'ambientic.hardware-template',
      version: 1,
      name: 'Legacy deck',
      rows: 1,
      columns: 2,
      rootViewId: 'home',
      views: [{ id: 'home', name: 'Home', assignments: {
        'pad-1-1': { actionId: ['work', 'flow.run'].join(''), targetId: 'retired-routine' },
        'pad-1-2': { actionId: 'goal.open', targetId: 'goal-1', label: 'Open goal' }
      } }],
      bindings: { 'note:0:36': 'pad-1-1', 'note:0:37': 'pad-1-2' }
    }]
  }, null, 2)}\n`
  writeFileSync(file, serialized)

  const restored = createHardwareProfileService({ file })
  assert.equal(restored.active().views[0].assignments['pad-1-1'], undefined)
  assert.equal(restored.active().views[0].assignments['pad-1-2'].actionId, 'goal.open')
  assert.deepEqual(restored.active().bindings, { 'note:0:36': 'pad-1-1', 'note:0:37': 'pad-1-2' })
  assert.equal(readFileSync(file, 'utf8'), serialized)
})
