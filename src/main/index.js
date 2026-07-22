import { app, BrowserWindow, Tray, Menu, clipboard, ipcMain, nativeImage, screen, shell, systemPreferences } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { SessionStore, STATE } from './sessions.js'
import { startServer } from './server.js'
import { focusSession, pasteClipboardImage } from './focus.js'
import { startDiscovery } from './discovery.js'
import { createTaskSummarizer } from './summarizer.js'
import { createUsageService } from './usage.js'
import { createCompanionService } from './companions.js'
import { loadPrefs, savePrefs } from './prefs.js'
import { loadTaskCache, saveTaskCache } from './task-cache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
let tray = null
let discovery = null
let pointerResize = null
let lastFocusedSessionId = null

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
    console.error(`[claude-controller] could not update login item: ${error.message}`)
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
  if (rendererUrl) win.loadURL(rendererUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  win.once('ready-to-show', () => win.showInactive())

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

function pushState () {
  const list = store.list()
  if (win && !win.isDestroyed()) win.webContents.send('state', list)
  updateTray()
}

function pushSys () {
  if (win && !win.isDestroyed()) {
    win.webContents.send('sys', { accessibility: accessibilityGranted(false) })
  }
}

function pushUsage () {
  if (win && !win.isDestroyed()) win.webContents.send('usage', usage.getState())
}

function pushDisplays () {
  if (win && !win.isDestroyed()) win.webContents.send('displays', displayTopology())
}

function pushCompanions () {
  if (win && !win.isDestroyed()) win.webContents.send('companions', companions.getState())
}

function updateTray () {
  if (!tray) return
  const { worst, needy, total } = store.summary()
  const glyph = TRAY_GLYPH[worst] || '⚪️'
  tray.setTitle(total ? ` ${glyph}${needy || ''}` : ' ⚪️')
  tray.setToolTip(
    total
      ? `${total} session${total > 1 ? 's' : ''}${needy ? ` · ${needy} need you` : ''}`
      : 'Vibe Controller — no sessions'
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

function runInstaller () {
  const hookRoot = app.isPackaged
    ? join(process.resourcesPath, 'hook')
    : join(app.getAppPath(), 'hook')
  const script = join(hookRoot, 'install.sh')
  execFile('/bin/sh', [script], { timeout: 20_000 }, (err, stdout, stderr) => {
    const body = (stdout || '') + (stderr || '') + (err ? `\n${err.message}` : '')
    if (win && !win.isDestroyed()) {
      win.webContents.send('installer', { ok: !err, output: body.trim() })
    }
  })
}

function buildTrayMenu () {
  const loginItem = loginItemSettings()
  const zoom = savedZoom()
  return Menu.buildFromTemplate([
    { label: 'Show / Hide', click: () => (win.isVisible() ? win.hide() : win.showInactive()) },
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
    { label: 'Install / update agent hooks…', click: runInstaller },
    { label: 'Open hooks folder', click: () => shell.openPath(join(app.getPath('home'), '.claude-controller')) },
    { type: 'separator' },
    { label: 'Quit Vibe Controller', click: () => { app.isQuitting = true; app.quit() } }
  ])
}

function createTray () {
  tray = new Tray(TRAY_IMG)
  tray.setContextMenu(buildTrayMenu())
  updateTray()
}

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-state', () => store.list())
ipcMain.handle('get-usage', () => usage.getState())
ipcMain.handle('refresh-usage', () => usage.refresh())

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

function queueCapture (id) {
  const next = focusQueue.catch(() => {}).then(() => captureById(id))
  focusQueue = next
  return next
}

ipcMain.handle('focus', (_e, id) => queueFocus(id))
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
store.on('task-cache', (records) => saveTaskCache(records))
usage.on('change', () => pushUsage())
companions.on('change', () => pushCompanions())

app.whenReady().then(() => {
  store.hydrateTasks(loadTaskCache())
  if (app.dock) app.dock.hide() // menu-bar utility, no dock icon
  const loginItem = ensureLaunchAtLoginPreference()
  createWindow()
  createTray()
  startServer(store, {
    focusById: queueFocus,
    onTaskText: (id, text) => {
      store.updateContext(id, text)
      summarizer.enqueue(id, text)
    }
  })
  discovery = startDiscovery(store, {
    onTaskText: (id, text) => {
      store.updateContext(id, text)
      summarizer.enqueue(id, text)
    }
  })
  companions.start()
  usage.start()
  console.log(`[claude-controller] accessibility granted: ${accessibilityGranted(false)}`)
  console.log(`[claude-controller] launch at login: ${loginItem.openAtLogin} (${loginItem.status})`)
  // Reflect permission changes (user granting it in Settings) into the UI.
  const sysTimer = setInterval(pushSys, 3000)
  if (sysTimer.unref) sysTimer.unref()
  screen.on('display-added', pushDisplays)
  screen.on('display-removed', pushDisplays)
  screen.on('display-metrics-changed', pushDisplays)
})

// Tray app — closing the window doesn't quit.
app.on('window-all-closed', (e) => { e.preventDefault?.() })
app.on('before-quit', () => { app.isQuitting = true; stopPointerResize(); discovery?.stop(); companions.stop(); usage.stop() })
