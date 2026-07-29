import { app, BrowserWindow, Tray, Menu, clipboard, dialog, ipcMain, nativeImage, powerSaveBlocker, screen, shell, systemPreferences } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { cpSync, existsSync, readdirSync } from 'node:fs'
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
import { AmbientModeService, DEFAULT_AMBIENT_CHECK_IN_MINUTES } from './ambient-mode.mjs'
import { readBuildInfo } from './build-info.mjs'

// Widen PATH before any provider CLI (or its node-based hooks) is spawned. A
// Finder-launched app otherwise only has launchd's minimal PATH, which lacks
// Homebrew/nvm node and breaks Claude Code plugin hooks.
ensureEnhancedPath()

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

// A disposable state directory makes first-run replayable without touching the
// user's real data. Keep the old variable as a compatibility alias.
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

const DEFAULT_WIDTH = 232
const MIN_WIDTH = 232
const MIN_HEIGHT = 220
const MARGIN = 16
const ZOOM_STEPS = [0.9, 1, 1.15, 1.3, 1.5, 1.75]
const store = new SessionStore()
const summarizer = createTaskSummarizer(store)
const usage = createUsageService()
const companions = createCompanionService(store)

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
let pendingWorkspaceSessionId = ''
let workspaceListTimer = null

function sendToWindows (channel, payload) {
  for (const target of [win, workspaceWin]) {
    if (target && !target.isDestroyed()) target.webContents.send(channel, payload)
  }
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
  const session = store.list().find((candidate) => candidate.id === id)
  if (!session) return { ok: false, reason: 'not-found' }
  store.acknowledge(id)
  lastFocusedSessionId = id
  midiController?.select(id)
  showWorkspace(id)
  const preview = await presentWorkspacePreview(id)
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
    ? { completed: false, step: 0, name: '', ...value }
    : { completed: false, step: 0, name: '' }
})
ipcMain.handle('save-onboarding', (_event, patch = {}) => {
  const prefs = loadPrefs()
  const current = prefs.onboarding && typeof prefs.onboarding === 'object' ? prefs.onboarding : {}
  const onboarding = {
    completed: Boolean(patch.completed ?? current.completed),
    step: Math.max(0, Math.min(3, Number(patch.step ?? current.step) || 0)),
    name: String(patch.name ?? current.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 48),
    completedAt: patch.completed ? Date.now() : (current.completedAt || null)
  }
  savePrefs({ ...prefs, onboarding })
  return onboarding
})
ipcMain.handle('reset-onboarding', () => {
  const prefs = loadPrefs()
  const onboarding = { completed: false, step: 0, name: '' }
  savePrefs({ ...prefs, onboarding })
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
ipcMain.handle('open-artifact', (_event, path) => shell.openPath(path))
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
  ambientMode.on('change', (state) => {
    sendToWindows('ambient-mode', state)
    tray?.setContextMenu(buildTrayMenu())
  })
  store.hydrateTasks(loadTaskCache())
  if (app.dock) {
    const logoPath = app.isPackaged
      ? join(process.resourcesPath, 'ambientic-logo.png')
      : join(app.getAppPath(), 'resources', 'ambientic-logo.png')
    if (existsSync(logoPath)) app.dock.setIcon(nativeImage.createFromPath(logoPath))
    app.dock.show()
  }
  const loginItem = ensureLaunchAtLoginPreference()
  workspace = new WorkspaceService(store, () => connectors, {
    aliases: prefs.threadAliases,
    onAliasesChange: (threadAliases) => savePrefs({ ...loadPrefs(), threadAliases })
  })
  consumptionLedger = createConsumptionLedger({ file: join(app.getPath('userData'), 'consumption-ledger.json') })
  consumptionLedger.on('change', (state) => sendToWindows('consumption-ledger', state))
  handovers = new HandoverService({ workspace, usage })
  handovers.on('change', (records) => sendToWindows('handovers', records))
  workspace.on('change', (snapshot) => {
    sendToWindows('thread', snapshot)
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
  void refreshConnectors()
  startServer(store, {
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
app.on('before-quit', () => { app.isQuitting = true; stopPointerResize(); if (workspaceListTimer) clearTimeout(workspaceListTimer); ambientMode?.stop(); discovery?.stop(); voiceInput?.dispose(); midiController?.stop(); workspace?.stop(); claudeAuth?.stop(); companions.stop(); usage.stop() })
