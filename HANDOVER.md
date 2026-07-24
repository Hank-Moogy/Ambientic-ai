<!-- agentbase-handover -->
# AgentBase handover

Generated: 2026-07-23  
Source: Codex  
Suggested next provider: Claude Code  
Project: `/Users/samori/vibe-controller`

## Mission

AgentBase is a local-first macOS control surface above Codex, Claude Code, and Hermes. It unifies tasks, transcripts, provider usage, artifacts, previews, and native Akai APC40 MKII / APC mini mk2 hardware workflows without owning provider credentials.

The current product direction is to make the first encounter with AgentBase feel as intentional as the long-term agentic-engineering workflow. A native four-screen onboarding now introduces the field, captures a local display name, connects existing providers or starts a first task, and optionally wakes a MIDI controller before revealing Overview. The same increment restores manual Overview usage refresh and replaces Claude's obsolete print-mode `/usage` polling with a privacy-bounded local status-line quota bridge.

## Current objective

The first production-shaped handover, provider account flows, and persistent consumption ledger are implemented. The current creative increment establishes `ART_DIRECTION.md` and adds an Overview Vibe control that plays a temporary ambient lighting composition on either supported APC before restoring operational LEDs.

## What is already working

- Full Electron workspace plus compact APC40 MKII controller.
- Managed Codex via app-server, Hermes via ACP, and Claude Code via its local CLI.
- Cross-provider history, normalized task states, transcripts, Markdown rendering, artifacts, localhost/simulator previews, and prompt sending.
- Provider consumption collection in `src/main/usage.js`:
  - Codex through `account/rateLimits/read`.
  - Claude through cached `rate_limits` emitted by Claude Code's local status-line payload after real agent activity; AgentBase never submits a quota prompt.
  - Kimi remains in the legacy usage adapter but is not part of the current visible product scope.
- Overview's compact provider-balance card again has a refresh button with in-progress feedback. Claude's row exposes a specific setup/staleness reason when no safe quota observation exists.
- `hook/claude-statusline.py` persists only normalized five-hour/seven-day usage and reset times in `~/.agentbase/claude-usage.json`. The installer adds it only when no custom Claude status line exists, preserving user configuration.
- Full-screen first-run mode lives in `src/renderer/Workspace.jsx` and `src/renderer/onboarding.css`: Welcome → local name → provider field/first task → optional MIDI controller → Overview.
- First-run state persists in AgentBase preferences through narrow IPC. It can be reset from Settings or `⌘⇧O`; `AGENTBASE_STATE_DIR` enables isolated repeatable visual tests.
- Kimi Code is now a detected account-only connector with the official `kimi login` setup command and install guide. It is intentionally excluded from managed-task choices until a real Kimi conversation bridge exists.
- A disconnected→connected native MIDI transition starts the existing cold Vibe composition automatically for either APC40 MKII or APC mini mk2 and restores operational LEDs when the phrase ends.
- `ART_DIRECTION.md` now defines onboarding as a minimalist game introduction plus ambient instrument, with single decisions, large type, calm spatial motion, and reduced-motion parity.
- `src/main/consumption-ledger.mjs` persists normalized capacity snapshots and events in Electron user data, detects exact Codex reset use from allowance and quota transitions, distinguishes natural renewals, and tracks provider credit balance deltas.
- Settings → Usage & Billing contains the quota board and AI usage/spend-signals history with recent local activity, reset/limit counters, observed credit usage, and explicit provider coverage boundaries. Overview is intentionally agent-focused again.
- `ART_DIRECTION.md` defines AgentBase’s fluid, aerial, ambient visual and physical-interaction language; `AGENTS.md` requires it to be revisited for material creative changes.
- Overview Vibe cycles between cold center-wave and cold-orbit studies. It now sends only changed LEDs at a 60 ms cadence with slower phase movement and a denser cold palette, reducing visible stepping without saturating MIDI. The hot Game of Life and illumination studies were removed because their hard on/off rhythm conflicted with the ambient direction.
- A compact Overview provider-balance card restores at-a-glance Codex/Claude quota and Hermes activity without moving detailed usage history or billing out of Settings.
- Threads sidebar is activity-first instead of project-grouped: a bounded local interaction map keeps the latest conversation opened by the user first, active/provider-recent threads are highlighted in **Recent & active**, and dormant history is separated into **Earlier threads** without breaking provider/search filters.
- Turn state now has one provider-neutral precedence across UI and hardware: error/pending approval or hook-reported user wait → attention/red; known active managed turn or hook progress → running/green; completed managed turn → idle/blue; dormant history → history. Lifecycle state is written to the hardware session store before snapshot emission, passive terminal snapshots no longer mask hook state, and workspace lists refresh on streamed changes.
- Threads navigation is globally recency-first using the latest known message activity, including immediate managed user/agent updates. Project groups inherit the timestamp of their newest conversation, and an icon-only All/Codex/Claude/Hermes filter sits above search.
- The current local ledger is seeded with the real Codex reset just used by the user (reported limit hit; exact 97% → 0% and reset allowance 1 → 0). The packaged runtime subsequently refreshed it to 2% used, confirming continued observation.
- APC40 MKII pad selection, RGB state, MIDI Learn, and per-column push-to-talk.
- APC mini mk2 native 8×8/64-pad task mode, RGB state, Track-button column push-to-talk, and Scene/fader MIDI Learn.
- Settings → MIDI Hardware with persisted Automatic, APC40 MKII, and APC mini mk2 profiles plus device-specific mappings.
- The latest packaged build is running as one healthy instance; Automatic mode detected the attached `APC mini mk2 Control` port and initialized the native profile.
- Stable per-provider thread aliases and an inline Rename action keep the same name across Overview, Threads, compact controller, and hardware pads; provider refreshes no longer overwrite aliases with first-prompt text.
- The alias-enabled app is packaged at `release/mac-arm64/AgentBase.app`, and this exact Codex task is locally aliased to `AgentBase`; one manual app restart is required to load the new bundle.
- Codex consumption discovery now resolves ChatGPT.app's bundled Codex binary; Overview shows real window durations and explicitly reports when Codex omits its short-term window.
- Settings → AI Providers.
- Official Codex ChatGPT browser login, with persistent global waiting/success/error feedback and `account/read` fallback verification.
- Improve → Continuity with provider-risk cards and one brief per project folder.
- Automatic handover preparation at 85% of any available provider quota window.
- Manual Prepare, Refresh, Open, and Continue with another connected provider actions.
- Deterministic bounded handovers built from README direction, Git state, recent canonical user/assistant messages, and material artifacts; tool logs and credentials are excluded.
- Target-provider continuation creates a managed task in the same folder with a compact instruction to use the handover rather than request the old chat.
- Claude’s official interactive `/login` now runs in a hidden pseudo-terminal behind an AgentBase wizard with browser handoff, minimal interaction controls, sanitized output, credential polling, and no separate Terminal window.
- Claude authorization-code paste auto-submits once, immediately reports verification, never echoes or stores the code, and moves raw TUI redraws into collapsed diagnostics.
- Claude verification recognizes the CLI success screen, reads only account identity metadata from Claude’s local provider-owned configuration, and times out to a retryable code step instead of spinning indefinitely.
- The thread composer accepts native file/folder selections and exposes Build, Plan, and Ask. Codex uses app-server `localImage`/`mention` inputs and collaboration presets, Claude uses its planning permission mode, and Hermes receives a compact path-aware instruction.
- Codex canonical user-message events now replace AgentBase's optimistic local row by client message ID or normalized text; one row remains and its attachment/mode metadata is retained.
- Test suite currently has 73 passing tests, including activity-first thread ordering/recent separation, Codex optimistic-message reconciliation and native attachment/mode payloads, Claude status-line quota parsing/staleness, long-context Claude recovery, Kimi connection command coverage, MIDI arrival detection, cross-provider latest-message ordering, two smoothed native APC Vibe compositions, the persistent consumption ledger, reset and credit transitions, persistent alias/provider-refresh regressions, bundled-Codex usage discovery, weekly-only quota parsing, APC mini mk2 ordering/RGB/PTT, APC40 regressions, real PTY relay, OAuth-link validation, phase detection, non-retention, and secret-exclusion smokes.

## Architecture landmarks

- `src/main/index.js` — Electron lifecycle, IPC, windows, service wiring.
- `src/main/workspace-service.mjs` — normalized Codex/Claude/Hermes task read/create/send/interrupt behavior.
- `src/main/usage.js` — provider rate-limit collectors and two-minute refresh service.
- `src/main/consumption-ledger.mjs` — persistent local quota/reset/credit event ledger.
- `src/main/sessions.js` — normalized live session store.
- `src/renderer/Workspace.jsx` — Overview, Threads, Settings, task creation, transcript and artifacts.
- `src/renderer/workspace.css` — full-workspace styling.
- `src/preload/index.js` — narrow renderer IPC bridge.
- `test/workspace-service.test.mjs` and other `test/*.mjs` — Node test suite.
- `README.md` and `AGENTS.md` — product status and repository rules.

## Working tree state

The tree intentionally contains uncommitted AgentBase changes. Preserve them. They include provider-account settings, Codex browser authentication, connector detection improvements, auth feedback, UI adjustments, and associated tests. Run `git status --short` before editing and do not reset unrelated work.

## Implemented handover architecture

- `src/main/handover-service.mjs` owns risk evaluation, project deduplication, bounded deterministic rendering, atomic file writes, and provider continuation.
- `src/main/index.js` wires automatic evaluation to usage updates and exposes handover IPC.
- `src/preload/index.js` exposes the narrow handover bridge.
- `src/renderer/Workspace.jsx` and `src/renderer/improve.css` implement the new Improve domain.
- `test/handover-service.test.mjs` covers threshold selection and clutter-free provider-neutral output.

## Immediate next actions

1. Run `git status --short`; preserve the existing uncommitted work.
2. Physically validate the connected APC mini mk2 in Settings → MIDI Hardware: all 64 pads, RGB states, Track-button push-to-talk, Scene-button Learn, and fader Learn.
3. Replay onboarding from Settings or `⌘⇧O` and run the complete human-paced sequence, including name entry, one account ceremony, first-task creation, controller skip, and Overview arrival.
4. Repeat the controller-arrival step with the APC mini mk2 and confirm its full 64-pad cold-water phrase restores normal LEDs.
5. Restart Claude Code and send one real subscription-backed message so the newly installed status-line bridge publishes its first quota observation.
6. Click the restored Overview refresh button and confirm Claude five-hour/seven-day usage appears. If Claude reports API billing or omits `rate_limits`, reconnect Claude Code with the Pro/Max subscription account before testing again.
7. Open the running AgentBase build, select **Improve**, find this AgentBase project, and choose **Continue with Claude**.
8. Confirm Claude receives this file, works in `/Users/samori/vibe-controller`, and starts without asking for the Codex transcript.
9. Validate automatic regeneration when a real provider window crosses 85%.
10. Send one Codex prompt from AgentBase and confirm the optimistic row stays single when Codex returns its canonical user-message event; then try a folder attachment in Plan mode.

## Guardrails

- Product name is **AgentBase**, even if the concept is casually called Agenthub.
- Keep all credentials in provider-owned stores.
- Keep the APC40 MKII behavior intact.
- Update `README.md` before ending every coding task.
- Prefer a deterministic, auditable handover builder for the MVP; model-assisted refinement can be added later behind strict size and privacy controls.
