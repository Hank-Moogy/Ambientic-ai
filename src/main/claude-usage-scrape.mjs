import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Scrapes Claude Code's interactive /usage panel (via resources/claude_usage.py)
// to obtain real subscription limit windows — the only local source for Claude's
// 5-hour and weekly "% used", which it exposes nowhere else. Running Claude's TUI
// costs a few seconds and a short-lived process, so results are cached: success
// for 8 minutes, failure for 4, and concurrent calls share one in-flight run.
const SUCCESS_TTL_MS = 8 * 60 * 1000
const FAILURE_TTL_MS = 4 * 60 * 1000
const SCRAPE_TIMEOUT_MS = 16_000

let cache = { at: 0, value: null, error: null }
let inflight = null

function helperPath () {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'claude_usage.py') : '',
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'resources', 'claude_usage.py')
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) || candidates.at(-1)
}

export function scrapeClaudeUsage (claudePath) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/python3', [helperPath(), claudePath], {
      timeout: SCRAPE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      killSignal: 'SIGKILL'
    }, (error, stdout) => {
      if (error) return reject(error)
      let parsed
      try {
        parsed = JSON.parse(String(stdout).trim().split('\n').filter(Boolean).at(-1) || '{}')
      } catch {
        return reject(new Error('Could not parse Claude /usage output'))
      }
      if (parsed.error) {
        const reason = new Error(parsed.error)
        if (parsed.code) reason.code = parsed.code
        return reject(reason)
      }
      if (!Array.isArray(parsed.windows) || !parsed.windows.length) return reject(new Error('Claude /usage returned no limit windows'))
      resolve(parsed)
    })
  })
}

// Cached wrapper. Throws on failure (the caller falls back to activity).
export async function collectClaudeUsageWindows (claudePath) {
  const now = Date.now()
  const ttl = cache.error ? FAILURE_TTL_MS : SUCCESS_TTL_MS
  if (cache.at && now - cache.at < ttl) {
    if (cache.error) throw cache.error
    return cache.value
  }
  if (inflight) return inflight
  inflight = scrapeClaudeUsage(claudePath)
    .then((value) => { cache = { at: Date.now(), value, error: null }; return value })
    .catch((error) => { cache = { at: Date.now(), value: null, error }; throw error })
    .finally(() => { inflight = null })
  return inflight
}
