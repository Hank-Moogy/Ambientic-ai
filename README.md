# Claude Controller

A floating, always-on-top **APC40-style pad grid** that monitors every coding-agent
terminal you have open — Claude Code, Codex, and Kimi — and lets you jump straight
to the one that needs you.

- 🟢 **green** — the agent is working
- 🔴 **red** — it is ready for the next prompt (including notifications)

The **menu-bar icon** mirrors the worst state across all sessions (`🔴2` = two need
you), so you can glance without even looking at the panel. **Click a pad** to bring
that terminal's window to the front.

## How it works

Each agent CLI fires lifecycle hooks (`SessionStart`, `UserPromptSubmit`,
`PostToolUse`, `Notification`, `Stop`, `SessionEnd`). A tiny Python hook maps each
one to a pad state and fires a detached `curl` at a loopback server the app runs on
`127.0.0.1:47600`. The hook never blocks your agent — worst case it's a no-op.

The app also scans live foreground terminal jobs, so active Claude Code, Codex,
and Kimi panes appear even if the controller started after them. Hook events add
the precise working/ready state. Each pad uses the agent's real logo and shows a
short current-task label above a fitted project name.

The limits strip above the pads reads the authenticated local accounts every two
minutes and on demand. It shows Claude's 5-hour, weekly, and model-scoped limits,
Codex's general and model-scoped weekly buckets, and Kimi's 5-hour and weekly
limits. Percentages are normalized to "used" so the three providers are directly
comparable. Quotas above 50% show a compact live reset countdown beneath their
name. Claude runs its local `/usage` command in safe mode, Codex uses the
app-server `account/rateLimits/read` method, and Kimi uses its managed usage API.
Credentials remain in each CLI's own local credential store.

The packaged macOS app enables **Launch at Login** on its first run, so the
controller returns automatically after a restart. The setting can be toggled
from the Claude Controller menu-bar menu.

The controller window is resizable from any edge or corner. Pads reflow into
content-driven columns as the window grows, and both the chosen window size and
interface zoom persist across restarts. Use **Interface Size** in the menu-bar
menu or `⌘+`, `⌘−`, and `⌘0` while the controller is focused.

### Task labels

`UserPromptSubmit` sends only the cleaned human prompt to the local controller.
The app immediately creates a local four-word fallback, then asks
`amazon/nova-micro-v1` through OpenRouter for a clearer 2–5 word label. Results
are persisted by terminal identity for seven days, requests are serialized, and
tool events never call the model. On startup, meaningful titles from existing
Ghostty panes seed labels for agents whose prompts happened before the controller
opened; generic project-only titles are ignored.

The OpenRouter credential is read from the `OPENROUTER_API_KEY` environment
variable or the macOS Keychain service
`com.findmecreators.claudecontroller.openrouter`; it is never bundled with the
app. Prompt text (capped at 4,000 characters) is sent to OpenRouter when this
feature is enabled.

On Ghostty, clicking a pad maps that agent's TTY directly to Ghostty's native
AppleScript terminal object. If its owning window is on another physical display,
the controller moves that whole window onto the controller's display, brings it
to the front, and focuses the exact split. Windows already on that display are
left in place. It does not type into the terminal, send process signals, cycle
panes, or guess from duplicated project names.

### Companion previews

With two or more displays connected, a pad press can arrange the project beside
its terminal:

- The exact Ghostty pane moves to the display holding Claude Controller and
  remains focused for typing.
- A matching localhost page or emulator is shown on the configured preview
  display first, so it remains visible when Ghostty receives keyboard focus.
- Localhost pages auto-link by tracing the listening port back to its process
  working directory. Expo-launched simulators auto-link when the device and
  project are explicit in the launch command.
- The route resolver reads the agent's local prompt/transcript context and the
  localhost routes already recorded in Chrome's local session files. It ranks
  those routes by task, tool, file, title, and URL-path evidence. A terminal
  working on `Aya` therefore selects `/expansion/aya` instead of the project
  root or another expansion.
- Browser previews reuse an exact-route Chrome window when one exists, or open
  one with the same Chrome profile on the preview display. Chrome does not need
  an extension, so the preview keeps the user's existing login and cookies.
- Ambiguous emulators stay suggestions. Use the monitor button on a pad to
  attach one or more previews manually; those choices are remembered by
  project.

The header shows the live route (`T2 → P1`). Click it to choose the preview
display. On a single-display setup, pad presses keep their existing terminal-only
behavior.

Native macOS fullscreen windows stay in their fullscreen Space; macOS does not
allow them to be repositioned like ordinary windows. Their exact pane is still
focused normally.

## Setup

```sh
npm install
npm run dev          # launches the floating panel + menu-bar icon
```

Then install the hooks into your agents (once):

```sh
npm run install-hooks
# or from the menu-bar icon → "Install / update agent hooks…"
```

New and already-running agent processes are discovered automatically. Restarting
an agent is only needed after the first hook installation if you want full
lifecycle colors immediately.

### Ghostty requirement

Exact split targeting uses Ghostty's `terminal.tty` AppleScript property. Install
a Ghostty tip build containing PR #11922 (merged April 20, 2026) or a newer stable
release that includes it. The controller reports a safe failure instead of trying
to type, signal, or traverse panes when that API is unavailable.

### macOS permissions

The first time you click a pad, macOS may ask to grant **Accessibility** and
**Automation** permission to the app (in dev this is "Electron"). Approve it in
*System Settings → Privacy & Security → Accessibility* — that's what lets it focus
terminal windows.

## Layout

- Frameless, translucent, floats above everything (incl. fullscreen apps).
- No dock icon — lives in the menu bar.
- **Drag** it by the title strip; it remembers where you put it.
- Menu bar → **Dock top-right** snaps it back to the corner.

## Uninstalling the hooks

The installer backs up each config to `*.cc-backup` before its first edit. To remove,
delete the `~/.claude-controller/hook.py` entries from:

- `~/.claude/settings.json`
- `~/.codex/hooks.json`
- `~/.kimi-code/config.toml`

## Packaging into a .app

```sh
npm run dist        # builds the distributable into release/ via electron-builder
```

## Config

- Port: set `CLAUDE_CONTROLLER_PORT` (default `47600`) — must match on both the app
  env and the hook.
- Which agents to install: `CC_AGENTS=claude,codex,kimi npm run install-hooks`.
- Summary model: set `CLAUDE_CONTROLLER_SUMMARY_MODEL` (default
  `amazon/nova-micro-v1`).
