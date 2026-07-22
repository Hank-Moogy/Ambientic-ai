import { EventEmitter } from 'node:events'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, release as osRelease } from 'node:os'
import { dirname, join } from 'node:path'

const execFileAsync = promisify(execFile)
const REFRESH_MS = 2 * 60 * 1000
const COMMAND_TIMEOUT_MS = 20_000
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

async function resolveCommand (name) {
  if (commandPaths.has(name)) return commandPaths.get(name)

  const known = {
    claude: [join(homedir(), '.local/bin/claude')],
    kimi: [join(homedir(), '.kimi-code/bin/kimi')]
  }
  for (const candidate of known[name] || []) {
    if (await pathExists(candidate)) {
      commandPaths.set(name, candidate)
      return candidate
    }
  }

  // Finder-launched apps receive a minimal PATH. Resolve through the user's
  // login shell so NVM/Homebrew-installed CLIs remain discoverable.
  const { stdout } = await execFileAsync('/bin/zsh', [
    '-lc',
    'command -v -- "$1"',
    'claude-controller-resolve',
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
      usedPercent: clampPercent(match[2]),
      resetAt: resetTextToEpoch(match[3]),
      resetText: match[3].trim()
    })
  }

  if (windows.length === 0) throw new Error('Claude usage output did not contain quota windows')
  return { plan: 'subscription', windows }
}

async function collectClaude () {
  const command = await resolveCommand('claude')
  const { stdout } = await execFileAsync(command, [
    '--safe-mode',
    '--no-session-persistence',
    '-p',
    '/usage',
    '--output-format',
    'json'
  ], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 })
  return parseClaudeUsage(stdout)
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
  return { plan, credits, windows }
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
        clientInfo: { name: 'claude-controller', version: CONTROLLER_VERSION },
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
  const temporary = `${file}.claude-controller-${process.pid}.tmp`
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

  async doRefresh () {
    this.state = { ...this.state, refreshing: true }
    this.emitState()

    const collectors = { claude: collectClaude, codex: collectCodex, kimi: collectKimi }
    const results = await Promise.allSettled(PROVIDERS.map((name) => collectors[name]()))
    const providers = { ...this.state.providers }

    PROVIDERS.forEach((name, index) => {
      const result = results[index]
      if (result.status === 'fulfilled') {
        providers[name] = { status: 'ok', error: null, ...result.value }
      } else {
        const previous = providers[name]
        providers[name] = {
          ...previous,
          status: previous.windows.length ? 'stale' : 'error',
          error: safeError(result.reason)
        }
      }
    })

    this.state = {
      refreshing: false,
      updatedAt: Date.now(),
      providers
    }
    this.emitState()
    return this.state
  }
}

export function createUsageService () {
  return new UsageService()
}
