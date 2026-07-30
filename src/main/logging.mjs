import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// A packaged Electron app has nowhere to print: launched from Finder or the Dock
// its stdout is discarded, so every console.* line in the main process — provider
// spawn failures, usage-collection errors, approval routing — vanishes and a bug
// report arrives with no evidence. Tee the main process's console output to a
// rotating file under ~/.ambientic/logs so problems can be diagnosed after the
// fact, while still printing to stdout for `npm run dev`.

const MAX_BYTES = 2 * 1024 * 1024
const LEVELS = ['log', 'info', 'warn', 'error', 'debug']

export function logDirectory (home = homedir()) {
  return join(home, '.ambientic', 'logs')
}

export function logFilePath (home = homedir()) {
  return join(logDirectory(home), 'main.log')
}

// Secrets must never reach disk. Provider CLIs and hook payloads can carry
// tokens, API keys, and authorization codes; redact the well-known shapes
// before a line is written.
const REDACTIONS = [
  [/\b(sk-ant-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g, '$1…<redacted>'],
  [/\b(sk-[A-Za-z0-9]{6})[A-Za-z0-9]{12,}/g, '$1…<redacted>'],
  [/\b(sbp_[A-Za-z0-9]{6})[A-Za-z0-9]+/g, '$1…<redacted>'],
  [/\b(gh[pousr]_[A-Za-z0-9]{6})[A-Za-z0-9]+/g, '$1…<redacted>'],
  [/\b(ey[A-Za-z0-9_-]{10})[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '$1…<redacted-jwt>'],
  [/("?(?:access_?token|refresh_?token|api_?key|authorization|password|secret)"?\s*[:=]\s*"?)([^"\s,}]{4,})/gi, '$1<redacted>']
]

export function redactSecrets (line) {
  let text = String(line)
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement)
  return text
}

export function formatLogLine (level, parts, now = new Date()) {
  const body = parts.map((part) => {
    if (typeof part === 'string') return part
    if (part instanceof Error) return part.stack || `${part.name}: ${part.message}`
    try { return JSON.stringify(part) } catch { return String(part) }
  }).join(' ')
  return `${now.toISOString()} [${level}] ${redactSecrets(body)}\n`
}

// Rotate once the active file passes the cap, keeping a single previous file so
// the log cannot grow without bound on a machine that runs Ambientic all day.
export function shouldRotate (size, maxBytes = MAX_BYTES) {
  return Number.isFinite(size) && size >= maxBytes
}

function rotateIfNeeded (file, maxBytes) {
  try {
    if (!existsSync(file)) return
    if (!shouldRotate(statSync(file).size, maxBytes)) return
    renameSync(file, `${file}.1`)
  } catch {}
}

let installed = false

export function initFileLogging ({ home = homedir(), maxBytes = MAX_BYTES, console: target = console } = {}) {
  if (installed) return logFilePath(home)
  const file = logFilePath(home)
  try {
    mkdirSync(logDirectory(home), { recursive: true })
  } catch {
    return ''
  }
  installed = true
  const write = (level, parts) => {
    try {
      rotateIfNeeded(file, maxBytes)
      appendFileSync(file, formatLogLine(level, parts))
    } catch {}
  }
  for (const level of LEVELS) {
    const original = target[level]?.bind(target)
    target[level] = (...parts) => {
      write(level, parts)
      original?.(...parts)
    }
  }
  // A crash is exactly when the log matters most.
  process.on('uncaughtException', (error) => write('error', ['uncaughtException', error]))
  process.on('unhandledRejection', (reason) => write('error', ['unhandledRejection', reason]))
  write('log', [`--- Ambientic log started (pid ${process.pid}) ---`])
  return file
}
