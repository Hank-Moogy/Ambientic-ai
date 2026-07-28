import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { claudeAccountStatus } from './claude-auth-service.mjs'

const AGENTS = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    executableCandidates: ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', join(homedir(), '.local', 'bin', 'claude')],
    config: join(homedir(), '.claude', 'settings.json'),
    setupCommand: 'claude /login',
    launchCommand: 'claude'
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    executableCandidates: ['/Applications/ChatGPT.app/Contents/Resources/codex', '/opt/homebrew/bin/codex', '/usr/local/bin/codex'],
    config: join(homedir(), '.codex', 'hooks.json'),
    setupCommand: 'codex login',
    launchCommand: 'codex'
  },
  {
    id: 'hermes',
    label: 'Hermes',
    command: 'hermes',
    executableCandidates: [join(homedir(), '.local', 'bin', 'hermes'), '/opt/homebrew/bin/hermes', '/usr/local/bin/hermes'],
    config: join(homedir(), '.hermes', 'plugins', 'agentbase', 'plugin.yaml'),
    setupCommand: 'hermes login',
    launchCommand: 'hermes'
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    command: 'kimi',
    executableCandidates: [
      '/opt/homebrew/bin/kimi',
      '/usr/local/bin/kimi',
      join(homedir(), '.local', 'bin', 'kimi'),
      join(homedir(), '.kimi-code', 'bin', 'kimi')
    ],
    config: join(homedir(), '.kimi-code', 'config.toml'),
    setupCommand: 'kimi login',
    launchCommand: 'kimi',
    accountOnly: true
  }
]

function run (file, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr: String(stderr || '') }))
      else resolve(String(stdout || '').trim())
    })
  })
}

async function executablePath (agent) {
  try {
    const path = await run('/bin/zsh', ['-lic', `command -v ${agent.command}`], 4000)
    if (path) return path
  } catch {}
  return agent.executableCandidates.find((path) => existsSync(path)) || ''
}

function hookConfigured (agent) {
  if (!existsSync(agent.config)) return false
  if (agent.id === 'hermes') {
    try {
      const config = readFileSync(join(homedir(), '.hermes', 'config.yaml'), 'utf8')
      return /^\s*-\s*["']?agentbase["']?\s*$/m.test(config)
    } catch { return false }
  }
  try {
    const value = readFileSync(agent.config, 'utf8')
    return value.includes('.ambientic/hook.py') || value.includes('.agentbase/hook.py') || value.includes('.claude-controller/hook.py')
  } catch { return false }
}

async function versionFor (path) {
  if (!path) return ''
  try {
    const value = await run(path, ['--version'], 5000)
    return value.split('\n')[0].slice(0, 80)
  } catch {
    return ''
  }
}

function authStatus (agent, path) {
  if (!path) return Promise.resolve({ authenticated: false, authMessage: 'CLI not installed', accountLabel: '' })
  if (agent.id === 'kimi') {
    return Promise.resolve({
      authenticated: false,
      accountLabel: '',
      authMessage: 'Kimi Code is installed. Login is managed by Kimi in its official terminal flow.'
    })
  }
  if (agent.id === 'claude') {
    return claudeAccountStatus(undefined, path).then((status) => ({
      authenticated: status.connected,
      accountLabel: status.email,
      authMessage: status.connected ? '' : 'Claude Code is signed out. Connect its Pro or Max account.'
    }))
  }
  const args = agent.id === 'codex' ? ['login', 'status'] : ['status']
  return new Promise((resolve) => {
    execFile(path, args, { timeout: 8000, maxBuffer: 512 * 1024 }, (error, stdout, stderr) => {
      const output = `${stdout || ''}\n${stderr || ''}`.trim()
      const authenticated = agent.id === 'hermes'
        ? !error && (/✓\s+logged in/i.test(output) || /✓\s+(?:exists|configured|set)/i.test(output))
        : !error && Boolean(output) && !/invalid|not logged|login required/i.test(output)
      const accountLabel = agent.id === 'codex'
        ? (output.split('\n').find((line) => /logged in using/i.test(line)) || '')
        : agent.id === 'hermes'
            ? (output.split('\n').find((line) => /Provider:\s+/i.test(line)) || '').replace(/^.*Provider:\s*/i, '')
            : ''
      const fallback = agent.id === 'claude' ? 'Run claude /login' : agent.id === 'codex' ? 'Run codex login' : 'Run hermes login or hermes model'
      resolve({
        authenticated,
        accountLabel: authenticated ? accountLabel.slice(0, 100) : '',
        authMessage: authenticated ? '' : (output.split('\n').find((line) => /invalid|not logged|login required/i.test(line)) || fallback).slice(0, 160)
      })
    })
  })
}

export async function connectorState () {
  return Promise.all(AGENTS.map(async (agent) => {
    const path = await executablePath(agent)
    const configured = hookConfigured(agent)
    const auth = await authStatus(agent, path)
    return {
      id: agent.id,
      label: agent.label,
      installed: Boolean(path),
      configured,
      ready: Boolean(path && configured),
      manageable: Boolean(path && auth.authenticated),
      taskCapable: !agent.accountOnly,
      ...auth,
      path,
      version: await versionFor(path)
    }
  }))
}

function appleScriptString (value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function openAgentCommand (agentId, field) {
  const agent = AGENTS.find((candidate) => candidate.id === agentId)
  if (!agent) return false
  const script = `tell application "Terminal"\nactivate\ndo script "${appleScriptString(agent[field])}"\nend tell`
  await run('/usr/bin/osascript', ['-e', script], 8000)
  return true
}

export function openAgentSetup (agentId) { return openAgentCommand(agentId, 'setupCommand') }
export function openAgentTerminal (agentId) { return openAgentCommand(agentId, 'launchCommand') }

export function providerConnectionCommand (agentId) {
  return AGENTS.find((agent) => agent.id === agentId)?.setupCommand || ''
}

export function providerExecutableCandidates (agentId) {
  return [...(AGENTS.find((agent) => agent.id === agentId)?.executableCandidates || [])]
}

export const CONNECTOR_IDS = AGENTS.map((agent) => agent.id)
