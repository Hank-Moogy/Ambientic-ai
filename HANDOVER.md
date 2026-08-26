<!-- ambientic-handover -->
# AgentBase handover

Generated: 2026-08-26T15:28:10.664Z  
Source provider: claude  
Source task: AgentBase  
Reason: 100% used · Current session

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

AgentBase

## Completed and material state

Recent commits:

```text
71a88c0 Merge commit 'f4a7ba4' into codex/acknowledge-opened-threads
f4a7ba4 Stop pre-granting the access the user asked to be consulted about
5d77d9c Light a pad orange while it waits on you
1a759a5 Merge commit '4154f10a82e1b57eed94c1159827eb674c425e72' into codex/acknowledge-opened-threads
f23d945 Acknowledge completed threads when opened
```

Current working tree (preserve these changes):

```text
M resources/build-info.json
 M src/main/index.js
 M src/main/permission-policy.mjs
 M src/main/workspace-service.mjs
 M src/preload/index.js
 M src/renderer/Workspace.jsx
 M test/permission-policy.test.mjs
?? src/main/permission-grants.mjs
```

Change footprint:

```text
resources/build-info.json       |  6 ++--
 src/main/index.js               |  8 ++++++
 src/main/permission-policy.mjs  | 45 +++++++++++++++++------------
 src/main/workspace-service.mjs  | 63 +++++++++++++++++++++++++++++++----------
 src/preload/index.js            |  5 +++-
 src/renderer/Workspace.jsx      | 51 ++++++++++++++++++++++++++++++---
 test/permission-policy.test.mjs | 28 +++++++++++++++---
 7 files changed, 161 insertions(+), 45 deletions(-)
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
- Linking an existing provider thread or artifact to a goal task, assignment leases, approval-gated agent mutations, or automated next-action reviews.
- Agent-powered natural-language workflow authoring and native inbox/calendar connectors. The current prompt uses a deterministic local parser; live workflow steps run through managed AI providers, while direct app actions still require normalized adapters and confirmed tool evidence.

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
                                        

## Recent decision context

- No canonical recent messages were available. Use the task title, README, and working tree as the source of truth.

## Material artifacts

- No task artifacts were recorded. Inspect the working tree.

## First action

Run `git status --short`, read the directly relevant files, and continue the current objective with the smallest verifiable increment.
