import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, join, normalize, sep } from 'node:path'
import { mkdir, stat } from 'node:fs/promises'
import { loadPrefs, savePrefs } from './prefs.js'
import { terminalContexts } from './terminal-context.js'
import { localPreviewCandidates, localUrl } from './preview-candidates.mjs'

const SCAN_INTERVAL_MS = 10_000
const ADAPTER_PATH = `${homedir()}/Library/Android/sdk/platform-tools/adb`
const SIMULATOR_PATH = '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app'
const CHROME_BINARY = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function run (file, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr: String(stderr || '') }))
      else resolve(String(stdout || ''))
    })
  })
}

function safeJson (text, fallback) {
  try { return JSON.parse(text) } catch { return fallback }
}

function cleanPath (value) {
  const path = normalize(String(value || '').trim())
  return path === '.' ? '' : path.replace(new RegExp(`${sep}+$`), '')
}

export function pathAffinity (left, right) {
  const a = cleanPath(left)
  const b = cleanPath(right)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`)) return 88
  if (basename(a).toLowerCase() === basename(b).toLowerCase()) return 55
  return 0
}

function sessionProjectKey (session) {
  return cleanPath(session?.terminalCwd || session?.cwd) || `project:${String(session?.project || '').toLowerCase()}`
}

function sessionTerminalKey (session) {
  return session?.tty ? `tty:${session.tty}` : `session:${session?.id || ''}`
}

function parsePs (text) {
  return String(text || '').split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.*)$/)
    return match ? [{ pid: Number(match[1]), command: match[2] }] : []
  })
}

function normalizeDeviceName (value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function candidateSummary (candidate, confidence = 'suggested') {
  return {
    id: candidate.id,
    type: candidate.type,
    label: candidate.label,
    detail: candidate.detail,
    confidence
  }
}

async function scanProcesses () {
  try { return parsePs(await run('/bin/ps', ['-axo', 'pid=,command='])) } catch { return [] }
}

async function scanIosCandidates (processes, launchHints) {
  let payload = { devices: {} }
  try { payload = safeJson(await run('/usr/bin/xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], 6000), payload) } catch {}
  const simulatorPid = processes.find((process) => process.command.includes('/Simulator.app/Contents/MacOS/Simulator'))?.pid || null
  const devices = Object.entries(payload.devices || {}).flatMap(([runtimeIdentifier, runtimeDevices]) => (
    runtimeDevices.map((device) => ({ ...device, runtimeIdentifier }))
  )).filter((device) => device.state === 'Booted' && device.isAvailable !== false)
  return devices.map((device) => {
    const normalizedName = normalizeDeviceName(device.name)
    const hint = launchHints.find((item) => item.platform === 'ios' && normalizeDeviceName(item.device) === normalizedName)
    return {
      id: `ios:${device.udid}`,
      type: 'ios',
      label: device.name,
      detail: 'iOS Simulator',
      udid: device.udid,
      runtime: String(device.runtimeIdentifier || '')
        .replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, '')
        .replace(/^([A-Za-z]+)-/, '$1 ')
        .replace(/-/g, '.'),
      pid: simulatorPid,
      projectCwd: hint?.cwd || ''
    }
  })
}

async function scanAndroidCandidates (processes, launchHints) {
  let devicesText = ''
  try { devicesText = await run(ADAPTER_PATH, ['devices'], 5000) } catch { return [] }
  const serials = String(devicesText).split('\n').flatMap((line) => {
    const match = line.match(/^(emulator-\d+)\s+device\b/)
    return match ? [match[1]] : []
  })

  const avds = await Promise.all(serials.map(async (serial) => {
    try {
      const text = await run(ADAPTER_PATH, ['-s', serial, 'emu', 'avd', 'name'], 2500)
      return { serial, avd: text.split('\n')[0].trim() || serial }
    } catch {
      return { serial, avd: serial }
    }
  }))

  return avds.map(({ serial, avd }) => {
    const process = processes.find((item) => item.command.includes('qemu-system') && item.command.includes(`-avd ${avd}`))
    const normalizedNames = [serial, avd].map(normalizeDeviceName)
    const hint = launchHints.find((item) => item.platform === 'android' && normalizedNames.includes(normalizeDeviceName(item.device)))
    return {
      id: `android:${avd}`,
      type: 'android',
      label: avd.replace(/_/g, ' '),
      detail: `Android Emulator · ${serial}`,
      serial,
      avd,
      pid: process?.pid || null,
      projectCwd: hint?.cwd || ''
    }
  })
}

async function discoverCandidates (sessions, contexts) {
  const processes = await scanProcesses()
  const launchHints = []
  const [ios, android] = await Promise.all([
    scanIosCandidates(processes, launchHints),
    scanAndroidCandidates(processes, launchHints)
  ])
  const browser = localPreviewCandidates(sessions, contexts)
  return [...browser, ...ios, ...android]
}

function appleScriptEscape (value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function displaySlot (display, index, count) {
  const area = display?.workArea
  if (!area) return null
  const gap = 10
  const columns = count <= 2 ? count : Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const column = index % columns
  const row = Math.floor(index / columns)
  const width = Math.floor((area.width - gap * (columns + 1)) / columns)
  const height = Math.floor((area.height - gap * (rows + 1)) / rows)
  return {
    x: Math.round(area.x + gap + column * (width + gap)),
    y: Math.round(area.y + gap + row * (height + gap)),
    width: Math.max(160, width),
    height: Math.max(160, height)
  }
}

function chromeWindowScript (pid, candidate, slot) {
  const url = appleScriptEscape(candidate.url)
  return `
tell application "System Events"
  set matches to every process whose unix id is ${Number(pid)}
  if matches is {} then return "not-found"
  set p to item 1 of matches
  repeat with w in windows of p
    set docText to ""
    try
      set docText to value of attribute "AXDocument" of w as text
    end try
    if docText is "${url}" then
      set position of w to {${slot.x}, ${slot.y}}
      set size of w to {${slot.width}, ${slot.height}}
      set frontmost of p to true
      perform action "AXRaise" of w
      return "browser"
    end if
  end repeat
  return "not-found"
end tell
`
}

function boundsResultScript (body) {
  return `
tell application "System Events"
  ${body}
end tell
return "not-found"
`
}

function windowBoundsLines () {
  return `
set windowPosition to position of targetWindow
set windowSize to size of targetWindow
return (item 1 of windowPosition as text) & "|" & (item 2 of windowPosition as text) & "|" & (item 1 of windowSize as text) & "|" & (item 2 of windowSize as text)`
}

function browserBoundsScript (pid, candidate) {
  const url = appleScriptEscape(candidate.url)
  return boundsResultScript(`
  set matches to every process whose unix id is ${Number(pid)}
  if matches is {} then return "not-found"
  set p to item 1 of matches
  repeat with w in windows of p
    set docText to ""
    try
      set docText to value of attribute "AXDocument" of w as text
    end try
    if docText is "${url}" then
      set targetWindow to w
      ${windowBoundsLines()}
    end if
  end repeat`)
}

function processBoundsScript (pid) {
  return boundsResultScript(`
  set matches to every process whose unix id is ${Number(pid)}
  if matches is {} then return "not-found"
  set p to item 1 of matches
  set targetWindow to missing value
  set largestArea to 0
  repeat with w in windows of p
    try
      set windowSize to size of w
      set windowArea to (item 1 of windowSize) * (item 2 of windowSize)
      if windowArea > largestArea then
        set largestArea to windowArea
        set targetWindow to w
      end if
    end try
  end repeat
  if targetWindow is missing value then return "not-found"
  ${windowBoundsLines()}`)
}

function simulatorBoundsScript (pid, candidate) {
  const device = appleScriptEscape(candidate.label)
  return boundsResultScript(`
  set matches to every process whose unix id is ${Number(pid)}
  if matches is {} then return "not-found"
  set p to item 1 of matches
  repeat with w in windows of p
    try
      set windowName to name of w as text
      if windowName is "${device}" or windowName starts with "${device} –" then
        set targetWindow to w
        ${windowBoundsLines()}
      end if
    end try
  end repeat`)
}

function parseBounds (value) {
  const [x, y, width, height] = String(value || '').trim().split('|').map(Number)
  if (![x, y, width, height].every(Number.isFinite) || width < 2 || height < 2) return null
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

async function candidateBounds (candidate) {
  let pid = candidate.pid
  let script = ''
  if (candidate.type === 'browser') {
    pid = await defaultChromePid()
    if (pid) script = browserBoundsScript(pid, candidate)
  } else if (candidate.type === 'ios') {
    pid = pid || await currentSimulatorPid()
    if (pid) script = simulatorBoundsScript(pid, candidate)
  } else if (pid) {
    script = processBoundsScript(pid)
  }
  if (!script) return null
  return parseBounds(await run('/usr/bin/osascript', ['-e', script], 5000).catch(() => ''))
}

function safeCaptureName (value) {
  return String(value || 'preview').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'preview'
}

async function captureCandidate (candidate, slot, outputDirectory, index) {
  const presented = await presentCandidate(candidate, slot, { allowLaunch: false })
  if (!presented.ok) return { ...presented, captured: false }
  await new Promise((resolve) => setTimeout(resolve, 180))
  const bounds = await candidateBounds(candidate)
  if (!bounds) return { ...presented, captured: false, reason: 'window-bounds-not-found' }

  await mkdir(outputDirectory, { recursive: true })
  const path = join(outputDirectory, `${Date.now()}-${index + 1}-${safeCaptureName(candidate.label)}.png`)
  try {
    await run('/usr/sbin/screencapture', [
      '-x',
      '-R', `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
      path
    ], 12_000)
    const info = await stat(path)
    if (info.size < 512) return { ...presented, captured: false, reason: 'empty-screenshot' }
    return { ...presented, captured: true, path, label: candidate.label, bounds }
  } catch (error) {
    return { ...presented, captured: false, reason: error.message || 'capture-failed' }
  }
}

async function defaultChromePid () {
  const processes = await scanProcesses()
  return processes.find((process) => process.command === CHROME_BINARY)?.pid || null
}

async function chromeProfilePreview (candidate, slot, { allowLaunch = true } = {}) {
  let pid = await defaultChromePid()
  if (pid) {
    const existing = await run('/usr/bin/osascript', ['-e', chromeWindowScript(pid, candidate, slot)], 5000).catch(() => '')
    if (existing.trim() === 'browser') return { ok: true, via: 'chrome-profile' }
  }

  // Capturing is observational. If the exact linked route is not already
  // open, never create or navigate a Chrome window merely to screenshot it.
  if (!allowLaunch) return { ok: false, via: 'chrome-profile', reason: 'window-not-open' }

  await run(CHROME_BINARY, [
    `--profile-directory=${candidate.chromeProfile || 'Default'}`,
    '--new-window',
    candidate.url
  ], 8000).catch(() => '')
  await new Promise((resolve) => setTimeout(resolve, 900))
  pid = await defaultChromePid()
  if (!pid) return { ok: false, via: 'chrome-profile', reason: 'chrome-not-running' }
  const result = await run('/usr/bin/osascript', ['-e', chromeWindowScript(pid, candidate, slot)], 6000).catch(() => '')
  return { ok: result.trim() === 'browser', via: 'chrome-profile', reason: result.trim() === 'browser' ? '' : 'window-not-found' }
}

function moveProcessScript (pid, slot) {
  return `
tell application "System Events"
  set matches to every process whose unix id is ${Number(pid)}
  if matches is {} then return "not-found"
  set p to item 1 of matches
  set frontmost of p to true
  delay 0.12
  set targetWindow to missing value
  set largestArea to 0
  repeat with w in windows of p
    try
      set windowSize to size of w
      set windowArea to (item 1 of windowSize) * (item 2 of windowSize)
      if windowArea > largestArea then
        set largestArea to windowArea
        set targetWindow to w
      end if
    end try
  end repeat
  if targetWindow is missing value then return "not-found"
  set currentSize to size of targetWindow
  set newWidth to item 1 of currentSize
  set newHeight to item 2 of currentSize
  if newWidth > ${slot.width} then
    set ratio to ${slot.width} / newWidth
    set newWidth to ${slot.width}
    set newHeight to newHeight * ratio
  end if
  if newHeight > ${slot.height} then
    set ratio to ${slot.height} / newHeight
    set newHeight to ${slot.height}
    set newWidth to newWidth * ratio
  end if
  set newX to ${slot.x} + ((${slot.width} - newWidth) div 2)
  set newY to ${slot.y} + ((${slot.height} - newHeight) div 2)
  set position of targetWindow to {newX, newY}
  set size of targetWindow to {newWidth, newHeight}
  perform action "AXRaise" of targetWindow
  return "emulator"
end tell
`
}

function simulatorPreviewScript (candidate, pid, slot) {
  const device = appleScriptEscape(candidate.label)
  const runtime = appleScriptEscape(candidate.runtime)
  return `
tell application "Simulator" to activate
delay 0.15
tell application "System Events"
  set matches to every process whose unix id is ${Number(pid)}
  if matches is {} then return "not-found"
  set p to item 1 of matches
  set frontmost of p to true
  try
    click menu item "${device}" of menu 1 of menu item "${runtime}" of menu 1 of menu item "Open Simulator" of menu 1 of menu bar item "File" of menu bar 1 of p
  end try
  delay 0.3
  set targetWindow to missing value
  repeat with w in windows of p
    try
      set windowName to name of w as text
      if windowName is "${device}" or windowName starts with "${device} –" then
        set targetWindow to w
        exit repeat
      end if
    end try
  end repeat
  if targetWindow is missing value then return "not-found"
  set currentSize to size of targetWindow
  set newWidth to item 1 of currentSize
  set newHeight to item 2 of currentSize
  if newWidth > ${slot.width} then
    set ratio to ${slot.width} / newWidth
    set newWidth to ${slot.width}
    set newHeight to newHeight * ratio
  end if
  if newHeight > ${slot.height} then
    set ratio to ${slot.height} / newHeight
    set newHeight to ${slot.height}
    set newWidth to newWidth * ratio
  end if
  set newX to ${slot.x} + ((${slot.width} - newWidth) div 2)
  set newY to ${slot.y} + ((${slot.height} - newHeight) div 2)
  set position of targetWindow to {newX, newY}
  set size of targetWindow to {newWidth, newHeight}
  perform action "AXRaise" of targetWindow
  return "emulator"
end tell
`
}

async function currentSimulatorPid () {
  const processes = await scanProcesses()
  return processes.find((process) => process.command.includes('/Simulator.app/Contents/MacOS/Simulator'))?.pid || null
}

async function presentCandidate (candidate, slot, { allowLaunch = true } = {}) {
  try {
    if (candidate.type === 'browser') {
      const result = await chromeProfilePreview(candidate, slot, { allowLaunch })
      return { id: candidate.id, type: candidate.type, ...result }
    }

    let pid = candidate.pid
    if (candidate.type === 'ios') {
      if (!pid) {
        if (!allowLaunch) return { ok: false, id: candidate.id, type: candidate.type, reason: 'not-running' }
        await run('/usr/bin/open', ['-a', SIMULATOR_PATH], 5000)
        await new Promise((resolve) => setTimeout(resolve, 850))
        pid = await currentSimulatorPid()
      }
      if (!pid) return { ok: false, id: candidate.id, type: candidate.type, reason: 'not-running' }
      const result = await run('/usr/bin/osascript', ['-e', simulatorPreviewScript(candidate, pid, slot)], 6000)
      return { ok: result.trim() === 'emulator', id: candidate.id, type: candidate.type }
    }
    if (!pid) return { ok: false, id: candidate.id, type: candidate.type, reason: 'not-running' }

    const result = await run('/usr/bin/osascript', ['-e', moveProcessScript(pid, slot)], 6000)
    return { ok: result.trim() === 'emulator', id: candidate.id, type: candidate.type }
  } catch (error) {
    return { ok: false, id: candidate.id, type: candidate.type, reason: error.message }
  }
}

const ROUTE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'build', 'code', 'current', 'do', 'for', 'from', 'get', 'http', 'https',
  'i', 'in', 'is', 'it', 'localhost', 'make', 'on', 'page', 'please', 'project', 'task', 'the', 'this',
  'to', 'update', 'want', 'website', 'with', 'work', 'working', 'www'
])

function routeWords (value) {
  return (String(value || '').toLowerCase().normalize('NFKD').match(/[a-z0-9]{2,}/g) || [])
    .filter((word) => !ROUTE_STOP_WORDS.has(word) && !/^\d+$/.test(word))
}

export function routeScore (session, candidate) {
  if (candidate.type !== 'browser') return 0
  let url
  try { url = new URL(candidate.url) } catch { return 0 }
  const directQuery = new Set(routeWords([
    session?.contextText,
    session?.task,
    session?.summary,
    session?.project,
    session?.terminalDirectContext
  ].join(' ')))
  const transcript = String(session?.transcriptContext || '').toLowerCase()
  const changedFiles = new Set(routeWords(session?.changedFilesContext || ''))
  const pathWords = new Set(routeWords(decodeURIComponent(`${url.pathname} ${url.search}`)))
  const titleWords = new Set(routeWords(candidate.detail))
  let relevance = 0
  for (const word of new Set([...pathWords, ...titleWords])) {
    // Current prompt/task is authoritative. A route-specific changed filename
    // (for example map-aya-*.sql) is the next strongest local signal.
    if (directQuery.has(word)) relevance += pathWords.has(word) ? 24_000 : 4200
    if (changedFiles.has(word)) relevance += pathWords.has(word) ? 18_000 : 2600
    const last = transcript.lastIndexOf(word)
    if (last >= 0) {
      // Later transcript/tool/file evidence is more representative of what is
      // on screen now than an older mention from the same long session.
      relevance += Math.round((last / Math.max(1, transcript.length)) * (pathWords.has(word) ? 7000 : 1800))
      const recent = transcript.slice(-12_000)
      const occurrences = recent.split(word).length - 1
      relevance += Math.min(2000, occurrences * (pathWords.has(word) ? 350 : 120))
    }
  }
  const decodedPath = decodeURIComponent(url.pathname).toLowerCase().replace(/\/$/, '')
  const recentTranscript = transcript.slice(-16_000)
  const exactRouteIndex = decodedPath && decodedPath !== '/' ? recentTranscript.lastIndexOf(decodedPath) : -1
  if (exactRouteIndex >= 0) relevance += 12_000 + Math.round((exactRouteIndex / Math.max(1, recentTranscript.length)) * 5000)
  const nonRoot = url.pathname && url.pathname !== '/'
  if (nonRoot) relevance += 80
  const age = Math.max(0, Date.now() - (candidate.lastActivatedAt || 0))
  const recency = candidate.lastActivatedAt ? Math.max(0, 1000 - Math.floor(age / 60_000)) : 0
  return relevance + recency + (candidate.priority || 0)
}

export function createCompanionService (store, { intervalMs = SCAN_INTERVAL_MS } = {}) {
  const events = new EventEmitter()
  let candidates = []
  let scanning = null
  let timer = null
  let stopped = false
  let scannedAt = 0
  let contexts = new Map()

  function enrichedSession (session) {
    const context = contexts.get(session.id) || {}
    // Accept the old string shape during hot reloads, but all fresh scans use
    // the structured context so prompt, transcript, and file evidence retain
    // their different confidence levels.
    if (typeof context === 'string') return { ...session, transcriptContext: context }
    return {
      ...session,
      terminalDirectContext: context.direct || '',
      transcriptContext: context.transcript || '',
      changedFilesContext: context.changedFiles || ''
    }
  }

  function savedLinks () {
    const value = loadPrefs().companionLinks
    return value && typeof value === 'object' ? value : {}
  }

  function configFor (session) {
    const saved = savedLinks()[sessionProjectKey(session)]
    return saved && saved.mode === 'manual'
      ? {
          mode: 'manual',
          ids: Array.isArray(saved.ids) ? [...new Set(saved.ids)] : [],
          candidates: saved.candidates && typeof saved.candidates === 'object' ? saved.candidates : {}
        }
      : { mode: 'auto', ids: [], candidates: {} }
  }

  function disabledFor (session) {
    return Boolean(loadPrefs().companionDisabled?.[sessionTerminalKey(session)])
  }

  function optionsFor (session) {
    const sessionCwd = session?.terminalCwd || session?.cwd || ''
    const config = configFor(session)
    const available = [...candidates]
    const availableIds = new Set(available.map((candidate) => candidate.id))
    // A manually pinned browser route remains usable even if its original tab
    // was closed. The controller can recreate that exact localhost URL.
    for (const id of config.ids) {
      const saved = config.candidates[id]
      if (saved?.type === 'browser' && !availableIds.has(id)) available.push(saved)
    }
    return available.map((candidate) => ({
      candidate,
      affinity: pathAffinity(sessionCwd, candidate.projectCwd)
    })).filter(({ candidate, affinity }) => affinity > 0 || !candidate.projectCwd || candidate.type !== 'browser')
  }

  function configuredFor (session) {
    const routeSession = enrichedSession(session)
    const config = configFor(session)
    const options = optionsFor(session)
    if (config.mode === 'manual') {
      const wanted = new Set(config.ids)
      return options.filter(({ candidate }) => wanted.has(candidate.id)).map(({ candidate }) => candidate)
    }
    // Automatic linking is intentionally strict. A parent workspace can own
    // many unrelated projects, so only the exact terminal/dev-server cwd is
    // authoritative enough to trigger a preview without asking.
    const automatic = options.filter(({ affinity }) => affinity === 100)
    const browser = automatic
      .filter(({ candidate }) => candidate.type === 'browser')
      .sort((left, right) => routeScore(routeSession, right.candidate) - routeScore(routeSession, left.candidate))[0]
    const emulators = automatic.filter(({ candidate }) => candidate.type !== 'browser')
    return [...(browser ? [browser.candidate] : []), ...emulators.map(({ candidate }) => candidate)]
  }

  function activeFor (session) {
    return disabledFor(session) ? [] : configuredFor(session)
  }

  function sessionState (session) {
    const routeSession = enrichedSession(session)
    const config = configFor(session)
    const active = activeFor(session)
    const configured = configuredFor(session)
    const activeIds = new Set(active.map((candidate) => candidate.id))
    const options = optionsFor(session).sort((a, b) => (
      b.affinity - a.affinity || routeScore(routeSession, b.candidate) - routeScore(routeSession, a.candidate) || a.candidate.label.localeCompare(b.candidate.label)
    ))
    return {
      mode: config.mode,
      disabled: disabledFor(session),
      activeCount: active.length,
      availableCount: options.length,
      suggestionCount: options.filter(({ affinity }) => affinity > 0 && affinity < 100).length,
      active: active.map((candidate) => candidateSummary(candidate, config.mode === 'manual' ? 'remembered' : 'automatic')),
      configured: configured.map((candidate) => candidateSummary(candidate, config.mode === 'manual' ? 'remembered' : 'automatic')),
      candidates: options.map(({ candidate, affinity }) => ({
        ...candidateSummary(candidate, affinity === 100 ? 'automatic' : 'suggested'),
        selected: activeIds.has(candidate.id)
      }))
    }
  }

  function getState () {
    return {
      scannedAt,
      scanning: Boolean(scanning),
      bySession: Object.fromEntries(store.list().map((session) => [session.id, sessionState(session)]))
    }
  }

  function persistConfig (session, config) {
    const prefs = loadPrefs()
    const links = { ...(prefs.companionLinks || {}) }
    links[sessionProjectKey(session)] = config
    savePrefs({ ...prefs, companionLinks: links })
    events.emit('change', getState())
  }

  async function refresh () {
    if (stopped) return getState()
    if (scanning) return scanning
    const sessions = store.list()
    scanning = terminalContexts(sessions).then(async (nextContexts) => {
      const next = await discoverCandidates(sessions, nextContexts)
      candidates = next
      contexts = nextContexts
      scannedAt = Date.now()
      scanning = null
      events.emit('change', getState())
      return getState()
    }).catch((error) => {
      console.error('[ambientic] companion discovery failed:', error.message)
      scanning = null
      return getState()
    })
    return scanning
  }

  function useAutomatic (session) {
    setEnabled(session, true, false)
    persistConfig(session, { mode: 'auto', ids: [], candidates: {} })
  }

  function setEnabled (session, enabled, emit = true) {
    const prefs = loadPrefs()
    const disabled = { ...(prefs.companionDisabled || {}) }
    const key = sessionTerminalKey(session)
    if (enabled) delete disabled[key]
    else disabled[key] = true
    savePrefs({ ...prefs, companionDisabled: disabled })
    if (emit) events.emit('change', getState())
  }

  function toggleEnabled (session) {
    setEnabled(session, disabledFor(session))
  }

  function toggle (session, candidateId) {
    setEnabled(session, true, false)
    const config = configFor(session)
    const automatic = configuredFor(session)
    const baseIds = config.mode === 'manual' ? config.ids : automatic.map((candidate) => candidate.id)
    const ids = new Set(baseIds)
    const snapshots = { ...config.candidates }
    if (config.mode !== 'manual') {
      for (const candidate of automatic) snapshots[candidate.id] = candidate
    }
    if (ids.has(candidateId)) {
      ids.delete(candidateId)
      delete snapshots[candidateId]
    } else {
      ids.add(candidateId)
      const candidate = optionsFor(session).find((option) => option.candidate.id === candidateId)?.candidate
      if (candidate) snapshots[candidateId] = candidate
    }
    persistConfig(session, { mode: 'manual', ids: [...ids], candidates: snapshots })
  }

  async function present (session, display) {
    if (!display?.workArea) return { ok: true, skipped: 'single-display', results: [] }
    const active = activeFor(session)
    if (!active.length) return { ok: true, skipped: 'no-companion', results: [] }
    const routeSession = enrichedSession(session)
    const routeDiagnostics = optionsFor(session)
      .filter(({ candidate, affinity }) => candidate.type === 'browser' && affinity === 100)
      .map(({ candidate }) => ({ url: candidate.url, score: routeScore(routeSession, candidate) }))
      .sort((left, right) => right.score - left.score)
    if (routeDiagnostics.length) console.log(`[route] "${session.project}" ${JSON.stringify(routeDiagnostics.slice(0, 6))}`)
    const results = []
    for (let index = 0; index < active.length; index++) {
      const slot = displaySlot(display, index, active.length)
      if (active[index].type === 'browser') {
        console.log(`[preview] "${session.project}" -> ${active[index].url} via=${active[index].source || 'applescript'}`)
      }
      results.push(await presentCandidate(active[index], slot))
    }
    return { ok: results.some((result) => result.ok), results }
  }

  async function capture (session, display, outputDirectory) {
    if (!display?.workArea) return { ok: false, reason: 'no-display', results: [] }
    // Capturing is an explicit user action, so it uses configured links even
    // when automatic presentation is toggled off for normal pad taps.
    const linked = configuredFor(session)
    if (!linked.length) return { ok: false, reason: 'no-companion', results: [] }
    const results = []
    for (let index = 0; index < linked.length; index++) {
      const slot = displaySlot(display, index, linked.length)
      results.push(await captureCandidate(linked[index], slot, outputDirectory, index))
    }
    return { ok: results.some((result) => result.captured), results }
  }

  function start () {
    void refresh()
    timer = setInterval(refresh, intervalMs)
    if (timer.unref) timer.unref()
  }

  function stop () {
    stopped = true
    if (timer) clearInterval(timer)
  }

  return {
    start,
    stop,
    refresh,
    getState,
    sessionState,
    useAutomatic,
    toggle,
    toggleEnabled,
    present,
    capture,
    on: (...args) => events.on(...args)
  }
}
