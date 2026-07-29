# Ambientic

Ambientic is a local-first control surface for people working with several AI agents at once. It makes every active agent visible in one calm interface and maps that interface onto physical hardware so switching attention becomes immediate and habitual.

The local checkout and GitHub repository are named **AgentBase**. The application and product presented to users remain **Ambientic**.

The first product target is a personal macOS cockpit for **Claude Code**, **Codex**, and **Hermes**, with native hardware modes for the **Akai APC40 MKII** and **Akai APC mini mk2**.

The product’s durable creative direction—fluid, aerial, ambient, and quietly alive—is defined in [`ART_DIRECTION.md`](ART_DIRECTION.md) and must be revisited for material interface, motion, lighting, sound, and hardware-expression work.

## Long-term vision

Ambientic should become the interface above agent providers:

- See every active agent, project, task, state, context, and usage signal in one place.
- Start, resume, interrupt, and supervise agents without navigating between terminal windows.
- Inspect agent-created files, diffs, localhost websites, simulators, screenshots, and other artifacts visually.
- Use the best provider for each task without changing the control surface or learned workflow.
- Map semantic actions to physical controls so repeated operations become muscle memory.
- Keep a local-first trust model while allowing optional remote access and synchronization later.
- Help users improve their agentic engineering through continuity coaching, prompt and workflow insights, skill suggestions, and provider-neutral best practices derived from their own work.

The product should own the user experience and normalized session model, not provider credentials or private authentication formats. Provider-specific hooks, ACP implementations, SDKs, and CLIs are adapters behind a stable Ambientic interface.

## Current product increment

This increment is deliberately personal and local. It adds the first full Ambientic workspace above the providers while keeping each provider responsible for its own account and credentials.

### User experience

1. Open the Ambientic macOS app.
2. See whether Claude Code, Codex, and Hermes are installed and connected.
3. Land on an **Overview** command center instead of a conventional chat-history list.
4. See animated Codex, Claude Code, Hermes, and create-task pads alongside active, needs-input, total-thread, and APC hardware signals.
5. Select a centered provider card to refresh its conversations and enter **Threads** on that provider's latest work with its filter already active.
6. Browse the cross-provider thread mosaic, or start a managed local task from the dedicated create-task pad by choosing a provider, working folder, and first prompt; Ambientic uses the provider's existing local login.
7. Press an APC40 MKII pad to open that exact live task in **Threads** and present its linked localhost, iOS, or Android preview; then hold that physical column's **Record Arm** button to speak and release it to transcribe and send.
8. Use green running, red input-required, and blue idle pad feedback, or open the compact controller for previews, usage, connectors, and MIDI Learn mappings.

### Included

- Local macOS Electron application and menu-bar utility.
- Full desktop workspace with project-grouped task navigation, transcript, shared composer, approval cards, task state, and artifact list.
- Experimental Overview landing surface with slowly floating provider portals, live metrics, dedicated provider-aware task creation, and a dense cross-provider thread mosaic.
- Settings → Usage & Billing with comparable Codex and Claude short/weekly quota meters, reset windows, stale/error states, manual refresh, and local weekly-session activity whenever a provider does not expose usable quota data.
- Persistent local capacity ledger and Settings activity panel for provider limit hits, Codex reset-credit use, natural quota renewals, purchased-credit balance changes, and current observed balances. Codex reset allowance is shown beside its live plan without treating subscription capacity as currency spend.
- Explicit Overview and Threads navigation, preserving the conventional conversation interface as a secondary tab rather than the product's default mental model.
- Activity-first Threads sidebar with a persistent local “last opened by you” signal: the latest user-interacted conversation stays first, recently updated/actionable conversations are highlighted under **Recent & active**, and dormant history is separated under **Earlier threads**. Provider and search filters apply consistently to both lanes.
- Threads sidebar ordered globally by the latest known user or agent message across providers; project groups and conversations move together as activity changes, with compact logo filters for All, Codex, Claude Code, and Hermes.
- Managed Codex conversations through Codex app-server, authenticated by the existing Codex installation.
- Managed Hermes conversations through Hermes ACP, including streamed messages, tool activity, cancellation, and permission requests.
- Completed Hermes turns are reconciled against Hermes' local database so dropped ACP chunks cannot leave a partial answer in the transcript.
- User and assistant messages are selectable, each message has a Copy action, and the thread header can copy the complete human-readable chat without tool payloads.
- Threads can be renamed from their header; Ambientic stores the alias against the stable provider thread ID and uses it consistently in Overview, Threads, the compact controller, and MIDI pads.
- Agent responses render GitHub-flavored Markdown with larger reading typography, clear heading/list/table hierarchy, blockquotes, task lists, inline and fenced code, safe clickable links, and restrained semantic color.
- Managed Claude Code turns through the installed Claude CLI with streamed structured output and the existing Claude login.
- Readable recent Codex conversations plus dormant Claude Code and Hermes conversation history discovered directly from each provider's local store.
- Separate workspace and hardware indexes: dormant history appears in the desktop workspace but only live/recent actionable sessions occupy APC40 pads.
- Automatic discovery of Claude Code, Codex, and Hermes terminal processes.
- Read-only import of the eight most recently active Codex desktop tasks from Codex's local index.
- Direct `codex://threads/<id>` navigation back to imported Codex desktop tasks.
- Session cards named from the active task, provider surface, or meaningful project instead of the macOS account folder.
- Lifecycle events normalized into running, waiting, attention, idle, and ended states. A completed managed turn is idle/done, not red. The provider-neutral resolver is shared by workspace cards, transcript headers, compact controller, and APC LEDs: explicit approval/user-input signals override a still-live provider process; real Codex Desktop and terminal-hook lifecycles cannot be demoted by a passive transcript reader running in another provider process; managed notifications can still promote work immediately; lifecycle changes synchronize before rendering and resolving an approval immediately clears the signal.
- Exact Ghostty pane focus when its TTY AppleScript API is available.
- Localhost and simulator companion previews.
- APC40 task activation is a complete context switch: exact thread selection, immediate preview rescan, automatic presentation on the configured preview display, and a right-side single-display fallback.
- The thread header and Context panel show linked preview availability and can present it again on demand.
- Akai APC40 MKII 5×8 clip-grid session selection and RGB state feedback.
- Akai APC mini mk2 8×8 task grid, RGB state feedback, per-column push-to-talk, and MIDI Learn support through its dedicated Control port.
- Overview **Vibe** sampler and ⌘⇧V shortcut cycling between two named five-second APC40 MKII/APC mini mk2 studies: cold center-out wave and cold circular orbit. Delta-only LED updates support a smoother 60 ms frame cadence, slower color phases reduce stepping, and live task-state LEDs are restored after every composition.
- Compact Overview provider-balance card with Codex and Claude quota remaining plus Hermes local activity; detailed resets, credits, history, and billing remain in Settings → Usage & Billing.
- Settings → MIDI Hardware selector with Automatic, APC40 MKII, and APC mini mk2 modes; controller choice and device-specific learned mappings persist locally.
- Push-to-talk voice prompts from the eight APC40 MKII per-track Record Arm buttons using the Mac microphone and installed Whisper `base` model.
- APC40 MKII MIDI Learn mappings stored locally.
- Local connector status and guided provider setup.
- Cross-provider handover surfaced directly on the thread: a **Hand off →** action in the thread header moves the task's full context to another connected agent, and an inline banner offers one-click handover to the least-loaded provider when the current one nears its rate limit. (The standalone Improve → Continuity page has been retired in favor of this in-context flow.)
- Automatic project-level `HANDOVER.md` preparation when a managed provider reaches 85% of an available quota window, plus manual handover at any time.
- Continuation with another connected provider using the deterministic handover file instead of replaying the source transcript.
- Spawned provider CLIs (and their node-based hooks/plugins) inherit a real PATH, so a Finder-launched app no longer breaks Claude Code plugin hooks with `node: command not found`.
- Existing Claude, Codex, and Kimi compatibility retained while the visible personal scope moves to Claude, Codex, and Hermes.

### Not included yet

- Ambientic accounts or a cloud backend.
- Universal monetary spend totals from consumer subscriptions. Exact currency reporting requires an optional provider billing connection (for example an OpenAI organization Admin API key); Claude subscription spend is not exposed by the local CLI, and Hermes costs belong to its configured upstream provider.
- Archived/deleted-provider sessions and Claude internal subagent transcripts; the workspace intentionally indexes top-level user conversations only.
- Rich diff rendering, image galleries, or embedded localhost web previews inside the full workspace; this increment lists touched files and retains the existing companion-preview system.
- Fully interactive Claude tool approvals inside Ambientic. Claude managed turns currently use the CLI's `acceptEdits` permission mode; unsupported permission prompts are reported and can be continued in the native surface.
- Windows or Linux support.
- Generic MIDI-controller output profiles.
- Public auto-update infrastructure.
- OpenClaw integration.

## Friend test build

The current prerelease target is **Ambientic 0.8.1 alpha 1** for Apple-silicon Macs (`arm64`). The distributable is a ZIP containing `Ambientic.app`.

This build is ad-hoc signed and integrity-verified, but it is not Apple-notarized yet. A tester may need to move `Ambientic.app` into Applications, Control-click it, choose **Open**, and confirm the macOS warning. Accessibility is needed for terminal focus; microphone and screen-recording permissions are only requested when their corresponding hardware or preview features are used.

## Multi-agent development and local releases

Claude and Codex should never package from the same dirty checkout. Give each agent a dedicated branch and worktree, then review or cherry-pick its finished commit into the integration worktree:

```bash
git worktree add ../ambientic-claude -b agent/claude-feature
git worktree add ../ambientic-codex -b agent/codex-feature
```

Only the integration worktree installs the shared app in `/Applications`. Once the selected changes are committed and the tree is clean, the canonical local release is:

```bash
npm run release:local
```

That command takes an exclusive local release lock, refuses uncommitted input, records the Git commit, branch, version, build time, and clean-tree status, runs the complete tests and packaging flow, applies and verifies a fast ad-hoc seal for local macOS use, validates the packaged manifest, replaces `/Applications/Ambientic.app`, restarts it, and waits for the local health endpoint. Settings shows the installed version, short commit, branch, and build time so an agent or tester can identify the running build without guessing.

This is the personal-development release lane. Public beta releases still require signing/notarization, update distribution, and a release branch policy.

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

Provider quota adapters ──> current capacity ──> local consumption ledger ──> Overview history
Provider billing APIs (future, optional) ────────────────────────────────────> currency spend
```

The Electron main process owns local system access, session state, connectors, previews, and MIDI. The renderer receives a narrow IPC surface through the preload script. Provider credentials remain in provider-owned local stores.

## APC40 MKII behavior

Ambientic targets the protocol documented for the Akai APC40 MKII:

- The 40 clip-launch pads are MIDI notes `0–39`.
- APC note numbers begin on the hardware's bottom row; Ambientic reverses the row order so session 1 is always the physical top-left pad.
- Sessions fill the top row from left to right before moving downward.
- Select an agent pad, then hold the Record Arm button in that agent's physical column to capture a voice prompt.
- Release Record Arm to stop, transcribe locally, and send the prompt directly to the selected agent.
- Record Arm MIDI note `0x30` uses channels 0–7 for columns 1–8; Ambientic validates the selected pad's column before recording.
- Only the held column's Record Arm LED is on during capture. It turns off immediately on release while transcription continues; the global transport Record button is not used.
- Ambientic refreshes the complete owned LED surface every three seconds so a connected controller cannot leave an assigned session pad dark after transient MIDI state drift.
- Pad velocity selects the hardware color.
- MIDI channel selects solid, pulsing, or blinking animation.
- Alternate Ableton mode is enabled while Ambientic owns the grid.

Default session colors:

- Green: working.
- Red: requires user action.
- Blinking red: requires user action and has not been acknowledged.
- Blue: idle.

Unassigned APC40 notes and CC controls can be learned as semantic Ambientic actions without replacing the default grid behavior unless the user explicitly maps that control.

## APC mini mk2 behavior

- Ambientic opens the device's dedicated `APC mini mk2 Control` input and output ports.
- The 64 RGB pads address agent tasks from physical top-left to bottom-right.
- Green is running, red requires input, blinking red is unseen input required, blue is idle, and unused pads are off.
- The eight Track buttons are per-column push-to-talk controls: select a task pad, hold its column's Track button to record, and release to transcribe and send.
- The eight Scene buttons and nine faders remain available for semantic MIDI Learn actions.
- Automatic mode prefers APC40 MKII if both supported controllers are attached. A specific controller can be chosen in **Settings → MIDI Hardware**.

## Implementation plan and status

Last updated: 2026-07-29

### Completed

- [x] Canonical clean-tree `npm run release:local` workflow with a cross-process lock, tests, packaging, verified local ad-hoc sealing, manifest verification, `/Applications` installation, restart, and health check.
- [x] Installed build identity (version, Git commit, and build time) exposed in Settings for reliable Claude/Codex handoff and testing.
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
- [x] APC40 MKII Note/CC Learn mappings persisted in local Ambientic preferences.
- [x] Learned APC40 controls routed to focus, navigation, preview, launch, and window actions.
- [x] Clean local-agent connector strip and APC40 MKII mapping screen.
- [x] Product renamed to Ambientic across runtime UI, package metadata, release metadata, logs, and documentation.
- [x] Supplied orbital Ambientic mark installed as the macOS application icon and reused across onboarding, workspace navigation, loading/empty states, Dock identity, and the compact controller.
- [x] Existing Electron state migrates once from the legacy product directory; provider hooks move to `~/.ambientic/` while accepting the prior hook and quota-cache paths during migration.
- [x] Claude Code, Codex, and Hermes all detected and reported connected on the development Mac.
- [x] Local arm64 Ambientic app and DMG packaging.
- [x] Packaged Ambientic app launched locally and verified through its health endpoint.
- [x] Recent Codex desktop tasks imported read-only and routed through stable Codex task deep links.
- [x] APC40 MKII grid reordered from physical top-left to bottom-right.
- [x] APC40 MKII state palette normalized to green running, red action required, and blue idle.
- [x] Contextual card naming: task title first, then provider/platform or meaningful project; home-folder usernames are suppressed.
- [x] Restored the individual-session-per-pad APC40 layout after testing column banking.
- [x] APC40 MKII per-column Record Arm buttons provide hold-to-record/release-to-send voice prompts for the selected agent.
- [x] Voice delivery uses the managed Ambientic provider bridge for non-terminal sessions and paste-plus-submit for an already-running terminal agent.
- [x] Global transport Record no longer latches or controls voice input; per-column Record Arm LEDs mirror only active microphone capture.
- [x] APC40 MKII full-grid LED heartbeat added, with a physical top-left pad regression test for green running, red input-required, blue idle, and off only when unassigned.
- [x] Full Ambientic desktop workspace added alongside the compact always-on-top APC40 controller.
- [x] Project-grouped task navigation, transcript reader, shared prompt composer, error reporting, status, and touched-file artifact panel.
- [x] Codex app-server bridge for existing-task resume/read, new tasks, streamed item updates, turn interruption, and native approval requests.
- [x] Hermes ACP bridge for session resume/new/prompt, streamed agent/tool updates, cancellation, and native permission requests.
- [x] Claude Code local CLI bridge for new/resumed sessions and structured streamed output using the provider's existing local login.
- [x] APC40 MKII pad presses now select the matching task in the Ambientic workspace; **Open native** preserves direct terminal/Codex navigation.
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
- [x] Message role labels now identify the actual provider (Codex, Claude Code, or Hermes) instead of labeling every response as Ambientic.
- [x] Codex lifecycle events are matched to the exact active turn, preventing stale completion notifications from showing a still-running task as “Needs input.”
- [x] Reopening a Codex conversation restores its in-progress turn ID and reconciles the canonical provider transcript after completion.
- [x] The Ambientic composer remains usable while Codex is working and sends follow-up guidance through `turn/steer` instead of starting a conflicting second turn.
- [x] Full workspace Settings area added with a dedicated AI Providers account-management section for Claude Code, Codex, and Hermes.
- [x] Provider settings expose installed CLI, local authentication, Ambientic hook, version, and credential-ownership status without storing provider secrets.
- [x] Claude “Connect account” now runs the provider-owned `claude auth login --claudeai` flow inside an Ambientic wizard using a hidden macOS pseudo-terminal; no separate Terminal window is opened.
- [x] The Claude wizard renders sanitized bounded CLI output, provides Up/Down/Continue and optional text-response controls for official interactive prompts, opens only Claude/Anthropic HTTPS authentication URLs, polls `claude auth status`, and displays an explicit connected/failed result.
- [x] Replaced the incompatible macOS `script` wrapper after a real packaged failure (`tcgetattr/ioctl: Operation not supported on socket`) with a bundled stdio-to-PTY relay that gives Claude Code a genuine interactive terminal without displaying Terminal.app.
- [x] Claude connection failures now retain their explanation and offer explicit Close and Retry connection actions instead of removing the interaction controls without a recovery path.
- [x] Claude Connect account now defaults directly to the official Claude subscription path, automatically selects “Claude account with subscription” when the CLI presents its account menu, and opens the browser without an Ambientic account-type chooser.
- [x] Claude OAuth URLs are validated before browser launch; authorization links missing the required `redirect_uri` are rejected, and the bundled PTY uses a wide terminal to prevent long OAuth links from being visually wrapped and truncated.
- [x] Claude’s one-time authorization-code prompt is detected as a dedicated step: paste submits immediately, shows an explicit verification state, never echoes or stores the code, and keeps noisy terminal redraws inside collapsed diagnostics.
- [x] Claude connection truth now prefers the official live `claude auth status --json` result on current CLIs and falls back to non-secret account metadata only on older builds that do not support it; stale profile metadata can no longer make a signed-out account appear connected.
- [x] Claude OAuth no longer treats the generic signed-out TUI phrase “Welcome back” as authentication success. Ambientic keeps Claude's localhost callback listener alive until the browser redirect is consumed and the separate live CLI status confirms credentials were stored.
- [x] A verified Claude login brings Ambientic back to the foreground and Overview, queues a genuinely fresh usage pass behind any pre-login refresh, and reports whether live quota windows were synchronized.
- [x] Codex connector discovery now falls back to the binary bundled inside ChatGPT.app, so the compact controller no longer reports “Not installed” when no shell PATH alias exists.
- [x] Compact connector status now distinguishes provider authentication from hook installation and routes “Sign in” to the account flow instead of labeling an unauthenticated CLI “Connected.”
- [x] Codex browser login now shows explicit waiting, connected, failed, and timeout feedback in Ambientic, with an `account/read` fallback when the live completion notification is missed.
- [x] Provider-auth feedback is now persistent at the application level and shown globally, so returning browser focus or leaving Settings cannot overwrite or lose the Codex login result.
- [x] Codex account connection now uses app-server’s official hosted ChatGPT browser flow, supports the normal Google/ChatGPT sign-in ceremony, and refreshes provider state from completion notifications without opening Terminal.
- [x] Compact APC40 controller and mapping window now has an explicit close button that hides the mapper without quitting Ambientic; the workspace launcher can reopen it.
- [x] Dedicated Improve → Continuity area added with provider risk cards, one handover per working folder, manual Prepare/Refresh/Open actions, and connected-provider continuation actions.
- [x] Local deterministic `HandoverService` added with an 85% quota trigger, bounded README/Git/canonical-message context, project-level deduplication, atomic `HANDOVER.md` writes, and no credential or raw tool-log capture.
- [x] Cross-provider continuation creates a managed target-provider task in the same working folder with a compact instruction to read the handover and continue without asking for the prior chat.
- [x] The Ambientic project itself now has a real root `HANDOVER.md` prepared from this Codex session for continuation by Claude Code.
- [x] Native APC mini mk2 profile added from Akai's v1.0 protocol: dedicated Control-port detection, 8×8/64-pad task selection, full RGB heartbeat, and Track-button column push-to-talk.
- [x] Settings → MIDI Hardware added with persisted Automatic, APC40 MKII, and APC mini mk2 selection plus separate learned mappings per device.
- [x] Existing APC40 MKII protocol, colors, 40-pad ordering, Alternate Ableton mode, and Record Arm behavior remain intact.
- [x] Persistent cross-provider thread aliases added with an inline Rename action; provider refreshes can no longer replace a user-selected name with a long first prompt.
- [x] Existing task-label cache is applied before new external Codex sessions render and remains authoritative across subsequent provider-index refreshes.
- [x] Codex usage discovery now finds the binary bundled inside ChatGPT.app, matching connector discovery instead of depending on a shell `codex` command.
- [x] Overview quota meters retain the provider's real window duration and clearly distinguish a missing short-term window from a failed collector.
- [x] Overview provider balance has a manual refresh control again, with disabled/spinning feedback while all provider collectors update.
- [x] Claude quota collection now drives Claude Code's provider-owned interactive `/usage` panel through a hidden PTY, including the current slash-command confirmation and tabbed Settings UI; it prefers Claude Desktop's newest bundled CLI over a stale Homebrew installation.
- [x] Claude usage collection no longer classifies a Pro account as API-billed merely because Claude's Usage screen mentions optional “API usage billing”; only live CLI authentication and observed quota windows determine the displayed state.
- [x] Claude quota cache validation rejects observations older than 24 hours; Ambientic prefers the structured status-line observation when available, falls back to the interactive `/usage` panel, and finally shows honest seven-day local activity with a specific sign-in/sync explanation.
- [x] Claude `/usage` navigation supports both the legacy three-tab Settings UI and Claude Code 2.1.220's four-tab Status/Config/Usage/Stats UI, where `/usage` already opens the correct tab and the old two-arrow workaround would skip past it.
- [x] Overview and Settings consistently label **Claude Code**, distinguish live limits from activity fallback, and show “Sign in to sync Pro or Max plan limits” instead of a blank or misleading quota row.
- [x] Successful Claude authentication now leaves the blocking wizard immediately and becomes one dismissible confirmation toast; dismissal clears both renderer and main-process feedback so a completed login cannot reopen the modal.
- [x] Overview provider cards use a stable upper identity row: provider artwork sits left of a separate name/status block, operational state remains in the corner, and the footer is reserved for metrics. Hermes uses the supplied transparent portrait mark, tinted with its violet accent for dark-surface legibility.
- [x] Overview provider cards now open existing work instead of the new-task dialog: selecting Codex, Claude Code, or Hermes refreshes the workspace index, opens Threads with that provider filter active, clears stale search text, and selects that provider’s latest thread. The dedicated create-task card remains the only creation shortcut in the provider field.
- [x] Codex Desktop running state remains authoritative after a conversation is opened in Ambientic: the passive transcript app-server can enrich messages and promote activity, but its separate idle result can no longer demote a real in-progress Desktop turn or turn the corresponding screen/APC signal blue.
- [x] Native four-screen first-run experience added: mysterious Welcome, local display-name capture, provider connection/first-task choice, and skippable MIDI controller discovery before Overview.
- [x] Onboarding uses full-screen single decisions, oversized type, floating spatial objects, provider-specific connection cards, one dominant CTA, reduced-motion support, and the ambient game/instrument language recorded in `ART_DIRECTION.md`.
- [x] Codex and Claude reuse their guided Ambientic authentication; Hermes opens its provider-owned local setup; Kimi Code is detected as an account-only connector and links to its official install path when absent.
- [x] APC40 MKII and APC mini mk2 connection transitions automatically play one temporary cold Vibe composition, then restore truthful task LEDs.
- [x] First-run state is local and replayable from Settings → Replay onboarding or `⌘⇧O`; `AMBIENTIC_STATE_DIR` provides disposable isolated state for repeatable developer smokes.
- [x] Thread composer now supports native file/folder selection plus Build, Plan, and Ask modes. Codex receives images and path mentions through app-server inputs; Claude uses its native planning permission mode where applicable; Hermes receives a compact provider-neutral local-context instruction.
- [x] Composer tuning can select Claude's model and reasoning effort or Codex's supported reasoning effort per provider; validated values are forwarded to each provider while empty selections preserve provider defaults.
- [x] The Attach action is restored to the composer's top toolbar, keeping files and folders visible as prompt context before typing while model/effort tuning remains in the lower status row.
- [x] Passive transcript reads cannot demote a running Codex Desktop or hook-backed terminal session, keeping the Overview cards, thread state, and APC LEDs aligned with the authoritative external lifecycle.
- [x] Codex user-message echoes reconcile against Ambientic's optimistic row by stable client ID or normalized text, so the temporary local message is replaced rather than briefly duplicated. Attachment and mode metadata survive the replacement.
- [x] Ambientic rename/build integration audited against the complete local AgentBase-era increment: consumption tracking, compact provider balances, activity-first thread navigation, provider-neutral turn states, APC40 MKII/APC mini mk2 profiles, voice routing, preview activation, and both ambient Vibe sequences are present in the Ambientic source and regression suite.
- [x] Claude terminal attention is immediate and hardware-truthful: `PermissionRequest` turns the selected task red as soon as an approval dialog opens, while a narrow `PreToolUse` matcher does the same for `AskUserQuestion` and `ExitPlanMode`; ordinary tool calls remain green and the next `PostToolUse`/prompt restores working state.
- [x] Ambient mode adds an explicit Overview/menu-bar On/Off control backed by Electron’s temporary `prevent-app-suspension` assertion: the Mac remains available for agents while its display may sleep, no system setting or elevated permission is changed, and quitting Ambientic releases the assertion.
- [x] Ambient mode’s active control and Settings status breathe through a reduced-motion-safe blue–violet–green hue. Settings offers bounded 30-minute, 1/2/4/8/12-hour safety check-ins (four hours by default); a due check-in offers Keep running or Turn off, while no response deliberately leaves agent work uninterrupted.
- [x] Overview header simplified to All threads, Ambient mode, and Vibe; the redundant top-right New task action is removed, and the lighting action is labeled simply **Vibe** while its tooltip retains composition detail.
- [x] Native approval cards now offer **Deny**, **Allow once**, and **Always allow** inside the active Ambientic thread for Codex and Claude Code. Codex replies through app-server; Claude’s official blocking `PermissionRequest` hook waits on Ambientic’s loopback bridge and returns Claude’s own structured decision/permission suggestion. If Ambientic is unavailable or times out, Claude falls back to its native approval dialog.
- [x] Selecting any thread now clears the prior transcript and deterministically scrolls the newly loaded conversation to its latest message. Scrolling away from the bottom pauses auto-follow and reveals a floating **Latest** shortcut; returning to the bottom restores live auto-follow.
- [x] The thread composer now owns its draft independently from the transcript, so typing no longer rerenders every Markdown message. Previously rendered Markdown is memoized, submission shows an explicit **Starting agent…** state, and a failed provider start restores the unsent draft.
- [x] Native MIDI crash containment: Ambientic enforces one running application instance and reuses one CoreMIDI Input/Output pair for its lifetime instead of reconstructing native clients during three-second reconnect polling.
- [x] Project inspection is scope-bounded: home and filesystem roots are rejected for automatic Git/handover inspection, preventing Ambientic from traversing unrelated macOS-protected Music, Photos/Pictures, Documents, or Desktop collections.
- [x] Automatic context enrichment now also excludes every macOS protected home collection; unsafe discovered sessions retain chat and lifecycle state but skip background Git/transcript inspection. New tasks no longer default to `/Users/samori`: they require a specific project folder, with a user-triggered folder picker for intentional access.
- [x] Local repository identity normalized to AgentBase: the checkout lives at `/Users/samori/AgentBase`, handover instructions and project-label fixtures use that path, and the shipped product name remains Ambientic.
- [x] Overview task creation now keeps its primary action usable before a folder is chosen, opens the native folder chooser on demand, follows newly available provider connections, and displays actionable folder/provider/startup failures instead of silently resetting the button.

### In progress

- [ ] Evaluate whether the Overview's provider-pad scale, floating motion, metric hierarchy, and mosaic density feel better than a chat-list-first product.
- [ ] Confirm the green/red/blue palette visually on the connected physical APC40 MKII after this build.
- [ ] Physically validate exact pad-to-thread switching and preview presentation for one live localhost task on the connected APC40 MKII.
- [ ] Physically validate per-column Record Arm hold/release, microphone permission, transcription latency, LED feedback, and direct prompt submission across Claude Code, Codex, and Hermes.
- [ ] Physical validation of learned non-grid APC40 MKII buttons, knobs, and faders.
- [ ] Physically validate all 64 APC mini mk2 pad positions, RGB colors, Track-button hold/release voice capture, Scene-button learning, and fader learning.
- [ ] Restart active agent terminals so every process loads the migrated `~/.ambientic/hook.py` integration.
- [ ] Validate one real managed prompt and interrupt on each locally authenticated provider after the packaged app relaunch.
- [ ] Explore a supported shared-host transport for live Codex desktop mirroring. Today Ambientic and Codex desktop share persisted task history, but their separate stdio app-server processes do not share the same in-memory active turn; reopen the task in Codex to refresh it after an Ambientic-owned turn.
- [ ] Validate Codex and Hermes approval cards against a real tool permission request.
- [ ] Reconnect Claude Code itself with the restored Pro/Max subscription. The current CLI's authoritative auth result is `loggedIn: false` even though stale local profile metadata still identifies the account as Claude Pro; after connection, send one Claude message or refresh Overview and confirm the five-hour/weekly balances.
- [ ] Run one human-paced onboarding pass from a clean profile, including Codex browser login, Claude embedded login, first-task creation, controller skip, and replay from Settings.
- [ ] Physically repeat the arrival-light test with the APC mini mk2; automated coverage confirms the same 64-pad Vibe path, while the connected visual smoke used an APC40 MKII.
- [ ] Use a thread's **Hand off →** action (or the near-limit banner) as the first live cross-provider takeover test now that Claude is connected.
- [ ] Validate automatic handover regeneration against a real provider window crossing 85%, including reset-window deduplication.

### Next

- [ ] Replace terminal-owned Hermes and Kimi setup with guided provider-native browser/device-code ceremonies where their supported local protocols expose reliable completion callbacks.
- [ ] Bundle a supported recording/transcription runtime so voice prompts do not depend on Homebrew tools in public builds.
- [ ] Configure Apple notarization for distribution beyond the development Mac.
- [ ] Add an in-app reconnect message when another older controller process owns port `47600`.
- [ ] Add history filters, archive controls, and pagination when the local conversation index grows beyond the current recent-session limit.
- [ ] Add rich unified diffs, image/media previews, and embedded localhost websites to the workspace artifact panel.
- [ ] Upgrade Claude integration to its supported Agent SDK control protocol if/when that becomes necessary for fully native permission prompts.
- [ ] Add privacy controls, editable thresholds, handover history/versioning, and optional model-assisted refinement after the deterministic continuity workflow is validated.
- [ ] Expand Improve beyond continuity with transcript-grounded prompt coaching, recurring workflow insights, skill/tool recommendations, and measurable agentic-engineering habits.
- [ ] Add optional provider billing adapters and manual monthly subscription-cost entries so the spend panel can combine exact API costs with clearly labeled fixed plans.
- [ ] Extend the ambient art direction into coordinated screen transitions, preview presentation, optional sound, and user-selectable hardware compositions while respecting reduced motion.

### Verification

- 2026-07-29 Overview task-start regression: task-launch IPC errors are reduced to their actionable provider message, missing error text receives a stable fallback, and the production modal no longer discards rejected provider starts.
- 2026-07-29 repository rename: tracked checkout references and the handover entry point now identify `/Users/samori/AgentBase`; the remote repository remains `Hank-Moogy/AgentBase` while the upstream `therocketgui/vibe-controller` URL is preserved as project provenance.
- 2026-07-27 crash investigation: both macOS reports (`15:08:37` and `15:15:07`) terminate with `SIGABRT` on the main thread inside `MidiInCore::getCoreMidiClientSingleton` during `new midi.Input()`. The controller-lifetime regression confirms repeated disconnected reconnects construct exactly one native input and output pair.
- `npm test`: 100 tests passing, including actionable managed-task startup errors, a simulated browser-to-localhost Claude OAuth callback, post-login forced usage refresh, non-repeating Claude success feedback, provider-filtered latest-thread entry, passive-reader versus live-Codex state precedence, CoreMIDI client reuse, protected project-scope and explicit-project-folder boundaries, build identity, inherited provider-session environment sanitization, transcript navigation, provider approvals, current/legacy Claude usage navigation, live Claude authentication truth, MIDI layouts, voice validation, and cross-provider workspace behavior.
- 2026-07-28 macOS privacy audit: background context enrichment no longer runs for home roots or protected Music, Pictures/Photos, Documents, Desktop, Downloads, Movies, Public, or Library paths. Folder access is initiated only from the new-task chooser or the explicit Attach action.
- 2026-07-28 release-gate hardening: the simulated Claude browser callback keeps its strict lifecycle assertions but allows 15 seconds for URL and credential verification under concurrent packaging load, removing a false five-second timeout without weakening product behavior.
- 2026-07-28 live Codex state audit: this exact Codex Desktop thread was `running` in both its local index and Ambientic's discovery store while the opened Ambientic conversation appeared idle. A regression now proves a separate passive app-server read cannot write a false idle lifecycle or override the authoritative Desktop state.
- 2026-07-28 Overview provider-card verification: focused regressions confirm connected Claude auth uses non-modal success feedback and provider-filtered ordering selects the newest matching conversation. The production renderer build succeeds with centered provider identities and the refreshed provider-to-Threads transition.
- 2026-07-28 Claude OAuth root-cause regression: a fake official CLI prints the misleading “Welcome back” text, owns an ephemeral localhost callback, receives a simulated browser authorization redirect, persists its credential marker, and only then returns `loggedIn: true`. Ambientic remains in `waiting` before the callback and reaches `connected` only after the authoritative check.
- 2026-07-28 Claude usage audit: the local profile metadata identifies a valid Claude Pro Apple subscription, but every installed current Claude CLI returns `{"loggedIn":false,"authMethod":"none"}`. Ambientic now treats that live result as authoritative, reports `CLAUDE_LOGIN_REQUIRED`, preserves the real seven-day fallback (1,597 messages across 15 sessions at audit time), and never infers API billing from optional-extra-usage copy. Targeted tests, the full 92-test suite, and the production build pass.
- 2026-07-24 Claude usage foundation: commits `a2d3dea`, `16f182a`, and `5efb10c` introduced the interactive `/usage` collector, matching five-hour/weekly Overview gauges, and live reset countdowns. The later live-auth and four-tab fixes supersede its original account-mode inference.
- 2026-07-27 combined-agent checkpoint: the shared working tree, including Claude's provider-environment and thread-scroll work plus the isolated composer render path, passes all 83 tests before packaging.
- `npm test`: 83 tests passing, including inherited provider-session environment sanitization, semantic selection of the newest Claude Desktop CLI, transcript near-bottom/jump visibility, Claude official-hook approval once/persisted-rule decisions and IPC-safe approval projection, Ambient mode single-assertion lifecycle, bounded check-in timing and non-interrupting reminders, immediate Claude approval/question → red-pad propagation, ordinary-tool false-positive protection, activity-first thread ordering/recent separation, Codex optimistic-message reconciliation, native attachment/mode payloads, Claude status-line quota parsing/staleness, Claude long-context compaction/error guidance, provider connection commands including Kimi, MIDI arrival-light transition, cross-provider latest-message ordering, two smoothed native APC Vibe compositions, consumption-ledger reset/credit transitions, single-resolver thread-state precedence and approval-clearing, completed-turn idle vs approval-blocked state semantics, PATH resolution for spawned CLIs, persistent thread aliases across provider refreshes, bundled-Codex usage discovery, weekly-only rate-limit parsing, APC mini mk2 8×8 ordering, APC40 MKII regressions, Claude authentication, quota handovers, provider bridges, voice validation, Hermes reconciliation, and safe external links.
- Installed-app verification target is `/Applications/Ambientic.app`; repository packages under `release/mac-arm64/` must be copied there and the existing Applications process restarted before UI acceptance checks.
- Consumption-ledger regressions cover exact Codex reset-credit transitions, duplicate suppression, purchased-credit additions/consumption, and natural window renewal classification.
- Vibe-sequence regressions verify both cold compositions, full 40/64-pad native layouts, temporal movement, minimum composition duration, and delta-frame smoothing.
- Thread-order regressions verify latest-user-interaction priority, recent/archive separation, and provider/search filtering.
- Turn-state regressions verify approval-over-running precedence, passive-terminal running/waiting preservation, completed-turn idle behavior, approval clearing, and stale Codex completion protection.
- `npm run build`: production main, preload, and renderer bundles succeed.
- Pad activation build verification confirms the renderer subscribes to hardware workspace selections, switches to Threads, resolves the selected ID through the existing workspace bridge, refreshes companion candidates, and exposes linked previews through the preload boundary.
- Real Hermes transcript smoke renders at 15 px/26.1 px line height with four H2 sections, four H3 subsections, six ordered lists, six clickable links, four emphasized spans in the final message, and no visible raw `**` markers.
- Friend-test archive `Ambientic-0.8.1-alpha.1-mac-arm64.zip` is 96 MB, passes ZIP creation and strict deep code-signature verification, and has SHA-256 `670542ed7e3c36d0a3b0235c37f5ee202881f6f063402fcb1d948f52dc2fd53f`.
- Full workspace production bundle succeeds with the local Codex app-server, Claude CLI, and Hermes ACP bridges included; no Ambientic credential storage or API-key field is introduced.
- Packaged GUI smoke confirms the full workspace discovers eight recent Codex tasks, marks this task running, renders top-row-first APC task ordering, and detects the connected APC40 MKII.
- Final packaged app is running as a single local instance; `/health` returns `{"ok":true,"sessions":8}` and the APC40 MKII is connected.
- Local history-index verification discovers 12 top-level Claude Code conversations and 7 Hermes conversations; Claude internal `subagents/` transcripts are excluded.
- Updated packaged app is running with 27 workspace conversations (8 live/recent Codex, 12 Claude Code history, and 7 Hermes history); `/health` continues to report only the 8 sessions assigned to the live APC40 surface by design.
- Packaged navigation regression: at a 900×600 window, the sidebar is constrained to 315 px with 1,429 px scroll content; a hit-tested mouse click switched threads and a wheel event advanced `scrollTop` to 500. The prior unbounded 69,355 px layout is eliminated.
- Overview visual smoke uses 27 real local conversations and renders all three provider pads, one active Codex signal, Claude login-required state, Hermes ready state, four top metrics, create-task pad, and cross-provider mosaic.
- Overview interaction smoke confirms a Codex provider pad preselects Codex in the task dialog, a mosaic card opens its exact conversation, and Overview/Threads tab switching works without creating or modifying a provider task.
- Usage & Billing is isolated in Settings so Overview remains focused on agent providers, tasks, status, and hardware; the detailed three-provider quota board and persistent activity ledger retain their refresh behavior and data.
- Live read-only quota smoke returned Codex's current weekly window successfully. Claude Code 2.1.31 proved that `/usage` is an interactive-only subscription command and that `claude -p /usage` is not a safe quota API; Ambientic no longer executes it. The replacement status-line bridge passed a privacy smoke with synthetic limits and persisted no supplied transcript or token field. The real Claude balance will populate after the next response from a restarted subscription-authenticated Claude session.
- The reported Hermes conversation was recovered directly from `state.db` with its complete 4,052-character assistant response; the normalized view contains 13 useful messages and no empty assistant placeholders.
- Live bridge smoke: Codex app-server initialized and read this exact Codex task with 19 turns; Hermes ACP initialized as `hermes-agent` 0.19.0; Claude CLI authentication check correctly identified the currently invalid local login.
- Cross-host Codex diagnostic confirmed the desktop host reports this task live while a separately spawned, read-only app-server reports it `notLoaded` and sees only the persisted checkpoint. The lifecycle fix therefore guarantees exact-turn state inside Ambientic and persisted transcript continuity; instantaneous mirroring into an already-open Codex desktop view remains a provider-host limitation.
- Packaged `Ambientic.app` is running, owns the local controller port, responds successfully at `/health`, and detects the connected APC40 MKII.
- Latest packaged Improve/Continuity and corrected embedded-Claude-login build is running as a single instance; `/health` returns `{"ok":true,"sessions":9}`, the APC40 MKII is connected, and the bundled PTY relay was executed successfully from `Ambientic.app/Contents/Resources`.
- Latest packaged individual-pad build is running and healthy with eight currently discovered sessions; contextual labels remain active, so the active task resolves to `Ambientic — Codex Desktop` while untitled home-folder agents resolve to their provider instead of `samori`.
- Voice-input implementation now follows the APC40 MKII's track-channel Record Arm protocol and direct-send behavior; physical hold/release validation remains the next step.
- Latest packaged LED-heartbeat build is running with eight sessions; live inspection confirms the first grid entry is this running Codex task, so physical top-left pad 1 is refreshed green every three seconds.
- Packaged runtime imported the active `Ambientic` Codex desktop task as `running`; its focus endpoint returned `provider-deep-link` for this exact task.
- Runtime session ordering currently starts with live terminal agents followed by the active Codex desktop task and recent Codex tasks; up to 40 sessions are addressable from the APC40 grid in top-row-first order.
- Visual smoke checks completed for the connector dashboard and APC40 MKII Learn interface at the minimum window width.
- Local provider check: Claude Code 2.1.31 is installed and hooked but currently requires `/login`; Codex is connected through ChatGPT; Hermes is connected through its configured OpenAI Codex provider.
- Current runnable app bundle: `release/mac-arm64/Ambientic.app` (not signed or notarized). The latest DMG creation reached the macOS `hdiutil` stage but failed there; the older DMG in `release/` does not contain this workspace increment and should not be used for this build.
- Latest packaged hardware-profile build is running as a single healthy instance with nine live hardware sessions; Automatic mode detected `APC mini mk2 Control`, opened the correct Control port, and initialized the native 8×8 surface.
- Latest thread-alias build is packaged at `release/mac-arm64/Ambientic.app`; the current Codex task ID has a persistent `Ambientic` alias in local preferences and task cache. Quit and reopen the app once to load the new bundle.
- Live Codex quota verification through the bundled ChatGPT binary returned Plus plan data with a 7-day window at 97% used; the provider response currently contains no secondary/short-term window, which the Overview now reports explicitly.
- Post-reset packaged runtime verification recorded the reported limit hit, exact one-credit reset transition (97% → 0%, available resets 1 → 0), and subsequent 2% consumption in the renewed Codex window. The app is healthy at `/health`, and the ledger persisted across the packaged-app restart.
- Isolated first-run visual smokes at 1420×880 verified the Welcome, four-provider connection field, and connected-controller screens. The real APC40 MKII was detected as 40 pads ready and played the new arrival composition; the same transition is unit-covered for the native APC mini mk2 64-pad path.

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

Replay onboarding without changing any provider account or conversation data:

- In the app: **Settings → Replay onboarding**
- From anywhere in the workspace: `⌘⇧O`
- For an isolated developer smoke: launch with `AMBIENTIC_STATE_DIR=/tmp/your-ambientic-smoke`

## Local data and permissions

- Ambientic preferences and mappings live in Electron's local `userData` directory.
- The provider integration bridge lives under `~/.ambientic/`. Existing `~/.agentbase/` and `~/.claude-controller/` references are migrated or accepted only for compatibility.
- Claude, Codex, and Hermes keep ownership of their authentication data.
- Ambientic does not need Music or Photos access. Automatic project inspection refuses `/`, `/Users`, and the user's home directory so a broad Git repository cannot sweep macOS-protected personal collections.
- Accessibility permission is required only for focusing terminal windows.
- Microphone permission is required only while recording voice prompts. Audio is written to a temporary local folder and removed after local Whisper transcription.
- Screen Recording permission is required only for companion screenshots.
- This personal voice-input increment resolves Homebrew `ffmpeg` and `whisper` from `/opt/homebrew/bin` or `/usr/local/bin`; the public distribution still needs a bundled runtime.

## Project discipline

`README.md` is the current source of truth for scope and implementation status. Every coding task must update the completed, in-progress, next, and verification information before handoff.
