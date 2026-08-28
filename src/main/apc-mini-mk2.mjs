// Akai APC mini mk2 protocol. The Control port exposes an 8x8 RGB grid as
// notes 0x00-0x3F, track buttons as 0x64-0x6B, and scene buttons as
// 0x70-0x77. See Akai Communications Protocol v1.0.
export const APC_MINI_MK2 = {
  ID: 'apc-mini-mk2',
  LABEL: 'Akai APC mini mk2',
  PAD_COUNT: 64,
  DEVICE_NAME: /APC\s*mini\s*mk2\s*Control/i,
  INTRO: [0xF0, 0x47, 0x7F, 0x4F, 0x60, 0x00, 0x04, 0x00, 0x01, 0x00, 0x00, 0xF7],
  COLOR: { OFF: 0, RED: 5, ORANGE: 9, GREEN: 21, BLUE: 45 },
  ANIMATION: { SOLID: 6, BLINK_QUARTER: 14 },
  NOTE: { TRACK_FIRST: 0x64 }
}

export function miniNoteForPad (pad) {
  if (!Number.isInteger(pad) || pad < 0 || pad >= APC_MINI_MK2.PAD_COUNT) return null
  const row = Math.floor(pad / 8)
  const column = pad % 8
  return (7 - row) * 8 + column
}

export function miniPadForMessage (message) {
  if (!Array.isArray(message) || message.length < 3) return null
  const [status, note, velocity] = message
  if ((status & 0xF0) !== 0x90 || velocity === 0 || !Number.isInteger(note) || note < 0 || note >= APC_MINI_MK2.PAD_COUNT) return null
  return miniNoteForPad(note)
}

export function miniRecordButtonForMessage (message) {
  if (!Array.isArray(message) || message.length < 3) return null
  const [status, note, velocity] = message
  const kind = status & 0xF0
  if ((kind !== 0x80 && kind !== 0x90) || note < APC_MINI_MK2.NOTE.TRACK_FIRST || note > APC_MINI_MK2.NOTE.TRACK_FIRST + 7) return null
  return { column: note - APC_MINI_MK2.NOTE.TRACK_FIRST, pressed: kind === 0x90 && velocity > 0 }
}

export function miniGridSessions (sessions = []) {
  return sessions.slice(0, APC_MINI_MK2.PAD_COUNT)
}

function miniLedForSession (session) {
  if (!session) return { channel: APC_MINI_MK2.ANIMATION.SOLID, color: APC_MINI_MK2.COLOR.OFF }
  // Same meaning as the APC40 grid: orange is a question waiting for the person.
  if (session.awaitingApproval) return { channel: APC_MINI_MK2.ANIMATION.SOLID, color: APC_MINI_MK2.COLOR.ORANGE }
  if (session.standby) return { channel: APC_MINI_MK2.ANIMATION.SOLID, color: APC_MINI_MK2.COLOR.ORANGE }
  if (session.state === 'running') return { channel: APC_MINI_MK2.ANIMATION.SOLID, color: APC_MINI_MK2.COLOR.GREEN }
  if (session.state === 'attention' || (session.state === 'waiting' && session.unseen)) {
    return { channel: session.unseen ? APC_MINI_MK2.ANIMATION.BLINK_QUARTER : APC_MINI_MK2.ANIMATION.SOLID, color: APC_MINI_MK2.COLOR.RED }
  }
  return { channel: APC_MINI_MK2.ANIMATION.SOLID, color: APC_MINI_MK2.COLOR.BLUE }
}

export function miniGridLedMessages (sessions = []) {
  const grid = miniGridSessions(sessions)
  return Array.from({ length: APC_MINI_MK2.PAD_COUNT }, (_, pad) => {
    const led = miniLedForSession(grid[pad])
    return [0x90 | led.channel, miniNoteForPad(pad), led.color]
  })
}

export function miniRecordLedMessages (recording) {
  return Array.from({ length: 8 }, (_, column) => [
    0x90,
    APC_MINI_MK2.NOTE.TRACK_FIRST + column,
    recording?.column === column ? 1 : 0
  ])
}

export function miniSelectedSessionForRecordColumn (sessions, selectedSessionId, column) {
  if (!Number.isInteger(column) || column < 0 || column > 7) return null
  const grid = miniGridSessions(sessions)
  const index = grid.findIndex((session) => session.id === selectedSessionId)
  return index >= 0 && index % 8 === column ? grid[index] : null
}
