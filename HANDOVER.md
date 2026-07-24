<!-- ambientic-handover -->
# vibe-controller handover

Generated: 2026-07-24T13:23:19.041Z
Source provider: claude
Source task: Ok now can you
Reason: 100% used · Current session

## Continue from here

Work in `/Users/samori/vibe-controller`. Read this file, inspect the working tree, and continue the current objective. Preserve existing uncommitted work. Do not ask for the prior chat, and do not spend a turn re-summarizing this handover unless the repository contradicts it.

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

Ok now can you

## Completed and material state

Recent commits:

```text
a2d3dea Claude usage gauge: scrape the interactive /usage panel for real limit windows
83a8cb8 Stop tracking Python bytecode cache (__pycache__/*.pyc)
e88f58f usage: publish each provider incrementally so one slow collector can't stall the panel
eac0386 Combined checkpoint: Claude usage activity display + concurrent workspace work
6c77020 NEXT_STEPS: Overview usage wiring + startup-refresh caveat
```

Current working tree (preserve these changes):

```text
M hook/controller-hook.py
 M hook/install.sh
 M src/main/index.js
 M src/main/server.js
 M src/main/workspace-service.mjs
 M src/renderer/Workspace.jsx
 M src/renderer/spend.css
 M test/workspace-service.test.mjs
```

Change footprint:

```text
hook/controller-hook.py         | 31 ++++++++++++++++++++
 hook/install.sh                 | 33 ++++++++++++++-------
 src/main/index.js               |  1 +
 src/main/server.js              | 30 ++++++++++++++++++-
 src/main/workspace-service.mjs  | 65 +++++++++++++++++++++++++++++++++++++++--
 src/renderer/Workspace.jsx      | 45 ++++++++++++++++++----------
 src/renderer/spend.css          | 16 +++++-----
 test/workspace-service.test.mjs | 35 ++++++++++++++++++++++
 8 files changed, 218 insertions(+), 38 deletions(-)
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

Implemented after this handover was generated:

- Claude and Codex approval cards now expose Deny, Allow once, and Always allow in the active thread. Claude’s command hook waits for Ambientic’s loopback decision and returns official `PermissionRequest` structured output; persisted approval uses only Claude-provided `permission_suggestions`, with the provider-native prompt as the timeout/unavailable fallback.

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

- **Agent result:** Now I'll rewrite `OverviewUsageBalance` to show both windows as matching meters. First the component:
- **User direction:** The file /Users/samori/vibe-controller/src/renderer/Workspace.jsx has been updated successfully. (note: the file had been modified on disk since you last read it — the edit applied cleanly, but the file contains other changes not in your context. Read it before edits that depend on surrounding content.)
- **Agent result:** Now the CSS — replace the grid row layout with the head + dual-meter layout:
- **User direction:** 43	.overview-usage__row { --balance-accent: #67df98; min-height: 56px; padding: 9px 14px; display: grid; grid-template-columns: 30px minmax(90px, 1fr) 38px; gap: 10px; align-items: center; border-bottom: 1px solid #282d34; position: relative; } 44	.overview-usage__row[data-provider="claude"] { --balance-accent: #e49a70; } 45	.overview-usage__row[data-provider="hermes"] { --balance-accent: #898cff; } 46	.overview-usage__icon { width: 29px; height: 29px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--balance-accent) 35%, #343a43); border-radius: 8px; background: color-mix(in srgb, var(--balance-accent) 7%, #15191e); color: var(--balance-accent); } 47	.overview-u
- **User direction:** The file /Users/samori/vibe-controller/src/renderer/spend.css has been updated successfully. (file state is current in your context — no need to Read it back)
- **Agent result:** Now build, test, and verify the dual-meter layout renders:

## Material artifacts

- `/Users/samori/vibe-controller/src/renderer/Workspace.jsx`
- `/Users/samori/vibe-controller/src/main/usage.js`
- `/Users/samori/vibe-controller/NEXT_STEPS.md`
- `/tmp/overview.png`
- `/Users/samori/vibe-controller/src/main/index.js`
- `/tmp/overview2.png`
- `/tmp/ov3.png`
- `/Users/samori/vibe-controller/resources/claude_usage.py`
- `/Users/samori/vibe-controller/src/main/claude-usage-scrape.mjs`
- `/Users/samori/vibe-controller/package.json`
- `/tmp/gauge.png`
- `/Users/samori/vibe-controller/src/renderer/spend.css`

## First action

Run `git status --short`, read the directly relevant files, and continue the current objective with the smallest verifiable increment.
