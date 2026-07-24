import { EventEmitter } from 'node:events'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, release as osRelease } from 'node:os'
import { dirname, join } from 'node:path'
import { collectClaudeActivity } from './claude-activity.mjs'
import { collectClaudeUsageWindows } from './claude-usage-scrape.mjs'

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

function resetTextToEpoch (text) {
  if (!text) return null
  const clean = text.replace(/\s*\([^)]*\)\s*$/, '').replace(/\sat\s/i, ' ').trim()
  // A time-only reset like "7:09pm" (Claude's 5-hour window) means the next
  // occurrence of that local time — today, or tomorrow if it already passed.
  const timeOnly = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (timeOnly) {
    const now = new Date()
    let hour = Number(timeOnly[1]) % 12
    if (/pm/i.test(timeOnly[3])) hour += 12
    const reset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, Number(timeOnly[2] || 0), 0, 0)
    if (reset.getTime() <= now.getTime()) reset.setDate(reset.getDate() + 1)
    return Math.floor(reset.getTime() / 1000)
  }
  const compactTime = clean.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2})(?::(\d{2}))?(am|pm)$/i)
  const normalized = compactTime
    ? `${compactTime[1]} ${compactTime[2]} ${new Date().getFullYear()} ${compactTime[3]}:${compactTime[4] || '00'} ${compactTime[5].toUpperCase()}`
    : clean
  const withYear = /\b\d{4}\b/.test(normalized) ? normalized : `${normalized} ${new Date().getFullYear()}`
  const value = Date.parse(withYear)
  return Number.isFinite(value) ? Math.floor(value / 1000) : null
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
  if (now - observedAt > 24 * 60 * 60 * 1000) {
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
  return {
    plan: document.plan || 'subscription',
    observedAt,
    source: 'claude-status-line',
    windows
  }
}

async function collectClaude () {
  // Primary: scrape Claude's interactive /usage panel for the real 5-hour and
  // weekly limit windows — the only local source of Claude's "% used", so the
  // app can show the same gauge Codex gets. Cached, so this is cheap most calls.
  try {
    const command = await resolveCommand('claude')
    const scraped = await collectClaudeUsageWindows(command)
    const windows = scraped.windows.map((window) => ({
      id: String(window.id || ''),
      label: String(window.label || 'All models'),
      period: window.period === 'week' ? 'week' : 'short',
      durationMins: Number.isFinite(Number(window.durationMins)) ? Number(window.durationMins) : null,
      usedPercent: clampPercent(window.usedPercent),
      resetAt: resetTextToEpoch(window.resetText),
      resetText: window.resetText || null
    })).filter((window) => window.usedPercent !== null)
    if (windows.length) return { plan: scraped.plan || 'subscription', source: 'claude-usage-scrape', windows }
    throw new Error('Claude /usage produced no usable windows')
  } catch {
    // Fallback: Claude's interactive /usage was unavailable (not logged in, TUI
    // changed, timed out). Show real recorded activity from Claude's stats cache
    // (messages/sessions this week) so the app still shows honest Claude usage.
    const activity = await collectClaudeActivity()
    if (!activity.available) throw new Error('Claude usage is unavailable until you use Claude Code at least once.')
    return { plan: 'subscription', windows: [], activity, source: 'claude-stats-cache' }
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
  constructor () {
    super()
    this.state = initialState()
    this.timer = null
    this.inFlight = null
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

  refresh () {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.doRefresh().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  applyProvider (name, provider) {
    this.state = {
      ...this.state,
      providers: { ...this.state.providers, [name]: provider }
    }
    this.emitState()
  }

  async doRefresh () {
    this.state = { ...this.state, refreshing: true }
    this.emitState()

    const collectors = { claude: collectClaude, codex: collectCodex, kimi: collectKimi }
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
