# Ambientic product specification

Last updated: 2026-07-30

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

### 0. Context and capability substrate

Underpins every other pillar. Ambientic owns a durable local memory of the user, their projects, and their decisions, and a single gateway through which any agent on any provider reaches tools. An agent started from Ambientic knows what the user is trying to achieve and can act through connections the user authorized once, without Ambientic handing credentials to the provider or copying whole transcripts into every model. Specified in **Memory layer and tool gateway** below.

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

## Memory layer and tool gateway

This is the provider-agnostic substrate. Everything else in the product — Goals, workflows, Coach, handover — reads and writes through it.

### Principles

- Store canonical goals, tasks, workflow definitions, mappings, execution results, and recommendations outside model transcripts.
- Treat provider/model choice as runtime policy; a workflow step requests capabilities and constraints, then Ambientic resolves an eligible connected provider.
- Preserve deterministic execution state locally so a different provider can resume without replaying unrelated conversation history.
- Never hand a provider a third-party credential. An agent receives a capability, not a token.

### Two context channels

Context reaches an agent through two channels with deliberately different budgets. Pushing more is not the goal; making the right thing reachable is.

| | Push — session capsule | Pull — gateway tools |
| --- | --- | --- |
| Budget | Hard cap, 600–1200 tokens | Unbounded, agent-paced |
| Carries | Identity, active goal, current task and acceptance criteria, project card, standing constraints, and an index of what else exists | Transcript history, past decisions, artifacts, prior sessions, entity facts |
| Written | Once per session, byte-stable | On demand |
| Cost | Every turn | Only when used |

The capsule's most valuable content is the index, not the facts: it tells the agent what Ambientic holds and under which conditions to ask for it. Capsule instructions must be trigger-shaped ("before assuming a project convention, recall it") rather than capability-shaped ("you have a recall tool"), because agents do not reliably use a tool they are merely told exists.

The capsule must be stable for the life of a session. Rebuilding it per turn breaks provider prompt caching and multiplies cost for no gain. Material mid-session changes — goal status, task switch, a revoked connection — are delivered as an explicit bounded context update, never by rewriting the capsule.

The capsule budget is enforced in code, surfaced in the UI, and rank-dropped when exceeded.

### Memory tiers

| Tier | Horizon | Contents | Key |
| --- | --- | --- | --- |
| T0 working | Current turn | The provider's own context window | Session |
| T1 episodic | 30–90 days, decaying | Session objective, what changed, decisions taken, files touched, outcome | Session |
| T2 project | Weeks to months | Stack, conventions, entry points, current objective, open threads, known gotchas | Project root |
| T3 semantic | Durable, curated, small | User profile, working preferences, standing constraints, entity facts | User |

T2 is keyed by project root, which every session already carries, and is the highest-leverage tier: it is what makes a fresh session on any provider immediately useful in a known repository. T3 stays small and is superseded rather than mutated, so provenance survives.

### Write path

The write path is deterministic first and inferential second. Structured signals Ambientic already emits are harvested with no model call: goal and task transitions, approved tool calls, files written, commits, provider switches, recurring errors. Session transcripts and provider snapshots are additionally mined locally for decisions and rationale.

Anything derived, inferred, or asserted by an agent enters a **candidate** store with confidence, provenance, and expiry. Candidates are not visible to the capsule. A candidate is promoted to T2 or T3 when it recurs, when the user accepts it, or when an agent uses it without correction. Agents write only candidates; an agent can never silently mutate durable memory.

Promotion, Coach evidence, and recommendation ranking are the same mechanism and must not be built twice.

### Retrieval

Ranked local retrieval over structured filters — project, goal, tier, type, recency decay — with lexical search doing the scoring. For a single user's own memory this is sufficient and, unlike vector similarity, it is inspectable when a recall returns the wrong thing. Retrieval sits behind an interface so semantic search can be added later without changing callers.

### Tool gateway

Ambientic runs one long-lived local gateway that speaks the tool protocol the provider CLIs already support. Each session Ambientic starts is issued a session token bound to its session, provider, project root, goal, and permission scope.

```text
             agent (any provider, any runtime)
                          │  tool protocol + session token
                          ▼
   ┌───────────────────────────────────────────────────┐
   │  Ambientic gateway                                │
   │    token          → session identity              │
   │    tool call      → semantic capability resolver  │
   │    capability     → permission policy             │
   │                     (read / draft / consequential)│
   │    consequential  → approval boundary             │
   │    dispatch       → adapter                       │
   │    result         → audit journal ──▶ harvester   │
   └────────┬──────────────────────────────────────────┘
            │
   ┌────────┼─────────────┬──────────────────────┐
   ▼        ▼             ▼                      ▼
 memory   goals /      connected tool         app adapters
 tools    workflow     servers (proxied)      (deferred)
          tools
```

Requirements:

- A single gateway instance, not one per session, so identity, permission, audit, and cache are shared and every call is attributable to a session, project, and goal.
- Third-party credentials remain in Ambientic's own credential store. The agent holds only a session token. Revoking a session revokes its reach immediately.
- Gateway permission requests surface through the same approval boundary as provider-native tool approvals. The user should not have to know which layer asked.
- Every call is journaled locally, and the journal is an input to the memory harvester.
- Tools are requested as semantic capabilities resolved to an eligible connection at validation or runtime, never as a hard-coded vendor.

Ambientic also acts as a proxy for tool servers the user connects once: a server configured in Ambientic becomes available to every agent on every provider, under one permission policy and one audit trail, without per-provider configuration.

### Cross-provider continuity

Once T1 and T2 exist, a new session's capsule *is* the handover. Provider switching stops being a distinct feature with its own document and becomes the default behavior of the memory layer. The generated handover file remains as a portable export format, not as the transfer mechanism.

### Trust boundaries specific to this layer

- An agent that reads untrusted content can attempt to write memory. Candidate-only agent writes, retained provenance, and user review are the mitigation and are not optional.
- Transcript mining stays local and is a distinct opt-in from goal and event harvesting.
- The user can inspect exactly what any agent will see for a given project before starting it, and can edit, reject, or forget any memory record.

## Deferred — memory and gateway backlog

These are specified now so the substrate is designed for them, and deliberately excluded from the first implementation.

### Model-assisted memory distillation

Session tails are sent to a user-selected provider to distill decisions and rationale into higher-quality episodic and project memory, beyond what deterministic harvesting and local transcript mining produce.

Requirements before implementation: candidate queue and provenance proven in production; explicit opt-in separate from transcript mining; user-chosen distillation provider with visible token cost per session; distilled records marked as model-derived and never auto-promoted to T3; a local-only mode that disables it entirely.

### Native app adapters

Direct adapters for Mail, Calendar, Files, and Communication behind semantic capabilities such as `calendar.event.create`, with their own OAuth flows owned by Ambientic.

Requirements before implementation: capability resolver, permission policy, approval boundary, and audit journal proven with native and proxied tools; read, draft, and consequential-write permission levels enforced independently; dependent-workflow disclosure before disconnect; no success ever reported from an agent's assertion without adapter confirmation.

### Ambientic-hosted agent runtime

A native turn loop against model APIs for providers that ship no local CLI, making the capsule and gateway reachable by any model rather than any CLI.

Requirements before implementation: the context assembler and gateway transport must stay runtime-agnostic from the outset, so this drops in behind the same interfaces. Adds ownership of streaming, tool-call parsing, retry, and per-provider cost accounting, plus direct API key custody — a materially different trust posture from the current model where each provider owns its own credentials.

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
