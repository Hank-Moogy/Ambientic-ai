import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function normalizeBuildInfo (value = {}, fallbackVersion = 'development') {
  return {
    version: String(value.version || fallbackVersion),
    commit: String(value.commit || 'development'),
    branch: String(value.branch || 'local'),
    builtAt: value.builtAt ? String(value.builtAt) : null,
    dirty: value.dirty !== false
  }
}

export function readBuildInfo ({ resourcesPath, appPath, version } = {}) {
  const candidates = [
    resourcesPath && join(resourcesPath, 'build-info.json'),
    appPath && join(appPath, 'resources', 'build-info.json')
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      return normalizeBuildInfo(JSON.parse(readFileSync(candidate, 'utf8')), version)
    } catch {}
  }

  return normalizeBuildInfo({}, version)
}
