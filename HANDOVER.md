<!-- ambientic-handover -->
# AgentBase handover

Generated: 2026-07-30T10:54:57.600Z  
Source provider: claude  
Source task: Why is it not  
Reason: 100% used · All models

## Continue from here

Work in `/Users/samori/AgentBase`. Read this file, inspect the working tree, and continue the current objective. Preserve existing uncommitted work. Do not ask for the prior chat, and do not spend a turn re-summarizing this handover unless the repository contradicts it.

## Product direction

Ambientic should become the interface above agent providers:

- See every active agent, project, task, state, context, and usage signal in one place.
- Start, resume, interrupt, and supervise agents without navigating between terminal windows.
- Inspect agent-created files, diffs, localhost websites, simulators, screenshots, and other artifacts visually.
- Use the best provider for each task without changing the control surface or learned workflow.
- Map semantic actions to physical controls so repeated operations become muscle memory.
- Keep a local-first trust model while allowing optional remote access and synchronization later.
- Help users improve their agentic engineering through continuity coaching, prompt and workflow insights, skill suggestions, and provider-neutral best practices derived from their own work.

The product should own the user experience and normalized session model, not provider credentials or private authentication formats. Provider-specific hooks, ACP implementations, SDKs, and CLIs are adapters behind a stable Ambientic interface.

## Current objective

Finish release validation for the implemented context kernel and tool gateway.
The code and renderer work for C1–C6 and H1–H5 are in the working tree; the
Electron-native package smoke passes, leaving one live three-provider/external-
MCP acceptance pass. `HANDOVER.md` remains a portable export, not the normal
cross-provider continuity path.

## Session log — 2026-08-02 (context platform implemented)

- Added the canonical SQLite/FTS5 store, ordered migrations and backups, project
  backfill, session bindings, frozen capsules, deterministic memory observation,
  redaction, exclusions, corroboration, conflicts, supersession, and forgetting.
- Added one permission-restricted local gateway and stdio MCP shim with hashed,
  scoped, expiring session capabilities; native Ambientic tools; approval,
  cancellation, audit, namespaced idempotency; and generic stdio/Streamable HTTP
  MCP discovery and proxying.
- Wired Claude, Codex, and Hermes through their native instruction and MCP seams.
  Codex dynamic tools remain deliberately disabled.
- Added systematic goal closeout for linked work. Before finishing a meaningful
  turn, the agent must fetch the latest bound goal, compare evidence with ticket
  acceptance criteria, request justified status updates, and explicitly confirm
  reconciliation even when nothing changed. Missing closeout is audited, and
  ticket writes outside the bound goal are rejected.
- Added preload contracts plus the New Agent context selector, thread capsule and
  activity panel, Memory workspace, Apps & Tools, gateway approval metadata, and
  onboarding transcript-consent control. Visual QA passed at desktop and 720 px.
- Extracted the legacy prompt wrapper behind a byte-regression-tested assembler;
  kept Goals and Workflows JSON-backed behind repository interfaces.
- Automated local-release tests, production renderer build, real Unix-socket
  gateway transport, Electron 33 native rebuild, and packaged-app SQLite/FTS5
  smoke pass. Do not reset a broken database; the startup error intentionally
  preserves it for recovery.

## Session log — 2026-08-02 (architecture settled, docs aligned)

Second design session. The plan from 2026-08-01 was challenged against a
competing proposal and merged. Three positions from the first design were
overturned and are now settled:

1. **Gateway transport.** A localhost HTTP gateway was wrong — a TCP port is
   reachable by any local process. Replaced by one long-lived gateway plus a
   small stdio MCP shim per session, forwarding over a permission-restricted
   local socket, with the capability token passed only through the shim's
   environment and persisted as a hash.
2. **Tool schema budget.** The first design bounded the capsule to ~1200 tokens
   and would then have injected every proxied server's schemas into every
   request. External capabilities now go behind `ambientic_capability`
   search/invoke; only the narrow native tools stay directly visible.
3. **Goal inference.** Titles-only degradation was replaced by a seven-step
   inference ladder, made safe by showing the inferred binding before launch and
   allowing correction afterwards. Inference is acceptable when visible, not
   when silent.

**Settled technical choices:** SQLite/FTS5 via `better-sqlite3` as the canonical
store with native packaging as a release gate; goals and workflows stay JSON
behind repository interfaces; ~900-token frozen capsule with a 1200 hard cap,
bytes and hash persisted per session; deterministic harvesting only; Hermes
reproduced, not forked.

**Verified against the installed toolchain this session, not assumed:**

- `claude --help` confirms `--append-system-prompt-file`, `--mcp-config`, and
  `--strict-mcp-config` all exist. C5's Claude path is sound as written.
- `codex app-server generate-json-schema --out DIR` dumps the full protocol.
  `ThreadStartParams` accepts `developerInstructions`, a free-form `config`
  object, and `dynamicTools`. C5's Codex path is sound. Dynamic tools are
  deliberately deferred: experimental, and a second dispatch path is not worth
  maintaining alongside the shim.
- Hermes is `NousResearch/hermes-agent`, MIT, Python, source at
  `~/.hermes/hermes-agent`. Its `agent/memory_provider.py` defines the lifecycle
  worth copying (`system_prompt_block`, `prefetch`, `sync_turn`,
  `get_tool_schemas`, `handle_tool_call`, `on_session_end`, `on_pre_compress`).
  Its built-in memory store is a single markdown file at
  `~/.hermes/memories/USER.md`; external providers are third-party services.
  There is no retrieval engine in there to harvest — the value is the interface.

**Baseline checkpoint:** commit `906f21a` preserves the working tree, including
pre-existing uncommitted work and the in-flight context contract, store, and UI
scaffolding. The stray bundled `index.js` at the repo root is excluded from it —
that is electron-vite output that landed outside the gitignored `out/`, and it
should be deleted or moved rather than committed.

**Lane discipline — active risk.** Two agents are working this repo
concurrently. The backend lane owns `src/main/**`, preload, package/build config,
the shim, migrations, and backend tests. The product lane owns
`src/renderer/**`, renderer tests, and product documentation. As of this session
that split was not being observed: renderer files and `package.json` were both
being written from one lane on `agent/workflow-studio`, not on the planned
`feature/context-kernel-gateway` and `feature/context-memory-ui` branches. Split
the branches before the next merge or the integration step will be painful.

Documentation updated this session: `PRODUCT.md`, `NEXT_STEPS.md`, `README.md`,
and this file.

## Ambient mode — two confirmed defects fixed 2026-08-02

Reported symptom: the machine still went to sleep with ambient mode on. Both
causes were confirmed against the running app, not inferred.

1. **Wrong assertion type.** `enable()` started `prevent-app-suspension`, which
   Electron documents as keeping the system active while *allowing the screen to
   be turned off*. `pmset -g assertions` against the running app showed
   `PreventUserIdleSystemSleep 1` but `PreventUserIdleDisplaySleep 0`. Because
   macOS `powerd` already holds its own "prevent sleep while display is on"
   assertion, the old type only began mattering once the screen went dark — and
   did not hold from there. Now `prevent-display-sleep`, exported as
   `AMBIENT_BLOCKER_TYPE`.
2. **Enabled state was never persisted.** `set-ambient-mode` wrote nothing to
   prefs while `set-ambient-mode-check-in` did, and construction restored only
   `checkInMinutes`. Every relaunch, crash, or auto-update silently turned
   ambient mode off while the tray checkbox correctly reported false. Persistence
   now happens in the service's `change` handler so the tray toggle and all
   future callers are covered by one write, and `prefs.ambientModeEnabled` is
   restored at startup.

Also added `reassert()` plus a `powerMonitor` `resume` hook, because a
sleep/wake cycle can leave the process holding a blocker id the system no longer
honours. It is a no-op when disabled or when the assertion still holds.

No user-space assertion of any type prevents sleep when the lid is closed. That
limitation is inherent, not a bug to chase.

## macOS permission prompts — root cause was ad-hoc signing, fixed 2026-08-02

Reported symptom: Ambientic re-asking for Apple Music, Photos, and Documents
access, having been granted them previously. Not related to the ambient mode
work — `powerMonitor` and `powerSaveBlocker` are not TCC-gated.

`build.mac` set no `identity`, so electron-builder fell back to ad-hoc signing
(`Signature=adhoc`, `TeamIdentifier=not set`). macOS keys TCC grants for a
properly signed app to signing identity plus bundle ID, which survives rebuilds;
with no identity it falls back to the binary's cdhash, which changes on **every
build**. Each local release therefore looked like a brand-new app and silently
discarded every permission previously granted.

Fixed by setting `build.mac.identity` to the machine's one available certificate
plus `"type": "development"`. Verified on a fresh `npm run pack`:
`Authority=Apple Development: samori.osei@gmail.com`, `TeamIdentifier=K78PT544J5`,
chain to Apple Root CA, `codesign --verify --deep --strict` clean.

Two things worth knowing:

- `project-scope.mjs` still correctly blocks Ambientic from inspecting protected
  home children, and the context kernel's project backfill is guarded at its call
  site in `workspace-service.mjs`. That guard was never the problem, and it also
  cannot be the whole solution: Ambientic spawns provider CLIs as children, and
  macOS attributes a child's file access to the responsible parent process, so
  anything an agent reads under `~` prompts under Ambientic's name. Sessions whose
  cwd is the home directory will therefore always surface these prompts.
- This is a development certificate. It stops the permission churn on this
  machine, but the app is not distributable to others without a Developer ID
  certificate, `hardenedRuntime`, and notarization.

Remaining manual step: install the newly signed build and grant the permissions
once more. They persist across subsequent rebuilds from that point.

## Resolved — better-sqlite3 ABI transition in the release lane

The Electron package and the system Node test runner require different native
ABIs. After packaging, Node previously failed the SQLite-backed tests with
`ERR_DLOPEN_FAILED`:

```
better_sqlite3.node was compiled against NODE_MODULE_VERSION 130,
this version of Node.js requires NODE_MODULE_VERSION 131
```

130 is Electron 33's ABI and 131 is the system Node used by `npm test`.
`scripts/rebuild-sqlite-node.mjs` now restores the Node ABI with the active SDK's
libc++ headers before the release tests. The existing Electron rebuild then runs
during packaging. The stable local-release suite passes 172 tests with only the
two separately exercised socket tests skipped; the real socket suite passes 4/4.

Previous objective, now landed: make Claude usage actually display (broken since
the status-line payload dropped rate_limits), plus main-process diagnostic
logging and approval cards that say what is being requested.

## Session log — 2026-08-01 (architecture, specs only)

Design session. No source files changed. Read the existing provider bridge and
context path, then wrote the memory-layer and tool-gateway architecture into the
spec documents.

**What the audit found:**

- All context injection in the product is one hard-coded string in
  `providerPrompt()` (`src/main/workspace-service.mjs:180`): a mode-guidance line
  and attachment paths inside an `<ambientic-context>` block. **Goals are never
  injected into any agent.**
- `handover-service.mjs` is the only real cross-provider context transfer, and it
  works by writing `HANDOVER.md` into the project and telling the next provider to
  read it. It is the intended architecture in miniature — hard-coded, one-shot,
  rate-limit-triggered, file-based.
- The gateway seam already exists and is deliberately empty: both
  `session/new` (Hermes) and `session/resume` pass `mcpServers: []`, and
  `runClaude()` spawns with no `--mcp-config` and no `--append-system-prompt`.
  Wiring the gateway is a matter of filling seams that are already in place, not
  restructuring the bridge.

**Decisions taken (Samori, 2026-08-01):**

1. Provider scope — target the local CLIs now, but keep the context assembler and
   gateway transport runtime-agnostic so an Ambientic-hosted API agent loop drops
   in later without rework.
2. Harvest scope — deterministic events plus local transcript mining now.
   Model-assisted distillation is backlogged, not dropped.
3. Gateway v1 — Ambientic-native tools plus proxying user-connected tool servers.
   Native app adapters (Mail, Calendar) are backlogged, not dropped.

**Architecture, in one line:** thin push, wide pull. A byte-stable session capsule
of 600–1200 tokens carries identity, active goal, acceptance criteria, project
card, and *an index of what else exists*; everything else is pulled on demand
through the gateway. The capsule must not be rebuilt per turn — that breaks
provider prompt caching and multiplies cost for no gain.

**Documents changed:** `PRODUCT.md` (new pillar 0; *Model-agnostic context
strategy* replaced by the full *Memory layer and tool gateway* spec; new
*Deferred — memory and gateway backlog*), `NEXT_STEPS.md` (new Phase 1.6 with
sub-phases a–e and an exit condition), `README.md` (roadmap item 0, planned
architecture diagram, Next backlog rewritten, new Deferred backlog section).

**Open items / blockers for the next session:**

- **Verify before building:** how the Codex app server accepts per-session tool
  servers. `thread/start` currently takes only `{ cwd }`. If Codex supports MCP
  only through global `~/.codex/config.toml`, per-session tokens do not work for
  it and it needs a static token with session inferred from cwd — weaker
  attribution, and it changes the gateway's identity model.
- **Packaging decision:** the memory store wants SQLite with FTS5 for ranked
  retrieval. `better-sqlite3` is a native module and `package.json` sets
  `"npmRebuild": false`. `@julusian/midi` proves native deps ship, but decide this
  deliberately rather than at release time.
- Phase 1.6a should land as a pure refactor with byte-identical output before any
  behavior change, so the seam is verifiable on its own.
- Phase 1.5 (agent-assisted authoring, Apps & Tools) and 1.6 share the connection
  and permission model. Decide whether they merge or 1.6 goes first.

## Why Claude usage was broken "forever" — root cause, 2026-07-30

`hook/claude-statusline.py` was the designed PRIMARY source: Claude invokes the
status-line command with a JSON snapshot, the script pulls `rate_limits`
(`five_hour` / `seven_day`) and writes `~/.ambientic/claude-usage.json`, and
`collectClaude` reads that cache.

**Current Claude Code no longer sends `rate_limits`.** Captured a real payload
from 2.1.220 via `claude --settings '{"statusLine":…}'` pointed at a dumper (no
user config touched). Its only top-level keys are:

```text
context_window, cost, cwd, effort, exceeds_200k_tokens, fast_mode, model,
output_style, session_id, thinking, transcript_path, version, workspace
```

So `normalize_window` always returned `None`, the script returned early, and the
cache was never written again. The on-disk file was a 20-hour-old relic. Because
passive refreshes deliberately refuse to launch a provider TUI, the passive path
had **no data source at all** — hence "waiting for an observation" forever, or a
stale 100% presented as a live rate limit.

**Fix (within the privacy boundary):** a forced scrape now *writes* the cache the
status line can no longer fill (`writeClaudeUsageCache`, atomic temp+rename), so
passive refreshes and the next app launch serve real windows until they reset.
Verified end to end: forced → `five-hour=44% seven-day=5%`; a fresh service doing
a passive refresh → same numbers from `claude-status-line`, previously the false
100%.

**Periodic refreshes now read the limits too — this is intentional and is the
default.** Previously `collectClaude` refused to scrape unless `force` was set,
because launching a provider TUI in the background was a product boundary
asserted by `test/privacy-boundaries.test.mjs`. Samori explicitly authorised
changing it (2026-07-30) after the risks were checked empirically on 2.1.220:

- no transcript is left in `~/.claude/projects` (verified across ~8 scrapes),
- no stray processes survive (the long-lived `claude` processes on this machine
  are Samori's own sessions, 3–6 day uptimes, cwd `/Users/samori`),
- no prompt is sent, so it consumes no quota,
- it runs from `providerRuntimeDirectory()` (private, 0700), so macOS never
  attributes a protected-folder scan to Ambientic,
- the scrape cache (8 min success / 4 min failure, shared in-flight) bounds the
  2-minute refresh cycle to ~1 short-lived launch per 8 minutes.

The privacy test was rewritten rather than deleted: it now asserts the scrape runs
from the private runtime directory and never from `homedir()`. An intermediate
opt-in preference + UI toggle was built and then removed at Samori's request —
do not reintroduce it; the behaviour is meant to be on by default with no toggle.

Verified end to end with no preference present at all (fresh-install conditions):
startup logs `[usage] claude collector using …2.1.217… (force=false)` followed by
`[usage] claude scrape ok: five-hour=60% seven-day=6%`.

Also fixed while verifying: `resetTextToEpoch` dropped the 5-hour reset entirely
because ANSI stripping delivers "Resets 3:10pm" as "ets 3:10pm" (anchored regex).
Loosening it initially broke dated weekly resets — "Aug 6 5am" was parsed as the
next 5am, i.e. tomorrow — so the bare-time branch is now guarded by a month check.
Both cases are covered by tests.

## Session log — 2026-07-30 (Claude, opus)

Everything below is committed-ready: `npm run build` is clean and `node --test test/*.mjs`
passes 139/139. Written by hand — the auto-generated "Recent decision context"
section further down mislabels scraped tool output as "User direction"; do not
trust it, and note this whole file is regenerated by `handover-service.mjs` on a
rate-limit handover, which will clobber this section.

**1. Overview reported a false "rate limited" (fixed).**
Root cause was in `src/main/usage.js`, not in Claude or the user's plan. The cached
status-line document at `~/.ambientic/claude-usage.json` held `five-hour: 100%`
recorded 19.3h earlier, whose `resetAt` had passed 19.2h ago. The only staleness
check was a 24-hour age cap on `observedAt`, so an expired window sailed through
and was served as current truth (real `/usage` at the time: ~2% weekly).
- `parseClaudeStatusLineUsage` now drops windows whose `resetAt` has already
  passed and rejects the cache when none survive, so the caller falls through to
  a live source. **`resetAt` is in seconds; `observedAt`/`now` are milliseconds.**
- `collectClaude` no longer returns the cache when `force` is set — an explicit
  Refresh was a no-op whenever a cache file existed.
- Three regression tests in `test/usage.test.mjs`.

**2. No diagnostic logging (added).** A packaged app discards stdout, so all 38
`console.*` calls in main vanished and this bug had to be diagnosed by running
`src/main/*` modules directly under node.
- New `src/main/logging.mjs`: tees main-process console output to
  `~/.ambientic/logs/main.log`, rotating at 2 MB (keeps one `.1`), captures
  `uncaughtException`/`unhandledRejection`, and **redacts secret-shaped values**
  (`sk-ant-*`, `sk-*`, `sbp_*`, `gh[pousr]_*`, JWTs, `access_token`/`api_key`
  assignments) because this file is opened from a menu item.
- Initialised in `src/main/index.js` before any service; tray gains
  "Open diagnostic log".
- Log lines added at the blind spots that cost this session: which `claude`
  binary the usage collector resolved, scrape success percentages, the
  unavailable-limits reason, the passive-refresh branch, and failed Claude turns
  (exit code + binary + error text).
- Verified end-to-end by running the built app: the log now records startup and
  `[usage] claude passive refresh: no usable cached limits…`, which also confirms
  fix #1 rejecting the stale cache. Tests in `test/logging.test.mjs`.

**3. Approval cards didn't say what was being requested (fixed).**
`requestExternalApproval` set `title: event.tool_name` — the user saw "Bash" or
"Edit" with no indication of what would run.
- New exported `describeApprovalRequest(toolName, toolInput)` in
  `workspace-service.mjs` builds a one-line request summary per tool (Bash prefers
  Claude's own `description`; Edit/Write/Read shorten the path to `…/dir/file`;
  WebFetch shows the host; MCP `mcp__server__tool` becomes `server: tool`), clipped
  to 120 chars. Approvals also carry `tool` now.
- `Approval` in `Workspace.jsx` leads with that title; the tool name is secondary.
- Three tests in `test/workspace-service.test.mjs`.

**4. Claude binary is now resolved by version, not by list position.**
This machine carries three installs: a stale Homebrew cask (2.1.31), the real
native login (`~/.local/bin/claude`, 2.1.220), and Claude Desktop's own copy
(2.1.217). Both `connectors.js` and `usage.js` hardcoded Homebrew first and were
saved only by luck — `usage.js` by its Desktop preference, `connectors.js` by a
`command -v` hit. Against 2.1.31 the `/usage` scrape fails outright.
- New `src/main/claude-binary.mjs` gathers every candidate (standard paths, every
  Claude Desktop version directory, and any login-shell `command -v` result),
  reads each `--version`, and picks the highest. Selection is a pure function
  (`pickNewestClaudeCommand`) so it is tested without spawning; the async
  resolver caches for 10 minutes.
- Wired into both `usage.js` (`resolveCommand`) and `connectors.js`
  (`executablePath`), so the connector and the usage collector now always drive
  the *same* binary. The shell hit is offered as a candidate, not trusted.
- Removed the superseded `sortClaudeCodeVersions` / `compareClaudeVersions` /
  `findClaudeDesktopCommand` from `usage.js` (dead once this landed) and their
  test; `test/claude-binary.test.mjs` covers the same ground, including the
  numeric-vs-lexical trap where "2.1.31" sorts above "2.1.220" as a string.
- Verified on this machine: resolves to `~/.local/bin/claude` 2.1.220, and a real
  app run logs `[usage] claude collector using /Users/samori/.local/bin/claude
  (force=false)` → `scrape ok: five-hour=11% seven-day=8%`.

**Still open / deliberately not done**
- `resources/claude_usage.py` is genuinely flaky: the same binary returned 9%,
  14%, 20% and one hard failure, because it races a 12-second budget driving an
  interactive TUI. Fix #1 stops it producing a *wrong* number, not an absent one.
- Its blind two-right-arrows tab navigation is stale: the panel now has four tabs
  (`Status Config Usage Stats`).
- Hermes/Nous Research provider logo: user deprioritised; needs the image asset in
  `src/renderer/assets/` plus image support in `AgentIcon` (currently path-only).
- Logo centring (`display:block` on `.agent-icon`, `height:auto` on the three tile
  rules) is reasoned from CSS but never visually verified.
- Live secrets sit in `.claude/settings.local.json` permission strings
  (`sk-ant-api03-…`, `sbp_…`, `sk_live_…`). User chose to defer.
- Do **not** read the macOS Keychain to diagnose Claude auth; the user rejected it.

## Completed and material state

Recent commits:

```text
f50bb22 Add visual workflow studio
3512b13 Make task project selection optional
31d544c Simplify Goals ticket board
f982963 Define core Ambientic product roadmap
77e6c49 Prevent protected-folder prompts from provider probes
```

Current working tree (preserve these changes):

```text
M ART_DIRECTION.md
 M HANDOVER.md
 M README.md
 M resources/build-info.json
 M src/main/index.js
 M src/renderer/WorkflowBuilder.jsx
 M src/renderer/Workspace.jsx
 M src/renderer/main.jsx
 M src/renderer/workflow-model.mjs
 M src/renderer/workflows.css
 M src/renderer/workspace.css
 M test/workflow-model.test.mjs
?? index.js
?? test/workflow-interactions.test.mjs
```

Change footprint:

```text
ART_DIRECTION.md                 |   2 +
 HANDOVER.md                      | 160 +++++++++++++++++++++++----------------
 README.md                        |   6 +-
 resources/build-info.json        |  10 +--
 src/main/index.js                |  28 +++++++
 src/renderer/WorkflowBuilder.jsx | 138 ++++++++++++++++++++++++++++-----
 src/renderer/Workspace.jsx       |  20 ++++-
 src/renderer/main.jsx            |  43 +++++++++--
 src/renderer/workflow-model.mjs  |  19 +++++
 src/renderer/workflows.css       |   6 +-
 src/renderer/workspace.css       |   8 +-
 test/workflow-model.test.mjs     |  24 +++++-
 12 files changed, 359 insertions(+), 105 deletions(-)
```

## Remaining direction

- Ambientic accounts or a cloud backend.
- Universal monetary spend totals from consumer subscriptions. Exact currency reporting requires an optional provider billing connection (for example an OpenAI organization Admin API key); Claude subscription spend is not exposed by the local CLI, and Hermes costs belong to its configured upstream provider.
- Archived/deleted-provider sessions and Claude internal subagent transcripts; the workspace intentionally indexes top-level user conversations only.
- Rich diff rendering, image galleries, or embedded localhost web previews inside the full workspace; this increment lists touched files and retains the existing companion-preview system.
- Fully interactive Claude tool approvals inside Ambientic. Claude managed turns currently use the CLI's `acceptEdits` permission mode; unsupported permission prompts are reported and can be continued in the native surface.
- Windows or Linux support.
- Generic MIDI-controller output profiles.
- Public auto-update infrastructure.
- OpenClaw integration.
- Agent-facing Goals tools or MCP server; this first increment establishes the canonical local model and human interface before agents receive scoped read/write access.
- Linking an existing provider thread or artifact to a goal task, assignment leases, approval-gated agent mutations, or automated next-action reviews.
- Executing workflow nodes against live providers or inbox/calendar connectors; the current Workflow Studio is the inspectable authoring and portable-manifest slice, while durable execution, approval journals, retries, and restart recovery remain the next engine increment.

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

## Recent decision context

- **Agent result:** Installed build is commit `3512b13` (Jul 29) — one behind HEAD. Let me check whether that commit already had the desktop-binary preference.
- **User direction:** === when was findClaudeDesktopCommand introduced? === 4c871e4 Checkpoint usage tracking and responsive agent threads === is it present in installed commit 3512b13? === count: 2 === is providerSpawnEnv in 3512b13? === count: 1 === diagnostic field in scraper at 3512b13? === count: 1
- **Agent result:** The installed build **does** have all the fixes — yet nothing is running. Let me launch the packaged app directly so I can capture its logs and see the real failure.
- **User direction:** pid 77700 === log size ===        0 amb.log === usage / claude / error lines === Shell cwd was reset to /Users/samori
- **Agent result:** App runs but logs nothing. Let me instead execute the app's **own** usage code path directly against the repo source — that reproduces exactly what Ambientic does.
- **User direction:** 65:export function knownUsageCommandCandidates (name, home = homedir()) { 97:export function sortClaudeCodeVersions (versions) { 175:export function parseClaudeUsage (stdout) { 221:export function parseClaudeStatusLineUsage (payload, now = Date.now()) { 249:export function claudeUsageCachePath (home = homedir()) { 344:export function parseCodexRateLimits (result) { 580:export function parseKimiUsage (payload) { 618:export class UsageService extends EventEmitter { 694:export function createUsageService () { === collector wiring === async function fetchKimiUsage (token) {   return await fetch(KIMI_USAGE_URL, {     headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },     s

## Material artifacts

- `/Users/samori/vibe-controller/resources/claude_usage.py`
- `/private/tmp/claude-501/-Users-samori/09ff2cff-39d5-416b-9ac1-90e8f737ea83/scratchpad/usage_debug.py`
- `/private/tmp/claude-501/-Users-samori/09ff2cff-39d5-416b-9ac1-90e8f737ea83/scratchpad/usage_probe.py`
- `/Users/samori/vibe-controller/src/renderer/styles.css`
- `/Users/samori/vibe-controller/src/main/env-path.mjs`
- `/Users/samori/vibe-controller/src/renderer/AgentIcon.jsx`
- `/Users/samori/vibe-controller/src/renderer/Workspace.jsx`
- `/Users/samori/vibe-controller/src/main/workspace-service.mjs`
- `/Users/samori/vibe-controller/src/renderer/composer-controls.css`
- `/private/tmp/claude-501/-Users-samori/09ff2cff-39d5-416b-9ac1-90e8f737ea83/tasks/bnz359212.output`
- `/Users/samori/AgentBase/src/main/connectors.js`
- `/Users/samori/AgentBase/src/renderer/Workspace.jsx`

## First action

Run `git status --short`, read the directly relevant files, and continue the current objective with the smallest verifiable increment.
