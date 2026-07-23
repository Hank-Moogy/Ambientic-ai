import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const AGENTS = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    config: join(homedir(), '.claude', 'settings.json'),
    setupCommand: 'claude',
    launchCommand: 'claude'
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    config: join(homedir(), '.codex', 'hooks.json'),
    setupCommand: 'codex',
    launchCommand: 'codex'
  },
  {
    id: 'hermes',
    label: 'Hermes',
    command: 'hermes',
    config: join(homedir(), '.hermes', 'plugins', 'agentbase', 'plugin.yaml'),
    setupCommand: 'hermes setup',
    launchCommand: 'hermes'
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

async function executablePath (command) {
  try {
    return await run('/bin/zsh', ['-lic', `command -v ${command}`], 4000)
  } catch {
    return ''
  }
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
    return value.includes('.agentbase/hook.py') || value.includes('.claude-controller/hook.py')
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
  if (!path || agent.id !== 'claude') return Promise.resolve({ authenticated: true, authMessage: '' })
  return new Promise((resolve) => {
    execFile(path, ['auth', 'status'], { timeout: 8000, maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
      const output = `${stdout || ''}\n${stderr || ''}`.trim()
      const authenticated = !error && !/invalid|not logged|login required/i.test(output)
      resolve({ authenticated, authMessage: authenticated ? '' : (output.split('\n').find((line) => /invalid|login/i.test(line)) || 'Run claude /login').slice(0, 160) })
    })
  })
}

export async function connectorState () {
  return Promise.all(AGENTS.map(async (agent) => {
    const path = await executablePath(agent.command)
    const configured = hookConfigured(agent)
    const auth = await authStatus(agent, path)
    return {
      id: agent.id,
      label: agent.label,
      installed: Boolean(path),
      configured,
      ready: Boolean(path && configured),
      manageable: Boolean(path && auth.authenticated),
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

export const CONNECTOR_IDS = AGENTS.map((agent) => agent.id)
