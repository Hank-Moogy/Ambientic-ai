import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, normalize, sep } from 'node:path'
import { loadPrefs, savePrefs } from './prefs.js'

const SCAN_INTERVAL_MS = 10_000
const RECORD_SEPARATOR = String.fromCharCode(30)
const FIELD_SEPARATOR = String.fromCharCode(31)
const CONTROLLER_PORT = 47600
const ADAPTER_PATH = `${homedir()}/Library/Android/sdk/platform-tools/adb`
const SIMULATOR_PATH = '/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app'

const CHROME_TABS_SCRIPT = `
if application "Google Chrome" is not running then return ""
set rows to ""
tell application "Google Chrome"
  set windowOrder to 0
  repeat with w in windows
    set windowOrder to windowOrder + 1
    set activeIndex to active tab index of w
    repeat with tabIndex from 1 to count tabs of w
      set t to tab tabIndex of w
      set tabURL to ""
      set tabTitle to ""
      try
        set tabURL to URL of t as text
        set tabTitle to title of t as text
      end try
      if tabURL is not "" then
        set rows to rows & (id of w as text) & (ASCII character 31) & (windowOrder as text) & (ASCII character 31) & (tabIndex as text) & (ASCII character 31) & (activeIndex as text) & (ASCII character 31) & tabURL & (ASCII character 31) & tabTitle & (ASCII character 30)
      end if
    end repeat
  end repeat
end tell
return rows
`

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

function localUrl (raw) {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) return null
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    return Number.isFinite(port) ? { url, port } : null
  } catch {
    return null
  }
}

export function parseChromeTabs (text) {
  const tabs = []
  for (const row of String(text || '').split(RECORD_SEPARATOR)) {
    const [windowId, windowOrder, tabIndex, activeIndex, url = '', title = ''] = row.split(FIELD_SEPARATOR)
    const local = localUrl(url)
    if (!local) continue
    tabs.push({
      windowId: Number(windowId),
      windowOrder: Number(windowOrder),
      tabIndex: Number(tabIndex),
      active: Number(tabIndex) === Number(activeIndex),
      url,
      title: title.trim(),
      port: local.port
    })
  }
  return tabs
}

export function parseListeners (text) {
  const records = []
  let current = null
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('p')) {
      current = { pid: Number(line.slice(1)), commandName: '', ports: new Set() }
      records.push(current)
    } else if (current && line.startsWith('c')) {
      current.commandName = line.slice(1)
    } else if (current && line.startsWith('n')) {
      const match = line.slice(1).match(/:(\d+)$/)
      if (match) current.ports.add(Number(match[1]))
    }
  }
  return records
    .flatMap((record) => [...record.ports].map((port) => ({ ...record, ports: undefined, port })))
    .filter((record) => Number.isInteger(record.pid) && Number.isInteger(record.port))
}

function parseLsofCwds (text) {
  const result = new Map()
  let pid = null
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (pid && line.startsWith('n')) result.set(pid, cleanPath(line.slice(1)))
  }
  return result
}

function parsePs (text) {
  return String(text || '').split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.*)$/)
    return match ? [{ pid: Number(match[1]), command: match[2] }] : []
  })
}

async function processCwds (pids) {
  const unique = [...new Set(pids.filter(Number.isInteger))]
  if (!unique.length) return new Map()
  try {
    return parseLsofCwds(await run('/usr/sbin/lsof', ['-a', '-p', unique.join(','), '-d', 'cwd', '-Fn']))
  } catch {
    return new Map()
  }
}

function deviceArgument (command) {
  const match = String(command || '').match(/--device(?:=|\s+)(.+?)(?=\s+--|$)/i)
  return match ? match[1].replace(/^['"]|['"]$/g, '').trim() : ''
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

async function scanChromeTabs () {
  try { return parseChromeTabs(await run('/usr/bin/osascript', ['-e', CHROME_TABS_SCRIPT], 5000)) } catch { return [] }
}

async function scanProcesses () {
  try { return parsePs(await run('/bin/ps', ['-axo', 'pid=,command='])) } catch { return [] }
}

async function scanBrowserCandidates (processes, tabs) {
  let listeners = []
  try { listeners = parseListeners(await run('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'], 6000)) } catch {}

  const processByPid = new Map(processes.map((process) => [process.pid, process.command]))
  const cwds = await processCwds(listeners.map((listener) => listener.pid))
  const candidates = []
  const seenPorts = new Set()

  for (const listener of listeners) {
    if (listener.port === CONTROLLER_PORT || seenPorts.has(listener.port)) continue
    const cwd = cwds.get(listener.pid) || ''
    if (!cwd) continue
    const matchingTabs = tabs.filter((tab) => tab.port === listener.port).sort((a, b) => (
      Number(b.active) - Number(a.active) || a.windowOrder - b.windowOrder
    ))
    const command = processByPid.get(listener.pid) || listener.commandName
    const isMetro = /(?:^|\s|\/)(?:expo|metro)(?:\s|$)|react-native/i.test(command)
    const looksLikeDevServer = /node|python|ruby|php|bun|deno|next|vite|webpack/i.test(`${listener.commandName} ${command}`)
    if (!matchingTabs.length && (!looksLikeDevServer || isMetro)) continue

    const routeTabs = matchingTabs.length ? matchingTabs : [{ url: `http://localhost:${listener.port}`, title: '', active: false, windowOrder: 999 }]
    const seenUrls = new Set()
    for (const tab of routeTabs) {
      if (seenUrls.has(tab.url)) continue
      seenUrls.add(tab.url)
      const parsed = localUrl(tab.url)?.url
      const route = parsed && parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : ''
      candidates.push({
        id: `browser:${listener.port}:${encodeURIComponent(tab.url)}`,
        type: 'browser',
        label: `localhost:${listener.port}${route}`,
        detail: tab.title || basename(cwd) || 'Browser preview',
        url: tab.url,
        port: listener.port,
        priority: (tab.active ? 2000 : 1000) - (Number(tab.windowOrder) || 999),
        projectCwd: cwd
      })
    }
    seenPorts.add(listener.port)
  }

  // A localhost tab remains manually attachable even when its server process
  // cannot be inspected (Docker, a remote tunnel, or a briefly restarting dev server).
  for (const tab of tabs) {
    if (seenPorts.has(tab.port)) continue
    candidates.push({
      id: `browser:${tab.port}:${encodeURIComponent(tab.url)}`,
      type: 'browser',
      label: `localhost:${tab.port}${localUrl(tab.url)?.url.pathname.replace(/\/$/, '') || ''}`,
      detail: tab.title || tab.url,
      url: tab.url,
      port: tab.port,
      priority: (tab.active ? 2000 : 1000) - (Number(tab.windowOrder) || 999),
      projectCwd: ''
    })
    seenPorts.add(tab.port)
  }

  return candidates
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

async function discoverCandidates () {
  const [processes, tabs] = await Promise.all([scanProcesses(), scanChromeTabs()])
  const launchProcesses = processes.filter((process) => /(?:expo\s+run:|react-native\s+run-)(?:ios|android)/i.test(process.command))
  const launchCwds = await processCwds(launchProcesses.map((process) => process.pid))
  const launchHints = launchProcesses.map((process) => ({
    platform: /(?:run:ios|run-ios)/i.test(process.command) ? 'ios' : 'android',
    device: deviceArgument(process.command),
    cwd: launchCwds.get(process.pid) || ''
  })).filter((hint) => hint.device && hint.cwd)

  const [browser, ios, android] = await Promise.all([
    scanBrowserCandidates(processes, tabs),
    scanIosCandidates(processes, launchHints),
    scanAndroidCandidates(processes, launchHints)
  ])
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

function chromePreviewScript (candidate, slot) {
  const url = appleScriptEscape(candidate.url)
  const portNeedle = `:${candidate.port}`
  const left = slot.x
  const top = slot.y
  const right = slot.x + slot.width
  const bottom = slot.y + slot.height
  return `
tell application "Google Chrome"
  set targetWindow to missing value
  repeat with w in windows
    try
      if (count tabs of w) is 1 and (URL of active tab of w contains "${portNeedle}") then
        set targetWindow to w
        exit repeat
      end if
    end try
  end repeat
  if targetWindow is missing value then
    set targetWindow to make new window
  end if
  set URL of active tab of targetWindow to "${url}"
  set bounds of targetWindow to {${left}, ${top}, ${right}, ${bottom}}
  set index of targetWindow to 1
  activate
  return "browser"
end tell
`
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

async function presentCandidate (candidate, slot) {
  try {
    if (candidate.type === 'browser') {
      const result = await run('/usr/bin/osascript', ['-e', chromePreviewScript(candidate, slot)], 9000)
      return { ok: result.trim() === 'browser', id: candidate.id, type: candidate.type }
    }

    let pid = candidate.pid
    if (candidate.type === 'ios') {
      if (!pid) {
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

export function createCompanionService (store, { intervalMs = SCAN_INTERVAL_MS } = {}) {
  const events = new EventEmitter()
  let candidates = []
  let scanning = null
  let timer = null
  let stopped = false
  let scannedAt = 0

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

  function activeFor (session) {
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
      .sort((left, right) => (right.candidate.priority || 0) - (left.candidate.priority || 0))[0]
    const emulators = automatic.filter(({ candidate }) => candidate.type !== 'browser')
    return [...(browser ? [browser.candidate] : []), ...emulators.map(({ candidate }) => candidate)]
  }

  function sessionState (session) {
    const config = configFor(session)
    const active = activeFor(session)
    const activeIds = new Set(active.map((candidate) => candidate.id))
    const options = optionsFor(session).sort((a, b) => b.affinity - a.affinity || a.candidate.label.localeCompare(b.candidate.label))
    return {
      mode: config.mode,
      activeCount: active.length,
      availableCount: options.length,
      suggestionCount: options.filter(({ affinity }) => affinity > 0 && affinity < 100).length,
      active: active.map((candidate) => candidateSummary(candidate, config.mode === 'manual' ? 'remembered' : 'automatic')),
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
    scanning = discoverCandidates().then((next) => {
      candidates = next
      scannedAt = Date.now()
      scanning = null
      events.emit('change', getState())
      return getState()
    }).catch((error) => {
      console.error('[claude-controller] companion discovery failed:', error.message)
      scanning = null
      return getState()
    })
    return scanning
  }

  function useAutomatic (session) {
    persistConfig(session, { mode: 'auto', ids: [], candidates: {} })
  }

  function toggle (session, candidateId) {
    const config = configFor(session)
    const automatic = activeFor(session)
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
    const results = []
    for (let index = 0; index < active.length; index++) {
      const slot = displaySlot(display, index, active.length)
      results.push(await presentCandidate(active[index], slot))
    }
    return { ok: results.some((result) => result.ok), results }
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
    present,
    on: (...args) => events.on(...args)
  }
}
