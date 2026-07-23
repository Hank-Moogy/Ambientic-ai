# AgentBase

AgentBase is a local-first control surface for people working with several AI agents at once. It makes every active agent visible in one calm interface and maps that interface onto physical hardware so switching attention becomes immediate and habitual.

The first product target is a personal macOS cockpit for **Claude Code**, **Codex**, and **Hermes**, controlled from an **Akai APC40 MKII**.

## Long-term vision

AgentBase should become the interface above agent providers:

- See every active agent, project, task, state, context, and usage signal in one place.
- Start, resume, interrupt, and supervise agents without navigating between terminal windows.
- Inspect agent-created files, diffs, localhost websites, simulators, screenshots, and other artifacts visually.
- Use the best provider for each task without changing the control surface or learned workflow.
- Map semantic actions to physical controls so repeated operations become muscle memory.
- Keep a local-first trust model while allowing optional remote access and synchronization later.

The product should own the user experience and normalized session model, not provider credentials or private authentication formats. Provider-specific hooks, ACP implementations, SDKs, and CLIs are adapters behind a stable AgentBase interface.

## Current product increment

This increment is deliberately personal and local. It adds the first full AgentBase workspace above the providers while keeping each provider responsible for its own account and credentials.

### User experience

1. Open the AgentBase macOS app.
2. See whether Claude Code, Codex, and Hermes are installed and connected.
3. Land on an **Overview** command center instead of a conventional chat-history list.
4. See animated Codex, Claude Code, Hermes, and create-task pads alongside active, needs-input, total-thread, APC40, and provider-consumption signals.
5. Browse a cross-provider thread mosaic; select any card to open its full transcript, composer, approvals, and artifacts in the preserved **Threads** tab.
6. Start a managed local task from a provider pad or create-task pad by choosing a provider, working folder, and first prompt; AgentBase uses the provider's existing local login.
7. Press an APC40 MKII pad to open that exact live task in **Threads** and present its linked localhost, iOS, or Android preview; then hold that physical column's **Record Arm** button to speak and release it to transcribe and send.
8. Use green running, red input-required, and blue idle pad feedback, or open the compact controller for previews, usage, connectors, and MIDI Learn mappings.

### Included

- Local macOS Electron application and menu-bar utility.
- Full desktop workspace with project-grouped task navigation, transcript, shared composer, approval cards, task state, and artifact list.
- Experimental Overview landing surface with slowly floating provider pads, live metrics, provider-aware task creation, and a dense cross-provider thread mosaic.
- Overview consumption board with comparable Codex and Claude short/weekly quota meters, reset windows, stale/error states, manual refresh, and local weekly-session activity whenever a provider does not expose usable quota data.
- Explicit Overview and Threads navigation, preserving the conventional conversation interface as a secondary tab rather than the product's default mental model.
- Managed Codex conversations through Codex app-server, authenticated by the existing Codex installation.
- Managed Hermes conversations through Hermes ACP, including streamed messages, tool activity, cancellation, and permission requests.
- Completed Hermes turns are reconciled against Hermes' local database so dropped ACP chunks cannot leave a partial answer in the transcript.
- User and assistant messages are selectable, each message has a Copy action, and the thread header can copy the complete human-readable chat without tool payloads.
- Agent responses render GitHub-flavored Markdown with larger reading typography, clear heading/list/table hierarchy, blockquotes, task lists, inline and fenced code, safe clickable links, and restrained semantic color.
- Managed Claude Code turns through the installed Claude CLI with streamed structured output and the existing Claude login.
- Readable recent Codex conversations plus dormant Claude Code and Hermes conversation history discovered directly from each provider's local store.
- Separate workspace and hardware indexes: dormant history appears in the desktop workspace but only live/recent actionable sessions occupy APC40 pads.
- Automatic discovery of Claude Code, Codex, and Hermes terminal processes.
- Read-only import of the eight most recently active Codex desktop tasks from Codex's local index.
- Direct `codex://threads/<id>` navigation back to imported Codex desktop tasks.
- Session cards named from the active task, provider surface, or meaningful project instead of the macOS account folder.
- Lifecycle events normalized into running, waiting, attention, idle, and ended states.
- Exact Ghostty pane focus when its TTY AppleScript API is available.
- Localhost and simulator companion previews.
- APC40 task activation is a complete context switch: exact thread selection, immediate preview rescan, automatic presentation on the configured preview display, and a right-side single-display fallback.
- The thread header and Context panel show linked preview availability and can present it again on demand.
- Akai APC40 MKII 5×8 clip-grid session selection and RGB state feedback.
- Push-to-talk voice prompts from the eight APC40 MKII per-track Record Arm buttons using the Mac microphone and installed Whisper `base` model.
- APC40 MKII MIDI Learn mappings stored locally.
- Local connector status and guided provider setup.
- Existing Claude, Codex, and Kimi compatibility retained while the visible personal scope moves to Claude, Codex, and Hermes.

### Not included yet

- AgentBase accounts or a cloud backend.
- Archived/deleted-provider sessions and Claude internal subagent transcripts; the workspace intentionally indexes top-level user conversations only.
- Rich diff rendering, image galleries, or embedded localhost web previews inside the full workspace; this increment lists touched files and retains the existing companion-preview system.
- Fully interactive Claude tool approvals inside AgentBase. Claude managed turns currently use the CLI's `acceptEdits` permission mode; unsupported permission prompts are reported and can be continued in the native surface.
- Windows or Linux support.
- Generic MIDI-controller output profiles.
- Public auto-update infrastructure.
- OpenClaw integration.

## Friend test build

The current prerelease target is **AgentBase 0.8.1 alpha 1** for Apple-silicon Macs (`arm64`). The distributable is a ZIP containing `AgentBase.app`.

This build is ad-hoc signed and integrity-verified, but it is not Apple-notarized yet. A tester may need to move `AgentBase.app` into Applications, Control-click it, choose **Open**, and confirm the macOS warning. Accessibility is needed for terminal focus; microphone and screen-recording permissions are only requested when their corresponding hardware or preview features are used.

## Architecture

```text
Claude hooks ─┐
Codex hooks  ─┼──> local event server ──> normalized session store ──> React UI
Hermes plugin ┘                                  │                       │
                                                 ├──> terminal focus     │
Process discovery ───────────────────────────────┤                       │
Codex local task index ──> Codex deep links ────┤                       │
                                                 ├──> previews           │
APC40 MKII MIDI input ──> action mappings ──────┴───────────────────────┘
APC40 MKII MIDI output <── session state and selection LEDs

Codex app-server ─┐
Claude local CLI ─┼──> normalized workspace bridge ──> transcript / composer / artifacts
Hermes ACP ───────┘                                      │
                                                        └──> approvals / interrupt / state
```

The Electron main process owns local system access, session state, connectors, previews, and MIDI. The renderer receives a narrow IPC surface through the preload script. Provider credentials remain in provider-owned local stores.

## APC40 MKII behavior

AgentBase targets the protocol documented for the Akai APC40 MKII:

- The 40 clip-launch pads are MIDI notes `0–39`.
- APC note numbers begin on the hardware's bottom row; AgentBase reverses the row order so session 1 is always the physical top-left pad.
- Sessions fill the top row from left to right before moving downward.
- Select an agent pad, then hold the Record Arm button in that agent's physical column to capture a voice prompt.
- Release Record Arm to stop, transcribe locally, and send the prompt directly to the selected agent.
- Record Arm MIDI note `0x30` uses channels 0–7 for columns 1–8; AgentBase validates the selected pad's column before recording.
- Only the held column's Record Arm LED is on during capture. It turns off immediately on release while transcription continues; the global transport Record button is not used.
- AgentBase refreshes the complete owned LED surface every three seconds so a connected controller cannot leave an assigned session pad dark after transient MIDI state drift.
- Pad velocity selects the hardware color.
- MIDI channel selects solid, pulsing, or blinking animation.
- Alternate Ableton mode is enabled while AgentBase owns the grid.

Default session colors:

- Green: working.
- Red: requires user action.
- Blinking red: requires user action and has not been acknowledged.
- Blue: idle.

Unassigned APC40 notes and CC controls can be learned as semantic AgentBase actions without replacing the default grid behavior unless the user explicitly maps that control.

## Implementation plan and status

Last updated: 2026-07-23

### Completed

- [x] Floating Electron session grid and menu-bar state.
- [x] Claude Code, Codex, and Kimi lifecycle hook bridge.
- [x] Live terminal-process discovery.
- [x] Exact Ghostty TTY focus and multi-display companion routing.
- [x] Localhost, Chrome-route, simulator, and screenshot companion support.
- [x] Claude, Codex, and Kimi usage collectors.
- [x] APC40 MKII CoreMIDI detection.
- [x] APC40 MKII 5×8 pad input.
- [x] APC40 MKII RGB session-state output.
- [x] APC40 MKII physical hardware smoke test.
- [x] Initial Hermes process discovery and lifecycle event normalization.
- [x] Hermes plugin bridge resource added to the hook package.
- [x] Local connector-status foundation added for Claude, Codex, and Hermes.
- [x] APC40 MKII semantic mapping model foundation added.
- [x] Hermes plugin installed and enabled locally through Hermes' supported plugin manager.
- [x] Connector status, refresh, launch, and installation actions wired through Electron IPC.
- [x] APC40 MKII Note/CC Learn mappings persisted in local AgentBase preferences.
- [x] Learned APC40 controls routed to focus, navigation, preview, launch, and window actions.
- [x] Clean local-agent connector strip and APC40 MKII mapping screen.
- [x] Product renamed to AgentBase across runtime UI, package metadata, release metadata, logs, and documentation.
- [x] Claude Code, Codex, and Hermes all detected and reported connected on the development Mac.
- [x] Local arm64 AgentBase app and DMG packaging.
- [x] Packaged AgentBase app launched locally and verified through its health endpoint.
- [x] Recent Codex desktop tasks imported read-only and routed through stable Codex task deep links.
- [x] APC40 MKII grid reordered from physical top-left to bottom-right.
- [x] APC40 MKII state palette normalized to green running, red action required, and blue idle.
- [x] Contextual card naming: task title first, then provider/platform or meaningful project; home-folder usernames are suppressed.
- [x] Restored the individual-session-per-pad APC40 layout after testing column banking.
- [x] APC40 MKII per-column Record Arm buttons provide hold-to-record/release-to-send voice prompts for the selected agent.
- [x] Voice delivery uses the managed AgentBase provider bridge for non-terminal sessions and paste-plus-submit for an already-running terminal agent.
- [x] Global transport Record no longer latches or controls voice input; per-column Record Arm LEDs mirror only active microphone capture.
- [x] APC40 MKII full-grid LED heartbeat added, with a physical top-left pad regression test for green running, red input-required, blue idle, and off only when unassigned.
- [x] Full AgentBase desktop workspace added alongside the compact always-on-top APC40 controller.
- [x] Project-grouped task navigation, transcript reader, shared prompt composer, error reporting, status, and touched-file artifact panel.
- [x] Codex app-server bridge for existing-task resume/read, new tasks, streamed item updates, turn interruption, and native approval requests.
- [x] Hermes ACP bridge for session resume/new/prompt, streamed agent/tool updates, cancellation, and native permission requests.
- [x] Claude Code local CLI bridge for new/resumed sessions and structured streamed output using the provider's existing local login.
- [x] APC40 MKII pad presses now select the matching task in the AgentBase workspace; **Open native** preserves direct terminal/Codex navigation.
- [x] Normal macOS dock/application behavior restored for the full workspace while retaining the menu-bar controller.
- [x] Provider capability checks distinguish installed/observable agents from agents currently authenticated for managed prompts; invalid Claude login state is surfaced before task creation.
- [x] Read-only Claude Code history index from top-level `~/.claude/projects/*/*.jsonl` transcripts, with project paths and prompt-derived titles.
- [x] Read-only Hermes history index from `~/.hermes/state.db`, with stored titles, working directories, message counts, and transcript loading.
- [x] Dormant Claude and Hermes conversations merged into the desktop workspace without assigning them APC40 hardware pads.
- [x] Full-workspace grid rows constrained to the native window height so the thread list, transcript, and artifact panel scroll independently.
- [x] Full workspace now displays recording, transcription, sent, microphone failure, wrong-column, and no-live-target voice feedback.
- [x] Experimental Overview is now the default landing page, with real provider connection state, account usage, active/attention metrics, APC40 status, and animated provider pads.
- [x] Provider pads and the create-task pad open the existing managed-task flow with the relevant provider preselected.
- [x] Cross-provider task mosaic opens the selected conversation in the preserved Threads interface.
- [x] Stable one-time renderer subscriptions prevent late live Codex discovery from being overwritten by the initial Claude/Hermes history snapshot.
- [x] Landing-page consumption board added with provider rate-limit percentages, five-hour/weekly buckets, refresh and update state, and seven-day local-activity fallbacks for unavailable quota APIs.
- [x] Claude usage adapter now tolerates both older `--safe-mode` CLIs and newer Claude Code builds that require a restricted no-tools invocation.
- [x] Hermes completion now replaces best-effort ACP stream chunks with the canonical saved transcript, preserving full responses across tool-heavy turns.
- [x] Empty Hermes assistant rows surrounding tool calls are filtered from the conversation view.
- [x] Transcript selection, per-message Copy, and whole-chat Copy controls added through the local Electron clipboard bridge.
- [x] APC40 pad presses now force the workspace into Threads and load the pad's exact normalized session instead of changing a hidden selection behind Overview.
- [x] Hardware task activation now refreshes companion discovery and presents the matching localhost page or simulator automatically when a confident link exists.
- [x] Linked previews are visible in the thread header and Context panel, with a secondary-display layout and a right-side single-display presentation fallback.
- [x] Thread typography increased to a 15 px body size with a relaxed 1.74 line height, wider spacing, shorter readable line length, and clearer user/agent separation.
- [x] GitHub-flavored Markdown rendering added for headings, emphasis, ordered and unordered lists, tables, blockquotes, task lists, strikethrough, inline code, and fenced code.
- [x] Web, localhost, and email links are clickable through a protocol-validated Electron bridge; scripts, local files, relative paths, and credential-bearing URLs are rejected.
- [x] Message role labels now identify the actual provider (Codex, Claude Code, or Hermes) instead of labeling every response as AgentBase.

### In progress

- [ ] Evaluate whether the Overview's provider-pad scale, floating motion, metric hierarchy, and mosaic density feel better than a chat-list-first product.
- [ ] Confirm the green/red/blue palette visually on the connected physical APC40 MKII after this build.
- [ ] Physically validate exact pad-to-thread switching and preview presentation for one live localhost task on the connected APC40 MKII.
- [ ] Physically validate per-column Record Arm hold/release, microphone permission, transcription latency, LED feedback, and direct prompt submission across Claude Code, Codex, and Hermes.
- [ ] Physical validation of learned non-grid APC40 MKII buttons, knobs, and faders.
- [ ] Restart active agent terminals so every process loads the migrated `~/.agentbase/hook.py` integration.
- [ ] Validate one real managed prompt and interrupt on each locally authenticated provider after the packaged app relaunch.
- [ ] Validate Codex and Hermes approval cards against a real tool permission request.
- [ ] Re-authenticate the local Claude Code installation with `claude /login`; its current credential reports `Invalid API key`, so managed Claude task creation is intentionally disabled until then.
- [ ] Re-check Claude's native quota endpoint after local re-authentication; the current CLI does not return `/usage` non-interactively, so AgentBase correctly displays Claude's weekly local session activity instead of inventing a percentage.

### Next

- [ ] Add a proper AgentBase application icon.
- [ ] Bundle a supported recording/transcription runtime so voice prompts do not depend on Homebrew tools in public builds.
- [ ] Configure Apple notarization for distribution beyond the development Mac.
- [ ] Add an in-app reconnect message when another older controller process owns port `47600`.
- [ ] Add history filters, archive controls, and pagination when the local conversation index grows beyond the current recent-session limit.
- [ ] Add rich unified diffs, image/media previews, and embedded localhost websites to the workspace artifact panel.
- [ ] Upgrade Claude integration to its supported Agent SDK control protocol if/when that becomes necessary for fully native permission prompts.

### Verification

- `npm test`: 23 tests passing, including per-column APC40 MKII Record Arm press/release parsing, selected-agent/physical-column targeting, contextual session naming, Hermes discovery, Codex desktop lifecycle/deep-link import, state colors, Note/CC mapping, local voice-tool validation, Hermes partial-stream reconciliation, and safe external-link validation.
- `npm run build`: production main, preload, and renderer bundles succeed.
- Pad activation build verification confirms the renderer subscribes to hardware workspace selections, switches to Threads, resolves the selected ID through the existing workspace bridge, refreshes companion candidates, and exposes linked previews through the preload boundary.
- Real Hermes transcript smoke renders at 15 px/26.1 px line height with four H2 sections, four H3 subsections, six ordered lists, six clickable links, four emphasized spans in the final message, and no visible raw `**` markers.
- Friend-test archive `AgentBase-0.8.1-alpha.1-mac-arm64.zip` is 96 MB, passes ZIP creation and strict deep code-signature verification, and has SHA-256 `670542ed7e3c36d0a3b0235c37f5ee202881f6f063402fcb1d948f52dc2fd53f`.
- Full workspace production bundle succeeds with the local Codex app-server, Claude CLI, and Hermes ACP bridges included; no AgentBase credential storage or API-key field is introduced.
- Packaged GUI smoke confirms the full workspace discovers eight recent Codex tasks, marks this task running, renders top-row-first APC task ordering, and detects the connected APC40 MKII.
- Final packaged app is running as a single local instance; `/health` returns `{"ok":true,"sessions":8}` and the APC40 MKII is connected.
- Local history-index verification discovers 12 top-level Claude Code conversations and 7 Hermes conversations; Claude internal `subagents/` transcripts are excluded.
- Updated packaged app is running with 27 workspace conversations (8 live/recent Codex, 12 Claude Code history, and 7 Hermes history); `/health` continues to report only the 8 sessions assigned to the live APC40 surface by design.
- Packaged navigation regression: at a 900×600 window, the sidebar is constrained to 315 px with 1,429 px scroll content; a hit-tested mouse click switched threads and a wheel event advanced `scrollTop` to 500. The prior unbounded 69,355 px layout is eliminated.
- Overview visual smoke uses 27 real local conversations and renders all three provider pads, one active Codex signal, Claude login-required state, Hermes ready state, four top metrics, create-task pad, and cross-provider mosaic.
- Overview interaction smoke confirms a Codex provider pad preselects Codex in the task dialog, a mosaic card opens its exact conversation, and Overview/Threads tab switching works without creating or modifying a provider task.
- Consumption-board visual smoke confirms the three provider rows, compact hero metrics, refresh state, dual quota meters, and Hermes weekly-activity fallback fit cleanly above the provider pads at the packaged app's desktop size.
- Live read-only quota smoke returned Codex's current weekly window successfully (50% used during verification). Claude's current local CLI exposed no usable non-interactive quota window, so its row falls back to locally indexed weekly activity after refresh.
- The reported Hermes conversation was recovered directly from `state.db` with its complete 4,052-character assistant response; the normalized view contains 13 useful messages and no empty assistant placeholders.
- Live bridge smoke: Codex app-server initialized and read this exact Codex task with 19 turns; Hermes ACP initialized as `hermes-agent` 0.19.0; Claude CLI authentication check correctly identified the currently invalid local login.
- Packaged `AgentBase.app` is running, owns the local controller port, responds successfully at `/health`, and detects the connected APC40 MKII.
- Latest packaged individual-pad build is running and healthy with eight currently discovered sessions; contextual labels remain active, so the active task resolves to `AgentBase — Codex Desktop` while untitled home-folder agents resolve to their provider instead of `samori`.
- Voice-input implementation now follows the APC40 MKII's track-channel Record Arm protocol and direct-send behavior; physical hold/release validation remains the next step.
- Latest packaged LED-heartbeat build is running with eight sessions; live inspection confirms the first grid entry is this running Codex task, so physical top-left pad 1 is refreshed green every three seconds.
- Packaged runtime imported the active `AgentBase` Codex desktop task as `running`; its focus endpoint returned `provider-deep-link` for this exact task.
- Runtime session ordering currently starts with live terminal agents followed by the active Codex desktop task and recent Codex tasks; up to 40 sessions are addressable from the APC40 grid in top-row-first order.
- Visual smoke checks completed for the connector dashboard and APC40 MKII Learn interface at the minimum window width.
- Local connector check: Claude Code connected, Codex connected, Hermes connected.
- Current runnable app bundle: `release/mac-arm64/AgentBase.app` (not signed or notarized). The latest DMG creation reached the macOS `hdiutil` stage but failed there; the older DMG in `release/` does not contain this workspace increment and should not be used for this build.

## Local development

```sh
npm install
npm run dev
```

Install or update local provider integrations:

```sh
npm run install-hooks
```

Run tests and build verification:

```sh
npm test
npm run build
```

## Local data and permissions

- AgentBase preferences and mappings live in Electron's local `userData` directory.
- The provider integration bridge lives under `~/.agentbase/`. Existing `~/.claude-controller/` references are migrated or accepted for compatibility.
- Claude, Codex, and Hermes keep ownership of their authentication data.
- Accessibility permission is required only for focusing terminal windows.
- Microphone permission is required only while recording voice prompts. Audio is written to a temporary local folder and removed after local Whisper transcription.
- Screen Recording permission is required only for companion screenshots.
- This personal voice-input increment resolves Homebrew `ffmpeg` and `whisper` from `/opt/homebrew/bin` or `/usr/local/bin`; the public distribution still needs a bundled runtime.

## Project discipline

`README.md` is the current source of truth for scope and implementation status. Every coding task must update the completed, in-progress, next, and verification information before handoff.
