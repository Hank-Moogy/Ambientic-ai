import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { discoverCodexDesktopSessions } from './codex-desktop.mjs'

const SCAN_INTERVAL_MS = 5000

const GHOSTTY_TITLES_SCRIPT = `
tell application "Ghostty"
  set rows to ""
  repeat with w in windows
    repeat with t in terminals of w
      set rows to rows & (tty of t as text) & (ASCII character 31) & (name of t as text) & (ASCII character 31) & (working directory of t as text) & (ASCII character 30)
    end repeat
  end repeat
  return rows
end tell
`

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
    if (c.includes('/ghostty.app/')) return { term_program: 'ghostty', term_app: 'ghostty', term_pid: p.pid }
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

function cleanGhosttyTitle (title, project) {
  const clean = String(title || '')
    .replace(/^[\u2800-\u28ff✳*•·]+\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
  const plain = clean.replace(/[.…]+$/u, '').trim().toLowerCase()
  const projectName = String(project || '').trim().toLowerCase()

  if (!plain || plain.length < 3) return ''
  if (plain === projectName || projectName.startsWith(`${plain}.`)) return ''
  if (/^(claude|claude code|codex|kimi|kimi code|kimi-code|hermes|hermes agent|terminal|shell)$/i.test(plain)) return ''
  return clean.slice(0, 240)
}

export function parseGhosttyTitles (text) {
  const result = new Map()
  for (const row of String(text || '').split(String.fromCharCode(30))) {
    const [rawTty, title = '', cwd = ''] = row.split(String.fromCharCode(31))
    const tty = String(rawTty || '').trim().replace(/^\/dev\//, '')
    if (tty) result.set(tty, { title: title.trim(), cwd: cwd.trim() })
  }
  return result
}

async function ghosttyTerminalTitles () {
  try {
    return parseGhosttyTitles(await run('/usr/bin/osascript', ['-e', GHOSTTY_TITLES_SCRIPT]))
  } catch {
    // `null` means Ghostty could not be queried. Keep process-discovered pads
    // in that case; an empty Map is different and authoritatively means the
    // app has no terminal panes.
    return null
  }
}

export async function discoverAgentTerminals ({ includeTitles = false } = {}) {
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

  const [cwds, ghosttyTerminals] = await Promise.all([
    cwdForProcesses(agents),
    ghosttyTerminalTitles()
  ])
  return agents.map((p) => {
    // The agent can temporarily chdir into a skill/plugin folder while tools
    // run. Ghostty's terminal cwd is the stable user-facing project identity.
    const terminal = terminalFor(p, byPid)
    const ghosttyTerminal = ghosttyTerminals?.get(p.tty)

    // A closed Ghostty pane can leave its agent process orphaned for a while.
    // Ghostty's native terminal list is the source of truth for whether the
    // clickable surface still exists. Only fall back to process discovery when
    // the AppleScript query itself failed (`ghosttyTerminals === null`).
    if (terminal.term_program === 'ghostty' && ghosttyTerminals && !ghosttyTerminal) return null

    const cwd = ghosttyTerminal?.cwd || cwds.get(p.pid) || ''
    const project = basename(cwd) || p.tty || 'terminal'
    const title = includeTitles ? ghosttyTerminal?.title || '' : ''
    return {
      id: `discovered:${p.tty || p.pid}`,
      agent: agentForCommand(p.command),
      agent_pid: p.pid,
      project,
      cwd,
      tty: p.tty,
      seedTaskText: cleanGhosttyTitle(title, project),
      ...terminal
    }
  }).filter(Boolean)
}

export function startDiscovery (store, { intervalMs = SCAN_INTERVAL_MS, onTaskText } = {}) {
  let stopped = false
  let scanning = false
  let seededTitles = false

  const scan = async () => {
    if (stopped || scanning) return
    scanning = true
    try {
      const [terminals, codexDesktop] = await Promise.all([
        discoverAgentTerminals({ includeTitles: !seededTitles }),
        discoverCodexDesktopSessions().catch((error) => {
          console.error('[agentbase] Codex desktop discovery failed:', error.message)
          return []
        })
      ])
      store.syncDiscovered(terminals)
      store.syncExternal('codex-desktop', codexDesktop)
      if (!seededTitles && onTaskText) {
        for (const terminal of terminals) {
          if (!terminal.seedTaskText) continue
          const sessionId = store.sessionIdForTty(terminal.tty)
          if (sessionId) onTaskText(sessionId, terminal.seedTaskText)
        }
      }
      seededTitles = true
    } catch (err) {
      console.error('[agentbase] terminal discovery failed:', err.message)
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
