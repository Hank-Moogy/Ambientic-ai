# Ambientic

**The hub for all your agents and all your sources of intelligence.**

Ambientic is a local-first operating layer above AI providers. It gives Claude Code, Codex, Hermes, and future agents one shared home for supervision, context, goals, tools, artifacts, usage signals, and hardware control—without taking ownership of provider credentials or private authentication formats.

The repository is named `Ambientic-ai`; the product presented to users is **Ambientic**.

## Product direction

Ambientic should make a fragmented agent setup feel like one coherent intelligence environment:

- See every active agent, project, task, lifecycle state, approval, and usage signal in one place.
- Start, resume, interrupt, and supervise provider-native agents without navigating between terminal windows.
- Bring user-approved context, memory, goals, and connected information sources to any supported agent.
- Inspect agent-created files, localhost previews, simulators, screenshots, handovers, and other artifacts.
- Use the best provider for each task while keeping one consistent control surface.
- Map meaningful actions to MIDI or keyboard hardware so repeated control becomes muscle memory.
- Keep private context local by default and make every external capability explicit and auditable.

Product-specific vertical applications belong in separate products and repositories. Ambientic may connect to them through normal tools or sources, but they are not part of the Ambientic core.

## What is included

### Unified agent workspace

- Overview command center for live Claude Code, Codex, and Hermes activity.
- Cross-provider Threads with stable user-owned names, search, provider filters, streamed turns, artifacts, approvals, interruption, and native-surface handoff.
- Provider-aware new-task creation with project context, model selection, reasoning or effort controls, and safe folder boundaries.
- Cross-provider handovers, local preview discovery, and companion display presentation.
- Provider login state, quota signals, local consumption history, and diagnostics.
- Independently streamed Overview state with animated skeleton pads, so the pad grid, provider pads, and usage each appear as soon as their own reader returns rather than waiting on the slowest provider probe.

### Goals and context

- Local Goals with outcomes, motivation, success criteria, milestones, ownership, status, and next actions.
- A local SQLite/FTS5 context kernel for projects, session bindings, reviewed memory, provenance, and audit history.
- Small frozen context capsules plus scoped on-demand recall, so agents receive relevant context without copying an entire history into every turn.
- Explicit memory consent, review, exclusions, correction, supersession, and forgetting.

### Agents, tools, and sources

- One permission-scoped capability gateway shared by supported agents.
- Native Ambientic context and Goals tools plus connected stdio or Streamable HTTP MCP servers.
- Read, write, and destructive capability boundaries with user approval and a local audit trail.
- Credentials remain in provider-owned stores, connected applications, or macOS Keychain; agents receive capability results, not raw secrets.
- Hosted OpenAI-compatible inference routing for Ambientic-owned utility tasks, with local fallback.

### Hardware

- Native Akai APC40 MKII and APC mini mk2 live-session control with RGB lifecycle feedback and voice input.
- A dedicated Hardware workspace for MIDI Note/CC and focused keyboard mapping.
- Portable multi-view hardware templates with privacy-safe export, local target setup, input learning, conflict handling, and confirmation boundaries.
- Protected native controller behavior so custom mappings do not weaken the live agent grid.

## Product boundary

Ambientic currently does not provide a general automation builder, scheduler, reusable routine engine, or domain-specific operating system. Provider agents remain responsible for executing work; Ambientic provides the shared intelligence, context, supervision, permissions, and control layer around them.

Retired local feature files are not opened or mutated by current builds. Upgrading therefore preserves unrelated Goals, threads, aliases, memory, permissions, hardware templates, provider state, and private data. Unsupported legacy hardware assignments are ignored individually while supported mappings remain intact.

## Architecture

```text
Claude Code ─┐
Codex ───────┼──> normalized sessions ──> Overview / Threads / artifacts
Hermes ──────┘              │
                            ├──> Goals + project context + reviewed memory
Connected sources/tools ───>├──> scoped capability gateway + approvals + audit
                            ├──> handovers + usage + inference routing
MIDI / keyboard ───────────>└──> hardware actions + operational feedback
```

Ambientic owns the normalized local experience and durable user context. Provider-specific CLIs, hooks, ACP implementations, SDKs, and tool servers remain adapters behind that boundary.

## Privacy and safety

- Local-first stores use private file permissions and atomic writes where applicable.
- Raw credentials are never placed in thread context or portable hardware templates.
- Sensitive actions remain previewable and approval-gated.
- Context is scoped by project, goal, task, and session to prevent accidental cross-project leakage.
- Secret-shaped content is rejected from durable memory; forgetting removes content while retaining only a content-free audit tombstone.
- Exported hardware templates remove physical bindings, exact local targets, and saved private prompts.

## Development

Requirements: macOS, Node.js, npm, and the provider CLIs you want Ambientic to supervise.

```bash
npm install
npm run dev
```

Core verification:

```bash
npm run test:local-release
npm run build
```

The live pad roster only includes threads with verified current-session activity. Provider process discovery and cached thread names enrich the Threads view but cannot put an empty placeholder on a hardware pad.

Idle live threads can be placed on **Stand by** from the thread header or the Overview pad context menu. Stand by persists locally, holds the on-screen and physical pad solid orange as a check-later reminder, and clears automatically when the next turn begins or when the user removes it.

The canonical installed-app milestone gate is `npm run release:local`. It rebuilds native SQLite for Electron, runs the release tests, packages and signs the app, replaces `/Applications/Ambientic.app`, relaunches it, and checks the installed build identity and health endpoint.

## Current status

Last updated: 2026-08-28

Implemented:

- Unified Overview and Threads across Claude Code, Codex, and Hermes.
- Managed turns, approvals, interruption, provider login, usage, artifacts, previews, and handovers.
- Goals, project binding, context capsules, reviewed memory, scoped gateway tools, connected MCP servers, and local audit.
- Hosted inference settings and local fallback for Ambientic utility tasks.
- Native APC40 MKII/APC mini behavior plus generic input-first hardware mapping and portable templates.
- Simplified product boundary across runtime, navigation, preload/IPC contracts, capability scopes, hardware actions, styles, and tests.
- Overview load path: per-source state hydration in place of a single blocking `Promise.all`, an immediate non-blocking `get-connectors` reply backed by a deduplicated background probe, parallel auth and version reads per provider, and staggered skeleton pads while each slice is in flight.

Next:

- Install and smoke the signed milestone build after committing the completed cleanup.
- Run a full installed-app acceptance pass across Claude Code, Codex, Hermes, and one real external MCP server.
- Complete physical APC validation for two-view navigation, confirmations, voice input, and RGB state restoration.
- Improve artifact review, thread-to-goal evidence linking, source visibility, and cross-device supervision.
- Develop Ambientic Coach as an opt-in, evidence-backed recommendation layer without automatic mutation.
- Validate privacy-safe hardware template exchange before considering public sharing or accounts.

Verification on 2026-08-28:

- Retirement reference scans and `git diff --check`: clean.
- `npm test`: 275 tests, 273 passed, 2 intentional transport skips, 0 failures.
- `npm run build`: production main, preload, and renderer bundles built successfully.
- Signed installation, relaunch, build-identity, health, and physical APC smoke remain the release step after commit.

The durable visual direction is defined in [ART_DIRECTION.md](ART_DIRECTION.md), the product contract in [PRODUCT.md](PRODUCT.md), and the forward architecture in [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md).
