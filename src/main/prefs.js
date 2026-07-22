import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// Tiny JSON prefs (just the window position for now) in userData. No deps.
let file = null
function path () {
  if (!file) file = join(app.getPath('userData'), 'prefs.json')
  return file
}

export function loadPrefs () {
  try { return JSON.parse(readFileSync(path(), 'utf8')) } catch { return {} }
}

export function savePrefs (prefs) {
  try { writeFileSync(path(), JSON.stringify(prefs)) } catch { /* non-fatal */ }
}
