import { EventEmitter } from 'node:events'

export const AMBIENT_CHECK_IN_MINUTES = [30, 60, 120, 240, 480, 720]
export const DEFAULT_AMBIENT_CHECK_IN_MINUTES = 240

export function normalizeAmbientCheckIn (value) {
  const requested = Number(value)
  return AMBIENT_CHECK_IN_MINUTES.includes(requested) ? requested : DEFAULT_AMBIENT_CHECK_IN_MINUTES
}

export class AmbientModeService extends EventEmitter {
  constructor ({ blocker, checkInMinutes, now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout }) {
    super()
    this.blocker = blocker
    this.checkInMinutes = normalizeAmbientCheckIn(checkInMinutes)
    this.now = now
    this.schedule = schedule
    this.cancel = cancel
    this.blockerId = null
    this.startedAt = 0
    this.nextCheckAt = 0
    this.checkInDue = false
    this.timer = null
  }

  getState () {
    const enabled = this.blockerId !== null && this.blocker.isStarted(this.blockerId)
    return {
      enabled,
      startedAt: enabled ? this.startedAt : 0,
      nextCheckAt: enabled ? this.nextCheckAt : 0,
      checkInDue: enabled && this.checkInDue,
      checkInMinutes: this.checkInMinutes,
      availableCheckIns: AMBIENT_CHECK_IN_MINUTES
    }
  }

  emitState () {
    const state = this.getState()
    this.emit('change', state)
    return state
  }

  armCheckIn () {
    if (this.timer) this.cancel(this.timer)
    if (this.blockerId === null) return
    this.checkInDue = false
    this.nextCheckAt = this.now() + this.checkInMinutes * 60 * 1000
    this.timer = this.schedule(() => {
      this.timer = null
      if (this.blockerId === null) return
      this.checkInDue = true
      this.emitState()
    }, this.checkInMinutes * 60 * 1000)
    this.timer?.unref?.()
  }

  enable () {
    if (this.blockerId !== null && this.blocker.isStarted(this.blockerId)) return this.emitState()
    this.blockerId = this.blocker.start('prevent-app-suspension')
    this.startedAt = this.now()
    this.armCheckIn()
    return this.emitState()
  }

  disable () {
    if (this.timer) this.cancel(this.timer)
    this.timer = null
    if (this.blockerId !== null && this.blocker.isStarted(this.blockerId)) this.blocker.stop(this.blockerId)
    this.blockerId = null
    this.startedAt = 0
    this.nextCheckAt = 0
    this.checkInDue = false
    return this.emitState()
  }

  setEnabled (enabled) {
    return enabled ? this.enable() : this.disable()
  }

  continue () {
    if (this.blockerId === null) return this.emitState()
    this.armCheckIn()
    return this.emitState()
  }

  setCheckInMinutes (value) {
    this.checkInMinutes = normalizeAmbientCheckIn(value)
    if (this.blockerId !== null) this.armCheckIn()
    return this.emitState()
  }

  stop () {
    this.disable()
    this.removeAllListeners()
  }
}
