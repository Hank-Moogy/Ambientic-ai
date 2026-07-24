import { APC40, noteForPad } from './apc40.mjs'
import { APC_MINI_MK2, miniNoteForPad } from './apc-mini-mk2.mjs'

export const VIBE_SEQUENCE = {
  frameIntervalMs: 90,
  frameCount: 60
}

export const VIBE_VARIANTS = [
  { id: 'center-wave', label: 'Center wave', tone: 'cold' },
  { id: 'cold-orbit', label: 'Cold orbit', tone: 'cold' },
  { id: 'life', label: '8-bit life', tone: 'hot' },
  { id: 'illumination', label: 'Illumination', tone: 'hot' }
]

const COLD_PALETTES = {
  'apc40-mkii': [37, 41, 45, 49, 53, 33, 21],
  [APC_MINI_MK2.ID]: [45, 41, 49, 53, 37, 33, 21]
}

const HOT_PALETTES = {
  'apc40-mkii': [5, 9, 13, 17, 57, 53],
  [APC_MINI_MK2.ID]: [5, 9, 13, 17, 57, 53]
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

function initialLifeCell (row, column) {
  return ((row * 13 + column * 7 + row * column * 3) % 11) < 4
}

function lifeGrid (rows, columns, generation) {
  let cells = Array.from({ length: rows * columns }, (_, pad) => initialLifeCell(Math.floor(pad / columns), pad % columns))
  for (let step = 0; step < generation; step++) {
    cells = cells.map((alive, pad) => {
      const row = Math.floor(pad / columns)
      const column = pad % columns
      let neighbors = 0
      for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
          if (rowOffset === 0 && columnOffset === 0) continue
          const nextRow = (row + rowOffset + rows) % rows
          const nextColumn = (column + columnOffset + columns) % columns
          if (cells[nextRow * columns + nextColumn]) neighbors += 1
        }
      }
      return neighbors === 3 || (alive && neighbors === 2)
    })
  }
  return cells
}

function colorForPad ({ variantId, row, column, rows, columns, frame, cold, hot, life }) {
  const centerRow = (rows - 1) / 2
  const centerColumn = (columns - 1) / 2
  const x = column - centerColumn
  const y = row - centerRow
  const distance = Math.sqrt(x * x + y * y)

  if (variantId === 'center-wave') {
    const crest = Math.sin(distance * 2.25 - frame * 0.42)
    const shimmer = Math.cos((x - y) * 0.72 + frame * 0.16)
    return cold[Math.abs(Math.floor((crest + shimmer + 2.2) * 1.55)) % cold.length]
  }

  if (variantId === 'cold-orbit') {
    const angle = Math.atan2(y, x)
    const orbit = Math.sin(angle * 3 - frame * 0.28 + distance * 0.74)
    const ring = Math.cos(distance * 1.9 + frame * 0.12)
    return cold[Math.abs(Math.floor((orbit + ring + 2.2) * 1.6)) % cold.length]
  }

  if (variantId === 'life') {
    const alive = life[row * columns + column]
    if (!alive) return 0
    return hot[(row + column + Math.floor(frame / 3)) % hot.length]
  }

  // Staggered blocks flare on and off like a warm architectural light wall.
  const block = Math.floor(row / 2) * 5 + Math.floor(column / 2)
  const pulse = (block * 7 + Math.floor(frame / 3) * 5) % 17
  if (pulse > 8) return 0
  return hot[(block + Math.floor(frame / 5)) % hot.length]
}

export function vibeLedMessages (profileId, frame, variantId = VIBE_VARIANTS[0].id) {
  const geometry = profileGeometry(profileId)
  const cold = COLD_PALETTES[profileId] || COLD_PALETTES['apc40-mkii']
  const hot = HOT_PALETTES[profileId] || HOT_PALETTES['apc40-mkii']
  const life = variantId === 'life'
    ? lifeGrid(geometry.rows, geometry.columns, Math.floor(frame / 3))
    : null
  const messages = []

  for (let pad = 0; pad < geometry.rows * geometry.columns; pad++) {
    const row = Math.floor(pad / geometry.columns)
    const column = pad % geometry.columns
    const color = colorForPad({ variantId, row, column, rows: geometry.rows, columns: geometry.columns, frame, cold, hot, life })
    messages.push([0x90 | geometry.channel, geometry.noteForPad(pad), color])
  }

  return messages
}

export function vibePalette (profileId, tone = 'cold') {
  const source = tone === 'hot' ? HOT_PALETTES : COLD_PALETTES
  return [...(source[profileId] || source['apc40-mkii'])]
}
