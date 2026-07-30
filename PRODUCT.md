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

## Model-agnostic context strategy

- Store canonical goals, tasks, workflow definitions, mappings, execution results, and recommendations outside model transcripts.
- Give an agent a compact context capsule containing the objective, current task, acceptance criteria, relevant decisions, artifact references, and requested action.
- Retrieve full conversation or artifact context only when the action requires it.
- Record stable references and short derived facts instead of copying entire chats into every model.
- Treat provider/model choice as runtime policy; a workflow step requests capabilities and constraints, then Ambientic resolves an eligible connected provider.
- Preserve deterministic execution state locally so a different provider can resume without replaying unrelated conversation history.

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
