import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ANSI = /\u001B(?:[@-_][0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/g
const MAX_OUTPUT = 12_000

export function validClaudeAuthUrl (value) {
  try {
    const url = new URL(String(value || '').replace(/[),.;]+$/, ''))
    if (url.protocol !== 'https:' || !/(^|\.)((claude\.ai)|(anthropic\.com))$/i.test(url.hostname)) return ''
    if (/oauth|authorize/i.test(url.pathname) && !url.searchParams.has('redirect_uri')) return ''
    return url.toString()
  } catch {
    return ''
  }
}

export function cleanClaudeAuthOutput (value) {
  return String(value || '')
    .replace(ANSI, '')
    .replace(/\r/g, '\n')
    .replace(CONTROL, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .slice(-MAX_OUTPUT)
}

export function claudeAuthPhase (output, current = 'starting') {
  const value = String(output || '')
  if (/invalid|expired|incorrect|could not verify|authentication failed/i.test(value) && /code|oauth|auth/i.test(value)) return 'code-error'
  if (/Paste\s*code\s*here(?:\s*if\s*prompted)?/i.test(value)) return 'code'
  if (/Opening\s*browser\s*to\s*sign\s*in|Browser\s*didn'?t\s*open|https:\/\/(?:[^/\s]+\.)?(?:claude\.ai|anthropic\.com)\/oauth/i.test(value)) return 'browser'
  if (/Select\s*login\s*method|Claude\s*account\s*with\s*subscription/i.test(value)) return 'method'
  return current
}

export function prepareClaudeAuthorizationCode (value) {
  return String(value || '').replace(/[\r\n]/g, '').trim().slice(0, 4096)
}

export function parseClaudeAccountState (value) {
  try {
    const root = typeof value === 'string' ? JSON.parse(value) : value
    const account = root?.oauthAccount
    const connected = Boolean(account?.accountUuid && account?.emailAddress)
    return {
      connected,
      email: connected ? String(account.emailAddress).slice(0, 160) : '',
      detail: connected ? 'Claude subscription account is present in Claude Code.' : ''
    }
  } catch {
    return { connected: false, email: '', detail: '' }
  }
}

export function parseClaudeCliAuthStatus (value) {
  try {
    const state = typeof value === 'string' ? JSON.parse(value) : value
    if (typeof state?.loggedIn !== 'boolean') return null
    return {
      connected: state.loggedIn,
      authMethod: state.loggedIn ? String(state.authMethod || '') : '',
      detail: state.loggedIn
        ? `Claude Code confirmed ${state.authMethod || 'account'} authentication.`
        : 'Claude Code reports that it is signed out.'
    }
  } catch {
    return null
  }
}

function cliAuthStatus (commandPath, env = process.env) {
  return new Promise((resolve) => {
    if (!commandPath) return resolve(null)
    const child = spawn(commandPath, ['auth', 'status', '--json'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    const append = (chunk) => {
      output += chunk.toString()
      if (output.length > 64 * 1024) child.kill('SIGKILL')
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(parseClaudeCliAuthStatus(output.trim()))
    })
  })
}

export async function claudeAccountStatus (configPath = join(homedir(), '.claude.json'), commandPath = '', env = process.env) {
  const live = await cliAuthStatus(commandPath, env)
  let metadata = { connected: false, email: '', detail: '' }
  try {
    metadata = parseClaudeAccountState(await readFile(configPath, 'utf8'))
  } catch {}
  if (!live) return metadata
  return {
    connected: live.connected,
    email: live.connected ? metadata.email : '',
    detail: live.detail
  }
}

export class ClaudeAuthService extends EventEmitter {
  constructor ({ path, helperPath, onUrl, env = process.env }) {
    super()
    this.path = path
    this.helperPath = helperPath
    this.onUrl = onUrl
    this.env = env
    this.child = null
    this.timer = null
    this.verificationTimer = null
    this.openedUrls = new Set()
    this.selectionSent = false
    this.codeSubmitted = false
    this.state = { provider: 'claude', status: 'idle', phase: 'idle', output: '', error: '', updatedAt: Date.now() }
  }

  getState () { return this.state }

  update (patch) {
    this.state = { ...this.state, ...patch, updatedAt: Date.now() }
    this.emit('change', this.state)
    return this.state
  }

  append (chunk) {
    if (!this.child && ['connected', 'failed', 'cancelled'].includes(this.state.status)) return
    const output = cleanClaudeAuthOutput(`${this.state.output}${chunk}`)
    const urls = output.match(/https:\/\/[^\s<>"']+/g) || []
    for (const raw of urls) {
      const url = validClaudeAuthUrl(raw)
      if (!url) continue
      if (this.openedUrls.has(url)) continue
      this.openedUrls.add(url)
      void this.onUrl?.(url)
    }
    const chunkPhase = claudeAuthPhase(chunk, this.state.phase)
    let detectedPhase = claudeAuthPhase(output, this.state.phase)
    // An old failed attempt remains in the bounded debug transcript. Only a
    // newly received failure should move a fresh submission back to the field.
    if (detectedPhase === 'code-error' && chunkPhase !== 'code-error') detectedPhase = 'code'
    if (detectedPhase === 'code-error') this.codeSubmitted = false
    const phase = this.codeSubmitted && detectedPhase === 'code'
      ? 'verifying'
      : detectedPhase === 'code-error'
          ? 'code'
          : detectedPhase
    const waiting = /browser|authenticate|log in|login|sign in|authorize|select|choose|press enter|continue/i.test(output)
    const providerReportedSuccess = /Authentication\s+(?:successful|succeeded)|Successfully\s+(?:logged|signed)\s+in/i.test(chunk)
    this.update({
      output,
      phase: providerReportedSuccess ? 'verifying' : phase,
      status: providerReportedSuccess || ['browser', 'code', 'verifying'].includes(phase) || waiting ? 'waiting' : 'interactive',
      error: detectedPhase === 'code-error' ? 'Claude could not accept that authorization code. Paste a fresh code from the browser and try again.' : this.state.error
    })
    // Provider text is useful progress, never proof. The only success condition
    // is Claude's separate `auth status --json` result after credentials land.
    if (providerReportedSuccess) void this.verify(false)
    if (!this.selectionSent && /Claude account with subscription/i.test(output) && /Console|API/i.test(output)) {
      this.selectionSent = true
      setTimeout(() => {
        if (!this.child) return
        if (this.state.method === 'console') this.input({ action: 'down' })
        this.input({ action: 'enter' })
      }, 120)
    }
  }

  async start ({ method = this.state.method || 'subscription' } = {}) {
    if (this.child) return this.state
    this.openedUrls.clear()
    this.selectionSent = false
    this.codeSubmitted = false
    if (this.verificationTimer) clearTimeout(this.verificationTimer)
    this.verificationTimer = null
    this.update({
      status: 'starting',
      phase: 'starting',
      method,
      output: method === 'console'
        ? 'Starting Claude Code for an Anthropic Console account…\nChoose the Console / API billing option when Claude asks.'
        : 'Starting Claude Code for a Claude Pro or Max subscription…\nChoose the Claude App subscription option when Claude asks.',
      error: '',
      startedAt: Date.now()
    })
    const loginArgs = method === 'console'
      ? ['auth', 'login', '--console']
      : ['auth', 'login', '--claudeai']
    const child = spawn('/usr/bin/python3', [this.helperPath, this.path, ...loginArgs], {
      cwd: this.env.HOME || process.env.HOME,
      env: { ...this.env, TERM: 'xterm-256color', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    child.stdout.on('data', (chunk) => this.append(chunk.toString()))
    child.stderr.on('data', (chunk) => this.append(chunk.toString()))
    child.on('error', (error) => this.finish(false, error.message))
    child.on('exit', () => { void this.verify(true) })
    this.timer = setInterval(() => { void this.verify(false) }, 2000)
    if (this.timer.unref) this.timer.unref()
    return this.state
  }

  input ({ action, text = '' } = {}) {
    if (!this.child?.stdin?.writable) return false
    if (text && this.state.phase === 'code') {
      const code = prepareClaudeAuthorizationCode(text)
      if (!code) return false
      this.codeSubmitted = true
      this.update({
        phase: 'verifying',
        status: 'waiting',
        error: '',
        message: 'Authorization code submitted. Verifying with Claude…'
      })
      // Claude Code owns the PTY and credential exchange. Ambientic forwards the
      // one-time value once and deliberately never appends it to UI state or disk.
      this.child.stdin.write(`${code}\r`)
      setTimeout(() => { void this.verify(false) }, 500)
      if (this.verificationTimer) clearTimeout(this.verificationTimer)
      this.verificationTimer = setTimeout(async () => {
        if (this.state.phase !== 'verifying' || await this.verify(false)) return
        this.codeSubmitted = false
        this.update({
          phase: 'code',
          status: 'waiting',
          error: 'Ambientic could not confirm the code after 30 seconds. Paste a fresh authorization code or retry the connection.'
        })
      }, 30_000)
      if (this.verificationTimer.unref) this.verificationTimer.unref()
      return true
    }
    const values = { up: '\u001b[A', down: '\u001b[B', enter: '\r' }
    this.child.stdin.write(values[action] || `${String(text).slice(0, 500)}\r`)
    return true
  }

  async verify (processExited = false) {
    const result = await claudeAccountStatus(undefined, this.path, this.env)
    if (result.connected) {
      this.finish(true, '', result.email)
      return true
    }
    if (processExited && this.child) this.finish(false, 'Claude login closed before authentication completed. Review the details above and retry.')
    return false
  }

  finish (connected, error = '', email = '') {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.verificationTimer) clearTimeout(this.verificationTimer)
    this.verificationTimer = null
    const child = this.child
    this.child = null
    if (child && !child.killed) child.kill('SIGTERM')
    this.update({
      status: connected ? 'connected' : 'failed',
      phase: connected ? 'connected' : 'failed',
      email: connected ? email || this.state.email || '' : '',
      error: connected ? '' : error,
      output: connected ? `${this.state.output}\n\nClaude Code account connected.` : this.state.output
    })
  }

  cancel () {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.verificationTimer) clearTimeout(this.verificationTimer)
    this.verificationTimer = null
    if (this.child && !this.child.killed) this.child.kill('SIGTERM')
    this.child = null
    return this.update({ status: 'cancelled', phase: 'cancelled', error: 'Connection cancelled.' })
  }

  stop () { if (this.child) this.cancel() }
}
