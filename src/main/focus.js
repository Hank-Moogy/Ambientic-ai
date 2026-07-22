import { execFile } from 'node:child_process'
import { homedir } from 'node:os'

// Map the reported terminal to its GUI app name (activate fallback when we
// don't have / can't reach the captured pid).
const APP_NAMES = {
  ghostty: 'Ghostty',
  'iterm.app': 'iTerm',
  iterm2: 'iTerm',
  apple_terminal: 'Terminal',
  terminal: 'Terminal',
  wezterm: 'WezTerm',
  vscode: 'Visual Studio Code',
  'visual studio code': 'Visual Studio Code',
  warp: 'Warp',
  kitty: 'kitty',
  alacritty: 'Alacritty',
  hyper: 'Hyper',
  tabby: 'Tabby'
}

function appNameFor (s) {
  const keys = [s.term_app, s.term_program].filter(Boolean).map((x) => String(x).toLowerCase())
  for (const k of keys) if (APP_NAMES[k]) return APP_NAMES[k]
  const raw = keys[0] || ''
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ''
}

const esc = (v) => String(v || '').replace(/["\\]/g, '')

// AppleScript list literal from JS strings, e.g. {"a", "b"}.
function asList (arr) {
  const items = arr.filter(Boolean).map((v) => `"${esc(v)}"`)
  return `{${items.join(', ')}}`
}

function runAppleScript (script, timeout = 8000) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout }, (err, stdout, stderr) => {
      const out = String(stdout || '').trim()
      const msg = String(stderr || (err && err.message) || '')
      const permission = /not allowed|assistive access|-1719|-25211|osascript is not allowed/i.test(msg)
      resolve({ ok: !err && out !== 'none' && out !== 'not-found', via: out || 'error', permission, error: err ? msg : '' })
    })
  })
}

// Assumes `ownerWindow` and `target` are already resolved inside a Ghostty
// tell block. Ghostty's scripting API identifies the exact window, while
// System Events provides the writable AX position/size needed to move that
// window between physical displays.
function buildGhosttyBringHereScript (display, termPid) {
  const area = display && display.workArea
  if (!area || ![area.x, area.y, area.width, area.height].every(Number.isFinite)) return ''

  const x = Math.round(area.x)
  const y = Math.round(area.y)
  const width = Math.max(1, Math.round(area.width))
  const height = Math.max(1, Math.round(area.height))
  const pid = Number.isInteger(termPid) ? termPid : null
  const findProcess = pid
    ? `set p to first process whose unix id is ${pid}`
    : 'set p to first application process whose name is "Ghostty"'

  return `
    activate
    delay 0.2
    activate window ownerWindow
    delay 0.08
    try
      tell application "System Events"
        ${findProcess}
        set axWindow to front window of p
        set isFullScreen to false
        try
          set isFullScreen to value of attribute "AXFullScreen" of axWindow
        end try
        if isFullScreen is false then
          set currentPosition to position of axWindow
          set currentSize to size of axWindow
          set currentX to item 1 of currentPosition
          set currentY to item 2 of currentPosition
          set currentWidth to item 1 of currentSize
          set currentHeight to item 2 of currentSize
          set centerX to currentX + (currentWidth / 2)
          set centerY to currentY + (currentHeight / 2)
          set targetRight to ${x} + ${width}
          set targetBottom to ${y} + ${height}

          -- Leave windows already on the controller's display exactly where
          -- they are. Otherwise preserve their size, shrinking only when the
          -- destination display cannot contain it, and center them there.
          if centerX < ${x} or centerX >= targetRight or centerY < ${y} or centerY >= targetBottom then
            set newWidth to currentWidth
            set newHeight to currentHeight
            if newWidth > ${width} then set newWidth to ${width}
            if newHeight > ${height} then set newHeight to ${height}
            set newX to ${x} + ((${width} - newWidth) div 2)
            set newY to ${y} + ((${height} - newHeight) div 2)
            set position of axWindow to {newX, newY}
            if newWidth is not currentWidth or newHeight is not currentHeight then
              set size of axWindow to {newWidth, newHeight}
              set position of axWindow to {newX, newY}
            end if
            delay 0.12
          end if
        end if
      end tell
    end try`
}

// Ghostty tip builds after April 20, 2026 expose the PTY name directly on every
// AppleScript terminal. This is the authoritative process-to-split mapping even
// when many terminals share the same cwd and title.
function buildGhosttyTtyScript (tty, display, termPid) {
  const device = `/dev/${tty}`
  const bringHere = buildGhosttyBringHereScript(display, termPid)
  return `
try
  tell application "Ghostty"
    set matches to every terminal whose tty is "${esc(device)}"
    if matches is {} then set matches to every terminal whose tty is "${esc(tty)}"
    if (count of matches) is not 1 then return "not-found"
    set target to item 1 of matches
    set targetId to id of target as text
    set ownerId to ""
    repeat with w in windows
      repeat with candidate in terminals of w
        if (id of candidate as text) is targetId then set ownerId to id of w as text
      end repeat
    end repeat
    if ownerId is "" then return "not-found"
    set ownerWindow to first window whose id is ownerId
    ${bringHere}
    focus target
    delay 0.05
    activate window ownerWindow
    focus target
    return "ghostty-tty|" & targetId
  end tell
end try
return "not-found"
`
}

function buildGhosttyIdScript (id, display, termPid) {
  const bringHere = buildGhosttyBringHereScript(display, termPid)
  return `
try
  tell application "Ghostty"
    set matches to every terminal whose id is "${esc(id)}"
    if matches is {} then return "not-found"
    set target to item 1 of matches
    set targetId to id of target as text
    set ownerId to ""
    repeat with w in windows
      repeat with candidate in terminals of w
        if (id of candidate as text) is targetId then set ownerId to id of w as text
      end repeat
    end repeat
    if ownerId is "" then return "not-found"
    set ownerWindow to first window whose id is ownerId
    ${bringHere}
    focus target
    delay 0.05
    activate window ownerWindow
    focus target
    return "ghostty-id"
  end tell
end try
return "not-found"
`
}

function buildGhosttyUniqueCwdScript (cwd, display, termPid) {
  const bringHere = buildGhosttyBringHereScript(display, termPid)
  return `
try
  tell application "Ghostty"
    set matches to every terminal whose working directory is "${esc(cwd)}"
    if (count of matches) is not 1 then return "not-found"
    set target to item 1 of matches
    set targetId to id of target as text
    set ownerId to ""
    repeat with w in windows
      repeat with candidate in terminals of w
        if (id of candidate as text) is targetId then set ownerId to id of w as text
      end repeat
    end repeat
    if ownerId is "" then return "not-found"
    set ownerWindow to first window whose id is ownerId
    ${bringHere}
    focus target
    delay 0.05
    activate window ownerWindow
    focus target
    return "ghostty-cwd|" & targetId
  end tell
end try
return "not-found"
`
}

// Ghostty exposes only the selected tab as an accessibility "window". Hidden
// tabs are, however, all listed at the bottom of its Window menu. Selecting the
// matching menu item switches to the tab *and* focuses its terminal text area.
// We use that first, then fall back to visible-window cwd/title matching for
// terminals that do expose every tab as a window.
function buildScript (s) {
  const pid = Number.isInteger(s.term_pid) ? s.term_pid : null
  const app = appNameFor(s)
  const cwd = String(s.cwd || '')

  // Path forms that may show up in AXDocument / titles: absolute, ~-relative,
  // and space-encoded absolute.
  const home = homedir()
  const tilde = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : ''
  const cwdNeedles = asList([
    cwd ? cwd + '/' : '', // AXDocument is file://<cwd>/ — trailing slash avoids /aya matching /aya-website
    cwd ? encodeURI(cwd) + '/' : ''
  ])
  const titleNeedles = asList([s.project, tilde, cwd])

  const byPid = pid
    ? `
    set procs to (every process whose unix id is ${pid})
    if procs is not {} then
      set p to item 1 of procs
      set frontmost of p to true
      delay 0.1
      -- 1) Select a matching terminal tab from the Window menu. Do not retain
      -- an AXMenuItem reference: animated Claude/Codex titles make Ghostty
      -- rebuild those objects while the spinner changes. Clicking again by
      -- numeric index is stable.
      try
        set windowMenu to menu 1 of menu bar item "Window" of menu bar 1 of p
        repeat with i from 1 to count menu items of windowMenu
          try
            set itemName to name of menu item i of windowMenu
            repeat with n in ${titleNeedles}
              if itemName contains n then
                click menu item i of windowMenu
                delay 0.1
                return "menu"
              end if
            end repeat
          end try
        end repeat
      end try
      -- 2) match a visible window by working directory (AXDocument)
      repeat with w in windows of p
        set doc to ""
        try
          set doc to (value of attribute "AXDocument" of w) as text
        end try
        if doc is not "" then
          repeat with n in ${cwdNeedles}
            if doc contains n then
              set frontmost of p to true
              perform action "AXRaise" of w
              try
                set value of attribute "AXMain" of w to true
              end try
              return "cwd"
            end if
          end repeat
        end if
      end repeat
      -- 3) match a visible window by title text
      repeat with n in ${titleNeedles}
        set m to (every window of p whose name contains n)
        if m is not {} then
          set frontmost of p to true
          perform action "AXRaise" of (item 1 of m)
          try
            set value of attribute "AXMain" of (item 1 of m) to true
          end try
          return "title"
        end if
      end repeat
      -- 4) at least bring the terminal app forward
      set frontmost of p to true
      return "app"
    end if`
    : ''

  const byName = app
    ? `
  try
    tell application "${esc(app)}" to activate
    return "app"
  end try`
    : ''

  return `
try
  tell application "System Events"${byPid}
  end tell
end try${byName}
return "none"
`
}

export async function focusSession (s, display) {
  if (!s) return { ok: false, reason: 'no-session' }

  const isGhostty = [s.term_app, s.term_program].some((v) => String(v || '').toLowerCase() === 'ghostty')
  if (isGhostty && s.tty) {
    // Pad clicks use only a stable Ghostty UUID learned by the lifecycle hook.
    // They never signal a process, write to a TTY, type input, or scan panes.
    if (s.ghostty_terminal_id) {
      const cached = await runAppleScript(buildGhosttyIdScript(s.ghostty_terminal_id, display, s.term_pid), 3500)
      if (cached.ok) return cached
      delete s.ghostty_terminal_id
    }

    const byTty = await runAppleScript(buildGhosttyTtyScript(s.tty, display, s.term_pid), 3500)
    if (byTty.ok) {
      const [, terminalId] = byTty.via.split('|', 2)
      if (terminalId) s.ghostty_terminal_id = terminalId
      return { ...byTty, via: 'ghostty-tty', terminalId: terminalId || '' }
    }

    // A unique cwd is safe to resolve directly. Duplicate cwd matches are
    // deliberately rejected until the next lifecycle event provides a UUID.
    if (s.cwd) {
      const unique = await runAppleScript(buildGhosttyUniqueCwdScript(s.cwd, display, s.term_pid), 3500)
      if (unique.ok) {
        const [, terminalId] = unique.via.split('|', 2)
        if (terminalId) s.ghostty_terminal_id = terminalId
        return { ...unique, via: 'ghostty-cwd', terminalId: terminalId || '' }
      }
    }

    // The native TTY lookup is authoritative. When Ghostty says that TTY no
    // longer exists, distinguish a closed terminal from a live pane whose UUID
    // is still being learned so the controller can remove the dead pad.
    if (byTty.via === 'not-found') return { ok: false, reason: 'terminal-not-found' }

    return { ok: false, reason: 'ghostty-mapping-pending' }
  }

  return runAppleScript(buildScript(s))
}
