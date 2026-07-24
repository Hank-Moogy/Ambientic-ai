import { APC40, noteForPad } from './apc40.mjs'
import { APC_MINI_MK2, miniNoteForPad } from './apc-mini-mk2.mjs'

export const VIBE_SEQUENCE = {
  frameIntervalMs: 60,
  frameCount: 90
}

export const VIBE_VARIANTS = [
  { id: 'center-wave', label: 'Center wave', tone: 'cold' },
  { id: 'cold-orbit', label: 'Cold orbit', tone: 'cold' }
]

export function shouldCelebrateMidiConnection (previous, next) {
  return !previous?.connected && Boolean(next?.connected)
}

const COLD_PALETTES = {
  'apc40-mkii': [37, 37, 41, 45, 45, 49, 53, 49, 45, 41, 33, 21, 33],
  [APC_MINI_MK2.ID]: [45, 45, 41, 49, 49, 53, 37, 53, 49, 41, 33, 21, 33]
}

function profileGeometry (profileId) {
  if (profileId === APC_MINI_MK2.ID) {
    return {
      rows: 8,
      columns: 8,
      channel: APC_MINI_MK2.ANIMATION.SOLID,
      noteForPad: miniNoteForPad
    }
  }
  return {
    rows: 5,
    columns: 8,
    channel: APC40.ANIMATION.SOLID,
    noteForPad
  }
}

function colorForPad ({ variantId, row, column, rows, columns, frame, cold }) {
  const centerRow = (rows - 1) / 2
  const centerColumn = (columns - 1) / 2
  const x = column - centerColumn
  const y = row - centerRow
  const distance = Math.sqrt(x * x + y * y)

  if (variantId === 'center-wave') {
    const crest = Math.sin(distance * 1.8 - frame * 0.17)
    const shimmer = Math.cos((x - y) * 0.55 + frame * 0.055)
    return cold[Math.abs(Math.floor((crest + shimmer + 2.2) * 2.55)) % cold.length]
  }

  const angle = Math.atan2(y, x)
  const orbit = Math.sin(angle * 2.6 - frame * 0.13 + distance * 0.58)
  const ring = Math.cos(distance * 1.55 + frame * 0.045)
  return cold[Math.abs(Math.floor((orbit + ring + 2.2) * 2.55)) % cold.length]
}

export function vibeLedMessages (profileId, frame, variantId = VIBE_VARIANTS[0].id) {
  const geometry = profileGeometry(profileId)
  const cold = COLD_PALETTES[profileId] || COLD_PALETTES['apc40-mkii']
  const messages = []

  for (let pad = 0; pad < geometry.rows * geometry.columns; pad++) {
    const row = Math.floor(pad / geometry.columns)
    const column = pad % geometry.columns
    const color = colorForPad({ variantId, row, column, rows: geometry.rows, columns: geometry.columns, frame, cold })
    messages.push([0x90 | geometry.channel, geometry.noteForPad(pad), color])
  }

  return messages
}

export function vibePalette (profileId, tone = 'cold') {
  return [...(COLD_PALETTES[profileId] || COLD_PALETTES['apc40-mkii'])]
}

export function changedVibeMessages (previous = [], current = []) {
  const previousByNote = new Map(previous.map((message) => [message[1], message]))
  return current.filter((message) => {
    const before = previousByNote.get(message[1])
    return !before || before[0] !== message[0] || before[2] !== message[2]
  })
}
