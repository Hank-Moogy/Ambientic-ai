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

## Phase 1.6 — context kernel and tool gateway

Specified in `PRODUCT.md` → **Context kernel and tool gateway**. This is the substrate the other phases assume: Goals context, Coach evidence, cross-provider continuity, and workflow capability resolution all read and write through it.

Status (2026-08-02): implemented in the working tree. Automated kernel, provider, gateway, renderer, compatibility, visual-responsive, Electron-native rebuild, and packaged-app SQLite/FTS5 checks pass. The remaining exit work is one live external MCP and cross-provider acceptance run.

Settled decisions for this phase:

- Ambientic reproduces Hermes's proven patterns in its own Electron/JavaScript architecture. Hermes stays an inspiration and a provider; it is not forked.
- SQLite with FTS5 through a native binding is the canonical local store. Native packaging is a release gate, not a follow-up.
- Goals and workflows stay in their existing JSON stores behind repository interfaces.
- One Ambientic gateway serves Claude, Codex, and Hermes through a stdio shim.
- Codex dynamic tools stay out of the acceptance path; they are a later transport optimization behind the same gateway contract.
- The capsule targets ~900 tokens with a 1200 hard cap. Deeper context stays behind recall.
- Harvesting is deterministic. Model-assisted distillation, embeddings, graphs, external memory providers, and a hosted raw-model runtime remain backlog.

### Workstream split

Two agents work in parallel against a shared contract, in separate branches, merging into an integration branch.

**Backend lane** owns `src/main/**`, preload APIs, package and build configuration, the MCP shim, database migrations, and backend tests.

**Product lane** owns `src/renderer/**`, renderer tests, product documentation, UX copy, and visual and manual QA. It consumes the shared preload contract and does not edit backend services or provider launch code.

Neither lane rewrites or discards unrelated existing user changes. The working tree is checkpointed before branching.

### Backend sequence

**C1 — integration boundary.** Checkpoint the working tree. Publish the shared context and gateway contract plus fixtures. Extract the hard-coded `<ambientic-context>` prompt assembly from the provider bridge behind a context assembler, with regression tests proving byte-identical output first. Expose stub preload APIs backed by fixtures so the product lane can start without waiting for the kernel.

**C2 — storage.** Add the native SQLite binding, migrations, repositories, transactions, FTS5, migration backups, and project backfill. Add an Electron-version rebuild step, unpack the native binary from the application archive, and add an installed-app smoke command that creates, migrates, reads, searches, and closes the database. Wrap goals and workflows in repositories rather than migrating them.

**C3 — context kernel.** Projects, session bindings, inference, frozen capsule generation, hashing, token budgeting, and provenance. Normalize visible provider turns after onboarding consent. Deterministic candidate creation, corroboration, promotion, expiry, conflicts, supersession, and forgetting. Completed-turn observation is the durability path; session-end and pre-compression events are enrichment only.

**C4 — gateway.** One long-lived gateway plus the stdio shim. Per-session capability tokens passed only into the shim's environment, persisted as hashes, bound to provider, session, project, goal, task, permissions, and expiry, and revoked on removal, disconnect, permission change, or reauthorization. The six native tools, the authorization policy, approvals, audit, cancellation, and idempotency.

Implemented follow-up: linked goal/task sessions now use a systematic closeout protocol on every meaningful work turn. Agents must read the current goal, update only tickets justified by evidence, and explicitly reconcile; missing reconciliation is audited, and cross-goal ticket writes are rejected.

**C5 — provider wiring.** Claude receives the capsule through the append-system-prompt file flag and only the Ambientic shim through strict MCP config. Codex receives it through developer instructions and the shim through per-thread config on both start and resume. Hermes replaces its empty server array with the shim and takes the capsule once in a fenced first-message envelope until its protocol exposes session instructions. Provider-owned authentication and provider-native behavior are preserved.

**C6 — connected tools.** Stdio and streamable HTTP servers, capability discovery and schema normalization, connect/test/disable/disconnect, health, timeout, dependency, and permission classification. Credentials stay in the tool's store or the system keychain. The gateway invokes on the agent's behalf so agents never receive raw connection configuration. External schemas reach models through capability search and invoke, never by injection into every request.

### Product sequence

**H1 — launch context.** A compact inferred-context section in the New Agent flow: inferred project, goal, and task with the inference source in secondary text, without blocking launch. Change project or task, link an existing goal, create a project, goal, or task inline. Support projects without folders. Surface exclusions and consent state. Present no-context and low-confidence as normal states, not errors.

**H2 — thread context panel.** Current binding, frozen capsule preview and token usage, creation timestamp and hash indicator, why the context was selected, available recall scopes, a rebind action, and the session's recent recalls and memory writes. State plainly that rebinding emits a context-update event and does not rewrite what the agent was already told.

**H3 — memory workspace.** User profile, projects and briefs, active and candidate memories, provenance linking back to source, conflicts needing attention, search across memories and consented history, per-provider and per-project exclusions, and edit, promote, supersede, reject, and forget controls. A quiet activity feed with an unread badge. Empty, loading, indexing, error, and recovery states. The interface must keep explicit user memory, deterministically learned memory, agent-inferred candidates, conflicted or sensitive candidates, and unpromoted episodic search results visually distinguishable.

**H4 — apps and tools settings.** Separate from AI Providers: connected server list and health, add stdio or streamable HTTP server, connect/test/disable/reconnect/disconnect, capability inventory, read/write/destructive classification, per-capability permission controls, dependent workflows and sessions before disconnecting, a clear statement of where credentials live, and broken, slow, unauthenticated, and incompatible states.

**H5 — approval and audit.** Extend the existing approval presentation for gateway calls with provider, project, goal or task, tool, connection, argument summary, and risk classification. Approve once, session-scoped approval where allowed, reject, and cancel — never blanket remembered approval for destructive calls. Show completion, failure, timeout, retry, and duplicate suppression. Add activity filters for capsules, recalls, promotions, approvals, and external tool calls.

**H6 — documentation and QA.** Keep `README.md`, `PRODUCT.md`, `NEXT_STEPS.md`, and `HANDOVER.md` describing the context kernel and gateway, push/pull context, memory consent and exclusions, tool authorization and approval behavior, Hermes as inspiration and provider rather than foundation, and the handover file as a portable export. Renderer tests and manual QA for compact and windowed layouts, keyboard navigation, empty states, long memory content, accessibility labels, and existing hardware workflows.

### Merge sequence

The backend lane publishes the checkpoint, contract, fixtures, and byte-identical assembler extraction first. The product lane then builds against committed fixtures while storage, kernel, and gateway land. Contract changes arrive as dedicated contract commits; the product lane rebases only after those and updates fixture-driven tests. The product lane switches from fixtures to live preload calls without changing backend contracts. Both lanes merge into the integration branch, backend resolving main, preload, and package conflicts. Backend owns backend and packaging failures; product owns renderer and UX failures.

### Acceptance

Backend: migrations idempotent and preserving goals, workflows, aliases, and sessions; installed macOS builds loading the correct native binary and executing FTS5 queries; capsule composition respecting priority and the hard cap; capsule bytes and hash identical throughout a session; project scoping preventing cross-project leakage; deterministic promotion, corroboration, conflict handling, expiry, supersession, and hard forgetting; transcript ingestion respecting consent and exclusions; secret-shaped content neither promoted nor indexed; invalid, expired, revoked, and cross-session tokens unable to invoke tools; broken or slow external servers never blocking provider launch; and safe rejection, timeout, cancellation, retry, and idempotency.

Renderer: inferred context understandable and never blocking launch; bindings correctable and capsules inspectable; memory origin, confidence, status, and provenance distinguishable; forget and destructive operations appropriately confirmed; connection and approval states accurate after restart or failure; and existing Goals, Workflows, Threads, Settings, and hardware behavior intact.

Exit condition: a decision learned in a Claude session becomes project memory with provenance; a fresh Codex session in that project receives the inferred goal and task capsule and recalls that decision; Hermes reads the same goal, invokes one user-connected capability, and requests approval for a consequential task update; the user switches provider without creating or reading a handover file; every capsule, recall, promotion, approval, and tool result appears in the local audit trail; and the whole scenario passes in an installed macOS build, not only in development.

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
