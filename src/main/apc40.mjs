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
  }
}

export function padForMessage (message) {
  if (!Array.isArray(message) || message.length < 3) return null
  const [status, note, velocity] = message
  if ((status & 0xF0) !== 0x90 || velocity === 0) return null
  return Number.isInteger(note) && note >= 0 && note < APC40.PAD_COUNT ? note : null
}

export function ledForSession (session, selected = false) {
  if (!session) return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.OFF }
  if (selected) return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.BLUE }

  switch (session.state) {
    case 'running':
      return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.GREEN }
    case 'attention':
      return { channel: APC40.ANIMATION.PULSE_QUARTER, color: APC40.COLOR.YELLOW }
    case 'waiting':
      return {
        channel: session.unseen ? APC40.ANIMATION.BLINK_QUARTER : APC40.ANIMATION.SOLID,
        color: APC40.COLOR.RED
      }
    case 'idle':
    default:
      return { channel: APC40.ANIMATION.SOLID, color: APC40.COLOR.DIM_RED }
  }
}

export function gridSessions (sessions = []) {
  return sessions.slice(0, APC40.PAD_COUNT)
}
