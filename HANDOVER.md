<!-- ambientic-handover -->
# vibe-controller handover

Generated: 2026-07-24T14:35:16.749Z
Source provider: claude  
Source task: vibe-controller  
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

vibe-controller

## Completed and material state

Recent commits:

```text
5efb10c Overview: live countdown to each rate-limit reset
16f182a Overview: show both 5-hour and weekly limits as matching gauges per provider
a2d3dea Claude usage gauge: scrape the interactive /usage panel for real limit windows
83a8cb8 Stop tracking Python bytecode cache (__pycache__/*.pyc)
e88f58f usage: publish each provider incrementally so one slow collector can't stall the panel
```

Current working tree (preserve these changes):

```text
M HANDOVER.md
 M README.md
 M resources/claude_usage.py
 M src/main/claude-usage-scrape.mjs
 M src/main/usage.js
 M src/renderer/Workspace.jsx
 M src/renderer/workspace.css
 M test/usage.test.mjs
?? src/renderer/thread-scroll.mjs
?? test/thread-scroll.test.mjs
```

Change footprint:

```text
HANDOVER.md                      | 22 +++++++--------
 README.md                        |  5 ++--
 resources/claude_usage.py        | 51 +++++++++++++++++++++++++++++------
 src/main/claude-usage-scrape.mjs |  6 ++++-
 src/main/usage.js                | 58 +++++++++++++++++++++++++++++++++++++---
 src/renderer/Workspace.jsx       | 45 ++++++++++++++++++++++++++++---
 src/renderer/workspace.css       |  1 +
 test/usage.test.mjs              | 11 +++++++-
 8 files changed, 169 insertions(+), 30 deletions(-)
```

## Remaining direction

- Claude's Codex-style usage gauges are implemented and packaged. The installed app was refreshed on 2026-07-24 and its bundled collector reports `CLAUDE_SUBSCRIPTION_REQUIRED`: Claude Code's active credential is API Usage Billing, so the user must reconnect Claude Code with the restored Pro/Max subscription before five-hour and weekly limits become available.
- The 2026-07-27 audit found `out/` newer than both packaged copies: repository `Ambientic.app` was dated July 25 and `/Applications/Ambientic.app` July 24. The combined shared tree now includes Claude's provider-environment/thread-scroll changes plus a Codex composer responsiveness fix that isolates draft rendering, memoizes Markdown, shows **Starting agent…**, and restores failed drafts. It passes 83 tests and a production build; package/install verification follows from this exact tree.

- Ambientic accounts or a cloud backend.
- Universal monetary spend totals from consumer subscriptions. Exact currency reporting requires an optional provider billing connection (for example an OpenAI organization Admin API key); Claude subscription spend is not exposed by the local CLI, and Hermes costs belong to its configured upstream provider.
- Archived/deleted-provider sessions and Claude internal subagent transcripts; the workspace intentionally indexes top-level user conversations only.
- Rich diff rendering, image galleries, or embedded localhost web previews inside the full workspace; this increment lists touched files and retains the existing companion-preview system.
- Fully interactive Claude tool approvals inside Ambientic. Claude managed turns currently use the CLI's `acceptEdits` permission mode; unsupported permission prompts are reported and can be continued in the native surface.
- Windows or Linux support.
- Generic MIDI-controller output profiles.
- Public auto-update infrastructure.
- OpenClaw integration.

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

- No canonical recent messages were available. Use the task title, README, and working tree as the source of truth.

## Material artifacts

- No task artifacts were recorded. Inspect the working tree.

## First action

Run `git status --short`, read the directly relevant files, and continue the current objective with the smallest verifiable increment.
