import { app, BrowserWindow, Tray, Menu, clipboard, dialog, ipcMain, nativeImage, powerMonitor, powerSaveBlocker, screen, shell, systemPreferences } from 'electron'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { SessionStore, STATE } from './sessions.js'
import { startServer } from './server.js'
import { focusSession, pasteClipboardImage, pasteClipboardText, submitTerminalPrompt } from './focus.js'
import { startDiscovery } from './discovery.js'
import { createTaskSummarizer } from './summarizer.js'
import { createUsageService } from './usage.js'
import { createConsumptionLedger } from './consumption-ledger.mjs'
import { createCompanionService } from './companions.js'
import { loadPrefs, savePrefs } from './prefs.js'
import { loadTaskCache, saveTaskCache } from './task-cache.js'
import { createMidiController } from './midi-controller.js'
import { connectorState, openAgentSetup, openAgentTerminal } from './connectors.js'
import { createVoiceInput } from './voice-input.mjs'
import { WorkspaceService } from './workspace-service.mjs'
import { HandoverService } from './handover-service.mjs'
import { ClaudeAuthService } from './claude-auth-service.mjs'
import { normalizeExternalUrl } from './external-url.mjs'
import { ensureEnhancedPath } from './env-path.mjs'
import { initFileLogging, logFilePath } from './logging.mjs'
import { AmbientModeService, DEFAULT_AMBIENT_CHECK_IN_MINUTES } from './ambient-mode.mjs'
import { readBuildInfo } from './build-info.mjs'
import { createCareerOsRepository, createGoalsRepository, createWorkflowsRepository } from './repositories.mjs'
import { createContextStore } from './context-store.mjs'
import { createContextEngine } from './context-engine.mjs'
import { createCapabilityGateway } from './capability-gateway.mjs'
import { discoverCareerJobs } from './career-job-sources.mjs'
import { createMemoryBootstrapService } from './memory-bootstrap-service.mjs'
import { createHardwareProfileService } from './hardware-profile-service.mjs'
import { projectLaunchAccess } from './project-scope.mjs'
import { CAREER_OS_PACK } from '../shared/career-os-pack.mjs'

// Apply disposable state before logging and before Electron derives the
// single-instance lock. This lets a clean-profile developer smoke coexist with
// the installed app without sharing logs, preferences, mappings, or lock state.
// Keep the old variable as a compatibility alias.
const explicitStateDirectory = process.env.AMBIENTIC_STATE_DIR || process.env.AGENTBASE_STATE_DIR
if (explicitStateDirectory) {
  app.setPath('userData', explicitStateDirectory)
} else if (process.platform === 'darwin') {
  // The product rename changes Electron's default userData directory. Copy the
  // existing local state once so provider aliases, onboarding, mappings, and
  // consumption history survive the move from AgentBase to Ambientic.
  const ambienticState = app.getPath('userData')
  const legacyState = join(dirname(ambienticState), 'AgentBase')
  try {
    const ambienticIsEmpty = !existsSync(ambienticState) || readdirSync(ambienticState).length === 0
    if (ambienticState !== legacyState && ambienticIsEmpty && existsSync(legacyState)) {
      cpSync(legacyState, ambienticState, { recursive: true, force: false })
    }
  } catch (error) {
    console.error(`[ambientic] legacy state migration skipped: ${error.message}`)
  }
}

// Widen PATH before any provider CLI (or its node-based hooks) is spawned. A
// Finder-launched app otherwise only has launchd's minimal PATH, which lacks
// Homebrew/nvm node and breaks Claude Code plugin hooks.
ensureEnhancedPath()

// Start capturing main-process logs to ~/.ambientic/logs/main.log before any
// service runs, so startup failures are recorded too. A packaged app discards
// stdout, so this file is the only diagnostic record after the fact.
initFileLogging()

// Only one Ambientic process may own CoreMIDI, the hook server, and provider
// bridges. A second launch focuses the existing workspace instead of creating
// another native MIDI client and racing for the same controller.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

const __dirname = dirname(fileURLToPath(import.meta.url))
const buildInfo = readBuildInfo({
  resourcesPath: process.resourcesPath,
  appPath: app.getAppPath(),
  version: app.getVersion()
})

const DEFAULT_WIDTH = 232
const MIN_WIDTH = 232
const MIN_HEIGHT = 220
const MARGIN = 16
const CAREER_OS_GATEWAY_SCOPES = ['context:read', 'memory:read', 'memory:write', 'goals:read', 'tasks:write', 'capabilities:invoke', 'career:read', 'career:discover', 'career:write']
const ZOOM_STEPS = [0.9, 1, 1.15, 1.3, 1.5, 1.75]
const store = new SessionStore()
const summarizer = createTaskSummarizer(store)
const usage = createUsageService()
const companions = createCompanionService(store)

function cleanKeyboardBinding (code, modifiers = []) {
  const ordered = ['Meta', 'Control', 'Alt', 'Shift'].filter((modifier) => Array.isArray(modifiers) && modifiers.includes(modifier))
  return [...ordered, String(code || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)].filter(Boolean).join('+')
}

let win = null
let workspaceWin = null
let tray = null
let discovery = null
let pointerResize = null
let lastFocusedSessionId = null
let midiController = null
let voiceInput = null
let connectors = []
let pendingCodexLogin = ''
const providerAuthState = new Map()
let workspace = null
let handovers = null
let consumptionLedger = null
let claudeAuth = null
let ambientMode = null
let goals = null
let workflows = null
let career = null
let hardwareProfiles = null
let contextStore = null
let contextEngine = null
let capabilityGateway = null
let memoryBootstrap = null
let pendingHardwareAction = null
let pendingHardwareActionTimer = null
let contextStartupError = ''
let pendingWorkspaceSessionId = ''
let workspaceListTimer = null
let workspaceRendererFailures = []

function sendToWindows (channel, payload) {
  for (const target of [win, workspaceWin]) {
    if (target && !target.isDestroyed()) target.webContents.send(channel, payload)
  }
}

function requireContextService (service, label = 'context service') {
  if (contextStartupError) throw new Error(`Ambientic preserved the local context database but could not open it: ${contextStartupError}. Open the Ambientic data folder to recover or restore the database.`)
  if (!service) throw new Error(`Ambientic ${label} is not ready yet.`)
  return service
}

function stopPointerResize () {
  if (!pointerResize) return
  clearInterval(pointerResize.timer)
  pointerResize = null
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  savePrefs({ ...loadPrefs(), x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, manualSize: true })
}

function updatePointerResize () {
  if (!pointerResize || !win || win.isDestroyed()) return stopPointerResize()
  const point = screen.getCursorScreenPoint()
  const now = Date.now()
  if (point.x !== pointerResize.lastPoint.x || point.y !== pointerResize.lastPoint.y) {
    pointerResize.lastPoint = point
    pointerResize.lastMovedAt = now
  } else if (now - pointerResize.lastMovedAt > 200) {
    return stopPointerResize()
  }

  const { bounds, startPoint, edge } = pointerResize
  const wa = screen.getDisplayMatching(bounds).workArea
  const deltaX = point.x - startPoint.x
  const deltaY = point.y - startPoint.y
  const right = bounds.x + bounds.width
  const nextX = edge === 'left'
    ? Math.max(wa.x, Math.min(right - MIN_WIDTH, Math.round(bounds.x + deltaX)))
    : bounds.x
  const width = edge === 'left'
    ? right - nextX
    : Math.max(MIN_WIDTH, Math.min(Math.round(bounds.width + deltaX), wa.x + wa.width - bounds.x))
  const height = Math.max(MIN_HEIGHT, Math.min(Math.round(bounds.height + deltaY), wa.y + wa.height - bounds.y))
  win.setBounds({ ...bounds, x: nextX, width, height })
}

function loginItemSettings () {
  if (!app.isPackaged || process.platform !== 'darwin') return { openAtLogin: false, status: 'unavailable' }
  try { return app.getLoginItemSettings({ type: 'mainAppService' }) } catch { return { openAtLogin: false, status: 'unknown' } }
}

function setLaunchAtLogin (enabled) {
  if (!app.isPackaged || process.platform !== 'darwin') return loginItemSettings()
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), type: 'mainAppService' })
    savePrefs({ ...loadPrefs(), launchAtLogin: Boolean(enabled) })
  } catch (error) {
    console.error(`[ambientic] could not update login item: ${error.message}`)
  }
  return loginItemSettings()
}

function ensureLaunchAtLoginPreference () {
  const prefs = loadPrefs()
  // Enable it on the first packaged launch. Once the user changes the checkbox,
  // persist their choice instead of silently re-enabling it on a later launch.
  if (typeof prefs.launchAtLogin !== 'boolean') return setLaunchAtLogin(true)

  const current = loginItemSettings()
  if (current.openAtLogin !== prefs.launchAtLogin) return setLaunchAtLogin(prefs.launchAtLogin)
  return current
}

// 1x1 transparent image; the menu-bar signal is carried by tray.setTitle().
const TRAY_IMG = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
)

const TRAY_GLYPH = {
  [STATE.ATTENTION]: '🔴',
  [STATE.WAITING]: '🔴',
  [STATE.RUNNING]: '🟢',
  [STATE.IDLE]: '🔴'
}

function workArea () {
  return screen.getPrimaryDisplay().workArea
}

function defaultBounds (height, width = DEFAULT_WIDTH) {
  const wa = workArea()
  return {
    x: wa.x + wa.width - width - MARGIN,
    y: wa.y + MARGIN,
    width,
    height
  }
}

function savedZoom () {
  const value = Number(loadPrefs().zoomFactor)
  return ZOOM_STEPS.includes(value) ? value : 1
}

function setInterfaceZoom (value) {
  if (!win || win.isDestroyed()) return
  const zoomFactor = ZOOM_STEPS.includes(value) ? value : 1
  win.webContents.setZoomFactor(zoomFactor)
  savePrefs({ ...loadPrefs(), zoomFactor })
  tray?.setContextMenu(buildTrayMenu())

  // Zoom changes the rendered content height. Ask Chromium for the new layout
  // after it settles so auto-sized windows continue to hug their contents.
  setTimeout(() => {
    if (!win || win.isDestroyed()) return
    win.webContents.executeJavaScript(
      'document.querySelector(".app__content")?.scrollHeight || document.body.scrollHeight'
    ).then(resizeTo).catch(() => {})
  }, 80)
}

function stepInterfaceZoom (direction) {
  const current = savedZoom()
  const index = ZOOM_STEPS.reduce((best, value, candidate) => (
    Math.abs(value - current) < Math.abs(ZOOM_STEPS[best] - current) ? candidate : best
  ), 0)
  const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + direction))
  setInterfaceZoom(ZOOM_STEPS[next])
}

function createWindow () {
  const prefs = loadPrefs()
  const width = prefs.manualSize && Number.isFinite(prefs.width) ? Math.max(MIN_WIDTH, prefs.width) : DEFAULT_WIDTH
  const height = prefs.manualSize && Number.isFinite(prefs.height) ? Math.max(MIN_HEIGHT, prefs.height) : 320
  const start = defaultBounds(height, width)
  win = new BrowserWindow({
    ...start,
    x: typeof prefs.x === 'number' ? prefs.x : start.x,
    y: typeof prefs.y === 'number' ? prefs.y : start.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  // Float above everything, including other apps' fullscreen spaces.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) win.loadURL(`${rendererUrl}?surface=controller`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query: { surface: 'controller' } })

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.error(`[ambientic:renderer] ${message}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[ambientic:renderer] process gone: ${details.reason}`)
  })

  // The compact hardware view remains available from the workspace and tray,
  // but the full workspace is the default first-run surface.

  win.on('moved', () => {
    const b = win.getBounds()
    savePrefs({ ...loadPrefs(), x: b.x, y: b.y })
    pushDisplays()
  })

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(savedZoom())
    pushState()
    pushSys()
    pushUsage()
    pushDisplays()
    pushCompanions()
    pushMidi()
    pushVoice()
    pushConnectors()
    const smokeScreenshot = process.env.AMBIENTIC_SMOKE_SCREENSHOT || process.env.AGENTBASE_SMOKE_SCREENSHOT
    const smokeView = process.env.AMBIENTIC_SMOKE_VIEW || process.env.AGENTBASE_SMOKE_VIEW
    if (smokeScreenshot && smokeView !== 'workspace') {
      setTimeout(async () => {
        try {
          if (smokeView === 'midi') {
            await win.webContents.executeJavaScript('document.querySelector(".titlebar__midi")?.click()')
            await new Promise((resolve) => setTimeout(resolve, 250))
          }
          const image = await win.webContents.capturePage()
          await writeFile(smokeScreenshot, image.toPNG())
          console.log(`[ambientic] smoke screenshot: ${smokeScreenshot}`)
        } catch (error) {
          console.error(`[ambientic] smoke screenshot failed: ${error.message}`)
        } finally {
          if ((process.env.AMBIENTIC_SMOKE_QUIT || process.env.AGENTBASE_SMOKE_QUIT) === '1') app.quit()
        }
      }, 2500)
    }
  })

  // `will-resize` is emitted for direct user resizing, not our content-fit
  // setBounds calls. Once the user chooses a size, preserve it exactly.
  win.on('will-resize', (_event, bounds) => {
    savePrefs({
      ...loadPrefs(),
      width: Math.max(MIN_WIDTH, bounds.width),
      height: Math.max(MIN_HEIGHT, bounds.height),
      manualSize: true
    })
  })

  win.on('resize', () => {
    const prefs = loadPrefs()
    if (!prefs.manualSize || pointerResize) return
    const bounds = win.getBounds()
    savePrefs({ ...prefs, width: bounds.width, height: bounds.height })
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (!input.meta || input.type !== 'keyDown') return
    if (input.key === '+' || input.key === '=') {
      event.preventDefault()
      stepInterfaceZoom(1)
    } else if (input.key === '-') {
      event.preventDefault()
      stepInterfaceZoom(-1)
    } else if (input.key === '0') {
      event.preventDefault()
      setInterfaceZoom(1)
    }
  })
}

function createWorkspaceWindow () {
  workspaceWin = new BrowserWindow({
    width: 1420,
    height: 880,
    minWidth: 820,
    minHeight: 600,
    title: 'Ambientic',
    backgroundColor: '#0b0c0f',
    show: false,
    fullscreenable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) workspaceWin.loadURL(`${rendererUrl}?surface=workspace`)
  else workspaceWin.loadFile(join(__dirname, '../renderer/index.html'), { query: { surface: 'workspace' } })
  workspaceWin.once('ready-to-show', () => workspaceWin.show())
  workspaceWin.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.error(`[ambientic:workspace-renderer] ${message}`)
  })
  const recoverWorkspaceRenderer = (reason) => {
    const now = Date.now()
    workspaceRendererFailures = workspaceRendererFailures.filter((timestamp) => now - timestamp < 60_000)
    if (workspaceRendererFailures.some((timestamp) => now - timestamp < 500)) {
      console.error(`[ambientic:workspace-renderer] duplicate recovery signal ignored: ${reason}`)
      return
    }
    workspaceRendererFailures.push(now)
    console.error(`[ambientic:workspace-renderer] recovery requested: ${reason}`)
    if (workspaceRendererFailures.length > 2) {
      console.error('[ambientic:workspace-renderer] automatic recovery stopped after two failures in one minute')
      return
    }
    setTimeout(() => {
      if (!workspaceWin || workspaceWin.isDestroyed() || workspaceWin.webContents.isDestroyed()) return
      workspaceWin.webContents.reload()
    }, 350)
  }
  workspaceWin.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') recoverWorkspaceRenderer(`process gone: ${details.reason}`)
  })
  workspaceWin.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) recoverWorkspaceRenderer(`load failed ${errorCode}: ${errorDescription}`)
  })
  workspaceWin.webContents.on('did-finish-load', () => {
    pushState(); pushSys(); pushUsage(); pushDisplays(); pushCompanions(); pushMidi(); pushVoice(); pushConnectors()
    if (pendingWorkspaceSessionId) {
      workspaceWin.webContents.send('workspace-select', pendingWorkspaceSessionId)
      pendingWorkspaceSessionId = ''
    }
    const smokeScreenshot = process.env.AMBIENTIC_SMOKE_SCREENSHOT || process.env.AGENTBASE_SMOKE_SCREENSHOT
    const smokeView = process.env.AMBIENTIC_SMOKE_VIEW || process.env.AGENTBASE_SMOKE_VIEW
    if (smokeScreenshot && smokeView === 'workspace') {
      setTimeout(async () => {
        try {
          const image = await workspaceWin.webContents.capturePage()
          await writeFile(smokeScreenshot, image.toPNG())
          console.log(`[ambientic] workspace smoke screenshot: ${smokeScreenshot}`)
        } catch (error) {
          console.error(`[ambientic] workspace smoke screenshot failed: ${error.message}`)
        } finally {
          if ((process.env.AMBIENTIC_SMOKE_QUIT || process.env.AGENTBASE_SMOKE_QUIT) === '1') app.quit()
        }
      }, 11_000)
    }
  })
  workspaceWin.on('closed', () => { workspaceWin = null })
}

function pushState () {
  const list = store.list()
  sendToWindows('state', list)
  void pushWorkspaceThreads()
  updateTray()
}

async function pushWorkspaceThreads (force = false) {
  if (!workspace) return
  try { sendToWindows('workspace-threads', await workspace.list({ force })) } catch (error) { console.error('[ambientic] workspace index failed:', error.message) }
}

function scheduleWorkspaceThreads () {
  if (workspaceListTimer) clearTimeout(workspaceListTimer)
  workspaceListTimer = setTimeout(() => {
    workspaceListTimer = null
    void pushWorkspaceThreads()
  }, 80)
}

function pushSys () {
  sendToWindows('sys', { accessibility: accessibilityGranted(false) })
}

function voiceStatus () {
  const status = voiceInput?.getStatus() || { recording: false, transcribing: false, sessionId: '', error: '', transcript: '', toolsReady: false }
  const session = store.list().find((candidate) => candidate.id === status.sessionId)
  return { ...status, sessionLabel: session?.task || session?.project || session?.agent || '' }
}

function pushVoice () {
  sendToWindows('voice', voiceStatus())
}

function pushUsage () {
  sendToWindows('usage', usage.getState())
}

function pushConsumptionLedger () {
  if (consumptionLedger) sendToWindows('consumption-ledger', consumptionLedger.getState())
}

function pushDisplays () {
  sendToWindows('displays', displayTopology())
}

function pushCompanions () {
  sendToWindows('companions', companions.getState())
}

function pushMidi () {
  sendToWindows('midi', midiController?.getStatus() || { connected: false, model: 'Akai APC controller' })
}

function pushHardware () {
  if (hardwareProfiles) sendToWindows('hardware-profiles', hardwareProfiles.snapshot())
}

function pushConnectors () {
  sendToWindows('connectors', connectors)
}

async function refreshConnectors () {
  connectors = await connectorState()
  pushConnectors()
  return connectors
}

function pushProviderAuth (payload) {
  const value = { ...payload, updatedAt: Date.now() }
  providerAuthState.set(payload.provider, value)
  console.log(`[ambientic] ${payload.provider} auth: ${payload.status}${payload.email ? ` (${payload.email})` : ''}${payload.error ? ` — ${payload.error}` : ''}`)
  sendToWindows('provider-auth', value)
}

function verifyCodexLogin (loginId) {
  pendingCodexLogin = loginId
  const checks = [2500, 10_000, 30_000, 60_000]
  for (const delay of checks) {
    setTimeout(async () => {
      if (pendingCodexLogin !== loginId) return
      try {
        const account = await workspace.codexAccountStatus()
        if (account.connected) {
          pendingCodexLogin = ''
          await refreshConnectors()
          pushProviderAuth({ provider: 'codex', status: 'connected', loginId, ...account })
        } else if (delay === checks.at(-1)) {
          pendingCodexLogin = ''
          pushProviderAuth({
            provider: 'codex',
            status: 'timeout',
            loginId,
            error: 'Ambientic could not confirm the login. Return here and use Check connections.'
          })
        }
      } catch (error) {
        if (delay === checks.at(-1)) {
          pendingCodexLogin = ''
          pushProviderAuth({ provider: 'codex', status: 'failed', loginId, error: error.message })
        }
      }
    }, delay)
  }
}

function updateTray () {
  if (!tray) return
  const { worst, needy, total } = store.summary()
  const glyph = TRAY_GLYPH[worst] || '⚪️'
  tray.setTitle(total ? ` ${glyph}${needy || ''}` : ' ⚪️')
  tray.setToolTip(
    total
      ? `${total} session${total > 1 ? 's' : ''}${needy ? ` · ${needy} need you` : ''}`
      : 'Ambientic — no sessions'
  )
}

// Auto-fit the window height to the pad grid (keeps it hugging content, docked
// to the right, never taller than the screen).
function resizeTo (height) {
  if (!win || win.isDestroyed()) return
  if (loadPrefs().manualSize) return
  const wa = workArea()
  const zoomFactor = win.webContents.getZoomFactor()
  const h = Math.max(MIN_HEIGHT, Math.min(Math.round(height * zoomFactor), wa.height - MARGIN * 2))
  const b = win.getBounds()
  // React re-measures after state-only updates such as acknowledging a pad.
  // Avoid a redundant native resize: transparent always-on-top windows can
  // visibly recompose on macOS even when setBounds receives identical values.
  if (b.height === h) return
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: h })
}

function snapTopRight () {
  if (!win || win.isDestroyed()) return
  const b = win.getBounds()
  const nb = defaultBounds(b.height, b.width)
  win.setBounds(nb)
  savePrefs({ ...loadPrefs(), x: nb.x, y: nb.y })
}

function showWorkspace (sessionId = '') {
  if (!workspaceWin || workspaceWin.isDestroyed()) createWorkspaceWindow()
  workspaceWin.show()
  workspaceWin.focus()
  if (sessionId) {
    pendingWorkspaceSessionId = sessionId
    if (!workspaceWin.webContents.isLoadingMainFrame()) {
      workspaceWin.webContents.send('workspace-select', sessionId)
      pendingWorkspaceSessionId = ''
    }
  }
  return true
}

async function presentWorkspacePreview (id, { refresh = true } = {}) {
  const session = store.list().find((candidate) => candidate.id === id)
  if (!session) return { ok: false, reason: 'not-found' }
  if (refresh) await companions.refresh()
  const state = companions.sessionState(session)
  if (!state.activeCount) return { ok: false, reason: 'no-companion', state }
  const display = previewDisplay() || workspacePreviewDisplay()
  if (!display) return { ok: false, reason: 'no-preview-display', state }
  return { ...(await companions.present(session, display)), state }
}

async function selectWorkspaceSession (id) {
  const liveSession = store.list().find((candidate) => candidate.id === id)
  const session = liveSession || workspace?.sessionFor(id)
  if (!session) return { ok: false, reason: 'not-found' }
  if (liveSession) store.acknowledge(id)
  lastFocusedSessionId = id
  midiController?.select(liveSession ? id : null)
  showWorkspace(id)
  const preview = liveSession ? await presentWorkspacePreview(id) : { ok: false, reason: 'history-session' }
  return { ok: true, sessionId: id, preview }
}

function runInstaller () {
  const hookRoot = app.isPackaged
    ? join(process.resourcesPath, 'hook')
    : join(app.getAppPath(), 'hook')
  const script = join(hookRoot, 'install.sh')
  execFile('/bin/sh', [script], { timeout: 20_000 }, (err, stdout, stderr) => {
    const body = (stdout || '') + (stderr || '') + (err ? `\n${err.message}` : '')
    sendToWindows('installer', { ok: !err, output: body.trim() })
    void refreshConnectors()
  })
}

function buildTrayMenu () {
  const loginItem = loginItemSettings()
  const zoom = savedZoom()
  const midiStatus = midiController?.getStatus() || { connected: false }
  return Menu.buildFromTemplate([
    { label: 'Open Ambientic workspace', click: () => showWorkspace() },
    { label: 'Show / Hide compact controller', click: () => (win.isVisible() ? win.hide() : win.showInactive()) },
    {
      label: 'Ambient mode',
      type: 'checkbox',
      checked: Boolean(ambientMode?.getState().enabled),
      click: (item) => ambientMode?.setEnabled(item.checked)
    },
    { label: 'Dock top-right', click: snapTopRight },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: loginItem.openAtLogin,
      enabled: app.isPackaged && process.platform === 'darwin',
      click: (item) => {
        setLaunchAtLogin(item.checked)
        tray?.setContextMenu(buildTrayMenu())
      }
    },
    {
      label: `Interface Size (${Math.round(zoom * 100)}%)`,
      submenu: [
        { label: 'Larger', accelerator: 'CommandOrControl+=', enabled: zoom < ZOOM_STEPS.at(-1), click: () => stepInterfaceZoom(1) },
        { label: 'Smaller', accelerator: 'CommandOrControl+-', enabled: zoom > ZOOM_STEPS[0], click: () => stepInterfaceZoom(-1) },
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', enabled: zoom !== 1, click: () => setInterfaceZoom(1) }
      ]
    },
    { type: 'separator' },
    {
      label: midiStatus.connected ? `${midiStatus.shortModel}: ${midiStatus.device}` : `${midiStatus.shortModel || 'APC controller'}: Not connected`,
      enabled: false
    },
    { label: 'Reconnect MIDI controller', click: () => midiController?.reconnect() },
    { type: 'separator' },
    { label: 'Install / update agent hooks…', click: runInstaller },
    { label: 'Open Ambientic data folder', click: () => shell.openPath(join(app.getPath('home'), '.ambientic')) },
    { label: 'Open diagnostic log', click: () => shell.openPath(logFilePath()) },
    { type: 'separator' },
    { label: 'Quit Ambientic', click: () => { app.isQuitting = true; app.quit() } }
  ])
}

function createTray () {
  tray = new Tray(TRAY_IMG)
  tray.setContextMenu(buildTrayMenu())
  updateTray()
}

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-state', () => store.list())
ipcMain.handle('get-build-info', () => buildInfo)
ipcMain.handle('get-workspace-threads', () => workspace.list())
ipcMain.handle('get-goals', () => goals?.list() || { version: 1, goals: [], events: [], updatedAt: null })
ipcMain.handle('create-goal', (_event, input) => goals.createGoal(input || {}))
ipcMain.handle('update-goal', (_event, goalId, patch) => goals.updateGoal(goalId, patch || {}))
ipcMain.handle('create-goal-task', (_event, goalId, input) => goals.createTask(goalId, input || {}))
ipcMain.handle('update-goal-task', (_event, taskId, patch) => goals.updateTask(taskId, patch || {}))
ipcMain.handle('get-workflows', () => workflows?.list() || { version: 2, workflows: [], runs: [], packs: [], updatedAt: null })
ipcMain.handle('install-career-os', (_event, setup) => {
  const installed = workflows.installPack(CAREER_OS_PACK, setup || {})
  career.configure(setup || {})
  return installed
})
ipcMain.handle('get-career-os', () => career?.list() || { version: 1, configured: false, opportunities: [], pipeline: {}, dailyQueue: { minutes: 45, plannedMinutes: 0, remainingMinutes: 45, items: [] }, market: {}, feedbackSummary: {}, updatedAt: null })
ipcMain.handle('career-update-opportunity', (_event, opportunityId, patch) => career.updateOpportunity(String(opportunityId || ''), patch || {}, { actor: 'human' }))
ipcMain.handle('career-pass-opportunity', (_event, opportunityId, reason, note) => career.passOpportunity(String(opportunityId || ''), reason, note, { actor: 'human' }))
ipcMain.handle('create-workflow', (_event, input) => workflows.create(input || {}))
ipcMain.handle('update-workflow', (_event, workflowId, input) => workflows.update(workflowId, input || {}))
ipcMain.handle('duplicate-workflow', (_event, workflowId) => workflows.duplicate(workflowId))
ipcMain.handle('delete-workflow', (_event, workflowId) => workflows.remove(workflowId))
ipcMain.handle('set-workflow-enabled', (_event, workflowId, enabled) => workflows.setEnabled(workflowId, enabled))
ipcMain.handle('run-workflow', (_event, workflowId) => workflows.startRun(workflowId))
ipcMain.handle('approve-workflow-run', (_event, runId, allow) => workflows.approve(runId, allow))
ipcMain.handle('cancel-workflow-run', (_event, runId) => workflows.cancel(runId))
ipcMain.handle('get-hardware-profiles', () => hardwareProfiles?.snapshot() || { version: 1, templates: [], activeTemplateId: '', activeViewId: '', mode: 'play', actions: [] })
ipcMain.handle('hardware-create-template', (_event, input = {}) => hardwareProfiles.create(input))
ipcMain.handle('hardware-update-template', (_event, templateId, patch = {}) => hardwareProfiles.update(String(templateId || ''), patch))
ipcMain.handle('hardware-duplicate-template', (_event, templateId) => hardwareProfiles.duplicate(String(templateId || '')))
ipcMain.handle('hardware-delete-template', (_event, templateId) => hardwareProfiles.remove(String(templateId || '')))
ipcMain.handle('hardware-activate-template', (_event, templateId) => hardwareProfiles.activate(String(templateId || '')))
ipcMain.handle('hardware-set-mode', (_event, mode) => hardwareProfiles.setMode(mode))
ipcMain.handle('hardware-add-view', (_event, templateId, input = {}) => hardwareProfiles.addView(String(templateId || ''), input))
ipcMain.handle('hardware-rename-view', (_event, templateId, viewId, name) => hardwareProfiles.renameView(String(templateId || ''), String(viewId || ''), name))
ipcMain.handle('hardware-delete-view', (_event, templateId, viewId) => hardwareProfiles.removeView(String(templateId || ''), String(viewId || '')))
ipcMain.handle('hardware-assign-pad', (_event, templateId, viewId, slot, assignment = {}) => hardwareProfiles.assign(String(templateId || ''), String(viewId || ''), String(slot || ''), assignment))
ipcMain.handle('hardware-trigger-pad', (_event, slot) => hardwareProfiles.triggerSlot(String(slot || ''), 'screen'))
ipcMain.handle('hardware-open-view', (_event, viewId) => hardwareProfiles.openView(String(viewId || '')))
ipcMain.handle('hardware-learn-pad', (_event, templateId, slot) => hardwareProfiles.learn(String(templateId || ''), String(slot || '')))
ipcMain.handle('hardware-cancel-learn', () => hardwareProfiles.cancelLearn())
ipcMain.handle('hardware-clear-binding', (_event, templateId, slot) => hardwareProfiles.clearBinding(String(templateId || ''), String(slot || '')))
ipcMain.handle('hardware-key-input', (_event, code, modifiers = [], pressed = true) => hardwareProfiles.handleInput({ key: `key:${cleanKeyboardBinding(code, modifiers)}`, type: 'key', code: String(code || ''), modifiers, pressed: Boolean(pressed) }))
ipcMain.handle('hardware-confirm-action', async (_event, id, allow) => {
  if (!pendingHardwareAction || pendingHardwareAction.id !== id) return false
  const invocation = pendingHardwareAction
  pendingHardwareAction = null
  if (pendingHardwareActionTimer) clearTimeout(pendingHardwareActionTimer)
  pendingHardwareActionTimer = null
  if (!allow) {
    hardwareProfiles.resolveConfirmation(invocation.slot, false)
    return false
  }
  try {
    const result = await executeHardwareAssignment(invocation)
    hardwareProfiles.resolveConfirmation(invocation.slot, true, result, result === false ? 'Action unavailable' : `${invocation.assignment.label} confirmed`)
    return result
  } catch (error) {
    hardwareProfiles.resolveConfirmation(invocation.slot, true, false, error.message)
    throw error
  }
})
ipcMain.handle('hardware-export-template', async (_event, templateId) => {
  const manifest = hardwareProfiles.exportTemplate(String(templateId || ''))
  const result = await dialog.showSaveDialog(workspaceWin || win, {
    title: 'Export Ambientic hardware template',
    defaultPath: `${String(manifest.name || 'hardware-template').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'hardware-template'}.ambientic-hardware.json`,
    filters: [{ name: 'Ambientic hardware template', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { exported: false }
  await writeFile(result.filePath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  return { exported: true, path: result.filePath }
})
ipcMain.handle('hardware-import-template', async () => {
  const result = await dialog.showOpenDialog(workspaceWin || win, {
    title: 'Import Ambientic hardware template',
    properties: ['openFile'],
    filters: [{ name: 'Ambientic hardware template', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  const details = await stat(result.filePaths[0])
  if (details.size > 2 * 1024 * 1024) throw new Error('Hardware templates must be smaller than 2 MB.')
  const manifest = JSON.parse(await readFile(result.filePaths[0], 'utf8'))
  return hardwareProfiles.importTemplate(manifest)
})
ipcMain.handle('context-list-projects', () => requireContextService(contextStore).listProjects())
ipcMain.handle('context-upsert-project', (_event, input = {}) => requireContextService(contextStore).upsertProject(input))
ipcMain.handle('context-infer-launch', (_event, input = {}) => requireContextService(contextEngine).inferLaunch(input))
ipcMain.handle('context-launch-access', (_event, cwd = '') => projectLaunchAccess(String(cwd || '')))
ipcMain.handle('context-get-binding', (_event, sessionId) => {
  const session = workspace?.sessionFor(String(sessionId || ''))
  if (!session) return null
  const providerId = workspace.providerSessionId(session)
  return contextEngine?.bindingFor(session.agent, providerId) || null
})
ipcMain.handle('context-rebind', (_event, sessionId, patch = {}) => {
  const session = workspace?.sessionFor(String(sessionId || ''))
  if (!session) throw new Error('This session is no longer available.')
  const providerId = workspace.providerSessionId(session)
  const binding = contextEngine?.bindingFor(session.agent, providerId)
  if (!binding) throw new Error('This session does not have an Ambientic context binding yet.')
  return contextEngine.rebind(binding.id, patch)
})
ipcMain.handle('memory-list', (_event, options = {}) => ({ memories: requireContextService(contextStore).listMemory(options) }))
ipcMain.handle('memory-search', (_event, options = {}) => ({ memories: requireContextService(contextEngine).searchAll({ query: options.query || '', limit: options.limit || 50 }) }))
ipcMain.handle('memory-remember', (_event, command = {}) => {
  if (command.id && !command.supersedesId) {
    const current = contextStore?.getMemory(command.id)
    if (current && command.content !== current.content) return contextEngine.supersede(command.id, command)
    if (current && command.status === 'active') return contextStore.updateMemoryStatus(command.id, 'active')
  }
  return contextEngine.remember(command)
})
ipcMain.handle('memory-forget', (_event, id) => contextEngine?.forget(String(id || '')) || false)
ipcMain.handle('memory-resolve-conflict', (_event, id, resolution = {}) => contextEngine?.resolveConflict(String(id || ''), resolution))
ipcMain.handle('memory-bootstrap-status', () => memoryBootstrap?.getState() || { status: 'unavailable', providers: [], items: [], summary: '', error: 'Memory setup is not available.' })
ipcMain.handle('memory-bootstrap-start', (_event, options = {}) => requireContextService(memoryBootstrap).start(options))
ipcMain.handle('memory-bootstrap-commit', (_event, options = {}) => requireContextService(memoryBootstrap).commit(options))
ipcMain.handle('memory-bootstrap-reset', () => memoryBootstrap?.reset() || { status: 'idle', providers: [], items: [] })
ipcMain.handle('tools-list-connections', () => ({ connections: requireContextService(capabilityGateway).listConnections() }))
ipcMain.handle('tools-upsert-connection', (_event, connection = {}) => requireContextService(capabilityGateway).upsertConnection(connection))
ipcMain.handle('tools-test-connection', (_event, id) => requireContextService(capabilityGateway).testConnection(String(id || '')))
ipcMain.handle('tools-disable-connection', (_event, id, options = {}) => requireContextService(capabilityGateway).disableConnection(String(id || ''), Boolean(options.disabled)))
ipcMain.handle('tools-disconnect', (_event, id) => requireContextService(capabilityGateway).disconnect(String(id || '')))
ipcMain.handle('tools-list-capabilities', (_event, connectionId = '') => ({ capabilities: contextStore?.listCapabilities({ connectionId: String(connectionId || '') }) || [] }))
ipcMain.handle('audit-list', (_event, options = {}) => ({ events: requireContextService(contextStore).listAudit({ limit: options.limit || 200, bindingId: options.bindingId || '', category: options.category || '' }).map((item) => ({ ...item, type: item.eventType, title: item.eventType.replaceAll('.', ' ') })) }))
ipcMain.handle('get-usage', () => usage.getState())
ipcMain.handle('get-consumption-ledger', () => consumptionLedger?.getState() || null)
ipcMain.handle('get-ambient-mode', () => ambientMode?.getState() || {
  enabled: false,
  startedAt: 0,
  nextCheckAt: 0,
  checkInDue: false,
  checkInMinutes: DEFAULT_AMBIENT_CHECK_IN_MINUTES
})
ipcMain.handle('set-ambient-mode', (_event, enabled) => ambientMode?.setEnabled(Boolean(enabled)))
ipcMain.handle('continue-ambient-mode', () => ambientMode?.continue())
ipcMain.handle('set-ambient-mode-check-in', (_event, minutes) => {
  const state = ambientMode?.setCheckInMinutes(minutes)
  if (state) savePrefs({ ...loadPrefs(), ambientModeCheckInMinutes: state.checkInMinutes })
  return state
})
ipcMain.handle('refresh-usage', () => usage.refresh(true))
ipcMain.handle('get-connectors', () => connectors.length ? connectors : refreshConnectors())
ipcMain.handle('refresh-connectors', () => refreshConnectors())
ipcMain.handle('get-provider-auth', () => Object.fromEntries(providerAuthState))
ipcMain.handle('dismiss-provider-auth', (_event, provider) => providerAuthState.delete(String(provider || '')))
ipcMain.handle('get-onboarding', () => {
  const value = loadPrefs().onboarding
  return value && typeof value === 'object'
    ? { completed: false, step: 0, name: '', memoryConsent: false, providerMemoryConsent: false, providerMemoryImportedAt: null, ...value }
    : { completed: false, step: 0, name: '', memoryConsent: false, providerMemoryConsent: false, providerMemoryImportedAt: null }
})
ipcMain.handle('save-onboarding', (_event, patch = {}) => {
  const prefs = loadPrefs()
  const current = prefs.onboarding && typeof prefs.onboarding === 'object' ? prefs.onboarding : {}
  const onboarding = {
    completed: Boolean(patch.completed ?? current.completed),
    step: Math.max(0, Math.min(4, Number(patch.step ?? current.step) || 0)),
    name: String(patch.name ?? current.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 48),
    memoryConsent: Boolean(patch.memoryConsent ?? current.memoryConsent),
    providerMemoryConsent: Boolean(patch.providerMemoryConsent ?? current.providerMemoryConsent),
    providerMemoryImportedAt: patch.providerMemoryImportedAt ?? current.providerMemoryImportedAt ?? null,
    completedAt: patch.completed ? Date.now() : (current.completedAt || null)
  }
  savePrefs({ ...prefs, onboarding })
  return onboarding
})
ipcMain.handle('reset-onboarding', () => {
  const prefs = loadPrefs()
  const onboarding = { completed: false, step: 0, name: '', memoryConsent: false, providerMemoryConsent: false, providerMemoryImportedAt: null }
  savePrefs({ ...prefs, onboarding })
  try { memoryBootstrap?.reset() } catch {}
  return onboarding
})
ipcMain.handle('get-handovers', () => handovers?.list() || [])
ipcMain.handle('generate-handover', (_event, sessionId) => handovers.generate(sessionId))
ipcMain.handle('continue-handover', async (_event, sessionId, targetProvider) => {
  const result = await handovers.continueWith(sessionId, targetProvider)
  showWorkspace(result.targetSessionId)
  return result
})
ipcMain.handle('open-agent-setup', (_event, agentId) => openAgentTerminal(agentId))
ipcMain.handle('connect-provider', async (_event, agentId, options = {}) => {
  if (agentId === 'codex') {
    const result = await workspace.connectCodexAccount()
    await shell.openExternal(result.authUrl)
    pushProviderAuth({ provider: 'codex', status: 'waiting', loginId: result.loginId })
    verifyCodexLogin(result.loginId)
    return { provider: 'codex', mode: 'browser', loginId: result.loginId }
  }
  if (agentId === 'claude') {
    if (options.method === 'terminal') {
      const opened = await openAgentSetup('claude')
      return { provider: 'claude', mode: 'terminal', opened }
    }
    showWorkspace()
    const path = connectors.find((item) => item.id === 'claude')?.path
    if (!path) throw new Error('Claude Code is not installed.')
    if (!claudeAuth) {
      claudeAuth = new ClaudeAuthService({
        path,
        helperPath: app.isPackaged ? join(process.resourcesPath, 'claude_pty.py') : join(app.getAppPath(), 'resources', 'claude_pty.py'),
        onUrl: async (value) => {
          try {
            const url = new URL(value)
            await shell.openExternal(url.toString())
          } catch {}
        }
      })
      claudeAuth.on('change', async (state) => {
        pushProviderAuth(state)
        if (state.status === 'connected') {
          showWorkspace()
          await refreshConnectors()
          await usage.refresh(true)
          pushUsage()
          pushProviderAuth({
            ...state,
            usageReady: Boolean(usage.getState()?.providers?.claude?.windows?.length)
          })
        }
      })
    }
    await claudeAuth.start({ method: options.method === 'console' ? 'console' : 'subscription' })
    return { provider: 'claude', mode: 'embedded', method: claudeAuth.getState().method }
  }
  const opened = await openAgentSetup(agentId)
  return { opened, agentId, provider: agentId, mode: 'terminal' }
})
ipcMain.handle('claude-auth-input', (_event, input) => claudeAuth?.input(input) || false)
ipcMain.handle('claude-auth-cancel', () => claudeAuth?.cancel() || false)
ipcMain.handle('get-midi', () => midiController?.getStatus() || { connected: false, model: 'Akai APC controller' })
ipcMain.handle('midi-set-profile', (_event, profileId) => midiController?.setProfile(profileId) || false)
ipcMain.handle('midi-vibe', () => midiController?.triggerVibe() || false)
ipcMain.handle('midi-learn', (_event, actionId) => midiController?.learn(actionId) || false)
ipcMain.handle('midi-cancel-learn', () => { midiController?.cancelLearn(); return true })
ipcMain.handle('midi-clear-action', (_event, actionId) => midiController?.clearAction(actionId) || false)
ipcMain.handle('midi-reset-mappings', () => { midiController?.resetMappings(); return true })
ipcMain.handle('get-thread', (_event, id) => workspace.read(id))
ipcMain.handle('rename-thread', async (_event, id, title) => {
  const result = await workspace.rename(id, title)
  sendToWindows('workspace-threads', await workspace.list())
  return result
})
ipcMain.handle('choose-thread-context', async () => {
  const result = await dialog.showOpenDialog(workspaceWin || win, {
    title: 'Attach files or folders',
    buttonLabel: 'Attach',
    properties: ['openFile', 'openDirectory', 'multiSelections']
  })
  if (result.canceled) return []
  return result.filePaths.slice(0, 12).map((path) => ({ path }))
})
ipcMain.handle('choose-project-folder', async () => {
  const result = await dialog.showOpenDialog(workspaceWin || win, {
    title: 'Choose a project folder',
    buttonLabel: 'Use this folder',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? '' : (result.filePaths[0] || '')
})
ipcMain.handle('get-recent-projects', async () => {
  await workspace.list()
  return workspace.recentProjects()
})
ipcMain.handle('get-provider-task-options', (_event, provider) => workspace.taskOptions(String(provider || '')))
ipcMain.handle('send-thread-prompt', (_event, id, text, options = {}) => workspace.send(id, text, options))
ipcMain.handle('interrupt-thread', (_event, id) => workspace.interrupt(id))
ipcMain.handle('create-managed-thread', (_event, options) => workspace.create(options || {}))
ipcMain.handle('resolve-approval', (_event, id, allow, remember) => workspace.resolveApproval(id, allow, remember))
ipcMain.handle('copy-text', (_event, text) => {
  clipboard.writeText(String(text || '').slice(0, 2 * 1024 * 1024))
  return true
})
ipcMain.handle('open-external-url', (_event, value) => {
  const url = normalizeExternalUrl(value)
  if (!url) return false
  return shell.openExternal(url).then(() => true)
})
ipcMain.handle('show-controller', () => { win.showInactive(); return true })
ipcMain.handle('hide-controller', () => {
  if (!win || win.isDestroyed()) return false
  win.hide()
  return true
})
ipcMain.handle('show-workspace', (_event, id) => showWorkspace(id))
ipcMain.handle('open-artifact', async (_event, id, path) => {
  // Artifact paths are self-reported by the agent transcript, so never hand
  // shell.openPath a location outside that thread's own working directory —
  // a prompt-injected agent could otherwise get the user to click-launch an
  // arbitrary file or executable elsewhere on disk.
  const session = workspace.sessionFor(String(id || ''))
  const cwd = session?.cwd ? resolve(String(session.cwd)) : ''
  if (!cwd) return false
  const requested = resolve(String(path || ''))
  let target
  try { target = await realpath(requested) } catch { target = requested }
  if (target !== cwd && !target.startsWith(`${cwd}${sep}`)) return false
  return shell.openPath(target)
})
ipcMain.handle('present-preview', (_event, id) => presentWorkspacePreview(id))

function accessibilityGranted (prompt = false) {
  try { return systemPreferences.isTrustedAccessibilityClient(prompt) } catch { return true }
}

function openAccessibilitySettings () {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
}

function openScreenRecordingSettings () {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
}

function controllerDisplay () {
  if (!win || win.isDestroyed()) return null
  const display = screen.getDisplayMatching(win.getBounds())
  return { id: display.id, workArea: { ...display.workArea } }
}

function orderedDisplays () {
  return screen.getAllDisplays().sort((left, right) => (
    left.workArea.x - right.workArea.x || left.workArea.y - right.workArea.y
  ))
}

function displayTopology () {
  const displays = orderedDisplays()
  const controller = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : screen.getPrimaryDisplay()
  const preferredId = loadPrefs().previewDisplayId
  const availablePreview = displays.find((display) => display.id === preferredId && display.id !== controller.id) ||
    displays.find((display) => display.id !== controller.id) || null

  return {
    controllerDisplayId: controller.id,
    previewDisplayId: availablePreview?.id ?? null,
    displays: displays.map((display, index) => ({
      id: display.id,
      index: index + 1,
      label: display.label || (display.id === screen.getPrimaryDisplay().id ? 'Main display' : `Display ${index + 1}`),
      controller: display.id === controller.id,
      preview: display.id === availablePreview?.id,
      workArea: { ...display.workArea }
    }))
  }
}

function previewDisplay () {
  const topology = displayTopology()
  const display = topology.displays.find((candidate) => candidate.id === topology.previewDisplayId)
  return display ? { id: display.id, workArea: { ...display.workArea } } : null
}

function workspacePreviewDisplay () {
  if (!workspaceWin || workspaceWin.isDestroyed()) return null
  const display = screen.getDisplayMatching(workspaceWin.getBounds())
  const area = display.workArea
  const gap = 10
  const width = Math.max(420, Math.floor(area.width * 0.46))
  return {
    id: display.id,
    workArea: {
      x: area.x + area.width - width - gap,
      y: area.y,
      width,
      height: area.height
    }
  }
}

function setPreviewDisplay (displayId) {
  const topology = displayTopology()
  const valid = topology.displays.some((display) => display.id === displayId && !display.controller)
  if (!valid) return false
  savePrefs({ ...loadPrefs(), previewDisplayId: displayId })
  pushDisplays()
  return true
}

async function focusById (id) {
  const s = store.list().find((x) => x.id === id)
  if (!s) return { ok: false, reason: 'not-found' }
  store.acknowledge(id)

  if (s.deepLink) {
    await shell.openExternal(s.deepLink)
    lastFocusedSessionId = id
    midiController?.select(id)
    return { ok: true, via: 'provider-deep-link' }
  }

  // AX window control requires Accessibility permission for THIS app (in dev:
  // "Electron"). If it's missing, prompt + open the pane instead of silently
  // failing — the raise/frontmost calls just no-op without it.
  if (!accessibilityGranted(false)) {
    accessibilityGranted(true) // shows the system prompt with an "Open Settings" button
    openAccessibilitySettings()
    console.log('[focus] blocked — Accessibility not granted for this app')
    return { ok: false, permission: true }
  }

  // The first tap arranges this pad's preview. A repeat tap on the selected
  // pad only refocuses its terminal, so a correct browser route cannot be
  // replaced or reloaded by another context-ranking pass.
  const companion = lastFocusedSessionId === id
    ? { ok: true, skipped: 'already-focused', results: [] }
    : await companions.present(s, previewDisplay())
  const res = await focusSession(s, controllerDisplay())
  if (!res.ok && res.reason === 'terminal-not-found') {
    store.remove(id)
    return { ...res, reason: 'session-ended' }
  }
  console.log(`[focus] "${s.project}" pid=${s.term_pid} cwd=${s.cwd} -> via=${res.via} ok=${res.ok}${res.error ? ' err=' + res.error : ''}`)
  if (!res.ok && res.permission) { accessibilityGranted(true); openAccessibilitySettings() }
  if (res.ok) lastFocusedSessionId = id
  if (res.ok) midiController?.select(id)
  return { ...res, companion }
}

// Prevent rapid clicks (or an external focus request) from launching competing
// AppleScripts that fight over the frontmost terminal.
let focusQueue = Promise.resolve()
function queueFocus (id) {
  const next = focusQueue.catch(() => {}).then(() => focusById(id))
  focusQueue = next
  return next
}

async function captureById (id) {
  const s = store.list().find((candidate) => candidate.id === id)
  if (!s) return { ok: false, reason: 'not-found' }
  if (!accessibilityGranted(false)) {
    accessibilityGranted(true)
    openAccessibilitySettings()
    return { ok: false, permission: 'accessibility' }
  }

  const captureDisplay = previewDisplay() || controllerDisplay()
  // The linked preview normally lives on another display, so the controller
  // never needs to hide or change opacity while the screenshot is taken.
  // Keeping this window untouched avoids the distracting disappear/reappear
  // flash and preserves its always-visible hardware-controller behavior.
  const captured = await companions.capture(s, captureDisplay, join(app.getPath('userData'), 'captures'))

  const images = (captured?.results || []).filter((result) => result.captured && result.path)
  if (!images.length) {
    let status = 'granted'
    try { status = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted' } catch {}
    if (status !== 'granted') openScreenRecordingSettings()
    return { ok: false, reason: captured?.reason || captured?.results?.[0]?.reason || 'capture-failed', screenPermission: status }
  }

  const focused = await focusSession(s, controllerDisplay())
  if (!focused.ok) return { ...focused, reason: focused.reason || 'focus-failed' }
  for (const capture of images) {
    const image = nativeImage.createFromPath(capture.path)
    if (image.isEmpty()) return { ok: false, reason: 'invalid-screenshot' }
    clipboard.writeImage(image)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const pasted = await pasteClipboardImage()
    if (!pasted.ok) return { ...pasted, reason: 'paste-failed' }
    await new Promise((resolve) => setTimeout(resolve, 180))
  }

  lastFocusedSessionId = id
  return { ok: true, count: images.length, paths: images.map((image) => image.path) }
}

async function sendVoicePrompt (id, text) {
  const session = store.list().find((candidate) => candidate.id === id)
  if (!session) throw new Error('The selected agent is no longer available.')

  // Provider-managed and Codex desktop sessions can receive the prompt
  // directly through the normalized workspace bridge. Live terminal sessions
  // remain safest through their existing interactive process.
  if (!session.tty) {
    await workspace.send(id, text)
    showWorkspace(id)
    return { ok: true, via: 'workspace' }
  }

  const focused = await queueFocus(id)
  if (!focused?.ok) throw new Error('Could not focus the selected agent.')
  if (session.deepLink) await new Promise((resolve) => setTimeout(resolve, 500))
  clipboard.writeText(text)
  const pasted = await pasteClipboardText()
  if (!pasted.ok) throw new Error('Could not paste the transcript into the selected agent.')
  const submitted = await submitTerminalPrompt()
  if (!submitted.ok) throw new Error('Could not submit the transcript to the selected agent.')
  return { ok: true, via: 'terminal' }
}

async function startVoicePrompt (sessionId = lastFocusedSessionId) {
  if (!voiceInput) return false
  if (voiceInput.getStatus().transcribing) throw new Error('The previous voice prompt is still transcribing.')
  try {
    const selected = store.list().find((session) => session.id === sessionId)
    if (!selected) throw new Error('Select a live agent pad before recording a prompt.')
    if (voiceInput.getStatus().recording) return { ok: true, recording: true, sessionId }
    if (process.platform === 'darwin') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      if (!granted) throw new Error('Microphone permission is required for voice prompts.')
    }
    return voiceInput.start(sessionId)
  } catch (error) {
    voiceInput.reportError(error)
    throw error
  }
}

async function stopVoicePrompt () {
  if (!voiceInput) return false
  try { return await voiceInput.stop() } catch (error) { voiceInput.reportError(error); throw error }
}

async function toggleVoicePrompt () {
  return voiceInput?.getStatus().recording ? stopVoicePrompt() : startVoicePrompt()
}

function queueCapture (id) {
  const next = focusQueue.catch(() => {}).then(() => captureById(id))
  focusQueue = next
  return next
}

function relativeSession (direction, predicate = () => true) {
  const sessions = store.list().filter(predicate)
  if (!sessions.length) return null
  const index = sessions.findIndex((session) => session.id === lastFocusedSessionId)
  const next = index < 0 ? 0 : (index + direction + sessions.length) % sessions.length
  return sessions[next]
}

async function handleMidiAction (actionId) {
  const selected = store.list().find((session) => session.id === lastFocusedSessionId)
  if (actionId === 'focus-next') { const session = relativeSession(1); return session ? queueFocus(session.id) : false }
  if (actionId === 'focus-previous') { const session = relativeSession(-1); return session ? queueFocus(session.id) : false }
  if (actionId === 'focus-next-attention') {
    const session = relativeSession(1, (candidate) => candidate.state !== STATE.RUNNING)
    return session ? queueFocus(session.id) : false
  }
  if (actionId === 'focus-selected') return selected ? queueFocus(selected.id) : false
  if (actionId === 'acknowledge-selected') { if (selected) store.acknowledge(selected.id); return Boolean(selected) }
  if (actionId === 'capture-selected') return selected ? queueCapture(selected.id) : false
  if (actionId.startsWith('launch-')) return openAgentTerminal(actionId.slice('launch-'.length))
  if (actionId === 'toggle-controller') {
    if (!win || win.isDestroyed()) return false
    if (win.isVisible()) win.hide()
    else win.showInactive()
    return true
  }
  return false
}

function selectedHardwareSession (targetId = '') {
  return workspace?.sessionFor(targetId) || workspace?.sessionFor(lastFocusedSessionId) || null
}

async function executeHardwareAssignment ({ assignment }) {
  const actionId = assignment.actionId
  if (actionId === 'ambientic.overview') { showWorkspace(); sendToWindows('hardware-navigate', { view: 'overview' }); return true }
  if (actionId === 'ambientic.hardware') { showWorkspace(); sendToWindows('hardware-navigate', { view: 'hardware' }); return true }
  if (actionId === 'ambientic.toggle-window') {
    if (!workspaceWin || workspaceWin.isDestroyed()) return showWorkspace()
    if (workspaceWin.isVisible()) workspaceWin.hide()
    else showWorkspace()
    return true
  }
  if (actionId === 'ambientic.vibe') return midiController?.triggerVibe() || false
  if (actionId === 'session.focus-next') return handleMidiAction('focus-next')
  if (actionId === 'session.focus-previous') return handleMidiAction('focus-previous')
  if (actionId === 'session.capture-selected') return handleMidiAction('capture-selected')
  if (actionId === 'thread.open-next-attention') {
    const session = relativeSession(1, (candidate) => ['waiting', 'attention'].includes(candidate.state))
    return session ? selectWorkspaceSession(session.id) : false
  }
  if (actionId === 'thread.open-latest-provider') {
    const session = (await workspace.list()).find((candidate) => candidate.agent === assignment.targetId)
    return session ? selectWorkspaceSession(session.id) : false
  }
  if (actionId === 'thread.open') return assignment.targetId ? selectWorkspaceSession(assignment.targetId) : false
  if (actionId === 'thread.send-prompt') {
    const session = selectedHardwareSession(assignment.targetId)
    if (!session || !assignment.prompt) return false
    await workspace.send(session.id, assignment.prompt)
    return true
  }
  if (actionId === 'thread.interrupt') {
    const session = selectedHardwareSession(assignment.targetId)
    return session ? workspace.interrupt(session.id) : false
  }
  if (['thread.approve-pending', 'thread.deny-pending'].includes(actionId)) {
    const session = selectedHardwareSession(assignment.targetId)
    if (!session) return false
    const snapshot = await workspace.read(session.id)
    const approval = snapshot?.approvals?.find((item) => item.status === 'pending') || snapshot?.approvals?.[0]
    if (!approval) return false
    return workspace.resolveApproval(approval.id, actionId === 'thread.approve-pending', false)
  }
  if (actionId === 'provider.start-thread') {
    const sessionId = await workspace.create({ provider: assignment.targetId || assignment.provider, prompt: assignment.prompt || '' })
    return selectWorkspaceSession(sessionId)
  }
  if (actionId === 'skill.start-thread') {
    const provider = assignment.provider || 'codex'
    const skill = assignment.targetLabel || assignment.targetId
    const prompt = [`Use the ${skill} skill for this task.`, assignment.prompt].filter(Boolean).join('\n\n')
    const sessionId = await workspace.create({ provider, prompt })
    return selectWorkspaceSession(sessionId)
  }
  if (actionId === 'goal.open') { showWorkspace(); sendToWindows('hardware-navigate', { view: 'goals', targetId: assignment.targetId }); return true }
  if (actionId === 'workflow.open') { showWorkspace(); sendToWindows('hardware-navigate', { view: 'workflows', targetId: assignment.targetId }); return true }
  if (actionId === 'workflow.run') return workflows?.startRun(assignment.targetId, { source: 'hardware' }) || false
  return false
}

async function invokeHardwareAssignment (invocation) {
  if (invocation.definition?.permission === 'confirm') {
    if (pendingHardwareAction) throw new Error('Finish the current hardware confirmation before triggering another action.')
    pendingHardwareAction = { id: randomUUID(), ...invocation, createdAt: Date.now() }
    const confirmationId = pendingHardwareAction.id
    pendingHardwareActionTimer = setTimeout(() => {
      if (pendingHardwareAction?.id !== confirmationId) return
      const expired = pendingHardwareAction
      pendingHardwareAction = null
      pendingHardwareActionTimer = null
      hardwareProfiles?.resolveConfirmation(expired.slot, false, false, 'Confirmation expired')
      sendToWindows('hardware-confirmation-expired', { id: confirmationId })
    }, 30_000)
    if (pendingHardwareActionTimer.unref) pendingHardwareActionTimer.unref()
    showWorkspace()
    sendToWindows('hardware-confirmation', {
      id: pendingHardwareAction.id,
      label: invocation.assignment.label,
      actionId: invocation.assignment.actionId,
      targetLabel: invocation.assignment.targetLabel,
      source: invocation.source
    })
    return { pending: true }
  }
  return executeHardwareAssignment(invocation)
}

ipcMain.handle('focus', (_e, id) => queueFocus(id))
ipcMain.handle('select-session', (_event, id) => {
  const session = store.list().find((candidate) => candidate.id === id)
  if (!session) {
    lastFocusedSessionId = null
    midiController?.select(null)
    return false
  }
  lastFocusedSessionId = id
  midiController?.select(id)
  return true
})
ipcMain.handle('get-voice', () => voiceStatus())
ipcMain.handle('toggle-voice', () => toggleVoicePrompt())
ipcMain.handle('capture-preview', (_e, id) => queueCapture(id))
ipcMain.handle('get-displays', () => displayTopology())
ipcMain.handle('get-companions', () => companions.getState())
ipcMain.handle('toggle-companion', (_e, id) => {
  const session = store.list().find((candidate) => candidate.id === id)
  if (!session) return false
  companions.toggleEnabled(session)
  return true
})
ipcMain.handle('show-display-menu', () => {
  const topology = displayTopology()
  const choices = topology.displays.filter((display) => !display.controller)
  const template = choices.length
    ? choices.map((display) => ({
        label: `Preview on ${display.label} (Display ${display.index})`,
        type: 'radio',
        checked: display.id === topology.previewDisplayId,
        click: () => setPreviewDisplay(display.id)
      }))
    : [{ label: 'Connect another display for previews', enabled: false }]
  Menu.buildFromTemplate(template).popup({ window: win })
  return true
})
ipcMain.handle('show-companion-menu', async (_e, id) => {
  const session = store.list().find((candidate) => candidate.id === id)
  if (!session) return false
  await companions.refresh()
  const state = companions.sessionState(session)
  const typeLabel = { browser: 'Browser', ios: 'iOS', android: 'Android' }
  const template = [
    {
      label: 'Use automatic links',
      type: 'radio',
      checked: state.mode === 'auto',
      click: () => companions.useAutomatic(session)
    },
    { type: 'separator' },
    ...(state.candidates.length
      ? state.candidates.map((candidate) => ({
          label: `${typeLabel[candidate.type] || 'Preview'}: ${candidate.label}${candidate.confidence === 'automatic' ? ' (matched)' : ''}`,
          sublabel: candidate.detail,
          type: 'checkbox',
          checked: candidate.selected,
          click: () => companions.toggle(session, candidate.id)
        }))
      : [{ label: 'No localhost tabs or emulators detected', enabled: false }]),
    { type: 'separator' },
    { label: 'Scan again', click: () => companions.refresh() }
  ]
  Menu.buildFromTemplate(template).popup({ window: win })
  return true
})

ipcMain.handle('request-accessibility', () => {
  accessibilityGranted(true)
  openAccessibilitySettings()
  return true
})

ipcMain.handle('dismiss', (_e, id) => { store.remove(id); return true })
ipcMain.handle('install-hooks', () => { runInstaller(); return true })
ipcMain.on('resize', (_e, height) => resizeTo(height))
ipcMain.on('manual-resize-start', (_e, edge) => {
  if (!win || win.isDestroyed() || !['left', 'right'].includes(edge)) return
  stopPointerResize()
  const startPoint = screen.getCursorScreenPoint()
  pointerResize = {
    edge,
    bounds: win.getBounds(),
    startPoint,
    lastPoint: startPoint,
    lastMovedAt: Date.now(),
    timer: null
  }
  savePrefs({ ...loadPrefs(), manualSize: true })
  pointerResize.timer = setInterval(updatePointerResize, 20)
  if (pointerResize.timer.unref) pointerResize.timer.unref()
})
ipcMain.on('manual-resize-end', stopPointerResize)

// ── lifecycle ───────────────────────────────────────────────────────────────
store.on('change', () => pushState())
store.on('change', () => pushCompanions())
store.on('change', () => midiController?.render())
store.on('task-cache', (records) => saveTaskCache(records))
usage.on('change', (state) => {
  pushUsage()
  consumptionLedger?.observe(state)
  void handovers?.evaluate(state)
})
companions.on('change', () => pushCompanions())

app.whenReady().then(() => {
  if (!isPrimaryInstance) return
  const prefs = loadPrefs()
  ambientMode = new AmbientModeService({
    blocker: powerSaveBlocker,
    checkInMinutes: prefs.ambientModeCheckInMinutes
  })
  // Persist from the change event rather than the IPC handler so the tray
  // toggle and every future caller are covered by the same write.
  ambientMode.on('change', (state) => {
    sendToWindows('ambient-mode', state)
    tray?.setContextMenu(buildTrayMenu())
    const current = loadPrefs()
    if (current.ambientModeEnabled !== state.enabled || current.ambientModeCheckInMinutes !== state.checkInMinutes) {
      savePrefs({ ...current, ambientModeEnabled: state.enabled, ambientModeCheckInMinutes: state.checkInMinutes })
    }
  })
  // Ambient mode is meant to survive a relaunch or auto-update; without this the
  // toggle silently reads false on every start.
  if (prefs.ambientModeEnabled) ambientMode.enable()
  powerMonitor.on('resume', () => ambientMode?.reassert())
  store.hydrateTasks(loadTaskCache())
  if (app.dock) {
    const logoPath = app.isPackaged
      ? join(process.resourcesPath, 'ambientic-logo.png')
      : join(app.getAppPath(), 'resources', 'ambientic-logo.png')
    if (existsSync(logoPath)) app.dock.setIcon(nativeImage.createFromPath(logoPath))
    app.dock.show()
  }
  const loginItem = ensureLaunchAtLoginPreference()
  goals = createGoalsRepository({ file: join(app.getPath('userData'), 'goals.json') })
  goals.on('change', (snapshot) => sendToWindows('goals', snapshot))
  career = createCareerOsRepository({ file: join(app.getPath('userData'), 'career-os.json') })
  career.on('change', (snapshot) => sendToWindows('career-os', snapshot))
  try {
    contextStore = createContextStore({ file: join(app.getPath('userData'), 'ambientic-context.db') })
    contextEngine = createContextEngine({
      store: contextStore,
      goals,
      career,
      consent: () => Boolean(loadPrefs().onboarding?.memoryConsent)
    })
    capabilityGateway = createCapabilityGateway({
      store: contextStore,
      contextEngine,
      goals,
      career,
      jobDiscovery: discoverCareerJobs,
      workflows: () => workflows?.list(),
      socketPath: join(app.getPath('userData'), 'ambientic-gateway.sock'),
      requestApproval: (request) => workspace?.requestGatewayApproval(request) || false
    })
    capabilityGateway.start()
  } catch (error) {
    contextStartupError = error.message
    console.error(`[ambientic] context database unavailable; preserved for recovery: ${error.message}`)
  }
  workspace = new WorkspaceService(store, () => connectors, {
    aliases: prefs.threadAliases,
    onAliasesChange: (threadAliases) => savePrefs({ ...loadPrefs(), threadAliases }),
    contextEngine,
    capabilityGateway,
    gatewayExecutable: process.execPath,
    gatewayShimPath: app.isPackaged ? join(process.resourcesPath, 'ambientic-mcp-shim.mjs') : join(app.getAppPath(), 'resources', 'ambientic-mcp-shim.mjs')
  })
  if (contextEngine) {
    memoryBootstrap = createMemoryBootstrapService({ workspace, contextEngine, contextStore, connectors: () => connectors })
    memoryBootstrap.on('change', (state) => sendToWindows('memory-bootstrap', state))
  }
  workflows = createWorkflowsRepository({
    file: join(app.getPath('userData'), 'workflows.json'),
    connectors: () => connectors,
    executeAgentStep: async ({ provider, prompt, workflow }) => ({
      sessionId: await workspace.create({ provider, prompt, gatewayScopes: workflow.packId === CAREER_OS_PACK.id ? CAREER_OS_GATEWAY_SCOPES : null })
    })
  })
  workflows.on('change', (snapshot) => sendToWindows('workflows', snapshot))
  const existingCareerSetup = workflows.packSetup(CAREER_OS_PACK.id)
  if (!career.list().configured && existingCareerSetup) career.configure(existingCareerSetup)
  hardwareProfiles = createHardwareProfileService({
    file: join(app.getPath('userData'), 'hardware-profiles.json'),
    invoke: invokeHardwareAssignment
  })
  hardwareProfiles.on('change', (snapshot) => { sendToWindows('hardware-profiles', snapshot); midiController?.render() })
  consumptionLedger = createConsumptionLedger({ file: join(app.getPath('userData'), 'consumption-ledger.json') })
  consumptionLedger.on('change', (state) => sendToWindows('consumption-ledger', state))
  handovers = new HandoverService({ workspace, usage })
  handovers.on('change', (records) => sendToWindows('handovers', records))
  workspace.on('change', (snapshot) => {
    sendToWindows('thread', snapshot)
    workflows?.handleThread(snapshot)
    scheduleWorkspaceThreads()
  })
  workspace.on('provider-auth', async (payload) => {
    if (payload.loginId && payload.loginId === pendingCodexLogin && ['connected', 'failed'].includes(payload.status)) pendingCodexLogin = ''
    await refreshConnectors()
    pushProviderAuth(payload)
  })
  createWindow()
  createWorkspaceWindow()
  createTray()
  voiceInput = createVoiceInput({
    tempRoot: app.getPath('temp'),
    onTranscript: sendVoicePrompt
  })
  voiceInput.onStatus((status) => {
    midiController?.setVoiceActive(status.recording)
    pushVoice()
  })
  midiController = createMidiController(store, {
    onPadPress: selectWorkspaceSession,
    onAction: handleMidiAction,
    onControl: (control) => hardwareProfiles?.handleInput(control) || false,
    getFeedback: () => hardwareProfiles?.feedback() || null,
    onRecordStart: startVoicePrompt,
    onRecordStop: stopVoicePrompt,
    onRecordUnavailable: ({ column }) => {
      voiceInput?.reportError(new Error(`Record Arm ${column + 1} has no selected live agent. Select a blue, green, or red APC pad in that column first.`))
    },
    selectedProfile: prefs.midiProfile || 'auto',
    mappings: prefs.apc40Mappings,
    mappingsByProfile: prefs.midiMappings,
    onPreferencesChange: ({ selectedProfile, mappingsByProfile }) => savePrefs({
      ...loadPrefs(),
      midiProfile: selectedProfile,
      midiMappings: mappingsByProfile
    })
  })
  midiController.onStatus((status) => {
    console.log(`[midi] ${status.shortModel || 'APC controller'} ${status.connected ? `connected: ${status.device}` : `disconnected${status.error ? `: ${status.error}` : ''}`}`)
    tray?.setContextMenu(buildTrayMenu())
    pushMidi()
  })
  midiController.start()
  pushVoice()
  void refreshConnectors().then(() => workflows?.startScheduler())
  startServer(store, {
    // An isolated profile is a parallel developer smoke, not the provider-hook
    // endpoint. Give it an ephemeral loopback port so the installed app keeps
    // ownership of the canonical 47600 bridge.
    port: explicitStateDirectory ? 0 : undefined,
    focusById: queueFocus,
    onApprovalRequest: (event, sessionId) => workspace.requestExternalApproval('claude', event, sessionId),
    onTaskText: (id, text) => {
      store.updateContext(id, text)
      summarizer.enqueue(id, text)
    }
  })
  discovery = startDiscovery(store)
  companions.start()
  usage.start()
  console.log(`[ambientic] accessibility granted: ${accessibilityGranted(false)}`)
  console.log(`[ambientic] launch at login: ${loginItem.openAtLogin} (${loginItem.status})`)
  // Reflect permission changes (user granting it in Settings) into the UI.
  const sysTimer = setInterval(pushSys, 3000)
  if (sysTimer.unref) sysTimer.unref()
  const historyTimer = setInterval(() => pushWorkspaceThreads(true), 30_000)
  if (historyTimer.unref) historyTimer.unref()
  screen.on('display-added', pushDisplays)
  screen.on('display-removed', pushDisplays)
  screen.on('display-metrics-changed', pushDisplays)
})

// Tray app — closing the window doesn't quit.
app.on('second-instance', () => {
  if (isPrimaryInstance) showWorkspace()
})
app.on('window-all-closed', (e) => { e.preventDefault?.() })
app.on('activate', () => showWorkspace())
app.on('before-quit', () => { app.isQuitting = true; stopPointerResize(); if (workspaceListTimer) clearTimeout(workspaceListTimer); ambientMode?.stop(); discovery?.stop(); voiceInput?.dispose(); midiController?.stop(); workspace?.stop(); capabilityGateway?.stop(); contextStore?.close(); workflows?.stopScheduler(); claudeAuth?.stop(); companions.stop(); usage.stop() })
