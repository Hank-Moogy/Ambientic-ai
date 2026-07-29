# Ambientic next steps

Last updated: 2026-07-29

This is the execution order for the next core product phase. The same work is represented as tasks under the local **Build Ambientic** goal.

## Current objective

Build the smallest safe Workflow Builder vertical slice on top of a shared semantic action layer. Do not start with the community marketplace or a large free-form canvas.

The first usable slice is:

1. Define and validate a portable workflow manifest.
2. Register a small provider-neutral action catalog.
3. Run a linear workflow locally with inputs, approvals, cancellation, history, and safe resume.
4. Build a simple ordered-step editor and run inspector.
5. Ship three real templates and validate them across connected providers.

## Phase 0 — shared foundation

- Define the versioned semantic action registry used by UI controls, workflows, hardware mappings, and Coach suggestions.
- Define portable schemas for workflows, hardware profiles, recommendation drafts, triggers, permissions, capability requirements, and compatibility.
- Define the local execution/audit envelope: actor, trigger, goal/task/thread references, timestamps, inputs, results, errors, idempotency key, and permission decisions.
- Define import/export privacy linting and secret placeholders.
- Preserve the APC40 MKII native profile as a first-class capability test.

Exit condition: one semantic action can be invoked from the UI, a workflow step, and a learned hardware control and produces the same validated result.

## Phase 1 — Workflow Engine MVP

- Implement a deterministic local runner for ordered steps, conditions, waits, retries, timeouts, and bounded branching.
- Implement initial actions: start/resume agent, send prompt, wait for provider state, ask for human approval/input, update a goal task, collect/link an artifact, notify, and play a hardware cue.
- Add dry run, cancel, resume, idempotency, permission gates, and a durable execution journal.
- Add manual, schedule, session-state, rate-limit, goal-state, and hardware trigger definitions; expose manual trigger first.
- Add a compact ordered-step editor before evaluating a node canvas.
- Add run detail with inputs, current step, timeline, logs, approvals, outputs, retry, and recovery.
- Validate three templates:
  - Rate-limit handover to another provider.
  - Build → test → review with human approval.
  - Repetitive request → goal task → agent execution → artifact review.

Exit condition: all three templates can complete, fail safely, and resume after Ambientic restarts without duplicating a consequential step.

## Phase 2 — portable workflow library

- Add local template gallery, search, duplicate/fork, version history, and import/export.
- Add manifest compatibility checks, required provider/capability display, configurable inputs, permission preview, and test mode.
- Add privacy linting that blocks secrets, transcript content, and personal absolute paths from exports.
- Test sharing a bundle between two clean Ambientic profiles before adding accounts or public discovery.

Exit condition: another user can import, configure, preview, and run a workflow without seeing the author's private data.

## Phase 3 — universal hardware mapping

- Inventory generic MIDI and keyboard input/output capabilities.
- Generalize the current mapping model to device profiles, banks, layers, modifiers, press/hold/release, values, conditions, and semantic actions.
- Build device discovery, input monitor, MIDI/keyboard learn, conflict resolution, test mode, and recovery.
- Add output-feedback profiles with input-only fallbacks.
- Add profile import/export, privacy linting, compatibility checks, and local gallery.
- Maintain dedicated APC40 MKII and APC mini mk2 regressions throughout.

Exit condition: a new MIDI controller and a keyboard shortcut can each be configured without code, exported, imported into a clean profile, and restored with correct feedback semantics.

## Phase 4 — Ambientic Coach

- Define explicit transcript/source permissions, retention, redaction, and local-only mode.
- Build a local signal index for recurring intents, repeated manual sequences, provider/rate-limit friction, goal stagnation, hardware gaps, and cost opportunities.
- Add opt-in RSS/newsletter/bookmark ingestion with provenance and source-level controls.
- Generate evidence-backed recommendation cards with confidence, estimated benefit, and one-click creation of a draft workflow, mapping, goal task, skill, or provider policy.
- Add accept/edit/dismiss/snooze feedback and measure whether recommendations improve outcomes.
- Add cost recommendations using known usage/billing data without pretending consumer subscription telemetry is exact.

Exit condition: the Coach finds one real repeated behavior, explains it with bounded evidence, generates a useful draft automation, and learns when the user rejects it.

## Phase 5 — community

- Define accounts/sync only after local bundle exchange is validated.
- Add publishing, discovery, attribution, versioning, updates, forks, reporting, and moderation.
- Separate workflow templates from hardware profiles while allowing a setup bundle to reference both.
- Never upload private source material or derived conversation evidence as part of a shared bundle.

## Immediate next tickets

1. Write `workflow.schema.json` and three example manifests.
2. Implement the semantic action registry with capability and permission metadata.
3. Implement an atomic local workflow/template/run store.
4. Implement a headless linear runner with cancellation, idempotency, and restart recovery tests.
5. Wire the first action through all three surfaces: UI, workflow, and existing MIDI Learn.

## Validation required before each phase advances

- Unit tests for schema migrations, validation, permission boundaries, idempotency, and recovery.
- Installed-app restart smoke with real local data.
- At least one live provider run on Codex, Claude Code, and Hermes where supported.
- Physical APC40 MKII regression for state LEDs and existing learned controls.
- Privacy review of every new file scan, source connector, export, and model call.
- README, handover, goal tickets, and GitHub PR kept synchronized.
