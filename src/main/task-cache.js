import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7

let file = null
function path () {
  if (!file) file = join(app.getPath('userData'), 'tasks.json')
  return file
}

function currentRecords (value) {
  const now = Date.now()
  const records = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    Object.entries(records).filter(([, record]) =>
      record &&
      typeof record.label === 'string' &&
      record.label.trim() &&
      Number.isFinite(record.updatedAt) &&
      now - record.updatedAt < MAX_AGE_MS
    )
  )
}

export function loadTaskCache () {
  try { return currentRecords(JSON.parse(readFileSync(path(), 'utf8'))) } catch { return {} }
}

export function saveTaskCache (records) {
  try { writeFileSync(path(), JSON.stringify(currentRecords(records), null, 2)) } catch { /* non-fatal */ }
}
