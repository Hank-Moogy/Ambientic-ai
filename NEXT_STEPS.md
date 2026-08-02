# Ambientic next steps

Last updated: 2026-07-30

This is the execution order for the next core product phase. The same work is represented as tasks under the local **Build Ambientic** goal.

## Current objective

Build the smallest safe Workflow Builder vertical slice on top of a shared semantic action layer. The visual node canvas is now the primary authoring surface; keep its first execution model deliberately linear and inspectable before adding arbitrary graph semantics or the community marketplace.

The first usable slice is:

1. Define and validate a portable workflow manifest.
2. Register a small provider-neutral action catalog.
3. Run a linear workflow locally with inputs, approvals, cancellation, history, and safe resume.
4. Connect the existing visual canvas and step inspector to the durable manifest and run state.
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
- Preserve the node canvas as the direct-manipulation editor while keeping the first runnable graphs linear and fully readable as ordered manifests.
- Add run detail with inputs, current step, timeline, logs, approvals, outputs, retry, and recovery.
- Validate three templates:
  - Rate-limit handover to another provider.
  - Build → test → review with human approval.
  - Repetitive request → goal task → agent execution → artifact review.

Exit condition: all three templates can complete, fail safely, and resume after Ambientic restarts without duplicating a consequential step.

## Phase 1.5 — agent-assisted authoring and connected apps

- Add an authoring-provider selector to the workflow prompt using only connected, task-capable AI providers.
- Add a main-process `draft-workflow-with-agent` service that asks the selected provider for a structured portable manifest, validates and sanitizes it, and returns a preview without saving automatically.
- Preserve the local deterministic prompt parser as an explicit offline/fast-draft fallback.
- Separate the provider that authors a workflow from the provider policy used by each executable node.
- Expose permission-scoped agent tools for workflow list/get/create/update/validate/run operations, with approval gates and local audit events for mutations and runs.
- Add Settings → Apps & Tools, separate from AI Providers, with capability-grouped connections for Mail, Calendar, Files, Web & Research, Communication, Development, and MCP/custom tools.
- Define a normalized connection record containing non-secret identity, account/workspace label, capabilities, read/write permission level, health, last use, and dependent workflows.
- Add Connect, Test, Reconnect, Disable, and Disconnect flows. Before disabling or disconnecting, show the workflows and scheduled runs that depend on that capability.
- Implement direct inbox/calendar actions only through declared adapters and capability contracts; never claim success from an agent response without tool confirmation.
- Validate required capabilities when saving, enabling, importing, and running a workflow, with a clear “connection missing” repair path.

Exit condition: a user can choose Codex, Claude Code, or Hermes to draft a validated workflow, review it before saving, connect one real app, see its exact permissions and dependent workflows, and complete one confirmed app action through a provider-neutral capability.

## Phase 1.6 — memory layer and tool gateway

Specified in `PRODUCT.md` → **Memory layer and tool gateway**. This is the substrate the other phases assume: Goals context capsules, Coach evidence, cross-provider handover, and workflow capability resolution all read and write through it. It can be built alongside Phase 1.5 because it shares the connection and permission model, but it must not wait for the community phases.

Scope decisions for this increment:

- Target the local provider CLIs. Keep the context assembler and gateway transport runtime-agnostic so an Ambientic-hosted agent runtime can drop in later without rework.
- Harvest deterministic events plus local transcript mining. Model-assisted distillation is deferred to the backlog.
- Ship Ambientic-native tools and proxied tool servers. Native app adapters are deferred to the backlog.

### 1.6a — context assembler seam

- Extract turn composition out of the hard-coded provider prompt string into a context assembler returning a provider-neutral system capsule and user text.
- Keep output byte-identical at first so this lands as a pure refactor and unblocks the rest.
- Add the three injection adapters: system-prompt flag for Claude Code, session parameters for Hermes ACP, and the verified mechanism for the Codex app server.
- Confirm how the Codex app server accepts per-session tool servers before committing to per-session tokens for it; a global-config-only path needs a different token strategy and weaker session attribution.

### 1.6b — memory store

- Define tiers T1 episodic, T2 project, T3 semantic, plus the candidate store with confidence, provenance, and expiry.
- Implement ranked local retrieval over project, goal, tier, type, and recency-decay filters.
- Harvest deterministically from goal and task transitions, approved tool calls, files written, commits, provider switches, and recurring errors.
- Add local transcript and provider-snapshot mining as a distinct opt-in from event harvesting.
- Backfill T1 and T2 from existing local conversation history and known project roots.
- Enforce the capsule token budget in code and surface it in the UI.

### 1.6c — gateway

- Run one long-lived local gateway with per-session tokens bound to session, provider, project root, goal, and permission scope.
- Ship the native tool surface: recall, goal listing, project brief, remember-as-candidate, and task update as the first consequential write.
- Add tool-server proxying so a server connected once in Ambientic is available to every agent on every provider under one permission policy and audit trail.
- Route gateway permission requests through the existing approval boundary so provider-native and gateway approvals are indistinguishable to the user.
- Journal every call and feed the journal to the harvester.
- Stop passing an empty tool-server list on session creation.

### 1.6d — memory review surface

- Candidate queue with accept, edit, reject, and forget.
- Provenance and supersession history per record.
- A per-project preview of exactly what an agent will see before a session starts.

### 1.6e — continuity

- Make a new session's capsule the handover mechanism; keep the generated handover file as a portable export rather than the transfer path.

Exit condition: a task started on any connected provider, in a known project, receives the active goal, its acceptance criteria, and the project card without transcript copying; recalls a decision it was never told; performs one approved consequential write through the gateway with an audit record; and a second provider resumes that task from memory alone. Capsule size stays inside budget and is identical across turns of a session.

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
6. Add explicit AI-provider selection and validated structured output to natural-language workflow drafting.
7. Expose permission-scoped workflow authoring and execution tools to connected agents.
8. Define the normalized app/tool connection and capability schema.
9. Add the Settings → Apps & Tools connection inventory and dependency view.
10. Prove one direct calendar or inbox adapter end to end with confirmation and audit evidence.

## Validation required before each phase advances

- Unit tests for schema migrations, validation, permission boundaries, idempotency, and recovery.
- Installed-app restart smoke with real local data.
- At least one live provider run on Codex, Claude Code, and Hermes where supported.
- Physical APC40 MKII regression for state LEDs and existing learned controls.
- Privacy review of every new file scan, source connector, export, and model call.
- README, handover, goal tickets, and GitHub PR kept synchronized.
