import { execFile } from 'node:child_process'
import { homedir } from 'node:os'

// Map the reported terminal to its GUI app name (activate fallback when we
// don't have / can't reach the captured pid).
const APP_NAMES = {
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
  return ''
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
      -- 1) Select a matching terminal tab from the Window menu.
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
  return runAppleScript(buildScript(s))
}

// Claude Code, Codex, and Kimi all accept an image from the clipboard with
// Ctrl+V in their interactive composer. This deliberately does not press
// Enter, so the user can type the instruction that should accompany it.
export function pasteClipboardImage () {
  return runAppleScript(`
tell application "System Events"
  key code 9 using {control down}
end tell
delay 0.12
return "clipboard-image"
`, 3000)
}

// Text prompts use the normal macOS paste shortcut. Callers choose whether to
// leave them for review or follow with submitTerminalPrompt().
export function pasteClipboardText () {
  return runAppleScript(`
tell application "System Events"
  key code 9 using {command down}
end tell
delay 0.12
return "clipboard-text"
`, 3000)
}

export function submitTerminalPrompt () {
  return runAppleScript(`
tell application "System Events"
  key code 36
end tell
delay 0.12
return "prompt-submitted"
`, 3000)
}
