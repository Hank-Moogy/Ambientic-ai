# Ambientic

**The hub for all your agents and all your sources of intelligence.**

Ambientic is a local-first operating layer above AI providers. It gives Claude Code, Codex, Hermes, and future agents one shared home for supervision, context, goals, tools, artifacts, usage signals, and hardware control—without taking ownership of provider credentials or private authentication formats.

The repository is named `Ambientic-ai`; the product presented to users is **Ambientic**.

## Product direction

Ambientic should make a fragmented agent setup feel like one coherent intelligence environment:

- See every active agent, project, task, lifecycle state, approval, and usage signal in one place.
- Start, resume, interrupt, and supervise provider-native agents without navigating between terminal windows.
- Bring user-approved context, memory, goals, and connected information sources to any supported agent.
- Inspect agent-created files, localhost previews, simulators, screenshots, handovers, and other artifacts.
- Use the best provider for each task while keeping one consistent control surface.
- Map meaningful actions to MIDI or keyboard hardware so repeated control becomes muscle memory.
- Keep private context local by default and make every external capability explicit and auditable.

Product-specific vertical applications belong in separate products and repositories. Ambientic may connect to them through normal tools or sources, but they are not part of the Ambientic core.

## What is included

### Unified agent workspace

- Overview command center for live Claude Code, Codex, and Hermes activity.
- Cross-provider Threads with stable user-owned names, search, provider filters, streamed turns, artifacts, approvals, interruption, and native-surface handoff.
- Provider-aware new-task creation with project context, model selection, reasoning or effort controls, and safe folder boundaries.
- Cross-provider handovers, local preview discovery, and companion display presentation.
- Provider login state, quota signals, local consumption history, and diagnostics.
- Independently streamed Overview state with animated skeleton pads, so the pad grid, provider pads, and usage each appear as soon as their own reader returns rather than waiting on the slowest provider probe.

### Goals and context

- Local Goals with outcomes, motivation, success criteria, milestones, ownership, status, and next actions.
- A local SQLite/FTS5 context kernel for projects, session bindings, reviewed memory, provenance, and audit history.
- Small frozen context capsules plus scoped on-demand recall, so agents receive relevant context without copying an entire history into every turn.
- Explicit memory consent, review, exclusions, correction, supersession, and forgetting.

### Agents, tools, and sources

- One permission-scoped capability gateway shared by supported agents.
- Native Ambientic context and Goals tools plus connected stdio or Streamable HTTP MCP servers.
- Read, write, and destructive capability boundaries with user approval and a local audit trail.
- Credentials remain in provider-owned stores, connected applications, or macOS Keychain; agents receive capability results, not raw secrets.
- Hosted OpenAI-compatible inference routing for Ambientic-owned utility tasks, with local fallback.

### Hardware

- Native Akai APC40 MKII and APC mini mk2 live-session control with RGB lifecycle feedback and voice input.
- A dedicated Hardware workspace for MIDI Note/CC and focused keyboard mapping.
- Portable multi-view hardware templates with privacy-safe export, local target setup, input learning, conflict handling, and confirmation boundaries.
- Protected native controller behavior so custom mappings do not weaken the live agent grid.

## Product boundary

Ambientic currently does not provide a general automation builder, scheduler, reusable routine engine, or domain-specific operating system. Provider agents remain responsible for executing work; Ambientic provides the shared intelligence, context, supervision, permissions, and control layer around them.

Retired local feature files are not opened or mutated by current builds. Upgrading therefore preserves unrelated Goals, threads, aliases, memory, permissions, hardware templates, provider state, and private data. Unsupported legacy hardware assignments are ignored individually while supported mappings remain intact.

## Architecture

```text
Claude Code ─┐
Codex ───────┼──> normalized sessions ──> Overview / Threads / artifacts
Hermes ──────┘              │
                            ├──> Goals + project context + reviewed memory
Connected sources/tools ───>├──> scoped capability gateway + approvals + audit
                            ├──> handovers + usage + inference routing
MIDI / keyboard ───────────>└──> hardware actions + operational feedback
```

Ambientic owns the normalized local experience and durable user context. Provider-specific CLIs, hooks, ACP implementations, SDKs, and tool servers remain adapters behind that boundary.

## Privacy and safety

- Local-first stores use private file permissions and atomic writes where applicable.
- Raw credentials are never placed in thread context or portable hardware templates.
- Sensitive actions remain previewable and approval-gated.
- Context is scoped by project, goal, task, and session to prevent accidental cross-project leakage.
- Secret-shaped content is rejected from durable memory; forgetting removes content while retaining only a content-free audit tombstone.
- Exported hardware templates remove physical bindings, exact local targets, and saved private prompts.

## Development

Requirements: macOS, Node.js 22, npm, and the provider CLIs you want Ambientic to supervise. The locked `better-sqlite3@11.8.1` fails to compile against Node.js 26; use Node.js 22 for dependency installation and tests.

```bash
npm ci
npm run rebuild:sqlite
npm run dev
```

Core verification:

```bash
npm run test:local-release
npm run build
```

The default pad roster divides all eight columns equally among connected, authenticated task providers. Each group fills its allocated capacity with recent conversations, including history; missing conversations leave dark pads. Process-discovery placeholders are excluded. Screen and native APC pads use the same layout; conversations refresh by recency within each provider.

Idle live threads can be placed on **Stand by** from the thread header or the Overview pad context menu. Stand by persists locally, holds the on-screen and physical pad solid orange as a check-later reminder, and clears automatically when the next turn begins or when the user removes it.

The canonical installed-app milestone gate is `npm run release:local`. It rebuilds native SQLite for Electron, runs the release tests, packages and signs the app, replaces `/Applications/Ambientic.app`, relaunches it, and checks the installed build identity and health endpoint.

## Current status

Last updated: 2026-09-02

Implemented:

- Unified Overview and Threads across Claude Code, Codex, and Hermes.
- Managed turns, approvals, interruption, provider login, usage, artifacts, previews, and handovers.
- Goals, project binding, context capsules, reviewed memory, scoped gateway tools, connected MCP servers, and local audit.
- Hosted inference settings and local fallback for Ambientic utility tasks.
- Native APC40 MKII/APC mini behavior plus generic input-first hardware mapping and portable templates.
- Simplified product boundary across runtime, navigation, preload/IPC contracts, capability scopes, hardware actions, styles, and tests.
- Overview load path: per-source state hydration in place of a single blocking `Promise.all`, an immediate non-blocking `get-connectors` reply backed by a deduplicated background probe, parallel auth and version reads per provider, and staggered skeleton pads while each slice is in flight.
- Claude limit rejections from managed turns now update the Overview immediately, including a 100% session or weekly window and the provider-reported reset time; that evidence remains authoritative until reset even when Claude's interactive `/usage` panel omits the exhausted window.
- Claude usage gauges track every managed turn. Claude's `stream-json` output carries a `rate_limit_event` derived from the API's own unified rate-limit headers, so each turn refreshes the 5-hour and weekly gauges exactly, with no extra process launch and no quota cost. The interactive `/usage` scrape is now only a fallback for when no turn has run recently.
- Claude's refusals are read as limits regardless of wording. An exhausted subscription window on an account whose extra usage cannot cover the overflow is reported by Claude Code as missing usage credits or as an organization that disabled Claude Code, never as a limit; Ambientic now recognises those and reports a 100% session window, and the thread explains what actually happened instead of repeating a message about an administrator.
- The local release finds the running installed app through `ps` rather than `pgrep -f`. The old lookup reported no match for a demonstrably running app when a release was started from a Claude session Ambientic had spawned, and both callers read an empty result as "not running" — so the guard against releasing from inside Ambientic never fired and the wait for the old process returned immediately, which is exactly how a bundle gets replaced underneath a live app. Helper and MCP-shim processes running the same binary are still excluded.
- Safety & approvals now has one persisted provider-neutral default: Ask me, Work in project, or Approve routine work. Ambientic compiles that intent into an explicit Codex sandbox/reviewer policy, Claude's native permission mode, and conservative Hermes ACP decisions; Hermes project edits can proceed quietly while dangerous commands still require the user because Hermes exposes no equivalent automatic reviewer.

Next:

- Run a full installed-app acceptance pass across Claude Code, Codex, Hermes, and one real external MCP server.
- Complete physical APC validation for two-view navigation, confirmations, voice input, and RGB state restoration.
- Improve artifact review, thread-to-goal evidence linking, source visibility, and cross-device supervision.
- Develop Ambientic Coach as an opt-in, evidence-backed recommendation layer without automatic mutation.
- Validate privacy-safe hardware template exchange before considering public sharing or accounts.

Verification on 2026-09-02:

- `npm test`: 302 tests, 300 passed, 2 intentional transport skips, 0 failures.
- `npm run build`: production main, preload, and renderer bundles built successfully.
- `npm run release:local`: packaged, signed, installed into `/Applications/Ambientic.app`, relaunched, and reported healthy; installed build identity confirmed against the release commit and `codesign --verify --deep --strict` passed.
- The `ps` lookup was checked against the live installed app, not only in tests: it returns the running app's pid from a session where `pgrep -f` had previously returned nothing.
- Physical APC smoke remains outstanding.

The durable visual direction is defined in [ART_DIRECTION.md](ART_DIRECTION.md), the product contract in [PRODUCT.md](PRODUCT.md), and the forward architecture in [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md).

## Fresh-checkout verification — 2026-11-05

- Installed the lockfile dependencies using Node.js 22.23.4 on Apple Silicon.
- `npm run test:local-release`: 301 tests, 299 passed, 2 skipped, 0 failures.
- `npm run build`: main, preload, and renderer production bundles passed.
- Both APC40 MKII and APC mini mk2 have native profiles. The current MIDI service opens one controller at a time; simultaneous control from both devices remains future work.
- Electron SQLite/FTS5 smoke passed; `npm run preview` launched and `/health` returned `ok: true`. Startup detected a Keystation 61 MK3 MIDI input. Accessibility was not granted and the Claude CLI was unavailable.
- Physical APC MIDI acceptance remains outstanding. A signed installed release requires an Apple Development or Developer ID identity; none was available in this environment.

## Provider onboarding reliability — 2026-11-05

- Claude Desktop discovery supports both `version/claude.app` and `version/build-hash/claude.app` layouts. Installed Claude Code uses the existing native login wizard in onboarding step two.
- Pending provider discovery remains “Checking…” with a disabled action, rather than briefly offering an installation guide.
- Verified the actual Desktop-managed Claude 2.1.309 executable on this Mac. The earlier missing-CLI startup finding was a discovery bug, now corrected.
- Verification: 302 local-release tests, 300 passed, 2 skipped; production build and Electron SQLite/FTS5 smoke passed. Interactive account authorization still requires the user's own sign-in.
- Distribution target: a friend downloads Ambientic and connects their own providers in onboarding step two. Fresh-machine provider installation and signed/notarized distribution remain open; the current missing-provider path opens installation documentation.

## Recent conversations hardware default — 2026-11-05

- Automatic MIDI detection now rechecks ports while connected, switching from a generic keyboard to a newly attached APC40 MKII/APC mini mk2 and recovering after disconnection.
- The built-in Recent conversations layout opens the ten newest available threads per provider without manual mapping. Each provider owns two columns in the top five rows; extra APC mini rows remain empty.
- Hardware and Overview use the shared recent-thread grid. Hardware hides custom templates and editing modes behind Custom mappings; existing custom mappings are preserved.
- Verified: APC40 mkII appears in both local MIDI input and output ports; 303 regression tests, 301 passed, 2 skipped; production build passed. Relaunched app visibly reports APC40 MKII connected and displays ten Claude plus seven available Codex conversations in the shared grid. Physical pad response still requires hands-on confirmation.

## Dynamic provider allocation — 2026-11-05

This supersedes the initial fixed two-column / ten-thread layout above.

- Only connected, authenticated task-capable providers receive columns. Two providers split 4/4; three split 3/3/2; one gets all eight.
- Home and Hardware share aligned provider headers with names, column ranges, and pad capacities. Native grids remain eight columns wide at every viewport size.
- Drag the divider between headers to resize, or focus it and use arrow keys. The screen previews the split; releasing saves it and updates physical pads. Equal split restores automatic allocation.
- Overrides persist locally per connected-provider combination; absent providers do not reserve unused columns. Pad colors continue to communicate agent state, not provider identity.
- Each group fills its capacity with newest conversations rather than stopping at ten. Empty slots indicate no available thread.

Verification: 306 regression tests, 304 passed, 2 intentional skips; production build and Electron SQLite/FTS5 smoke passed. Updated development app relaunched and connected to APC40 MKII. Live drag/drop and reset interaction remains unverified because native UI automation returned `noWindowsAvailable`; allocation and resizing boundaries are covered by automated tests.

## Pad destinations and conversation fidelity — 2026-11-05

- Hardware settings → When I press a pad offers Native (default) or Ambientic. Physical pads, Home/Hardware pad mirrors, and custom thread-opening assignments share this routing. Selecting/focusing a thread no longer automatically launches localhost companion previews; previews remain an explicit action.
- Native uses a known Codex deep link or terminal target. Threads without a native route fall back to Ambientic. Requests owned by Ambientic open there and say “Handled in Ambientic”; a separate native runtime cannot answer them.
- Passive Claude sessions no longer enter Ambientic's permission broker. Ordinary assistant questions no longer fabricate a needs-input signal. Reading a native Codex conversation through Ambientic's separate app-server preserves the native discovery state instead of treating that server's notLoaded state as task completion.
- Pending requests and running jobs rank ahead of idle history within each provider's columns. Native Codex discovery reads up to forty recent threads; its activity remains an estimate based on local rollout/index events, not a subscription to native UI state.
- Chat hides Claude tool-result user rows, metadata, compaction summaries, and known injected context wrappers. Actual question answers remain visible. Technical activity is collapsed separately; source transcripts are unchanged. This is a cleaner conversation view, not an embedded replica of the native interface.
- Verified: 312 regression tests, 310 passed, 2 intentional skips; production build and Electron SQLite/FTS5 smoke passed. Relaunched development app reports APC40 MKII connected, this Codex task Working, and zero needs-input tasks. End-to-end pad clicks remain unverified because desktop input automation failed with ScreenCaptureKit error -3812. Signed installation remains outstanding as documented above.

## Homepage destination switch — 2026-11-05

- Overview now starts with a prominent Show Native / Show Ambientic control. The selected option is highlighted, keyboard accessible, and saved through the same pad preference used by Hardware settings. It applies to physical and on-screen pads.
- Saving disables repeat clicks; failures show an inline retry message. Existing native-unavailable and Ambientic-owned approval fallback remains in effect.
- Verification: production build and pad-navigation regression test passed. In the relaunched development app, both homepage options were clicked and their selected state and explanatory text verified; restored Native afterward. Layout visually checked at the current window size. Physical pad end-to-end acceptance remains open.
