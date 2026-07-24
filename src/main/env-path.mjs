import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// A Finder/Dock-launched macOS GUI app inherits launchd's minimal PATH
// (/usr/bin:/bin:/usr/sbin:/sbin). That omits Homebrew, nvm, Volta, and
// ~/.local/bin, so a spawned provider CLI — and any node-based hook it runs,
// e.g. a Claude Code plugin's `node .../session-end-cleanup.mjs` — fails with
// "node: command not found". We rebuild a real PATH once at startup and reuse
// it for every child process.
const COMMON_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.volta', 'bin'),
  join(homedir(), '.bun', 'bin'),
  join(homedir(), '.deno', 'bin'),
  join(homedir(), '.cargo', 'bin')
]

// Ask the user's login shell for the PATH it exports. A login (non-interactive)
// shell sources the profile files where Homebrew/nvm extend PATH, without the
// hang risk of a fully interactive shell. Failures are non-fatal — the static
// list below is the safety net.
function loginShellPath () {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const out = execFileSync(shell, ['-lc', 'printf %s "$PATH"'], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return String(out).trim()
  } catch {
    return ''
  }
}

export function resolveEnhancedPath (basePath = process.env.PATH || '') {
  const ordered = []
  const seen = new Set()
  const add = (dir) => {
    const value = String(dir || '').trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    ordered.push(value)
  }
  for (const dir of loginShellPath().split(':')) add(dir)
  for (const dir of basePath.split(':')) add(dir)
  for (const dir of COMMON_BIN_DIRS) if (existsSync(dir)) add(dir)
  return ordered.join(':')
}

let applied = false

// Idempotently widen process.env.PATH so every subsequently spawned child
// (claude/codex/hermes and their hooks) inherits a working PATH.
export function ensureEnhancedPath () {
  if (applied) return process.env.PATH
  applied = true
  const next = resolveEnhancedPath()
  if (next) process.env.PATH = next
  return process.env.PATH
}
