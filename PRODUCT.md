# Ambientic product specification

Last updated: 2026-08-02

## Product purpose

Ambientic is the local-first operating layer above AI agent providers. It helps a person see what every agent is doing, direct work toward real goals, automate repeated multi-agent work, and turn useful actions into physical muscle memory.

The product is not another provider-specific chat client. It is the durable user-owned layer for goals, workflows, hardware control, artifacts, usage, and improvement across Claude Code, Codex, Hermes, and future provider adapters.

## Primary user

The first user is a technically curious builder running several agent conversations and coding tasks across providers. They need to:

- Know what is active, blocked, idle, expensive, or close to a limit.
- Resume the correct thread and inspect what it built without reconstructing context.
- Convert repeated requests into reliable reusable workflows.
- Control semantic actions from MIDI or keyboard hardware.
- Learn how to work with agents more effectively without sending every conversation to another cloud service.

## Product pillars

### 0. Context kernel and tool gateway

Underpins every other pillar. Ambientic owns a durable local memory of the user, their projects, and their decisions, and a single gateway through which any agent on any provider reaches tools. An agent started from Ambientic knows what the user is trying to achieve and can act through connections the user authorized once, without Ambientic handing credentials to the provider or copying whole transcripts into every model. Specified in **Context kernel and tool gateway** below.

### 1. Unified agent cockpit

Normalize provider conversations, turns, approvals, artifacts, usage, and lifecycle state while keeping credentials in provider-owned stores.

### 2. Goals

Maintain a compact, provider-neutral source of truth for outcomes, milestones, tasks, ownership, evidence, and next actions. Agents receive only the goal or task context they need.

### 3. Workflow builder

Let users turn repetitive work into inspectable, resumable sequences that can coordinate humans, agents, goals, artifacts, and hardware.

The workflow MVP must support:

- Versioned workflow definitions with typed inputs and outputs.
- Sequential steps, conditions, branching, waits, retries, timeouts, and bounded loops.
- Provider-neutral actions such as create/resume agent, send prompt, wait for state, request approval, update a goal task, collect an artifact, notify the user, and invoke a hardware cue.
- Manual, scheduled, agent-state, rate-limit, goal-state, and hardware triggers.
- Dry run, explicit approval boundaries, cancellation, safe resume, idempotency, and execution history.
- A visual builder plus a readable portable manifest.
- Agent-assisted authoring through any eligible connected AI provider, with an explicit authoring-provider choice, structured manifest output, validation, and a deterministic offline fallback.
- Agent-facing workflow tools for creating, inspecting, updating, validating, and running workflows through the same permission and audit boundaries as the human UI.
- Local import/export before any community backend.

### Connected apps and tools

AI providers answer **who reasons**. Connected apps and tools answer **what a workflow can read or change**. Ambientic should keep those concepts separate in Settings while presenting one capability resolver to workflows.

Settings → Apps & Tools should:

- Group connections by capability rather than vendor alone: Mail, Calendar, Files, Web & Research, Communication, Development, and custom MCP/tools.
- Show connection state, owning account/workspace, capabilities, permission level, last successful use, and which workflows depend on the connection.
- Keep authentication in the app or tool's supported credential store. Ambientic stores only non-secret connection metadata and stable capability references.
- Distinguish read, draft, and consequential write permissions. Sending mail, modifying calendars, publishing, deleting, or purchasing always requires an explicit permission policy and auditable confirmation boundary.
- Offer Connect, Test, Reconnect, Disable, and Disconnect actions, plus a clear explanation of the workflows that will stop working before disabling or disconnecting.
- Let the workflow inspector request a semantic capability such as `calendar.event.create`; resolve that request against eligible connected apps at validation or runtime instead of hard-coding a vendor.
- Support provider-native tools, direct app adapters, MCP servers, and future remote tool providers behind the same normalized capability contract without presenting duplicate connections as interchangeable when their permissions differ.

### 4. Universal hardware mapping

Let any supported MIDI or keyboard control invoke the same semantic actions used by workflows and the UI.

The hardware system must support:

- Device discovery and capability inspection.
- MIDI Note/CC and keyboard input learning.
- Semantic actions rather than hard-coded screen coordinates or provider commands.
- Layers, banks, modifiers, press/hold/release, value ranges, conditions, and conflict detection.
- Output feedback where hardware supports it, with graceful input-only fallback.
- Test mode, live event monitor, reset/recovery, and per-device profiles.
- Versioned setup bundles that users can export, import, fork, and eventually share.
- First-class APC40 MKII behavior and regressions even as generic hardware support expands.

Implementation status (2026-08-02): the first complete local V1 is implemented in the working tree. Hardware is now a dedicated primary workspace with an atomic template store, protected native live-session profile, arbitrary 1–12 row/column decks, editable deck/view identity, multiple linked views, Back/Home navigation, Play/Edit/Map/Test modes, semantic assignment and target inspection across the complete live/history thread index, Note/CC/computer-key learning, press/release/hold/value triggers, input monitoring, visible conflict moves, derived setup readiness, expiring truthful confirmation lifecycle, generic input-only MIDI fallback, validated privacy-sanitized file import/export with catalog-ready requirements metadata, and clean-profile exchange/restart coverage. APC40 MKII and APC mini native input/output paths remain the default and retain their regression coverage; learned custom-template grid controls now receive assignment feedback without reusing stale session colors. A disposable live profile starts alongside the installed app and detects the connected APC mini without sharing state or ports. Remaining release gates are installed file-dialog import and human-operated two-view APC tests; arbitrary device-specific LED/SysEx output-profile authoring stays deferred.

The durable model separates three things:

1. A **device profile** describes how hardware communicates and, where known, how its lights behave.
2. A **mapping template** contains the portable logical grid, views, semantic assignments, triggers, and declared setup needs.
3. A local **installation** resolves private goals, workflows, threads, prompts, physical controls, and device identity. Export sanitization removes those local bindings rather than publishing the installation.

Physical input binds to a logical slot once. Every view assigns its own action to that slot, so navigation changes meaning while preserving muscle memory. “Create linked view” atomically creates the child view, assigns the source pad to open it, and seeds a Back pad in the child.

### 5. Ambientic Coach

Offer evidence-backed improvements derived from the user's work and explicitly chosen external sources.

The Coach should:

- Detect recurring requests, manual repetition, avoidable handoffs, stalled goals, weak prompts, unused hardware, and costly provider choices.
- Suggest a draft workflow, mapping, prompt pattern, skill, provider switch, or goal next step rather than only giving generic advice.
- Explain the supporting evidence, estimated benefit, confidence, permissions, and affected data.
- Learn from accept, edit, dismiss, snooze, and outcome feedback.
- Ingest newsletters, RSS feeds, bookmarks, or curated sources only after explicit opt-in and retain source provenance.
- Keep raw transcripts local by default; use compact derived signals and on-demand retrieval.
- Never mutate workflows, mappings, goals, provider settings, or billing behavior without review.

### 6. Community library

Allow users to share portable workflow templates and hardware setups without exposing credentials, private paths, prompts, or conversation content.

Community bundles need:

- A versioned manifest, declared capabilities, compatible app/schema versions, required providers/devices, permissions, and configurable inputs.
- Secret placeholders rather than embedded secrets.
- Preview, validation, trust warnings, test mode, and fork/update flows.
- Attribution, version history, reporting, and moderation before public discovery is opened broadly.

## Shared semantic action layer

Workflows, mappings, Coach suggestions, Goals, and the regular UI must use one action registry:

```text
User / MIDI / Keyboard / Schedule / Coach suggestion
                         │
                         ▼
              Trigger + context envelope
                         │
                         ▼
          Versioned semantic action registry
             │           │           │
             ▼           ▼           ▼
       Provider      Ambientic     Hardware
       adapters       services      feedback
             │           │           │
             └──── execution result ─┘
                         │
                         ▼
           Local audit + workflow history
```

An action definition declares its identifier, schema, required capabilities, permission level, idempotency behavior, result shape, and compatibility version. Provider adapters translate that stable contract into the provider's supported local protocol. Unsupported capabilities are explicit and never silently emulated with brittle UI automation.

## Context kernel and tool gateway

This is the provider-agnostic substrate. Everything else in the product — Goals, workflows, Coach, continuity — reads and writes through it.

Implementation status: the local SQLite/FTS5 kernel, frozen capsules, deterministic turn observation, scoped gateway tokens, native tools, generic MCP proxying, Claude/Codex/Hermes injection, Settings → Memory workspace, optional reviewed provider-memory bootstrap, launch/thread context UX, Apps & Tools, and approval/audit presentation are implemented. The Electron 33 native rebuild, archive unpacking, and packaged-app SQLite/FTS5 smoke pass. Release validation still requires one real external MCP server and the full three-provider scenario.

Ambientic remains the operating layer above provider-native agents. It does not become an agent runtime of its own in this release.

### Principles

- Store canonical goals, tasks, workflow definitions, mappings, execution results, and recommendations outside model transcripts.
- Treat provider/model choice as runtime policy; a workflow step requests capabilities and constraints, then Ambientic resolves an eligible connected provider.
- Preserve deterministic execution state locally so a different provider can resume without replaying unrelated conversation history.
- Never hand a provider a third-party credential. An agent receives a capability, not a token.
- Bound every channel that consumes model context, including tool schemas.

### Two context channels

Context reaches an agent through two channels with deliberately different budgets. Pushing more is not the goal; making the right thing reachable is.

| | Push — frozen capsule | Pull — gateway tools |
| --- | --- | --- |
| Budget | ~900 tokens target, 1200 hard cap | Unbounded, agent-paced |
| Carries | Compact user profile, project brief, goal/task and acceptance criteria, standing constraints, recent decisions, and trigger-shaped instructions for when to recall | Session episodes, older decisions, outcomes, transcript history, connected capabilities |
| Written | Once per session, byte-stable | On demand |
| Cost | Every turn | Only when used |

The capsule's most valuable content is the index, not the facts: it tells the agent what Ambientic holds and under which conditions to ask for it. Capsule instructions must be trigger-shaped ("before assuming a project convention, recall it") rather than capability-shaped ("you have a recall tool"), because agents do not reliably use a tool they are merely told exists.

The exact capsule bytes and their hash are persisted when a session starts and reused unchanged for the session's lifetime. Rebuilding the capsule per turn breaks provider prompt caching and multiplies cost for no gain. Mid-session change is delivered through recall tools; rebinding a session emits an explicit context-update event rather than silently rewriting what the agent was already told.

The budget is enforced in code, surfaced in the UI, and rank-dropped when exceeded.

### Canonical local store

A local SQLite database with an FTS5 index is the canonical store for projects, session bindings, memory records and their provenance, normalized session messages, connections and capabilities, gateway sessions, and the audit journal.

Goals and workflows remain in their existing JSON stores for this release, reached through repository interfaces so they can migrate later without changing callers.

Operational requirements: write-ahead logging, foreign keys, a bounded busy timeout, transactional state changes, ordered and idempotent migrations, and backups taken before migration. A corrupt database is never silently reset — the file is preserved and recovery instructions are surfaced.

Because the store is a native module, native packaging is a release gate: the build must rebuild against the app's Electron version, unpack the binary from the application archive, and pass an installed-app smoke test that creates, migrates, reads, searches, and closes the database. Development-mode success is not evidence.

### Projects and session binding

A project is a stable identity with an optional root path, so work that is not code still gets a brief and a memory scope. Every managed session is bound to a project and, where confidence allows, a goal and task. The binding records what inferred it and whether the user corrected it.

Launch context is inferred in this order:

1. Explicit user selection.
2. An existing binding for the session.
3. A project matching the working directory.
4. The most recently used in-progress or review task in that project.
5. The most recently updated active goal in that project.
6. A lexical match between the initial prompt and goal or task titles.
7. Project-only fallback.

Inference must never block task creation, and it is only safe because it is visible: the launch flow shows what was inferred and why, and the thread context panel allows correction after the fact. Low confidence is a normal state presented plainly, not an error.

### Memory records and promotion

Records are scoped to user, project, goal, task, or session, and typed as preference, constraint, fact, decision, outcome, or gotcha. Each carries confidence, status, provenance, sensitivity, expiry, and supersession.

The write path is deterministic in this release. Completed-turn observation is the primary durability path; session-end and pre-compression hooks are enrichment only and are never relied on to persist memory that would otherwise be lost.

Promotion rules:

- Explicit user preferences and corrections, manual goal edits, confirmed tool results, project manifests, and commits promote immediately.
- Agent-inferred facts enter as candidates and are invisible to the capsule.
- An inferred candidate promotes only after two independent corroborating sessions, with no conflict and no sensitivity flag.
- Secret-shaped content is rejected from durable memory outright, and high-confidence credentials are redacted before any transcript message is stored or indexed.
- Conflicts and sensitive personal assertions require review rather than auto-resolution.
- Candidates expire after 30 days; episodic relevance decays after 90 days unless reinforced. User and project records persist until superseded or forgotten.
- Forgetting removes content and its search rows, retaining only a content-free audit tombstone.

Ordinary learning appears in a quiet activity feed with an unread badge. Only conflicts and sensitive candidates interrupt the user.

Onboarding offers one explicit provider-memory bootstrap after account connection. When accepted, Ambientic starts isolated Ask-mode sessions against connected Claude Code, Codex, and Hermes runtimes, requesting only durable context already available through their native memory or standing instructions. These sessions receive no Ambientic capsule, tools, automatic learning, or goal reconciliation, so local memory cannot be echoed back as a provider import. Secret-shaped and sensitive personal assertions are filtered before a review screen; only checked records are activated. A deterministic high-level summary reports the result, including the normal empty case when a CLI exposes no provider memory. The feature is replayable from Settings without changing provider-owned authentication.

Promotion, Coach evidence, and recommendation ranking are the same mechanism and must not be built twice.

### Tool gateway

One long-lived gateway runs inside the Electron main process. Providers reach it through a small stdio shim, which is the transport all supported CLIs handle natively; the shim forwards to the gateway over a permission-restricted local socket rather than a locally reachable network port.

Each managed session receives a random capability token passed only into its shim's environment. Ambientic persists only the token's hash, bound to provider, session, project, goal, task, permissions, and expiry, and revokes it on session removal, disconnect, permission change, or reauthorization. Tokens and credentials are redacted from logs.

The native tool surface is deliberately narrow and stable:

`ambientic_context_get`, `ambientic_recall`, `ambientic_remember`, `ambientic_goals` (list/get/reconcile), `ambientic_task_update`, and `ambientic_capability` (search/invoke).

When a session is linked to a goal and task, its frozen capsule contains a mandatory closeout protocol. Before finishing meaningful work, the agent reads the latest linked goal, compares actual evidence with affected tickets' acceptance criteria, requests justified status changes, and confirms reconciliation even when no status changed. Ambientic restricts ticket writes to the linked goal and audits both completed and missing reconciliation. It does not infer `done` from a successful process exit or from the agent merely claiming completion.

Authorization policy:

- Context reads, recall, goal reads, and capability search run automatically.
- Memory writes and ordinary task updates are audited and may use session-scoped remembered approval.
- Consequential external writes enter the existing approval boundary and block until resolved.
- Destructive external calls always require explicit approval and can never receive blanket remembered approval.
- Rejection, cancellation, timeout, retry, and duplicate calls produce deterministic terminal results, and every mutation carries an idempotency key.

Gateway permission requests surface through the same approval presentation as provider-native tool approvals. The user should not have to know which layer asked.

### Connected tools and schema budget

Ambientic connects to external tool servers itself and proxies their calls, so provider agents receive neither credentials nor raw connection configuration. Credentials stay in the tool's own store or the system keychain, never in the local database.

External schemas are imported into a capability registry but are **not** exposed directly to models. Every connected server's schemas injected into every request would consume the same context budget the capsule is carefully bounding. External capabilities are therefore reached through `ambientic_capability` search and invoke, while the narrow native tools stay directly visible because models call a visible tool far more reliably than they execute a search-then-invoke sequence.

Capabilities are requested semantically and resolved to an eligible connection at validation or runtime, never hard-coded to a vendor.

### Cross-provider continuity

A new session's capsule is the handover. Provider switching stops being a distinct feature with its own document and becomes the default behavior of the context kernel: the new provider receives the same binding, a fresh capsule, and recall access. The generated handover file remains as an explicit portable export, not as the transfer mechanism.

### Relationship to Hermes

Hermes is an inspiration and a supported provider, not the foundation. Its bounded frozen memory, push/pull split, per-turn harvesting, session-end and pre-compression hooks, searchable transcripts, and tool exposure are proven patterns worth reproducing, and they are reproduced here in Ambientic's own architecture. Forking it would mean maintaining a second agent runtime and would leave the other providers without any of this, which is the opposite of the product's purpose.

### Trust boundaries specific to this layer

- An agent that reads untrusted content can attempt to write memory. Candidate-only agent writes, retained provenance, and user review are the mitigation and are not optional.
- Indexing locally visible sessions requires one explicit onboarding consent, with per-provider and per-project exclusions.
- Project scoping must prevent one project's memory from reaching another's sessions.
- The user can inspect exactly what any agent will see for a given project before starting it, and can edit, supersede, or forget any record.
- Ambientic runs agents as child processes, and the host OS attributes their file access to Ambientic rather than to the agent. The product therefore inherits blame for everything an agent touches, and users see permission requests naming Ambientic for reads it never performed. Ambientic's own file access is deliberately narrow, but that narrowness is invisible to the user at the moment a prompt appears, so the launch flow must warn before a project inside a protected location is chosen rather than explaining afterwards.

## Deferred — context kernel and gateway backlog

These are specified now so the substrate is designed for them, and deliberately excluded from this release.

### Model-assisted memory distillation

Session tails are sent to a user-selected provider to distill decisions and rationale into higher-quality memory, beyond what deterministic harvesting produces.

Requirements before implementation: candidate queue and provenance proven in production; explicit opt-in separate from transcript indexing; user-chosen provider with visible token cost per session; distilled records marked as model-derived and never auto-promoted to user scope; a local-only mode that disables it entirely.

### Codex dynamic tools

The Codex app server accepts per-thread `dynamicTools` with client-side callbacks carrying thread, turn, and call identifiers, which would let Ambientic answer tool calls on the connection it already holds rather than through a shim process.

Excluded from this release because the surface is experimental and because a second dispatch path would have to be maintained alongside the shim. Reconsider as a transport optimization behind the unchanged gateway contract, not as a separate tool model.

### Native app adapters

Direct adapters for Mail, Calendar, Files, and Communication behind semantic capabilities, with their own authorization flows owned by Ambientic.

Requirements before implementation: capability resolver, permission policy, approval boundary, and audit journal proven with native and proxied tools; read, draft, and consequential-write permission levels enforced independently; dependent-workflow disclosure before disconnect; no success ever reported from an agent's assertion without adapter confirmation.

### Ambientic-hosted agent runtime

A native turn loop against model APIs for providers that ship no local CLI, making the capsule and gateway reachable by any model rather than any CLI.

Requirements before implementation: the context engine and gateway contract must stay runtime-agnostic, so this drops in behind the same interfaces. Adds ownership of streaming, tool-call parsing, retry, and per-provider cost accounting, plus direct API key custody — a materially different trust posture from the current model where each provider owns its own credentials. Reconsider a Hermes sidecar only at this point, and only if no capable native runtime exists for the target models.

### Further deferred

Embeddings, knowledge graphs, external memory providers, remote sync, and non-macOS gateway transport.

## Trust and privacy

- Local-first by default; no Ambientic account is required for personal use.
- Provider credentials remain in provider-owned stores.
- Reading conversations, ingesting external sources, publishing templates, and using remote models for analysis are distinct opt-in permissions.
- Community exports pass a privacy linter and exclude secrets, absolute personal paths, transcript excerpts, and private artifact content by default.
- Every consequential Coach or workflow action is previewable, attributable, reversible where possible, and recorded locally.

## Success measures

- A user converts a repeated task into a successful workflow in under ten minutes.
- A user maps an arbitrary hardware control to a semantic action in under two minutes.
- Imported workflows and mappings declare compatibility before installation and never carry private data.
- Coach suggestions are accepted or edited because their evidence and value are clear; dismissal reduces repeated noise.
- Workflow runs can resume after app/provider interruption without duplicating consequential steps.
- APC40 MKII native selection, state colors, voice capture, and lighting remain stable.

## Experience principles

1. Glanceability before density.
2. Direct manipulation before configuration jargon.
3. Semantic actions before provider-specific commands.
4. Visible state and safe recovery before magical automation.
5. Suggestions before silent mutation.
6. Local evidence before context-heavy model calls.
7. Portable manifests before a centralized marketplace.
8. Ambient motion and hardware expression must remain calm, legible, reduced-motion-safe, and consistent with `ART_DIRECTION.md`.

## Out of scope for the first workflow increment

- Public marketplace accounts, payments, ratings, or social feeds.
- Arbitrary shell execution without a declared permission boundary.
- A general-purpose Zapier replacement.
- Cloud execution while Ambientic is closed.
- Automatic publishing of private prompts, chats, files, or hardware identifiers.
- Replacing the provider's model, authentication, or billing system.
