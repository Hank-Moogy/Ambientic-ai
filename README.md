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

## Core roadmap

The next product phase has three major user-facing systems built on one shared, versioned semantic action layer, over one provider-agnostic substrate:

0. **Context kernel and tool gateway** — the substrate the rest assumes. Ambientic keeps a durable local memory of the user, their projects, and their decisions in a local SQLite/FTS5 store, freezes a small capsule into any provider's session, and lets the agent pull the rest through a single local gateway that also owns tool authorization, permissions, and audit. Hermes's memory and tooling patterns are reproduced here rather than forked, so Claude and Codex benefit equally. Specified in `PRODUCT.md` → *Context kernel and tool gateway*; sequenced in `NEXT_STEPS.md` → Phase 1.6.

1. **Workflow Builder** — turn repetitive requests into inspectable, resumable sequences across agents, humans, Goals, artifacts, rate limits, and hardware. The first increment is a deterministic local runner and compact ordered-step editor with approvals, cancellation, idempotency, history, and restart recovery.
2. **Universal Hardware Mapping** — configure arbitrary MIDI and keyboard devices through discovery, learn, layers, banks, modifiers, conditions, and output feedback while preserving native APC40 MKII behavior.
3. **Ambientic Coach** — opt-in local analysis of conversations and explicitly selected newsletters, RSS feeds, and sources that finds recurring work, friction, and cost opportunities, then proposes evidence-backed draft workflows, mappings, skills, goal tasks, or provider policies.

Workflow templates and hardware profiles become versioned privacy-safe bundles that can be exported and imported locally before Ambientic adds accounts or a public community library. Community publishing must never include credentials, personal paths, raw transcripts, or private artifacts.

`PRODUCT.md` defines the product contracts, shared action architecture, privacy model, context strategy, and success measures. `NEXT_STEPS.md` defines the implementation phases and exit criteria. The live **Build Ambientic** goal mirrors this roadmap as executable tickets.

## Current product increment

This increment is deliberately personal and local. It adds the first full Ambientic workspace above the providers while keeping each provider responsible for its own account and credentials.

### User experience

1. Open the Ambientic macOS app.
2. See whether Claude Code, Codex, and Hermes are installed and connected.
3. Land on an **Overview** command center instead of a conventional chat-history list.
4. Open **Goals** from the persistent left navigation to see active outcomes as a slowly floating ambient field.
5. Create a goal with its outcome, motivation, success criteria, priority, and target date; open it to manage human, agent, or mixed work on a milestone-aware Kanban board.
6. See animated Codex, Claude Code, Hermes, and create-task pads alongside active, needs-input, total-thread, and APC hardware signals.
7. Select a centered provider card to refresh its conversations and enter **Threads** on that provider's latest work with its filter already active.
8. Browse the cross-provider thread mosaic, or start a managed local task from the dedicated create-task pad by choosing a provider, its model and reasoning level, a visible project context, and an optional first prompt. Ambientic defaults to the most recent safe real project; an empty private scratch workspace remains available explicitly.
9. Press an APC40 MKII pad to open that exact live task in **Threads** and present its linked localhost, iOS, or Android preview; then hold that physical column's **Record Arm** button to speak and release it to transcribe and send.
10. Use green running, red input-required, and blue idle pad feedback, or open the compact controller for previews, usage, connectors, and MIDI Learn mappings.

### Included

- Local macOS Electron application and menu-bar utility.
- Full desktop workspace with project-grouped task navigation, transcript, shared composer, approval cards, task state, and artifact list.
- Experimental Overview landing surface with slowly floating provider portals, live metrics, dedicated provider-aware task creation, and a dense cross-provider thread mosaic.
- Settings → Usage & Billing with comparable Codex and Claude short/weekly quota meters, reset windows, stale/error states, manual refresh, and local weekly-session activity whenever a provider does not expose usable quota data.
- Persistent local capacity ledger and Settings activity panel for provider limit hits, Codex reset-credit use, natural quota renewals, purchased-credit balance changes, and current observed balances. Codex reset allowance is shown beside its live plan without treating subscription capacity as currency spend.
- Settings → Inference for connecting hosted OpenAI-compatible inference accounts — Nebius Token Factory first, then Fireworks AI and OpenRouter — with keychain-only key storage, live model listing, per-provider model selection, connection checks, and per-workload routing. Ambientic's own thread labelling runs through the routed account; agent threads keep running on their own provider CLIs, and any workload set to stay local, or routed to a provider that does not answer, falls back to on-device handling.
- Explicit Overview and Threads navigation, preserving the conventional conversation interface as a secondary tab rather than the product's default mental model.
- First-class **Goals** section in the persistent left sidebar, with a spacious floating-card landing field and an in-section goal detail experience.
- First visual **Workflows** section in the persistent left sidebar, with an atmospheric workflow library and run-history stream, trackpad pan/pinch zoom, zoom-at-pointer behavior, draggable provider-neutral steps, keyboard delete and undo, a capability palette, step inspector, a larger collapsible natural-language dock, sequential dry-run lighting, local draft persistence, and privacy-safe portable manifest copying.
- Local workflow execution service with multiple saved workflows, recurrence scheduling, provider-neutral agent steps, explicit approval gates for consequential inbox/calendar actions, managed-thread continuation, run history, duplication, and cancellation.
- Dedicated **Hardware** workspace in the persistent navigation, designed as a calm programmable instrument rather than a Settings form: local template library, protected Ambientic Live Sessions profile, arbitrary grid creation, deck/view rename and secondary-view deletion, Play/Edit/Map MIDI/Test modes, low-motion floating pads, multiple linked views, automatic Back navigation, target/action inspector, input-arrival light, and responsive/reduced-motion layouts.
- Atomic local hardware-template persistence with logical-slot bindings shared across views, schema/graph/size-validated privacy-sanitized JSON import/export, derived non-private requirements summaries for future community catalogs, fork/duplicate/delete flows, exact-local-target repair markers, and explicit expiring confirmation before consequential hardware actions run.
- Universal input-first mapping for selectable native APC profiles, generic input-only MIDI devices, and focused computer keyboard controls, including Note/CC learning, visible conflict moves, press/release/650 ms hold/CC-value triggers, reconnect recovery, and visible raw-control labels.
- Collapsible global navigation with a persistent preference and ⌘\\ shortcut, giving canvas, board, and thread surfaces the full window when focus matters.
- Workspace renderer recovery: visible error fallback, renderer console diagnostics, and a bounded automatic reload replace permanent black screens after renderer load/process failures.
- Rotating, secret-redacted main-process diagnostics available from the tray, plus Claude usage collection that rejects expired windows, refreshes its cache from the current provider UI, and consistently selects the newest installed Claude Code binary.
- Local goal persistence in a dedicated private application-data store, separate from window preferences and provider credentials, with atomic writes and an append-only human-action audit trail.
- Goal capture with desired outcome, motivation, success criteria, target date, priority, and lifecycle state.
- Six-state execution board with milestone labels, bounded task context, definitions of done, human/agent/mixed ownership, drag-and-drop movement, and an accessible status selector fallback.
- Goal execution view simplified around the board: only the goal name remains expanded by default, goal context is disclosed on demand, ticket cards show only their titles, and selecting a ticket opens its complete context, milestone, owner, definition of done, and accessible status control.
- Derived goal health signals including progress, active work, blockers, completion totals, and next-action surfacing.
- Activity-first Threads sidebar with a persistent local “last opened by you” signal: the latest user-interacted conversation stays first, recently updated/actionable conversations are highlighted under **Recent & active**, and dormant history is separated under **Earlier threads**. Provider and search filters apply consistently to both lanes.
- Threads sidebar ordered globally by the latest known user or agent message across providers; project groups and conversations move together as activity changes, with compact logo filters for All, Codex, Claude Code, and Hermes.
- Managed Codex conversations through Codex app-server, authenticated by the existing Codex installation.
- Provider-native new-task tuning: Codex models and their supported reasoning levels come from the live app-server catalog, Claude exposes its supported model aliases and effort levels, and the chosen settings are applied to the first managed turn.
- Project-aware task starts now use one canonical Ambientic project as the provider-neutral launch unit: its stable identity carries the root workspace, brief, memory scope, goal, and task across Codex, Claude Code, and Hermes. The most recent rooted project is visibly selected, adding a folder creates or reuses its project record, folderless projects run in private per-task workspaces, and explicit project/folder mismatches are rejected before provider launch. The first turn still receives bounded repository orientation; unlinked scratch work remains explicit and local.
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
- Lifecycle events normalized into running, waiting, attention, idle, and ended states. A completed managed turn is idle/done, not red — except when Codex ends its turn by asking the user a clarifying question, which still needs a reply, so it surfaces as "Needs input" like a pending approval instead of going quietly idle. The provider-neutral resolver is shared by workspace cards, transcript headers, compact controller, and APC LEDs: explicit approval/user-input signals override a still-live provider process; real Codex Desktop and terminal-hook lifecycles cannot be demoted by a passive transcript reader running in another provider process; managed notifications can still promote work immediately; lifecycle changes synchronize before rendering and resolving an approval immediately clears the signal.
- Explicit terminal focus for supported terminal applications; Ambientic performs no background window automation.
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
- Local SQLite/FTS5 context kernel with projects, scoped memories and provenance, consented/redacted transcript search, deterministic promotion/conflict/expiry rules, frozen per-session capsules, and hard forgetting.
- One capability-token-scoped Ambientic MCP gateway shared by Claude, Codex, and Hermes, exposing context, recall, remember, Goals, task updates, and capability search/invoke without giving agents external credentials.
- Systematic goal closeout for linked work: every meaningful agent turn receives a required read → evidence check → ticket update → reconciliation protocol. Ambientic scopes writes to the linked goal and records a visible missing-closeout event when an agent skips the protocol; it never guesses completion on the agent's behalf.
- Provider-native context injection: Claude append-system-prompt files plus strict MCP config, Codex developer instructions plus per-thread MCP configuration, and Hermes MCP session configuration plus a first-message capsule envelope.
- Local releases discover an installed Apple Development or Developer ID certificate (or use `AMBIENTIC_SIGNING_IDENTITY`) and reject ad-hoc output before installation, preserving macOS permission continuity without hard-coding one developer's identity in shared build configuration.
- Settings → Memory workspace, inferred context in New Agent, inspectable and correctable thread bindings, audit filters, onboarding consent, and per-project/provider transcript exclusions.
- Optional provider-memory bootstrap after account connection: Ambientic asks each connected native agent runtime for durable context it already has, with Ambientic context/tools disabled for that isolated export. Secret-shaped and sensitive personal content is rejected, the user reviews every item, and a short local summary closes the step.
- [ ] Agent-assisted workflow authoring with an explicit connected-provider selector, validated structured manifests, preview-before-save, and the existing deterministic parser retained as an offline fallback.
- [ ] Agent-facing workflow tools for permission-scoped create, inspect, update, validate, and run operations.
- [x] Settings → Apps & Tools, separate from AI Providers, with generic stdio/Streamable HTTP MCP connections, capability permissions, health, dependents, and Connect/Test/Reconnect/Disable/Disconnect controls.
- [ ] Direct provider-neutral inbox and calendar adapters whose consequential actions require confirmation and tool evidence rather than trusting an agent's success claim.
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
- Linking an existing provider thread or artifact to a goal task, assignment leases, approval-gated agent mutations, or automated next-action reviews.
- Agent-powered natural-language workflow authoring and native inbox/calendar connectors. The current prompt uses a deterministic local parser; live workflow steps run through managed AI providers, while direct app actions still require normalized adapters and confirmed tool evidence.

## Friend test build

The current prerelease target is **Ambientic 0.8.1 alpha 1** for Apple-silicon Macs (`arm64`). The distributable is a ZIP containing `Ambientic.app`.

Personal local releases are signed with the developer's installed Apple Development certificate so macOS permission grants survive rebuilds. A build shared with another Mac still requires a Developer ID certificate and notarization; a development signature is not a public distribution mechanism. Accessibility is needed for terminal focus; microphone and screen-recording permissions are requested only when their corresponding hardware or preview features are used.

The local release gate runs the complete test suite by default. During the known fake-Claude-CLI OAuth callback timeout investigation, a developer may explicitly set `AMBIENTIC_SKIP_CLAUDE_OAUTH_TEST=1`; this skips only that named simulator test while retaining the other Claude authentication tests, packaging checks, signature verification, installed-manifest check, restart, and health check. This override is for a user-approved local installation only and must not be used for public releases.

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

That command takes an exclusive local release lock, refuses uncommitted input, records the Git commit, branch, version, build time, and clean-tree status, runs the complete tests and packaging flow, discovers a stable local code-signing identity, rejects ad-hoc output, validates the packaged manifest, replaces `/Applications/Ambientic.app`, restarts it, and waits for the local health endpoint. Local Apple Development signing deliberately omits distribution-only hardened-runtime timestamps so installation does not depend on Apple's timestamp service while the stable team identity is preserved. Settings shows the installed version, short commit, branch, and build time so an agent or tester can identify the running build without guessing.

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

Implemented — context kernel and tool gateway (PRODUCT.md, NEXT_STEPS.md Phase 1.6):

goal + task events ─┐
approved tool calls ┼─> turn observer ─> candidates ─> corroboration ─> memory records
normalized turns ───┘                                                        │
                                                                             ▼
   projects + session binding (inference: selection > binding > cwd >    context kernel
   recent task > active goal > lexical > project-only)                        │
                                              ┌──────────────────────────────┴────┐
                                     frozen capsule (~900 tok, 1200 cap)   recall on demand
                                              │                                   │
    Claude  --append-system-prompt-file ─┐    │                                   │
    Codex   developerInstructions ───────┼────┘                                   │
    Hermes  first-message envelope ──────┘                                        │
                                                                                  │
    agent tool call ──> stdio shim ──> local socket ──> gateway ──> policy ────────┘
                        (capability                        │          │
                         token in env)                     │          └─> approval boundary
                                                           ▼
                                      SQLite + FTS5 ──> audit journal ──> turn observer
                                                           │
                                            capability search/invoke ──> connected servers
```

External tool schemas are never injected into every request; they are reached through capability search and invoke so the gateway cannot quietly consume the context budget the capsule is bounding.

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

Last updated: 2026-08-26

### Completed

- [x] Goals added as a first-class item in the persistent workspace sidebar.
- [x] Dedicated local Goals service with atomic private JSON persistence, stable IDs, normalized goal/task states, validation, derived progress, and an append-only audit record.
- [x] Ambient floating Goals landing field with active, resting, empty, progress, blocker, and next-action states.
- [x] Goal detail experience with outcome, motivation, success criteria, priority, target date, lifecycle control, and execution signals.
- [x] Six-column milestone-aware Kanban board with human, agent, and mixed ownership, task context, definitions of done, drag-and-drop moves, and status-selector accessibility.
- [x] Goals renderer/main-process IPC contract plus real-time multi-window synchronization.

- [x] Canonical clean-tree `npm run release:local` workflow with a cross-process lock, tests, packaging, stable local development signing, explicit ad-hoc rejection, manifest verification, `/Applications` installation, restart, and health check.
- [x] Local releases now wait for the exact installed Ambientic process to exit and use a narrowly scoped termination fallback before replacing the bundle, preventing a stale process from masquerading as the newly installed build.
- [x] Installed build identity (version, Git commit, and build time) exposed in Settings for reliable Claude/Codex handoff and testing.
- [x] Floating Electron session grid and menu-bar state.
- [x] Claude Code, Codex, and Kimi lifecycle hook bridge.
- [x] Live terminal-process discovery.
- [x] Explicit terminal focus and multi-display companion routing without background terminal-window automation.
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
- [x] Native five-screen first-run experience added: mysterious Welcome, local display-name capture, provider connection/first-task choice, optional reviewed provider-memory bootstrap, and skippable MIDI controller discovery before Overview.
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
- [x] Ambient mode adds an explicit Overview/menu-bar On/Off control backed by Electron’s `prevent-display-sleep` assertion: while enabled, the Mac and display remain awake for agents, the choice survives relaunches, and the assertion is re-established after wake. Quitting Ambientic releases it; closing a MacBook lid remains outside user-space control.
- [x] Ambient mode’s active control and Settings status breathe through a reduced-motion-safe blue–violet–green hue. Settings offers bounded 30-minute, 1/2/4/8/12-hour safety check-ins (four hours by default); a due check-in offers Keep running or Turn off, while no response deliberately leaves agent work uninterrupted.
- [x] Overview header simplified to All threads, Ambient mode, and Vibe; the redundant top-right New task action is removed, and the lighting action is labeled simply **Vibe** while its tooltip retains composition detail.
- [x] Native approval cards now offer **Deny**, **Allow once**, and **Always allow** inside the active Ambientic thread for Codex and Claude Code. Codex replies through app-server; Claude’s official blocking `PermissionRequest` hook waits on Ambientic’s loopback bridge and returns Claude’s own structured decision/permission suggestion. If Ambientic is unavailable or times out, Claude falls back to its native approval dialog.
- [x] Selecting any thread now clears the prior transcript and deterministically scrolls the newly loaded conversation to its latest message. Scrolling away from the bottom pauses auto-follow and reveals a floating **Latest** shortcut; returning to the bottom restores live auto-follow.
- [x] The thread composer now owns its draft independently from the transcript, so typing no longer rerenders every Markdown message. Previously rendered Markdown is memoized, submission shows an explicit **Starting agent…** state, and a failed provider start restores the unsent draft.
- [x] Native MIDI crash containment: Ambientic enforces one running application instance and reuses one CoreMIDI Input/Output pair for its lifetime instead of reconstructing native clients during three-second reconnect polling.
- [x] Project inspection is scope-bounded: home and filesystem roots are rejected for automatic Git/handover inspection, preventing Ambientic from traversing unrelated macOS-protected Music, Photos/Pictures, Documents, or Desktop collections.
- [x] Automatic context enrichment excludes every macOS protected home collection; unsafe discovered sessions retain chat and lifecycle state but skip background Git/transcript inspection. New tasks never default to the home directory.
- [x] Local repository identity normalized to AgentBase: the checkout lives at `/Users/samori/AgentBase`, handover instructions and project-label fixtures use that path, and the shipped product name remains Ambientic.
- [x] Overview task creation now follows provider → model/reasoning → project context → prompt. Codex choices come from its live model catalog, Claude choices use its native CLI aliases, the most recent safe real project is selected visibly, and an explicit scratch choice still creates a uniquely named private workspace under `~/.ambientic/workspaces`.
- [x] Privacy boundary hardened: Ambientic no longer polls terminal windows with Apple Events, reads Chrome session files, or scans every localhost process/CWD in the background. Local previews are inferred from provider context; window focus, preview presentation, attachments, folder selection, microphone capture, and screenshots remain explicit user actions.
- [x] Background provider checks now run from `~/.ambientic/provider-runtime` rather than the user’s home directory, preventing provider-owned CLI startup inspection from being attributed to Ambientic as Music, Photos, Documents, Desktop, or Downloads access.
- [x] Automatic Claude usage refresh is passive: it reads the privacy-preserving status-line cache or local activity only. Claude’s interactive `/usage` collector runs solely after an explicit **Refresh usage** action or completed account connection, and always from Ambientic’s private runtime directory.
- [x] Removed the legacy terminal-specific discovery/focus adapter, hook metadata, cached identifiers, UI states, documentation, and generated hook bytecode.
- [x] Thread labels are generated from the user's actual request. `assembleProviderPrompt` wraps every managed turn in an `<ambientic-context>` element, and the labelling path previously read that preamble as if it were the prompt, so every task launched into the same project was named after Ambientic's own boilerplate ("Project context you are"). The wrapper is now stripped at the summarizer and in the provider hook's existing metadata filter, alongside `system-reminder` and the other wrapper elements it was always meant to sit with.
- [x] A managed Claude turn is granted the directories its attachments actually need. Claude confines its file tools to the working directory, so an attachment from outside the project was named in the prompt but unreadable, and `-p` mode has no way to ask for access — the turn simply reported that permission had not been granted. Out-of-project attachment roots are now passed as `--add-dir`, and a compacted retry keeps the grants of the turn it retries. The home folder, the filesystem root, and whole macOS protected collections are still refused; a real project inside one of them is not.
- [x] A task no longer has to be pointed at the work. The opening turn is given the machine's other known project roots by name and path, so an agent asked about a project it was not launched into opens it rather than reporting the request as out of scope. Reaching them is decided by the permission broker rather than pre-granted through the provider's sandbox: reads inside those projects proceed, and anything else asks. A file the user attached is recorded as a grant for that thread, because attaching it was the decision.
- [x] A thread is named once, from the prompt that establishes what it is for, and keeps that name. The summarizer previously ran on every message and `updateTask` overwrote unconditionally, so a single thread was renamed on each turn — one live thread went "Pick up the task" → "Go" → "What do you mean" → "Ok lets recap the". A prompt that is entirely filler ("go", "ok", "status", "?") now leaves the thread unnamed rather than naming it badly; the filler match is anchored at both ends so a real request like "Please fix the terminal focus bug" still names its thread. An explicit user rename is unaffected and still wins.
- [x] Opening a completed thread now consumes that exact waiting notification across the workspace and native APC profiles: the thread returns to idle and its pad returns from red to blue, an unchanged Codex refresh cannot re-arm the same completion, and a later completed turn becomes red again. Genuine approvals and explicit reply requests remain attention-red until resolved.
- [x] Agents ask for access instead of failing without one. A single provider-neutral policy (`permission-policy.mjs`) decides every request: reading inside a project the user already works in is allowed, writes and anything outside the project are confirmed, and the home folder or a whole protected collection is refused outright. Approving with **remember** grants the containing folder for that thread, so the next file beside it does not ask again. Codex and Hermes already raised these requests natively over JSON-RPC; Claude could not, because `PermissionRequest` never fires under `-p` — it is now brokered through a `PreToolUse` hook, which was measured to grant a read outside the working directory with no `--add-dir` involved. Answering is deliberately two-step: the first call returns at once so a session Ambientic does not manage never waits on it, and only a request that genuinely needs a person blocks. Terminal and history sessions are never brokered at all.
- [x] An approval offers three answers — **Allow once**, **Allow for this thread**, and **Always allow** — and the grant each one creates is coarser than the request that produced it, because approving one file and then being asked about its neighbour is what teaches people to click through prompts without reading them. A shell command previously could not be remembered at all: its scope was empty, so the card offered no way to keep the answer and it asked again on every single call. It is now anchored to the folder it runs in, so "always allow Bash here" is expressible without becoming "Bash anywhere". `always` grants are persisted and apply to every thread and provider; `session` grants are deliberately never written to disk, since a "for this thread" that survived a restart would be a promise the app broke. A read-only grant never authorises a change, and no grant can widen into the home folder. Settings → Permissions lists every standing grant with what it covers and a revoke that takes effect immediately.
- [x] A thread holding a pending approval lights its pad orange on the APC40 MKII and APC mini mk2, overriding the lifecycle colour beneath it and clearing when the approval is answered, cancelled, or times out. The flag is driven by watching the pending-approval collection itself rather than by notifying from each of the dozen places approvals are created and cleared, so the light cannot drift out of step with what is actually pending.
- [x] Overview shows the controller's own grid instead of a thread mosaic. Each pad carries the thread's name in large bold type, lights in the same language as the hardware, and holds its position by `seq` so a thread never moves under the hand; history sessions get no pad, because they never reach the controller. Screen and hardware resolve meaning through one shared module (`src/shared/pad-light.mjs`) that `apc40.mjs` now reads from as well, so the two cannot drift — the existing APC40 LED tests pass unchanged, which is what proves the hardware output did not move. The mosaic component, its styles, and its responsive rules are gone.
- [x] Installing a local release replaces the app bundle whole instead of copying into it. `ditto` merges: it writes the new files over the old ones but never removes what the new build no longer has, so every install inherited the debris of every install before it until a stray file broke the code signature and macOS silently refused to launch the app. The release now stages a complete copy beside the installed app and swaps it in with two renames, so a build that is killed partway leaves either the old app or the new one and never a mixture. The installed bundle's signature is verified after the swap, not only the packaged one, because that is the check that would have caught it.
- [x] A release started from inside the running Ambientic app is refused. Ambientic is used to build Ambientic, so a release can be launched by an agent hosted in the very app the install has to quit — killing the builder partway through, which is what produced the broken bundles. The script now walks its own process ancestry, and explains the situation rather than proceeding. `AMBIENTIC_ALLOW_SELF_RELEASE=1` overrides it for a genuinely detached build.

### In progress

- [ ] Physically confirm on the connected controller that opening a newly red completed thread in Ambientic returns its pad to blue, while an unresolved approval remains orange.
- [x] Add a hosted inference provider layer with a Nebius Token Factory / Fireworks AI / OpenRouter catalog, keychain-only credential storage, live model listing and auto-selection, connection tests, per-workload routing with an automatic and a stay-local option, and a dedicated Settings → Inference surface.
- [ ] Connect a real Nebius Token Factory account, confirm the live model list and a routed thread label end to end, then decide which further Ambientic workloads (memory distillation, handover summaries, workflow drafting) should become routable.
- [x] Build the first Workflow Studio surface: a new left-navigation section, infinite visual canvas, draggable capability nodes, natural-language drafting, local persistence, permission/provider inspector, sequential dry-run visualization, and portable manifest copy.
- [ ] Connect the Workflow Studio to a versioned manifest validator, semantic action registry, atomic workflow/run store, and deterministic headless runner.
- [ ] Prove one semantic action can be invoked consistently from the regular UI, a workflow step, and an existing MIDI Learn mapping.
- [x] Build the dedicated universal Hardware workspace and atomic profile service with saved templates, arbitrary grids, multi-view navigation, semantic assignments, Play/Edit/Map/Test modes, and protected native APC behavior.
- [x] Add generic input-only MIDI discovery, selectable input ports, computer-key Learn, Note/CC input monitoring, conflict replacement, and press/release/hold/value trigger semantics.
- [x] Add portable hardware template import/export with privacy removal of physical bindings, exact thread/goal/workflow targets, and saved prompts.
- [x] Project learned custom-template assignments back onto APC40 MKII/APC mini pads, clearing stale live-session colors while a custom deck is active and restoring the protected native feedback path for Ambientic Live Sessions.
- [x] Development visual QA at 1280×720: the four-row deck scales fully above its footer, pad selection opens the complete inspector, low-motion depth remains legible, and reduced-motion/responsive contracts are present.
- [x] Prove a sanitized two-view bundle can move between separate clean profile stores, survive restart, retain linked-view/Back navigation, discard physical bindings, and expose local targets as setup-required.
- [x] Launch a fully isolated clean development profile alongside the installed app, with separate lock/log/data state, a healthy context database and ephemeral hook port, and live APC mini mk2 Control-port detection.
- [ ] Complete human-operated physical validation for a two-view APC mapping, Back navigation, safe action, and confirmation handling, then repeat the import through the installed app's file dialogs.
- [ ] Validate three workflows end to end: rate-limit handover, build → test → review, and repetitive request → goal task → agent execution → artifact review.
- [ ] Visually validate the new Goals field at common workspace sizes with real goal/task content, including the two-column floating layout, reduced motion, horizontal board navigation, drag/drop, and compact-window fallbacks.
- [ ] Validate the private `goals.json` store through an installed-app restart and confirm a goal, task ownership, board move, and lifecycle change all survive relaunch.
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
- [ ] Run one human-paced onboarding pass from a clean profile, including Codex browser login, Claude embedded login, reviewed provider-memory import, first-task creation, controller skip, and replay from Settings.
- [ ] Physically repeat the arrival-light test with the APC mini mk2; automated coverage confirms the same 64-pad Vibe path, while the connected visual smoke used an APC40 MKII.
- [ ] Use a thread's **Hand off →** action (or the near-limit banner) as the first live cross-provider takeover test now that Claude is connected.
- [ ] Validate automatic handover regeneration against a real provider window crossing 85%, including reset-window deduplication.

### Next

- [ ] Add generic controller LED/SysEx output-profile authoring after the input-first Hardware V1 completes physical and clean-profile validation; retain graceful input-only fallback.
- [ ] Build Ambientic Coach as an opt-in local signal and recommendation system with bounded evidence, source provenance, user feedback, and one-click draft workflows/mappings/goal tasks.
- [ ] Add privacy-safe local template/profile import and export, then validate clean-profile sharing before designing community accounts, public discovery, ratings, or moderation.
- [x] **C1** Shared contract and fixtures, byte-stable prompt assembler regression, and preload boundary.
- [x] **C2** SQLite/FTS5 migrations, repositories, transactions, backups, project backfill, Electron-native rebuild/unpack, and database smoke command.
- [x] **C3** Projects, inference, frozen capsule hashing/budgeting, consented turn observation, deterministic promotion/conflict/expiry/supersession/forgetting, and provenance.
- [x] **C4** Long-lived gateway, stdio shim, hashed scoped tokens, native tools, session approvals, cancellation, audit, and namespaced idempotency.
- [x] **C5** Claude, Codex, and Hermes native capsule/MCP wiring on start and resume.
- [x] **C6** Generic stdio and Streamable HTTP MCP proxying, discovery, schema normalization, health/risk policy, dependents, and capability search/invoke.
- [x] **H1** Non-blocking inferred launch context with correction and inline folderless project/goal/task creation.
- [x] **H2** Thread binding, capsule/hash/token preview, recall scopes, correction, and context activity.
- [x] **H3** Memory profile/projects, provenance, candidates/conflicts, consented search, exclusions, controls, and quiet audit feed.
- [x] **H4** Apps & Tools connection, health, capability permission, dependent, and credential-boundary UX.
- [x] **H5** Gateway approval metadata, session-only remembered approval, destructive safeguards, terminal outcomes, and audit filters.
- [ ] Run one installed-app live acceptance pass across Claude, Codex, Hermes, and a real external MCP server.
- [x] Warn in New Task before launching inside macOS protected folders. The access presentation distinguishes the provider's explicit working-directory access from Ambientic's disabled background inspection and explains why macOS attributes the request to Ambientic; broad home/filesystem roots remain blocked.
- [ ] Link threads, runs, and artifacts to goal tasks without copying whole transcripts; add execution evidence, provider/model metadata, and continuity.
- [ ] Make the frozen capsule the cross-provider continuity mechanism and keep the generated handover file as a portable export rather than the transfer path.

### Deferred — context kernel and gateway backlog

Specified in `PRODUCT.md` → *Deferred — context kernel and gateway backlog*. Designed for now, excluded from this release.

- [ ] Model-assisted memory distillation: opt-in, user-chosen provider, visible per-session token cost, model-derived records marked and never auto-promoted to user scope, with a local-only mode that disables it.
- [ ] Codex dynamic tools as a transport optimization behind the unchanged gateway contract, once the surface is no longer experimental and a second dispatch path is worth maintaining.
- [ ] Native app adapters for Mail, Calendar, Files, and Communication behind semantic capabilities, with Ambientic-owned authorization, independent read/draft/consequential-write levels, and no success claimed without adapter confirmation.
- [ ] Ambientic-hosted agent runtime for providers with no local CLI, behind the same context engine and gateway contract, accepting direct API key custody and per-provider cost accounting.
- [ ] Embeddings, knowledge graphs, external memory providers, remote sync, and non-macOS gateway transport.
- [ ] Add agent task claims with expiring leases, idempotency keys, optimistic concurrency, and review-before-done defaults so multiple providers cannot silently duplicate or overwrite work.
- [ ] Add explainable goal health and next-action reviews based on blockers, inactivity, target dates, and acceptance evidence rather than raw task-count gamification.
- [ ] Replace terminal-owned Hermes and Kimi setup with guided provider-native browser/device-code ceremonies where their supported local protocols expose reliable completion callbacks.
- [ ] Bundle a supported recording/transcription runtime so voice prompts do not depend on Homebrew tools in public builds.
- [ ] Configure Apple notarization for distribution beyond the development Mac.
- [ ] Decide what a managed task may reach beyond its attachments. `--strict-mcp-config` currently removes every user-configured and plugin-provided MCP server from managed Claude tasks, which is faithful to the gateway pillar — Ambientic brokers the tools — but means a user's own connected tools silently disappear the moment they launch from Ambientic instead of a terminal. The options are to keep strict isolation and route those tools through the gateway, to merge the user's MCP configuration alongside Ambientic's, or to make it an explicit per-task choice.
- [ ] Give a managed task somewhere to ask for scope it does not have. Attachment-driven `--add-dir` covers the folder the user already pointed at; a thread that discovers mid-turn that it needs a sibling repository still dead-ends, because `-p` has no permission-prompt channel and Claude Code 2.1.220 no longer exposes `--permission-prompt-tool`. The remaining routes are the Agent SDK's `canUseTool` callback wired to the existing approval queue, or an `ambientic_scope_request` capability on the gateway; both need the session's directory grants to become mutable rather than fixed at creation.
- [ ] Carry this repository's own instructions into managed Claude tasks. Claude Code reads `CLAUDE.md` and does not read `AGENTS.md`, so a task launched into this checkout receives none of the repository rules — verified directly against Claude Code 2.1.220. `assembleProviderPrompt` tells the agent to go read the nearest `AGENTS.md`, which only helps on the first turn and only when project context is attached. Either bridge the file for providers that ignore it or stop relying on the preamble to do it.

### Verification notes — Hardware Mapping V1

- 2026-08-02 focused Hardware/APC verification: 37/37 tests pass across profile persistence and sharing, clean-profile exchange/restart, import graph validation, setup-state repair, confirmation lifecycle, full live/history thread targeting, multi-view navigation, trigger semantics, interaction contracts, MIDI normalization, conflict moves, generic input fallback, native controller behavior, and custom APC assignment LEDs.
- 2026-08-02 release-safe repository verification: `npm run test:local-release` passes 199 runnable tests with 0 failures and 2 intentional transport skips. The separate fake-Claude OAuth callback simulator remains excluded by that script because its live callback wait is flaky; the rest of the Claude authentication suite runs.
- 2026-08-02 production verification: `npm run build` succeeds for the Electron main process, preload, and renderer bundles.
- Browser-assisted visual QA at 1280×720 verified that a four-row deck stays above the footer and that selecting a pad exposes its full assignment inspector.
- A disposable live profile started beside the installed Ambientic app, created its own healthy context database, served `{"ok":true,"sessions":8}` on an ephemeral loopback port, and repeatedly detected the connected `APC mini mk2 Control` input/output. Human pad presses and installed-dialog import remain explicit release gates.
- [ ] Add an in-app reconnect message when another older controller process owns port `47600`.
- [ ] Add history filters, archive controls, and pagination when the local conversation index grows beyond the current recent-session limit.
- [ ] Add rich unified diffs, image/media previews, and embedded localhost websites to the workspace artifact panel.
- [ ] Upgrade Claude integration to its supported Agent SDK control protocol if/when that becomes necessary for fully native permission prompts.
- [ ] Add privacy controls, editable thresholds, handover history/versioning, and optional model-assisted refinement after the deterministic continuity workflow is validated.
- [ ] Expand Improve beyond continuity with transcript-grounded prompt coaching, recurring workflow insights, skill/tool recommendations, and measurable agentic-engineering habits.
- [ ] Add optional provider billing adapters and manual monthly subscription-cost entries so the spend panel can combine exact API costs with clearly labeled fixed plans.
- [ ] Extend the ambient art direction into coordinated screen transitions, preview presentation, optional sound, and user-selectable hardware compositions while respecting reduced motion.

### Verification

- 2026-08-27 release integrity and project audit: the broken install was diagnosed rather than guessed at. The packaged app in `release/mac-arm64` verified clean, while the installed bundle carried `better-sqlite3/build/Release/test_extension.node` from an earlier install, which is what invalidated its seal — proof that `ditto` was merging rather than replacing, and that rebuilding could never repair it. The same mechanism explains the earlier stranded `.BC.T_AfmbMs` temp file. Repository state was audited across every branch and worktree: `release/workflow-interactions-20260730` is the only history not contained in the pushed feature branch, and it is the patch README already records as superseded — confirmed by comparing test counts, where the current branch carries more coverage than the branch it replaced, so nothing was lost. It has been pushed to `origin` regardless, as it was the only history that existed on this Mac alone. Three stale worktrees were pruned and a stale release lock from a killed run cleared. Suite passes 257/259 runnable with 2 intentional skips and 0 failures.

- 2026-08-26 pad grid on Overview: pad assignment is covered directly — pads order by `seq` rather than recency so they hold position, history sessions are excluded, and the grid is always exactly as long as the connected device has pads. The shared tone mapping is covered against the same expectations the hardware uses, including that an approval outranks the lifecycle state beneath it. Moving APC40's LED mapping onto that shared module was proven behaviour-preserving by its existing tests passing untouched. The visual treatment was iterated against a photograph of the user's own APC40 MKII rather than from memory, which corrected three wrong assumptions: the light emanates from the pad's centre, the housing does as much work as the pads, and pad proportions are not square. The final direction is the user's: square pads, fluorescent tone, soft wide falloff, large bold names. Suite passes 256/258 runnable with 2 intentional skips and 0 failures.

- 2026-08-26 standing permissions: the grant model is covered on its own — approving a file grants its folder and its neighbours stop asking, a read grant refuses to authorise a write, a shell command is remembered where it runs and neither leaks to another folder nor becomes a blanket pass for other tools in the same one, a thread grant applies to its own thread and is never persisted, and an `always` grant is not tied to the thread that created it. The lifecycle is covered end to end through the service: **Allow for this thread** does not reach a second thread and writes nothing to disk, **Always allow** does both, a shell command stops asking once allowed, and revoking a standing grant takes effect on the next request. The older boolean caller still means "this thread", so nothing that predates the three-way choice changed meaning. Suite passes 252/254 runnable with 2 intentional skips and 0 failures, and the renderer build succeeds.

- 2026-08-26 opened-thread acknowledgement: regressions cover workspace selection calling the main-process acknowledgement boundary, completed external sessions presenting idle after opening, unchanged provider refreshes preserving that acknowledgement, a new running → completed lifecycle re-arming attention, genuine approval attention remaining actionable, and both APC40 MKII/APC mini mk2 returning acknowledged waits to blue. The focused lifecycle/hardware suite passes 46/46; after integrating the provider-neutral permission broker, orange approval light, and removal of provider pre-grants, the combined full suite passes 241/243 with 2 intentional transport skips and 0 failures; the production Electron main, preload, and renderer bundles build successfully; and `git diff --check` is clean.
- 2026-08-27 inference keys could never be saved: connecting any inference provider from Settings → Inference failed immediately with "has no API key on this Mac". The cause was in the keychain write, not the provider: `security add-generic-password -w` with no value does not read one value from stdin, it prompts twice ("password data", then "retype") and compares them. Feeding the key once left the confirmation empty — and `security` still exits **0**, so the write reported success, stored nothing, and the argument-form fallback in the `catch` never ran. Every provider was affected; OpenRouter only appeared to work because of the inherited pre-rename keychain entry. The write now feeds the value twice and, because the exit status cannot be trusted, reads the key back and only then reports success. A regression test asserts the user-visible contract rather than the shell mechanics: a keychain that reports success while storing nothing must never be described as connected. The Nebius console link was also repointed from `studio.nebius.com` to the post-rebrand `tokenfactory.nebius.com`. This is the defect the 2026-08-16 note predicted when it recorded that the layer had never been run against a live account. Suite passes 257/259 runnable with 2 intentional skips and 0 failures.

- 2026-08-26 pre-granting removed: with the broker confirmed working against the running app, `--add-dir` came out entirely. It pre-granted through the provider's sandbox exactly the access the user asked to be consulted about, so leaving it in would have kept the feature half-defeated. Scope is now decided per request in one place. Two regressions were rewritten rather than deleted, so the behaviour they protected is still covered: a task launched without a project is asserted to be *told* what exists (no `--add-dir` present), and an attached file is asserted not to prompt, since attaching it was already the user's decision. That second test also caught a real property worth keeping — attachments are `statSync`-validated before they are trusted, so a path that does not exist grants nothing. Suite passes 238/240 runnable with 2 intentional skips and 0 failures.

- 2026-08-26 approval light: the grid mapping is covered for both controllers — a thread with a pending approval reads orange whatever lifecycle state sits underneath it, held solid rather than blinking, and unseen attention still blinks red once the approval is answered. The wiring is covered separately and is the part that would rot: creating an approval raises the session store's flag and answering it lowers the flag, driven by the approval collection rather than by any individual call site. `ART_DIRECTION.md` records orange as a question addressed to the person, matching the amber that already carries consent on screen. Suite passes 239/241 runnable with 2 intentional skips and 0 failures.
- 2026-08-26 provider-neutral permission broker: the policy is covered directly — reads inside known projects allow, out-of-project paths ask and report the path a "remember" would grant, writes ask until the folder is remembered, every file of a multi-file edit is considered rather than only the first, and a shell command is never granted from its arguments (`cd <trusted> && cat ~/.ssh/id_rsa` still asks). The broker is covered at the seam that matters most: a session with a `tty`, and a history session, are both answered `null` so they can never block on Ambientic, while a managed thread is answered immediately when the request is already in scope and only registers a pending approval when it is not. An id nobody is holding open resolves rather than hanging its caller. Two defects were found and fixed while wiring this: the installer matched any existing group containing the hook, so reinstalling silently kept the old `AskUserQuestion|ExitPlanMode` matcher and the broker would never have fired, and `PreToolUse` carried no timeout, so Claude would have killed the hook long before a person could answer. Suite passes 237/239 runnable with 2 intentional skips and 0 failures. The hook-to-server round trip itself is not yet exercised against a running app; that needs the rebuild.

- 2026-08-25 persistent thread names: covered by a dedicated suite asserting that a thread takes a name once and holds it across later messages, that filler prompts leave it unnamed instead of naming it badly, and that the name is read from the request rather than the Ambientic preamble. A regression in the first attempt is worth recording: the filler pattern was anchored only at the start, so "Please fix the terminal focus bug" was classified as filler and the existing inference suite caught it. Full suite passes 226/228 runnable with 2 intentional skips and 0 failures. Separately measured against the installed Claude Code 2.1.237 that Ambientic actually resolves: the `PermissionRequest` hook does **not** fire under `-p`, which is why Ambientic's existing approval path never engages for managed tasks, but a `PreToolUse` hook returning `permissionDecision: "allow"` does grant a read outside the working directory with no `--add-dir` at all. That is the mechanism a provider-neutral, always-on permission broker should use, and it makes the current pre-granting of project roots the wrong default.

- 2026-08-23 project discovery: a task started with no project selected now reaches the others. Covered by a regression that drives the real `send` path and asserts both halves together — the spawned command carries `--add-dir` for each known project root, and the assembled prompt names those same roots — because a grant the agent is never told about is one it will not use. Bounding and refusal are covered separately: forty candidate roots collapse to eight, and the home folder, filesystem root, and whole macOS protected collections are still refused while a real project inside one is not. The suite passes 223/225 runnable with 2 intentional skips and 0 failures, and the production Electron build succeeds. Note that `/Applications/Ambientic.app` runs a packaged bundle: the installed build carried none of these changes until reinstalled, which is why the earlier fixes appeared to have no effect.

- 2026-08-21 managed-task naming and file reach: both defects were reproduced before being fixed and re-checked after. The label path was driven through the real summarizer with the real assembled prompt — it returned "Project context you are" for a task whose prompt was "Fix the MIDI clock drift on the APC40", and returns the correct label now. The access boundary was measured against the installed Claude Code 2.1.220 rather than inferred: a headless `-p` turn under `--permission-mode acceptEdits` writes inside its working directory and runs Bash, but a read outside it is refused with "requested permissions to read from … but you haven't granted it yet", and the same read succeeds when the directory is passed as `--add-dir`. Two further findings from that session are recorded as backlog items rather than changed here, because both are product decisions: `--strict-mcp-config` removes the user's own and plugin-provided MCP servers from every managed task, and Claude Code does not read `AGENTS.md`, so this repository's own instructions never reach a managed task. The full suite passes 220/223 with 2 intentional skips; the single failure remains the separately documented simulated Claude OAuth callback timeout, which imports none of the changed modules.

- 2026-08-16 hosted inference providers: the focused inference/context suite passes 14/14, the stable local-release suite passes 215 runnable tests with 0 failures and 2 intentional transport skips, and the production Electron build succeeds. Coverage includes catalog shape, keychain-only key storage (the local `inference.json` is asserted never to contain the key), small-instruct model auto-selection with user override, rejected-key reporting, automatic and explicit workload routing including the disconnect-degrades-to-local path, lazy model discovery for an inherited pre-rename OpenRouter key, environment-key precedence, guarded external links, and the thread-label summarizer's local fallback when a provider fails. Not yet run against a live Nebius or Fireworks account; the model auto-selection heuristics are matched against whatever the account itself lists rather than hardcoded model IDs.
- 2026-08-13 canonical project launch slice: focused context, access, launch-UI, handoff, provider-injection, and workspace regressions pass (53/53), and the production Electron build succeeds. Coverage proves an Ambientic project cannot be paired with an unrelated folder, sub-workspaces remain valid, prompt matching cannot import another project's goal, folderless projects retain durable context, protected-folder access is presented separately from background inspection, and cross-provider handoff preserves the exact project/goal/task binding. The unfiltered suite passes 206 runnable tests with 2 intentional socket skips; its one failure is the previously documented flaky simulated Claude OAuth callback waiting for a fake OAuth URL, outside this launch-context change.
- 2026-08-02 latest-worktree integration: every registered worktree was inspected; the clean workflow runtime and overview branches are ancestors of the integration branch, while the older divergent interaction patch is already represented by the current canvas, navigation, recovery, tests, and documentation. Ambient Mode persistence/wake handling and systematic linked-goal closeout now pass the stable local-release suite (172 passed, 2 socket-only skips, 0 failures), the real Unix-socket/MCP shim suite (4/4), and the production renderer build. The local installer now restores the system Node SQLite ABI before tests and rebuilds it for Electron during packaging.
- 2026-08-01 project-aware task start: focused regressions verify live Codex model/effort normalization, first-turn model and reasoning propagation, bounded project-orientation context, recent-project default selection, explicit scratch fallback, and the renderer-to-main capability IPC. `npm run build` succeeds; the stable local-release gate passes all 148 tests, while the unfiltered suite retains its separately documented simulated Claude OAuth callback timeout (148/149 passing).
- 2026-07-29 frictionless task start: focused regressions verify automatic private-workspace creation, safe slugging, protected/recent-project filtering, renderer-to-main IPC for recent projects, and a submit path that never forces the folder chooser. Explicit home/filesystem roots remain rejected.
- 2026-07-29 installed-build restart fix: the roadmap store contained 31 tickets, but the visible app process predated the file update and retained its old in-memory Goals snapshot. The local installer now verifies that the exact installed process exits before copying or health-checking a release; it refuses replacement if a scoped termination cannot stop that process.
- 2026-07-29 Goals density pass: the production renderer build verifies the compact goal header, progressive goal disclosure, title-only keyboard-selectable/draggable ticket cards, detailed ticket dialog, and removal of the redundant per-card status dropdown. The 31-ticket local roadmap remains persisted in the Goals store.
- 2026-07-29 live roadmap update: the local **Build Ambientic** goal is high priority and contains 31 audited tickets across shared foundations, Workflow Builder, universal hardware mapping, Ambientic Coach, and community phases. Three immediate tickets are active, the goals file has a recoverable pre-roadmap backup, and Ambientic relaunched healthy after loading the new store.
- 2026-07-29 roadmap synchronization: `PRODUCT.md` now specifies the shared semantic action layer, Workflow Builder, universal hardware mapping, Ambientic Coach, community bundle, privacy, and model-agnostic context contracts. `NEXT_STEPS.md`, `HANDOVER.md`, README status, and the live **Build Ambientic** goal use the same phased execution order.
- 2026-07-30 Workflow Studio execution and interaction pass: the canvas supports two-finger panning, pinch zoom centered under the gesture, keyboard delete/Backspace, ⌘Z/Ctrl-Z restoration, and a larger collapsible agent prompt. The workflow library now persists multiple routines and can schedule or manually run real provider-neutral agent steps, pause for approvals, resume from managed provider threads, and retain local run history. The global sidebar collapses persistently through its edge handle or ⌘\\ shortcut. Renderer recovery, rotating redacted diagnostics, corrected Claude usage-window collection, and newest-version Claude binary resolution improve reliability and observability. Browser QA verified prompt collapse, keyboard node deletion, undo restoration, and wheel panning; all 145 stable local-release tests and the production build pass.
- 2026-07-30 Workflow overview visual completion: the previously unstyled library markup now has the intended responsive spatial layout, natural-language creation surface, tactile workflow cards, readable operational states, scheduling controls, and a quiet adjacent run-history stream. The treatment follows the project’s cool mist, selective glow, strong-contrast, and reduced-motion language.
- 2026-07-29 protected-folder prompt root cause: macOS TCC logs identified Claude Code processes spawned by Ambientic as the accessing process and Ambientic as the responsible application for Media Library, Documents, Downloads, and All Files requests. Background provider probes no longer inherit the home directory, and automatic Claude refresh no longer starts the interactive TUI. Regression coverage requires the private provider runtime and passive refresh branch.
- 2026-07-29 local-release exception: the user approved ignoring the single simulated Claude OAuth callback lifecycle timeout for this installation. `npm run test:local-release` excludes only that named case; the remaining suite and every packaging, signing, manifest, restart, and health gate remain mandatory.
- 2026-07-29 Goals foundation: the dedicated three-test Goals service suite passes persistence, progress/blocker derivation, board moves, ownership updates, audit recording, and empty-name validation. `git diff --check` is clean and `npm run build` succeeds for main, preload, and renderer bundles. The broader suite currently has one unrelated intermittent Claude OAuth callback timeout that predates this increment.
- 2026-07-29 macOS privacy root cause: unified TCC logs attributed repeated five/ten-second `kTCCServiceAppleEvents` requests to Ambientic-owned `osascript` children. The periodic terminal-window and Chrome-tab pollers are removed, and regression coverage rejects their reintroduction while confirming localhost previews still derive from sanitized agent context.
- 2026-07-29 Overview task-start regression: task-launch IPC errors are reduced to their actionable provider message, missing error text receives a stable fallback, and the production modal no longer discards rejected provider starts.
- 2026-07-29 repository rename: tracked checkout references and the handover entry point now identify `/Users/samori/AgentBase`; the remote repository remains `Hank-Moogy/AgentBase` while the upstream `therocketgui/vibe-controller` URL is preserved as project provenance.
- 2026-07-27 crash investigation: both macOS reports (`15:08:37` and `15:15:07`) terminate with `SIGABRT` on the main thread inside `MidiInCore::getCoreMidiClientSingleton` during `new midi.Input()`. The controller-lifetime regression confirms repeated disconnected reconnects construct exactly one native input and output pair.
- `npm test`: 102 tests passing, including privacy-safe background discovery, sanitized provider-context localhost previews, actionable managed-task startup errors, a simulated browser-to-localhost Claude OAuth callback, post-login forced usage refresh, non-repeating Claude success feedback, provider-filtered latest-thread entry, passive-reader versus live-Codex state precedence, CoreMIDI client reuse, protected project-scope and explicit-project-folder boundaries, build identity, inherited provider-session environment sanitization, transcript navigation, provider approvals, current/legacy Claude usage navigation, live Claude authentication truth, MIDI layouts, voice validation, and cross-provider workspace behavior.
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

The optional memory step asks only connected Claude Code, Codex, and Hermes runtimes for durable provider-native user context. Those temporary export sessions receive no Ambientic capsule or gateway tools and are excluded from automatic transcript learning, preventing circular imports. Nothing becomes active memory until it is selected in the review screen. Provider runtimes may return no memory; this is expected when their CLI cannot expose consumer-chat memory.
- From anywhere in the workspace: `⌘⇧O`
- For an isolated developer smoke: launch with `AMBIENTIC_STATE_DIR=/tmp/your-ambientic-smoke`

## Local data and permissions

- Ambientic preferences and mappings live in Electron's local `userData` directory.
- The context kernel's SQLite database also lives in `userData`. It holds projects, session bindings, memory records and provenance, normalized session messages and their search index, connection and capability metadata, hashed gateway tokens, and the audit journal. It never holds third-party access or refresh tokens; those stay in the tool's own store or the system keychain.
- Indexing locally visible provider sessions requires one explicit onboarding consent and honors per-provider and per-project exclusions. Secret-shaped content is rejected from durable memory, and high-confidence credentials are redacted before any message is stored or indexed.
- Forgetting a memory removes its content and search rows, leaving only a content-free audit tombstone.
- A corrupt database is never silently reset. The file is preserved and recovery instructions are surfaced.
- The provider integration bridge lives under `~/.ambientic/`. Existing `~/.agentbase/` and `~/.claude-controller/` references are migrated or accepted only for compatibility.
- Claude, Codex, and Hermes keep ownership of their authentication data.
- Ambientic does not need Music or Photos access. Automatic project inspection refuses `/`, `/Users`, and the user's home directory so a broad Git repository cannot sweep macOS-protected personal collections.
- Accessibility permission is required only for focusing terminal windows.
- Microphone permission is required only while recording voice prompts. Audio is written to a temporary local folder and removed after local Whisper transcription.
- Screen Recording permission is required only for companion screenshots.
- This personal voice-input increment resolves Homebrew `ffmpeg` and `whisper` from `/opt/homebrew/bin` or `/usr/local/bin`; the public distribution still needs a bundled runtime.

## Project discipline

`README.md` is the current source of truth for scope and implementation status. Every coding task must update the completed, in-progress, next, and verification information before handoff.

Every major milestone ends at the installed app, not at a source build: after verification and documentation, commit a clean tree, run `npm run release:local`, replace and relaunch `/Applications/Ambientic.app`, and confirm that the running health endpoint and installed build identity match that commit.
