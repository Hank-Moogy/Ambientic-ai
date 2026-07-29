import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { discoverCodexDesktopSessions } from './codex-desktop.mjs'

const SCAN_INTERVAL_MS = 5000

function run (file, args, timeout = 4000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(String(stdout || ''))
    })
  })
}

export function parsePs (text) {
  const rows = []
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s+(.*)$/)
    if (!m) continue
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      tpgid: Number(m[4]),
      tty: m[5] === '??' ? '' : m[5],
      state: m[6],
      command: m[7]
    })
  }
  return rows
}

export function agentForCommand (command) {
  const c = String(command || '')
  const lower = c.toLowerCase()

  if (!lower.includes('--chrome-native-host') &&
      (/(^|\s)(?:\S*\/)?claude(?:\s|$)/i.test(c) || lower.includes('/.local/share/claude/versions/'))) {
    return 'claude'
  }

  if (!lower.includes('codex-code-mode-host') &&
      !lower.includes('app-server') &&
      !lower.includes('codex computer use.app') &&
      !lower.includes('skycomputeruseclient') &&
      /(^|\s)(?:\S*\/)?codex(?:\s|$)/i.test(c)) {
    return 'codex'
  }

  if (/(^|\s)(?:\S*\/)?kimi(?:-code|-cli)?(?:\s|$)/i.test(c)) return 'kimi'
  if (/(^|\s)(?:\S*\/)?hermes(?:\s|$)/i.test(c) && !lower.includes('hermes gateway')) return 'hermes'
  return ''
}

function terminalFor (process, byPid) {
  let p = process
  const seen = new Set()
  while (p && !seen.has(p.pid)) {
    seen.add(p.pid)
    const c = p.command.toLowerCase()
    if (c.includes('/iterm.app/') || c.includes('/iterm2.app/')) return { term_program: 'iterm2', term_app: 'iterm2', term_pid: p.pid }
    if (c.includes('/terminal.app/')) return { term_program: 'apple_terminal', term_app: 'apple_terminal', term_pid: p.pid }
    if (c.includes('/wezterm.app/')) return { term_program: 'wezterm', term_app: 'wezterm', term_pid: p.pid }
    if (c.includes('/warp.app/')) return { term_program: 'warp', term_app: 'warp', term_pid: p.pid }
    if (c.includes('/kitty.app/')) return { term_program: 'kitty', term_app: 'kitty', term_pid: p.pid }
    if (c.includes('/alacritty.app/')) return { term_program: 'alacritty', term_app: 'alacritty', term_pid: p.pid }
    if (c.includes('/hyper.app/')) return { term_program: 'hyper', term_app: 'hyper', term_pid: p.pid }
    if (c.includes('/tabby.app/')) return { term_program: 'tabby', term_app: 'tabby', term_pid: p.pid }
    if (c.includes('/visual studio code.app/')) return { term_program: 'vscode', term_app: 'vscode', term_pid: p.pid }
    p = byPid.get(p.ppid)
  }
  return { term_program: '', term_app: '', term_pid: null }
}

function parseLsofCwds (text) {
  const result = new Map()
  let pid = null
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (pid && line.startsWith('n')) result.set(pid, line.slice(1))
  }
  return result
}

async function cwdForProcesses (processes) {
  if (!processes.length) return new Map()
  try {
    const pids = processes.map((p) => p.pid).join(',')
    return parseLsofCwds(await run('/usr/sbin/lsof', ['-a', '-p', pids, '-d', 'cwd', '-Fn']))
  } catch {
    return new Map()
  }
}

export async function discoverAgentTerminals () {
  const rows = parsePs(await run('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,tpgid=,tty=,state=,command=']))
  const byPid = new Map(rows.map((p) => [p.pid, p]))

  // The process-group leader is the interactive CLI owning the terminal. Do
  // not require it to be the current foreground group: while an agent waits on
  // a long-running child command, the child temporarily owns tpgid but the
  // agent and its pad are still alive. Headless probes have no tty and remain
  // excluded.
  const agents = rows.filter((p) =>
    p.tty &&
    p.pid === p.pgid &&
    !p.state.includes('T') &&
    agentForCommand(p.command)
  )

  const cwds = await cwdForProcesses(agents)
  return agents.map((p) => {
    const terminal = terminalFor(p, byPid)
    // Use targeted process metadata only. Background terminal-window
    // automation caused macOS permission prompts while Ambientic was idle.
    const cwd = cwds.get(p.pid) || ''
    const project = basename(cwd) || p.tty || 'terminal'
    return {
      id: `discovered:${p.tty || p.pid}`,
      agent: agentForCommand(p.command),
      agent_pid: p.pid,
      project,
      cwd,
      tty: p.tty,
      ...terminal
    }
  }).filter(Boolean)
}

export function startDiscovery (store, { intervalMs = SCAN_INTERVAL_MS } = {}) {
  let stopped = false
  let scanning = false

  const scan = async () => {
    if (stopped || scanning) return
    scanning = true
    try {
      const [terminals, codexDesktop] = await Promise.all([
        discoverAgentTerminals(),
        discoverCodexDesktopSessions().catch((error) => {
          console.error('[ambientic] Codex desktop discovery failed:', error.message)
          return []
        })
      ])
      store.syncDiscovered(terminals)
      store.syncExternal('codex-desktop', codexDesktop)
    } catch (err) {
      console.error('[ambientic] terminal discovery failed:', err.message)
    } finally {
      scanning = false
    }
  }

  void scan()
  const timer = setInterval(scan, intervalMs)
  if (timer.unref) timer.unref()
  return {
    refresh: scan,
    stop: () => { stopped = true; clearInterval(timer) }
  }
}
