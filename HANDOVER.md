<!-- ambientic-handover -->
# vibe-controller handover

Generated: 2026-07-24T13:31:20.641Z  
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
16f182a Overview: show both 5-hour and weekly limits as matching gauges per provider
a2d3dea Claude usage gauge: scrape the interactive /usage panel for real limit windows
83a8cb8 Stop tracking Python bytecode cache (__pycache__/*.pyc)
e88f58f usage: publish each provider incrementally so one slow collector can't stall the panel
eac0386 Combined checkpoint: Claude usage activity display + concurrent workspace work
```

The working tree is clean or unavailable.



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

- **User direction:** ✓ built in 321ms ✓ built in 17ms ✓ built in 687ms ℹ tests 79 ℹ pass 79 ℹ fail 0 [ambientic] workspace smoke screenshot: /tmp/dual.png -rw-r--r--@ 1 samori  wheel  1013946 Jul 24 15:24 /tmp/dual.png
- **User direction:** [object Object]
- **User direction:** [Image: original 2778x1684, displayed at 2000x1212. Multiply coordinates by 1.39 to map to original image.]
- **Agent result:** The dual-gauge layout works cleanly. The **Provider Balance** panel now shows both windows side by side for each provider: - **Codex** (plus): `5H —` · `WEEK 41%` (green) - **Claude** (subscription): `5H 100%` (red — session maxed) · `WEEK 21%` (amber) - **Hermes**: activity fallback (no rate-limit API) Each provider keeps its accent color, with amber/red tinting when a window gets hot — identical treatment for both. (Codex's `5H` shows `—` because Codex didn't report its short window that refresh; the layout handles a missing window gracefully.) Let me commit, repackage, and reinstall:
- **User direction:** 16f182a Overview: show both 5-hour and weekly limits as matching gauges per provider === repackage + reinstall ===   • skipped macOS notarization  reason=`notarize` options were unable to be generated installed + launched
- **User direction:** 1 file delivered to user.

## Material artifacts

- `/Users/samori/vibe-controller/src/renderer/Workspace.jsx`
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
- `/tmp/dual.png`

## First action

Run `git status --short`, read the directly relevant files, and continue the current objective with the smallest verifiable increment.
