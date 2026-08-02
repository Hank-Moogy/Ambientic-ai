import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AMBIENT_BLOCKER_TYPE,
  AmbientModeService,
  DEFAULT_AMBIENT_CHECK_IN_MINUTES,
  normalizeAmbientCheckIn
} from '../src/main/ambient-mode.mjs'

function fixture (checkInMinutes = 60) {
  let clock = 1_000
  let scheduled = null
  const calls = []
  const blocker = {
    started: new Set(),
    start: (type) => { calls.push(['start', type]); blocker.started.add(7); return 7 },
    stop: (id) => { calls.push(['stop', id]); return blocker.started.delete(id) },
    isStarted: (id) => blocker.started.has(id)
  }
  const service = new AmbientModeService({
    blocker,
    checkInMinutes,
    now: () => clock,
    schedule: (fn, delay) => { scheduled = { fn, delay }; return { unref () {} } },
    cancel: () => { scheduled = null }
  })
  return {
    service,
    calls,
    blocker,
    advance: (milliseconds) => { clock += milliseconds },
    fire: () => scheduled?.fn()
  }
}

test('Ambient mode uses one display-sleep blocker and releases it cleanly', () => {
  const { service, calls } = fixture()
  assert.equal(service.enable().enabled, true)
  service.enable()
  // 'prevent-app-suspension' would let the display sleep, which leaves the
  // machine free to drop off once the screen goes dark.
  assert.deepEqual(calls, [['start', AMBIENT_BLOCKER_TYPE]])
  assert.equal(AMBIENT_BLOCKER_TYPE, 'prevent-display-sleep')
  assert.equal(service.disable().enabled, false)
  assert.deepEqual(calls.at(-1), ['stop', 7])
})

test('Ambient mode re-arms a blocker the system dropped across sleep/wake', () => {
  const { service, calls, blocker } = fixture()
  service.enable()
  blocker.started.clear()
  assert.equal(service.getState().enabled, false)
  assert.equal(service.reassert().enabled, true)
  assert.deepEqual(calls.at(-1), ['start', AMBIENT_BLOCKER_TYPE])
})

test('Ambient mode reassert is a no-op when disabled or already held', () => {
  const { service, calls } = fixture()
  service.reassert()
  assert.deepEqual(calls, [], 'must not assert while ambient mode is off')
  service.enable()
  const afterEnable = calls.length
  service.reassert()
  assert.equal(calls.length, afterEnable, 'must not stack a second blocker')
})

test('Ambient mode asks after the configured interval without stopping agents', () => {
  const { service, fire } = fixture(120)
  service.enable()
  fire()
  const due = service.getState()
  assert.equal(due.checkInDue, true)
  assert.equal(due.enabled, true)
  assert.equal(service.continue().checkInDue, false)
  assert.equal(service.getState().enabled, true)
})

test('Ambient check-in settings are bounded to supported safe durations', () => {
  assert.equal(normalizeAmbientCheckIn(30), 30)
  assert.equal(normalizeAmbientCheckIn(720), 720)
  assert.equal(normalizeAmbientCheckIn(0), DEFAULT_AMBIENT_CHECK_IN_MINUTES)
  assert.equal(normalizeAmbientCheckIn('forever'), DEFAULT_AMBIENT_CHECK_IN_MINUTES)
})
