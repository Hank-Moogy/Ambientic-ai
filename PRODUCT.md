# Ambientic product specification

Last updated: 2026-08-28

## Product promise

Ambientic is the local-first control plane for AI agents. It gives one calm place to see, start, resume, interrupt, and supervise Claude Code, Codex, Hermes, and future provider runtimes without surrendering provider choice, credentials, project context, or private memory.

Providers execute work. Ambientic owns the durable human-facing layer around that work.

## Core product

### Agent workspace

- Discover real provider sessions and normalize their lifecycle into running, waiting, needs input, idle, failed, and ended states.
- Preserve stable human-readable thread names and user-owned renames.
- Open transcripts, send turns, interrupt active work, answer approvals, and inspect artifacts from one surface.
- Keep provider-specific authentication in the provider's own credential store.

### Goals

- Store outcomes, tasks, ownership, progress, blockers, and definitions of done locally.
- Link a managed agent session to a project, goal, and task without making that link a prerequisite for ordinary work.
- Let approved agents read linked direction and update only the tasks within their scoped goal.

### Context and reviewed memory

- Infer project and task context from explicit selection, prior binding, working directory, and recent activity.
- Freeze a bounded context capsule for each managed session so its instructions do not drift mid-turn.
- Keep durable memories inspectable, attributable, editable, reviewable, and forgettable.
- Exclude secrets and user-excluded projects or providers from promotion and recall.

### Capabilities and permissions

- Give agents scoped capabilities rather than third-party credentials.
- Classify external actions as read, write, or destructive and apply explicit policy and approval boundaries.
- Audit capability invocation and task mutation locally.
- Before disabling a connection, disclose active capability sessions that depend on it.

### Hardware

- Preserve the native Akai APC40 MKII/APC mini live-session grid, task-state lighting, voice controls, attention acknowledgement, and Vibe restoration.
- Let users create private multi-view hardware templates whose logical slots can be mapped to MIDI or keyboard input.
- Use the shared semantic-action registry for screen and hardware commands.
- Sanitize physical bindings, local targets, and saved prompts from exported templates.

### Continuity, usage, and inference

- Create compact cross-provider handovers without replaying whole transcripts.
- Present provider capacity and usage truth without claiming billing data a provider does not expose.
- Offer optional hosted inference for bounded Ambientic utilities while keeping agent accounts and project access separate.

## Product boundaries

Ambientic is not a general automation engine, job-search application, provider credential vault, cloud source-code host, or replacement model vendor. It does not claim unsupported access to consumer subscription billing, archived provider history, or provider-internal authentication.

The desktop app is the current product surface. Web and mobile are future supervision clients, not alternate sources of truth. Execution remains on trusted user-owned nodes whenever possible.

## Architecture

```text
Claude Code ─┐
Codex       ─┼──> provider adapters ──> normalized sessions ──> workspace
Hermes      ─┘                              │                     │
                                             ├── approvals        ├── artifacts
Goals + context + reviewed memory ───────────┤                     └── hardware
                                             ├── handovers
External tools ──> capability gateway ───────┴── audit
Usage adapters + optional inference routing ───> Overview / Settings
```

Durable user state is local. Native provider sessions remain owned by their providers. Electron's main process owns filesystem, database, provider, hardware, and capability boundaries; the renderer receives normalized, non-secret snapshots through the preload API.

## Safety invariants

- No credential is copied out of its owning provider or macOS Keychain integration.
- Consequential actions require the configured approval boundary and produce an audit record.
- A UI or hardware effect never implies permission.
- Stale or unsupported persisted values are ignored narrowly; unrelated user data is preserved.
- Existing private data from retired product areas remains inert on disk and is not opened or mutated.
- Generic hardware support must never regress APC40 MKII native behavior.

## Success measures

- A user can understand every active agent and attention request at a glance.
- Starting or continuing a provider task takes less navigation than using separate provider surfaces.
- Thread names, context, approvals, and hardware state remain correct across restart and provider differences.
- Memory and capability behavior can be inspected and reversed by the user.
- Releases pass the canonical tests, signed install, build-identity, launch, and health checks.
