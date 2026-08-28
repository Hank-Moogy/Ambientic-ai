# Ambientic product direction

Last updated: 2026-08-28

## North star

> **The hub for all your agents and all your sources of intelligence.**

Ambientic is the provider-neutral control plane for people working across AI agents. Claude Code, Codex, Hermes, future harnesses, raw model APIs, and local models are execution backends. Ambientic makes them legible and controllable through one user-owned layer of sessions, context, goals, sources, permissions, artifacts, usage, and hardware.

A useful operating principle is:

> Providers execute. Ambientic connects, contextualizes, and supervises.

## Why Ambientic exists

Agent capability is increasingly abundant, but the experience remains fragmented:

- Separate agent surfaces and histories.
- Separate rate limits and reset windows.
- Separate project context and memory.
- Separate lifecycle and approval models.
- Disconnected tools and information sources.
- Manual switching when a provider becomes unavailable or unsuitable.
- No consistent physical or remote control layer.

Ambientic turns those fragments into one coherent intelligence environment without becoming the owner of the user's provider accounts or private data.

## Durable product model

```text
                  Ambientic
 ┌──────────────────────────────────────────────┐
 │ Overview · Threads · Goals · Hardware        │
 │ Context · Reviewed memory · Sources · Tools  │
 │ Permissions · Artifacts · Usage · Handovers  │
 └──────────────────────────────────────────────┘
        │               │               │
        ▼               ▼               ▼
   Claude Code        Codex           Hermes
        │               │               │
        └──── provider-native execution ┘
```

Ambientic owns normalized identity and state above providers. Provider adapters own protocol translation. Credentials and authentication stay with their native systems.

## Local-first, not desktop-bound

The Mac app is the first complete client, not the definition of the product. The durable boundary is a local Ambientic core that can eventually support:

- A desktop visual client.
- Hardware and keyboard control.
- A private mobile or Telegram supervision surface.
- Other authenticated local or remote clients.

Any remote access must preserve the same scoped permissions, audit, and user-owned storage model. A cloud dependency is never required merely to use local providers on one machine.

## Agent identity and continuity

Provider thread IDs are implementation details. Ambientic maintains stable user-facing identities, aliases, project bindings, goal/task links, and lifecycle truth across adapters.

Continuity should come from the context kernel:

- A small byte-stable capsule gives a session its immediate orientation.
- Scoped recall makes older evidence reachable without flooding every prompt.
- Reviewed memory and provenance remain provider-neutral.
- Portable handovers are explicit exports, not the default transport between providers.

The user can correct bindings at any time. Low-confidence inference is visible and never blocks launch.

## Sources of intelligence

Ambientic should treat intelligence broadly but precisely:

- Provider conversations and artifacts.
- User-authored goals, project briefs, and decisions.
- Reviewed memories derived from allowed evidence.
- Connected apps, MCP servers, local files, and curated external sources.
- Usage, lifecycle, hardware, and diagnostic signals.

Every source needs visible provenance, scope, freshness, permission, and failure state. Ambientic should help agents reach evidence; it should not make opaque claims based on hidden ingestion.

## Permission architecture

The capability gateway is a product boundary, not just transport plumbing.

- Agents receive short-lived capabilities rather than credentials.
- Permissions are scoped to provider, session, project, goal, task, capability, and expiry.
- Read, write, and destructive operations are classified independently.
- Consequential actions remain human-reviewable and locally auditable.
- Slow or broken sources never block provider launch.
- Removing a connection revokes its active routes without damaging unrelated sessions.

## Hardware as a first-class client

Hardware is a physical expression of the same normalized state shown on screen. It should make agent attention immediate and habitual:

- Green means running.
- Blue means idle or complete.
- Red means unseen input is required or an operation failed.
- Orange means an approval is waiting.
- Navigation and neutral controls use distinct restrained tones.

The APC40 MKII and APC mini mk2 native modes remain protected. Generic MIDI and keyboard support expands the control surface without weakening task-state truth, voice controls, or existing mappings.

## Ambientic Coach

Coach should turn the user's own evidence into better agent practice. It may recommend a clearer prompt, different provider, useful skill, goal adjustment, hardware mapping, or source connection.

Recommendations must remain:

- Opt-in and evidence-backed.
- Explicit about confidence and expected benefit.
- Reviewable before any change.
- Local-first, with source-level consent and provenance.
- Measurable through accept, edit, dismiss, and outcome feedback.

## Product boundaries

Ambientic is not currently a general automation platform or a host for vertical operating systems. Specialized products live in separate repositories and can connect as ordinary tools or sources where useful.

Ambientic also does not:

- Replace provider-native authentication.
- Promise exact currency spend from consumer subscriptions that do not expose billing data.
- Hide unsupported capabilities behind UI automation.
- Upload private context merely to enable local operation.
- Treat every provider as interchangeable when permissions or capabilities differ.

## Architectural sequence

1. Stabilize the local hub and remove retired feature seams.
2. Prove context, memory, sources, and tool permissions across three providers.
3. Finish native and programmable hardware validation.
4. Strengthen artifact review and goal evidence.
5. Add opt-in evidence-backed coaching.
6. Explore multi-device access and privacy-safe sharing only after local boundaries are proven.

## Exit signal

Ambientic succeeds when a user can start with a goal, choose any suitable agent, carry reviewed context and sources into the task, supervise its lifecycle and permissions from screen or hardware, inspect the result, and continue with another provider without reconstructing the work or surrendering ownership of their intelligence.
