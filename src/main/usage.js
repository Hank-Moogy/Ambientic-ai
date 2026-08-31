import { EventEmitter } from 'node:events'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, release as osRelease } from 'node:os'
import { dirname, join } from 'node:path'
import { collectClaudeActivity } from './claude-activity.mjs'
import { collectClaudeUsageWindows } from './claude-usage-scrape.mjs'
import { claudeAccountStatus } from './claude-auth-service.mjs'
import { resolveNewestClaudeCommand } from './claude-binary.mjs'

const execFileAsync = promisify(execFile)
const REFRESH_MS = 2 * 60 * 1000
const COMMAND_TIMEOUT_MS = 20_000
// Per-collector ceiling for a single usage refresh so one stalled provider can
// never keep the whole panel in its loading state.
const COLLECTOR_TIMEOUT_MS = 12_000

function withTimeout (promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out fetching provider usage')), ms) })
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer))
}
const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098'
const KIMI_OAUTH_URL = 'https://auth.kimi.com/api/oauth/token'
const KIMI_USAGE_URL = 'https://api.kimi.com/coding/v1/usages'
const CONTROLLER_VERSION = '0.5.5'

const PROVIDERS = ['claude', 'codex', 'kimi']
const commandPaths = new Map()
const CLAUDE_USAGE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

function blankProvider () {
  return { status: 'loading', windows: [], error: null }
}

function initialState () {
  return {
    refreshing: false,
    updatedAt: null,
    providers: Object.fromEntries(PROVIDERS.map((name) => [name, blankProvider()]))
  }
}

function clampPercent (value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(100, number))
}

function safeError (error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/Bearer\s+\S+/gi, 'Bearer <redacted>').slice(0, 240)
}

async function pathExists (path) {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function knownUsageCommandCandidates (name, home = homedir()) {
  const candidates = {
    codex: [
      '/Applications/ChatGPT.app/Contents/Resources/codex',
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      join(home, '.local/bin/codex')
    ],
    claude: [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      join(home, '.local/bin/claude')
    ],
    kimi: [
      join(home, '.kimi-code/bin/kimi'),
      '/opt/homebrew/bin/kimi',
      '/usr/local/bin/kimi'
    ]
  }
  return candidates[name] || []
}



async function resolveCommand (name) {
  if (commandPaths.has(name)) return commandPaths.get(name)

  // Several Claude installations can coexist and drift far apart in version, and
  // an old one renders a different /usage panel. Resolve by newest version across
  // every known location rather than by a fixed candidate order.
  if (name === 'claude') {
    const newest = await resolveNewestClaudeCommand()
    if (newest) {
      commandPaths.set(name, newest)
      return newest
    }
  }

  // Finder-launched apps receive a minimal PATH. Check stable app/Homebrew
  // locations first so usage discovery matches provider connector discovery.
  for (const candidate of knownUsageCommandCandidates(name)) {
    if (await pathExists(candidate)) {
      commandPaths.set(name, candidate)
      return candidate
    }
  }

  // Keep the login-shell fallback for custom installations.
  const { stdout } = await execFileAsync('/bin/zsh', [
    '-lc',
    'command -v -- "$1"',
    'agentbase-resolve',
    name
  ], { timeout: 5000, maxBuffer: 64 * 1024 })
  const resolved = stdout.trim().split('\n').at(-1)
  if (!resolved || !(await pathExists(resolved))) throw new Error(`${name} CLI not found`)
  commandPaths.set(name, resolved)
  return resolved
}

export function resetTextToEpoch (text, now = new Date()) {
  if (!text) return null
  const clean = text.replace(/\s*\([^)]*\)\s*$/, '').replace(/\sat\s/i, ' ').trim()
  // A time-only reset like "7:09pm" (Claude's 5-hour window) means the next
  // occurrence of that local time — today, or tomorrow if it already passed.
  // Allow a leading fragment before the time. The TUI repositions the cursor
  // mid-word, so ANSI stripping can leave the label truncated ("Resets 3:10pm"
  // arrives as "ets 3:10pm"); anchoring at the start dropped the whole reset
  // time and left the 5-hour window with no countdown. A dated reset such as
  // "Aug 6 5am" must NOT take this branch — treating it as a bare time would
  // resolve it to the next 5am (tomorrow) and lose the date entirely.
  const dated = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(clean)
  const timeOnly = !dated && clean.match(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (timeOnly) {
    let hour = Number(timeOnly[1]) % 12
    if (/pm/i.test(timeOnly[3])) hour += 12
    const reset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, Number(timeOnly[2] || 0), 0, 0)
    if (reset.getTime() <= now.getTime()) reset.setDate(reset.getDate() + 1)
    return Math.floor(reset.getTime() / 1000)
  }
  const compactTime = clean.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2})(?::(\d{2}))?(am|pm)$/i)
  const normalized = compactTime
    ? `${compactTime[1]} ${compactTime[2]} ${now.getFullYear()} ${compactTime[3]}:${compactTime[4] || '00'} ${compactTime[5].toUpperCase()}`
    : clean
  const withYear = /\b\d{4}\b/.test(normalized) ? normalized : `${normalized} ${now.getFullYear()}`
  const value = Date.parse(withYear)
  return Number.isFinite(value) ? Math.floor(value / 1000) : null
}

// Claude's managed-turn error is more authoritative than its interactive
// `/usage` panel while a limit is active: current builds can omit the session
// row from that panel at exactly 100%, even though the rejected turn includes
// the limit type and reset time. Normalize that provider signal into the same
// window shape used by the Overview.
export function parseClaudeLimitError (value, observedAt = Date.now()) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  const match = text.match(/(?:you(?:'|’)ve\s+)?hit your\s+(.{0,40}?limit)\s*[·-]?\s*resets?\s+(.+)$/i)
  if (!match) return null
  const kind = match[1].toLowerCase()
  const resetText = match[2].trim()
  const weekly = /week/.test(kind)
  const session = /session|5\s*-?\s*hour|rate/.test(kind)
  if (!weekly && !session) return null
  return {
    id: weekly ? 'seven-day' : 'five-hour',
    label: weekly ? 'All models' : 'Current session',
    period: weekly ? 'week' : 'short',
    durationMins: weekly ? 7 * 24 * 60 : 300,
    usedPercent: 100,
    resetAt: resetTextToEpoch(resetText, new Date(observedAt)),
    resetText
  }
}

export function parseClaudeUsage (stdout) {
  const envelope = JSON.parse(stdout)
  const text = typeof envelope.result === 'string' ? envelope.result : ''
  const windows = []

  const session = text.match(/^Current session:\s*([\d.]+)% used\s*·\s*resets\s+(.+)$/m)
  if (session) {
    windows.push({
      id: 'five-hour',
      label: 'All models',
      period: 'short',
      durationMins: 300,
      usedPercent: clampPercent(session[1]),
      resetAt: resetTextToEpoch(session[2]),
      resetText: session[2].trim()
    })
  }

  const weekly = /^Current week \(([^)]+)\):\s*([\d.]+)% used\s*·\s*resets\s+(.+)$/gm
  for (const match of text.matchAll(weekly)) {
    const rawLabel = match[1].trim()
    windows.push({
      id: rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: /^all models$/i.test(rawLabel) ? 'All models' : rawLabel,
      period: 'week',
      durationMins: 7 * 24 * 60,
      usedPercent: clampPercent(match[2]),
      resetAt: resetTextToEpoch(match[3]),
      resetText: match[3].trim()
    })
  }

  if (windows.length === 0) {
    // Current Claude Code builds no longer run `/usage` in -p/--print mode: the
    // argument is treated as a prompt and comes back as "Unknown skill: usage".
    // Report that precisely so the UI can say quota is interactive-only instead
    // of showing a vague failure. (Proper fix: scrape the interactive /usage TUI
    // over a PTY, like the login flow.)
    if (/unknown skill:\s*usage/i.test(text)) {
      throw new Error('Claude Code no longer exposes /usage non-interactively; quota is available only in an interactive session.')
    }
    throw new Error('Claude usage output did not contain quota windows')
  }
  return { plan: 'subscription', windows }
}

export function parseClaudeStatusLineUsage (payload, now = Date.now()) {
  const document = typeof payload === 'string' ? JSON.parse(payload) : payload
  if (!document || document.provider !== 'claude' || !Array.isArray(document.windows)) {
    throw new Error('Claude usage cache is invalid')
  }
  const observedAt = Number(document.observedAt)
  if (!Number.isFinite(observedAt)) throw new Error('Claude usage cache has no observation time')
  if (now - observedAt > CLAUDE_USAGE_CACHE_MAX_AGE_MS) {
    throw new Error('Claude limits are stale. Send one Claude Code message to update them.')
  }
  const windows = document.windows.map((window) => ({
    id: String(window?.id || ''),
    label: String(window?.label || 'All models'),
    period: window?.period === 'week' ? 'week' : 'short',
    durationMins: Number.isFinite(Number(window?.durationMins)) ? Number(window.durationMins) : null,
    usedPercent: clampPercent(window?.usedPercent),
    resetAt: Number.isFinite(Number(window?.resetAt)) ? Number(window.resetAt) : null,
    resetText: typeof window?.resetText === 'string' ? window.resetText : null
  })).filter((window) => window.id && window.usedPercent !== null)
  if (!windows.length) throw new Error('Claude usage cache contains no quota windows')
  // A window whose reset time has already passed has rolled over since it was
  // recorded, so its stored percentage describes an expired window. Serving it
  // reports a limit the user is no longer subject to — a cached "100% used"
  // 5-hour window kept claiming "rate limited" hours after it had reset.
  // Discard rolled-over windows; an empty result makes the caller fall through
  // to a live source instead of trusting an expired observation. (resetAt is in
  // seconds; observedAt and now are milliseconds.)
  const live = windows.filter((window) => window.resetAt === null || window.resetAt * 1000 > now)
  if (!live.length) throw new Error('Claude limits in the cache have already reset. Refresh usage to read the current windows.')
  return {
    plan: document.plan || 'subscription',
    observedAt,
    source: 'claude-status-line',
    windows: live
  }
}

export function claudeUsageCachePath (home = homedir()) {
  return join(home, '.ambientic', 'claude-usage.json')
}

async function readClaudeUsageCache () {
  return parseClaudeStatusLineUsage(await readFile(claudeUsageCachePath(), 'utf8'))
}

// Persist a freshly scraped observation in the same document the status-line
// bridge writes. Current Claude builds no longer supply rate_limits to the
// status line, so without this the cache is never written and every passive
// refresh falls back to "waiting for an observation" — the long-standing reason
// Claude usage did not display. Written atomically; failures are non-fatal.
async function writeClaudeUsageCache (plan, windows) {
  const file = claudeUsageCachePath()
  const document = {
    version: 1,
    provider: 'claude',
    observedAt: Date.now(),
    plan: plan || 'subscription',
    windows
  }
  const temporary = `${file}.${process.pid}.tmp`
  try {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(temporary, JSON.stringify(document), 'utf8')
    await rename(temporary, file)
  } catch (error) {
    console.error(`[usage] could not persist claude limits: ${safeError(error)}`)
    await rm(temporary, { force: true }).catch(() => {})
  }
}

async function collectClaude (force = false) {
  // Prefer the structured, privacy-preserving status-line observation whenever
  // Claude supplies rate_limits. It contains only normalized percentages and
  // reset timestamps and is more stable than interpreting a terminal screen.
  // An explicit Refresh must reach a live source, though: returning the cached
  // document here made the refresh button a no-op whenever a cache file existed.
  if (!force) {
    try {
      return await readClaudeUsageCache()
    } catch {}
  }

  // Periodic refreshes read Claude's limits too, not just explicit ones. Current
  // Claude builds send no rate_limits to the status line, so opening the /usage
  // panel is the only way to obtain them — gating it behind a manual Refresh is
  // what made these gauges appear permanently empty.
  //
  // What keeps this acceptable as default behaviour, all verified on 2.1.220:
  // the scrape runs from providerRuntimeDirectory() (private, 0700) so macOS
  // never attributes a protected-folder scan to Ambientic; it sends no prompt, so
  // it consumes no quota; it leaves no transcript in ~/.claude/projects and no
  // stray processes; and its own cache (8 minutes on success, 4 on failure, with
  // concurrent callers sharing one in-flight run) bounds the 2-minute refresh
  // cycle to roughly one short-lived launch per 8 minutes.

  // Scrape Claude's interactive /usage panel for the 5-hour and weekly windows.
  // This is the only remaining live source, since the status-line payload no
  // longer carries rate_limits. Its result is persisted below so subsequent
  // passive refreshes can serve real numbers without launching anything.
  try {
    const command = await resolveCommand('claude')
    // Which binary was chosen decides whether the /usage scrape can work at all
    // (an old Homebrew CLI renders a different panel), so record it.
    console.log(`[usage] claude collector using ${command} (force=${force})`)
    const account = await claudeAccountStatus(undefined, command)
    if (!account.connected) {
      const reason = new Error('Claude Code is signed out. Connect its Pro or Max account to sync plan limits.')
      reason.code = 'CLAUDE_LOGIN_REQUIRED'
      throw reason
    }
    const scraped = await collectClaudeUsageWindows(command, { force })
    const windows = scraped.windows.map((window) => ({
      id: String(window.id || ''),
      label: String(window.label || 'All models'),
      period: window.period === 'week' ? 'week' : 'short',
      durationMins: Number.isFinite(Number(window.durationMins)) ? Number(window.durationMins) : null,
      usedPercent: clampPercent(window.usedPercent),
      resetAt: resetTextToEpoch(window.resetText),
      resetText: window.resetText || null
    })).filter((window) => window.usedPercent !== null)
    if (windows.length) {
      console.log(`[usage] claude scrape ok: ${windows.map((w) => `${w.id}=${w.usedPercent}%`).join(' ')}`)
      // Hand the observation to the on-disk cache so passive refreshes — and the
      // next app launch — keep showing these numbers until the windows reset,
      // without ever launching Claude in the background.
      await writeClaudeUsageCache(scraped.plan, windows)
      return { plan: scraped.plan || 'subscription', source: 'claude-usage-scrape', windows }
    }
    throw new Error('Claude /usage produced no usable windows')
  } catch (error) {
    // Fallback: Claude's interactive /usage was unavailable (not logged in, TUI
    // changed, timed out). Show real recorded activity from Claude's stats cache
    // (messages/sessions this week) so the app still shows honest Claude usage.
    // This branch is why the panel can silently show something other than live
    // limits, so always record the reason.
    console.error(`[usage] claude limits unavailable (${error?.code || 'no-code'}): ${safeError(error)}`)
    const activity = await collectClaudeActivity()
    const quotaError = error?.code === 'CLAUDE_SUBSCRIPTION_REQUIRED'
      ? 'Claude Code did not expose subscription limits. Reconnect its Pro or Max account, then refresh.'
      : error?.code === 'CLAUDE_LOGIN_REQUIRED'
          ? error.message
          : `Claude rate limits unavailable: ${safeError(error)}`
    if (!activity.available) throw new Error(quotaError)
    return {
      plan: error?.code === 'CLAUDE_SUBSCRIPTION_REQUIRED' ? 'API billing' : 'Claude',
      windows: [],
      activity,
      quotaError,
      quotaStatus: error?.code || 'CLAUDE_USAGE_UNAVAILABLE',
      source: 'claude-stats-cache'
    }
  }
}

function readCodexWindow (bucketId, bucket, slot, value) {
  if (!value || typeof value !== 'object') return null
  const duration = Number(value.windowDurationMins)
  const period = Number.isFinite(duration) && duration <= 600 ? 'short' : 'week'
  const label = bucketId === 'codex' ? 'All models' : (bucket.limitName || bucketId)
  return {
    id: `${bucketId}-${slot}`,
    label,
    period,
    durationMins: Number.isFinite(duration) ? duration : null,
    usedPercent: clampPercent(value.usedPercent),
    resetAt: Number.isFinite(Number(value.resetsAt)) ? Number(value.resetsAt) : null,
    resetText: null
  }
}

export function parseCodexRateLimits (result) {
  const source = result?.rateLimitsByLimitId || (result?.rateLimits ? { codex: result.rateLimits } : {})
  const windows = []
  let plan = null
  let credits = null
  const resetSource = result?.rateLimitResetCredits
  const resetCredits = {
    availableCount: Number.isFinite(Number(resetSource?.availableCount))
      ? Math.max(0, Math.trunc(Number(resetSource.availableCount)))
      : null,
    credits: Array.isArray(resetSource?.credits)
      ? resetSource.credits.map((credit) => ({
          id: String(credit?.id || ''),
          resetType: String(credit?.resetType || ''),
          status: String(credit?.status || ''),
          title: String(credit?.title || ''),
          description: String(credit?.description || ''),
          grantedAt: Number.isFinite(Number(credit?.grantedAt)) ? Number(credit.grantedAt) : null,
          expiresAt: Number.isFinite(Number(credit?.expiresAt)) ? Number(credit.expiresAt) : null
        }))
      : []
  }

  for (const [bucketId, bucket] of Object.entries(source)) {
    if (!bucket || typeof bucket !== 'object') continue
    if (bucketId === 'codex') {
      plan = bucket.planType || null
      credits = bucket.credits || null
    }
    for (const slot of ['primary', 'secondary']) {
      const parsed = readCodexWindow(bucketId, bucket, slot, bucket[slot])
      if (parsed) windows.push(parsed)
    }
  }

  if (windows.length === 0) throw new Error('Codex returned no rate-limit windows')
  return {
    plan,
    credits,
    resetCredits,
    limitReachedType: result?.rateLimitReachedType || null,
    spendControlReached: Boolean(result?.spendControlReached),
    windows
  }
}

async function requestCodexRateLimits (command) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let buffer = ''
    let settled = false

    const timer = setTimeout(() => finish(new Error('Codex rate-limit request timed out')), COMMAND_TIMEOUT_MS)

    function finish (error, value) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      if (error) reject(error)
      else resolve(value)
    }

    function send (message) {
      child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (!settled) finish(new Error(`Codex app server exited before replying (${code ?? 'unknown'})`))
    })
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      if (buffer.length > 2 * 1024 * 1024) {
        finish(new Error('Codex app server response was too large'))
        return
      }
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line.trim()) continue
        let message
        try { message = JSON.parse(line) } catch { continue }
        if (message.id === 1) {
          if (message.error) { finish(new Error(message.error.message || 'Codex initialization failed')); return }
          send({ jsonrpc: '2.0', method: 'initialized', params: {} })
          send({ jsonrpc: '2.0', id: 2, method: 'account/rateLimits/read', params: {} })
        } else if (message.id === 2) {
          if (message.error) finish(new Error(message.error.message || 'Codex rate-limit request failed'))
          else finish(null, message.result)
          return
        }
      }
    })

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'ambientic', version: CONTROLLER_VERSION },
        capabilities: {}
      }
    })
  })
}

async function collectCodex () {
  const command = await resolveCommand('codex')
  return parseCodexRateLimits(await requestCodexRateLimits(command))
}

function kimiCredentialPath () {
  const root = process.env.KIMI_CODE_HOME || join(homedir(), '.kimi-code')
  return join(root, 'credentials', 'kimi-code.json')
}

async function readKimiCredentials () {
  const value = JSON.parse(await readFile(kimiCredentialPath(), 'utf8'))
  if (!value.access_token || !value.refresh_token) throw new Error('Kimi Code is not signed in')
  return value
}

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function acquireKimiRefreshLock () {
  const credentialFile = kimiCredentialPath()
  const root = dirname(dirname(credentialFile))
  const oauthTarget = join(root, 'oauth', 'kimi-code')
  const lockDir = `${oauthTarget}.lock`
  await mkdir(dirname(oauthTarget), { recursive: true })
  await writeFile(oauthTarget, '', { flag: 'a', mode: 0o600 })

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await mkdir(lockDir)
      return async () => { await rm(lockDir, { recursive: true, force: true }) }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      await sleep(100)
    }
  }
  throw new Error('Kimi credential refresh is busy')
}

async function saveKimiCredentials (credentials) {
  const file = kimiCredentialPath()
  const temporary = `${file}.ambientic-${process.pid}.tmp`
  await mkdir(dirname(file), { recursive: true })
  try {
    await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

async function refreshKimiToken (force = false) {
  let credentials = await readKimiCredentials()
  const now = Math.floor(Date.now() / 1000)
  if (!force && Number(credentials.expires_at) > now + 60) return credentials.access_token

  const release = await acquireKimiRefreshLock()
  try {
    credentials = await readKimiCredentials()
    const afterLock = Math.floor(Date.now() / 1000)
    if (!force && Number(credentials.expires_at) > afterLock + 60) return credentials.access_token

    const body = new URLSearchParams({
      client_id: KIMI_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: credentials.refresh_token
    })
    const response = await fetch(KIMI_OAUTH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `ClaudeController/${CONTROLLER_VERSION} (Darwin ${osRelease()})`
      },
      body,
      signal: AbortSignal.timeout(10_000)
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.access_token) throw new Error(`Kimi sign-in refresh failed (${response.status})`)

    const expiresIn = Number(payload.expires_in) || 900
    const next = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token || credentials.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      scope: payload.scope || credentials.scope || 'kimi-code',
      token_type: payload.token_type || credentials.token_type || 'Bearer',
      expires_in: expiresIn
    }
    await saveKimiCredentials(next)
    return next.access_token
  } finally {
    await release()
  }
}

function kimiResetAt (raw) {
  for (const key of ['reset_at', 'resetAt', 'reset_time', 'resetTime']) {
    if (!raw?.[key]) continue
    const value = Date.parse(raw[key])
    if (Number.isFinite(value)) return Math.floor(value / 1000)
  }
  for (const key of ['reset_in', 'resetIn', 'ttl']) {
    const seconds = Number(raw?.[key])
    if (Number.isFinite(seconds) && seconds > 0) return Math.floor(Date.now() / 1000) + seconds
  }
  return null
}

function parseKimiRow (raw, id, label, period) {
  if (!raw || typeof raw !== 'object') return null
  const limit = Number(raw.limit)
  let used = Number(raw.used)
  if (!Number.isFinite(used) && Number.isFinite(Number(raw.remaining)) && Number.isFinite(limit)) {
    used = limit - Number(raw.remaining)
  }
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null
  return {
    id,
    label: raw.name || raw.title || label,
    period,
    usedPercent: clampPercent(used / limit * 100),
    resetAt: kimiResetAt(raw),
    resetText: null
  }
}

export function parseKimiUsage (payload) {
  const windows = []
  const weekly = parseKimiRow(payload?.usage, 'weekly', 'All models', 'week')
  if (weekly) windows.push(weekly)

  for (const [index, item] of (Array.isArray(payload?.limits) ? payload.limits : []).entries()) {
    const detail = item?.detail && typeof item.detail === 'object' ? item.detail : item
    const duration = Number(item?.window?.duration ?? item?.duration ?? detail?.duration)
    const unit = String(item?.window?.timeUnit ?? item?.timeUnit ?? detail?.timeUnit ?? '')
    const minutes = unit.includes('HOUR') ? duration * 60 : unit.includes('DAY') ? duration * 1440 : duration
    const period = Number.isFinite(minutes) && minutes <= 600 ? 'short' : 'week'
    const fallback = Number.isFinite(minutes) && minutes % 60 === 0 ? `${minutes / 60}h limit` : 'Rate limit'
    const row = parseKimiRow(detail, `limit-${index}`, item?.name || item?.title || fallback, period)
    if (row) windows.push(row)
  }

  if (windows.length === 0) throw new Error('Kimi returned no usage windows')
  return { plan: 'Kimi Code', windows }
}

async function fetchKimiUsage (token) {
  return await fetch(KIMI_USAGE_URL, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000)
  })
}

async function collectKimi () {
  let token = await refreshKimiToken(false)
  let response = await fetchKimiUsage(token)
  if (response.status === 401) {
    token = await refreshKimiToken(true)
    response = await fetchKimiUsage(token)
  }
  if (!response.ok) throw new Error(`Kimi usage request failed (${response.status})`)
  return parseKimiUsage(await response.json())
}

export class UsageService extends EventEmitter {
  constructor ({ collectors } = {}) {
    super()
    this.state = initialState()
    this.timer = null
    this.inFlight = null
    this.limitObservations = new Map()
    this.collectors = collectors || { claude: collectClaude, codex: collectCodex, kimi: collectKimi }
  }

  getState () {
    return this.state
  }

  emitState () {
    this.emit('change', this.state)
  }

  start () {
    this.refresh().catch(() => {})
    this.timer = setInterval(() => this.refresh().catch(() => {}), REFRESH_MS)
    if (this.timer.unref) this.timer.unref()
  }

  stop () {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  refresh (force = false) {
    // A verified login must not reuse a pre-login refresh that is still
    // finishing. Queue one genuinely fresh pass behind it.
    if (this.inFlight) return force ? this.inFlight.then(() => this.refresh(true)) : this.inFlight
    this.inFlight = this.doRefresh(force).finally(() => { this.inFlight = null })
    return this.inFlight
  }

  applyProvider (name, provider) {
    const now = Date.now()
    const observed = [...this.limitObservations.values()]
      .filter((item) => item.provider === name && (!item.window.resetAt || item.window.resetAt * 1000 > now))
    for (const [key, item] of this.limitObservations) {
      if (item.window.resetAt && item.window.resetAt * 1000 <= now) this.limitObservations.delete(key)
    }
    if (observed.length) {
      const windows = [...(provider.windows || [])]
      for (const item of observed) {
        const index = windows.findIndex((window) => window.id === item.window.id)
        if (index >= 0) windows[index] = item.window
        else windows.push(item.window)
      }
      provider = { ...provider, windows }
    }
    this.state = {
      ...this.state,
      providers: { ...this.state.providers, [name]: provider }
    }
    this.emitState()
  }

  observeClaudeLimit (value, observedAt = Date.now()) {
    const window = parseClaudeLimitError(value, observedAt)
    if (!window) return false
    this.limitObservations.set(`claude:${window.id}`, { provider: 'claude', observedAt, window })
    const previous = this.state.providers.claude || blankProvider()
    this.state = { ...this.state, updatedAt: observedAt }
    this.applyProvider('claude', {
      ...previous,
      status: 'ok',
      error: null,
      source: 'claude-turn-limit',
      quotaStatus: 'CLAUDE_RATE_LIMITED',
      quotaError: `Claude ${window.period === 'week' ? 'weekly' : 'session'} limit reached · resets ${window.resetText}`
    })
    return true
  }

  async doRefresh (force = false) {
    this.state = { ...this.state, refreshing: true }
    this.emitState()

    const collectors = {
      ...this.collectors,
      claude: () => this.collectors.claude(force)
    }
    // Publish each provider the moment its collector settles, and time each one
    // out. A single slow/hung collector (e.g. a stalled codex app-server) must
    // never freeze the whole panel — fast providers like Claude activity should
    // appear within a second regardless of the others.
    await Promise.all(PROVIDERS.map(async (name) => {
      try {
        const value = await withTimeout(collectors[name](), COLLECTOR_TIMEOUT_MS)
        this.applyProvider(name, { status: 'ok', error: null, ...value })
      } catch (reason) {
        const previous = this.state.providers[name] || blankProvider()
        this.applyProvider(name, {
          ...previous,
          status: previous.windows?.length ? 'stale' : 'error',
          error: safeError(reason)
        })
      }
    }))

    this.state = { ...this.state, refreshing: false, updatedAt: Date.now() }
    this.emitState()
    return this.state
  }
}

export function createUsageService () {
  return new UsageService()
}
