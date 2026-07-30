import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

// A machine can carry several Claude Code installations at once: a Homebrew
// cask, a version-managed ~/.local/bin install, and the copy Claude Desktop
// keeps under Application Support. They drift far apart — this machine had a
// 2.1.31 Homebrew cask alongside a 2.1.220 native install — and an old build
// renders a different /usage panel and can fail outright.
//
// Both connector discovery and usage collection used to hardcode Homebrew
// first and were only saved by luck (a `command -v` hit, or the Desktop
// preference). Resolve by *newest version* instead, so the binary Ambientic
// drives is always the one most likely to match current behaviour.

const VERSION_TIMEOUT_MS = 5000
const CACHE_TTL_MS = 10 * 60 * 1000

export function parseClaudeVersion (text) {
  const match = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareClaudeVersionTuples (a, b) {
  for (let i = 0; i < 3; i += 1) {
    const diff = (b?.[i] ?? -1) - (a?.[i] ?? -1)
    if (diff) return diff
  }
  return 0
}

// Pure selection step, kept separate from process spawning so it can be tested:
// newest version wins; a candidate whose version could not be read loses to any
// known version but still beats nothing at all.
export function pickNewestClaudeCommand (entries = []) {
  const usable = entries.filter((entry) => entry && entry.path)
  if (!usable.length) return ''
  const versioned = usable.filter((entry) => Array.isArray(entry.version))
  if (!versioned.length) return usable[0].path
  return [...versioned].sort((a, b) => compareClaudeVersionTuples(a.version, b.version))[0].path
}

export function claudeCommandCandidates (home = homedir()) {
  return [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(home, '.local', 'bin', 'claude')
  ]
}

// Claude Desktop keeps its own signed CLI, one directory per version.
export async function claudeDesktopCandidates (home = homedir()) {
  const root = join(home, 'Library', 'Application Support', 'Claude', 'claude-code')
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, 'claude.app', 'Contents', 'MacOS', 'claude'))
      .filter((path) => existsSync(path))
  } catch {
    return []
  }
}

function versionOf (path) {
  return new Promise((resolve) => {
    execFile(path, ['--version'], { timeout: VERSION_TIMEOUT_MS, maxBuffer: 64 * 1024 }, (error, stdout) => {
      resolve(error ? null : parseClaudeVersion(stdout))
    })
  })
}

let cache = { at: 0, path: '' }

// Resolve the newest usable `claude`. `extra` accepts paths discovered by other
// means (for example a login-shell `command -v` hit) so a custom install still
// competes on version rather than being preferred or ignored by position.
export async function resolveNewestClaudeCommand ({ home = homedir(), extra = [], now = Date.now() } = {}) {
  if (cache.path && now - cache.at < CACHE_TTL_MS) return cache.path
  const seen = new Set()
  const paths = [...extra, ...claudeCommandCandidates(home), ...(await claudeDesktopCandidates(home))]
    .map((path) => String(path || '').trim())
    .filter((path) => path && !seen.has(path) && seen.add(path) && existsSync(path))
  if (!paths.length) return ''
  const entries = await Promise.all(paths.map(async (path) => ({ path, version: await versionOf(path) })))
  const best = pickNewestClaudeCommand(entries)
  if (best) cache = { at: now, path: best }
  return best
}

export function resetClaudeCommandCache () {
  cache = { at: 0, path: '' }
}
