import { PAD_MOTION, PAD_TONE, padLightForSession } from '../shared/pad-light.mjs'
// Akai APC40 mkII clip-grid protocol. The 5x8 RGB grid is exposed as notes
// 0x00-0x27; the MIDI channel selects the LED animation and velocity selects
// the colour. See APC40 Mk2 Communications Protocol v1.2.
export const APC40 = {
  PAD_COUNT: 40,
  DEVICE_NAME: /APC40\s*(?:mkII|mk2)/i,
  INTRO_ALT_MODE: [0xF0, 0x47, 0x7F, 0x29, 0x60, 0x00, 0x04, 0x42, 0x00, 0x08, 0x01, 0xF7],
  COLOR: {
    OFF: 0,
    RED: 5,
    ORANGE: 9,
    DIM_RED: 7,
    YELLOW: 13,
    GREEN: 21,
    DIM_GREEN: 23,
    BLUE: 37,
    DIM_WHITE: 1
  },
  ANIMATION: {
    SOLID: 0,
    PULSE_QUARTER: 9,
    BLINK_QUARTER: 14
  },
  NOTE: {
    RECORD: 0x5D,
    RECORD_ARM: 0x30
  }
}

export function padForMessage (message) {
  if (!Array.isArray(message) || message.length < 3) return null
  const [status, note, velocity] = message
  if ((status & 0xF0) !== 0x90 || velocity === 0) return null
  if (!Number.isInteger(note) || note < 0 || note >= APC40.PAD_COUNT) return null
  return noteForPad(note)
}

export function recordButtonForMessage (message) {
  if (!Array.isArray(message) || message.length < 3) return false
  const [status, note, velocity] = message
  return (status & 0xF0) === 0x90 && note === APC40.NOTE.RECORD && velocity > 0
}

// The eight per-track Record Arm buttons all use note 0x30. Their MIDI
// channel identifies the physical column (channels 0-7), and Alternate
// Ableton mode makes them momentary so press/release is suitable for PTT.
export function recordArmForMessage (message) {
  if (!Array.isArray(message) || message.length < 3) return null
  const [status, note, velocity] = message
  const kind = status & 0xF0
  const column = status & 0x0F
  if (note !== APC40.NOTE.RECORD_ARM || column > 7 || (kind !== 0x80 && kind !== 0x90)) return null
  return { column, pressed: kind === 0x90 && velocity > 0 }
}

// APC note numbers start on the physical bottom row. Ambientic presents pads
// in reading order instead: top-left to top-right, then the next row down.
export function noteForPad (pad) {
  if (!Number.isInteger(pad) || pad < 0 || pad >= APC40.PAD_COUNT) return null
  const row = Math.floor(pad / 8)
  const column = pad % 8
  return (4 - row) * 8 + column
}

export function ledForSession (session) {
  if (!session) return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.OFF }

  // An approval outranks the lifecycle colour beneath it: the thread cannot
  // move until the person answers, so that is the only thing the pad needs to
  // say. Held solid rather than blinking — this is a question waiting patiently,
  // not an alarm.
  if (session.awaitingApproval) {
    return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.ORANGE }
  }
  if (session.standby) {
    return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.ORANGE }
  }

  switch (session.state) {
    case 'running':
      return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.GREEN }
    case 'attention':
      return {
        channel: session.unseen ? APC40.ANIMATION.BLINK_QUARTER : APC40.ANIMATION.SOLID,
        color: APC40.COLOR.RED
      }
    case 'waiting':
      return session.unseen
        ? { channel: APC40.ANIMATION.BLINK_QUARTER, color: APC40.COLOR.RED }
        : { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.BLUE }
    case 'idle':
    default:
      return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.BLUE }
  }
}

export function gridSessions (sessions = []) {
  return sessions.slice(0, APC40.PAD_COUNT)
}

export function selectedSessionForRecordColumn (sessions, selectedSessionId, column) {
  if (!Number.isInteger(column) || column < 0 || column > 7) return null
  const grid = gridSessions(sessions)
  const index = grid.findIndex((session) => session.id === selectedSessionId)
  return index >= 0 && index % 8 === column ? grid[index] : null
}

export function gridLedMessages (sessions = []) {
  const grid = gridSessions(sessions)
  return Array.from({ length: APC40.PAD_COUNT }, (_, pad) => {
    const led = ledForSession(grid[pad])
    return [0x90 | led.channel, noteForPad(pad), led.color]
  })
}
