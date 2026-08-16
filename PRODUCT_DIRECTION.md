# Ambientic product direction

Last updated: 2026-08-16

## North star

Ambientic is the provider-neutral control plane that owns work across AI agents and user-owned compute.

The product should not be defined by Electron, by one desktop surface, or by any single provider. Claude Code, Codex, Hermes, future harnesses, raw model APIs, and local models are execution backends. Ambientic owns the durable layer above them: tasks, workflows, memory, permissions, lifecycle, handover, routing, usage, user interaction, and multi-device supervision.

A useful product shorthand is:

> Providers execute the work. Ambientic owns the work.

## Original economic wedge

Ambientic began from a simple observation: fixed-price consumer AI subscriptions can expose far more practical coding capacity than their monthly price suggests when they are used continuously and intelligently.

A builder may already pay roughly the price of two consumer subscriptions for Claude and ChatGPT/Codex, yet those subscriptions expose substantial coding-agent capacity. The constraint is not only model capability; it is fragmentation:

- Separate agent surfaces.
- Separate rate limits and reset windows.
- Separate task queues and histories.
- Separate project context.
- Separate lifecycle and approval models.
- Manual switching when one provider approaches a limit.
- No unified way to add user-owned local compute.

Ambientic turns those fragmented subscriptions and local machines into one pool of engineering capacity.

The product should therefore continue to optimize for **capacity aggregation** rather than replacing consumer subscriptions with Ambientic-funded inference.

## Core architectural principle: local execution, remote control

Ambientic should separate the execution plane from the control plane.

### Execution plane

The execution plane remains on trusted user-owned machines whenever possible.

An Ambientic execution node owns or can reach:

- Local Git repositories and worktrees.
- Claude Code, Codex, Hermes, and other installed agent runtimes.
- Provider-native consumer subscriptions and credentials.
- Local development tools and terminals.
- Localhost previews and simulators.
- MCP servers and approved capabilities.
- Local files and artifacts.
- Local models and local inference runtimes.
- Hardware integrations such as MIDI controllers.

The node should not require Ambientic Cloud to hold provider credentials or source code in order to run work.

### Control plane

The control plane should be available from multiple surfaces:

- Desktop for setup, deep work, detailed inspection, hardware, and local configuration.
- Web for low-friction access, onboarding, dashboards, and remote supervision.
- Mobile for attention management: status, approvals, replies, redirects, notifications, and lightweight task starts.

The long-term topology is:

```text
                     AMBIENTIC
              owns work and state
                       │
       Goals · Tasks · Workflows · Memory
       Permissions · Handover · Routing
                       │
               Ambientic Control Plane
                /         |         \
           Desktop       Web       Mobile
                       │
              secure node protocol
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
  MacBook Node     Mac mini Node    GPU Node
       │               │               │
 Claude/Codex      Claude/local       local
 Hermes/etc.          models          models
```

The desktop application remains important, but Ambientic itself should no longer be thought of as only a desktop app.

## Ambientic Node

The local execution runtime should evolve into an explicit product concept: **Ambientic Node**.

An Ambientic Node is a trusted execution environment registered to the user's Ambientic control plane. The node owns execution-local state and exposes normalized Ambientic events and commands through a secure protocol.

A node may be:

- A user's primary MacBook.
- An always-on Mac mini.
- A desktop workstation.
- A local GPU machine.
- Later, a trusted remote development box or user-controlled cloud machine.

The Node abstraction should make the Electron renderer optional to execution. A node must be able to continue running work when no desktop UI is open.

Long-term internal separation should trend toward:

```text
ambientic-core
ambientic-node
ambientic-desktop
ambientic-web
ambientic-mobile
```

This is an architectural direction, not a requirement to split repositories immediately.

## One pool of engineering capacity

Ambientic should present provider capacity and user-owned compute as one routing problem.

The user should increasingly see concepts such as:

- Available Claude capacity.
- Available Codex capacity.
- Local model availability.
- Which machines are online.
- Which projects exist on which nodes.
- Current task load.
- Provider/model suitability for a task.
- Rate-limit or reset pressure.

Rather than asking the user to decide manually which provider to open, Ambientic should eventually answer:

> Where should this task run now?

Routing policy may consider:

- Project location.
- Provider capability.
- Remaining quota.
- Current load.
- Required tools.
- Privacy requirements.
- Model quality and latency.
- Local compute availability.
- User preference.

Consumer subscriptions remain first-class capacity sources. Local models add marginal capacity without forcing Ambientic to become the inference provider.

## Provider-neutral execution contract

Ambientic should formalize a stable runtime boundary so providers remain replaceable execution engines.

Conceptually:

```ts
interface AgentRuntime {
  discover(): Promise<RuntimeStatus>
  start(input: StartTaskInput): Promise<AgentSession>
  resume(sessionId: string, input: AgentInput): Promise<void>
  interrupt(sessionId: string): Promise<void>
  subscribe(sessionId: string, onEvent: (event: AgentEvent) => void): Unsubscribe
  getModels(): Promise<ModelDefinition[]>
  getUsage(): Promise<UsageInfo>
  getArtifacts(sessionId: string): Promise<Artifact[]>
  injectContext(sessionId: string, capsule: ContextCapsule): Promise<void>
}
```

Concrete implementations may include:

- `ClaudeCodeRuntime`
- `CodexRuntime`
- `HermesRuntime`
- `HarnessRuntime`
- `LocalRuntime`
- Future raw-model runtimes

The exact TypeScript shape can differ. The durable requirement is that Ambientic owns the contract and provider-specific behavior stays behind adapters.

## What Ambientic must continue to own

The following are strategic product primitives and should not be delegated to one provider or external harness.

### Task and workflow state

Workflows own agents, not the reverse. A workflow may use Claude for one step, Codex for another, a local model for a third, and require a human approval between them.

### Memory and context

Ambientic remains the canonical user-owned memory and project-context layer. Provider-native memory is an importable or reconcilable source, not the source of truth.

### Permissions and capabilities

Agents receive capabilities, not credentials.

Ambientic should continue brokering external tools through scoped authorization, approval, and audit rather than handing Gmail, calendar, or other third-party credentials directly to agent runtimes.

### Normalized lifecycle

Provider events should map into one Ambientic lifecycle model such as running, waiting, needs input, idle, failed, and ended. UI, mobile notifications, workflows, and hardware should all consume the same normalized state.

### Handover

Ambientic owns provider portability at the task layer. Continuation should be driven by compact deterministic task/project context rather than replaying an entire provider transcript.

### Usage and routing

Ambientic should own the cross-provider view of capacity, limits, load, and routing policy.

## Native providers and Ambientic-native execution

Ambientic should support two complementary execution modes.

### Native provider runtimes

Use provider-native products when they provide real advantages:

- Claude Code.
- Codex.
- Hermes.
- Future high-quality third-party agent runtimes.

This preserves consumer subscriptions, native authentication, provider-specific features, existing tools, and user habits.

### Ambientic-native runtime

Later, Ambientic may provide its own lightweight agent runtime using the same context kernel, capability gateway, permissions, lifecycle, and workflow contracts.

This would allow Ambientic to run:

- DeepSeek APIs.
- OpenAI APIs.
- Anthropic APIs.
- Gemini APIs.
- Kimi or Qwen APIs.
- Ollama, LM Studio, llama.cpp, or other local inference.

This runtime should complement native coding agents, not force their replacement.

## Multi-device becomes a personal agent compute network

Multi-device support should be treated as a core product direction rather than merely remote desktop access.

A user's machines form a personal execution network:

```text
Ambientic
│
├── MacBook Pro
│   ├── Claude Code
│   └── Codex
│
├── Home Mac mini
│   ├── Claude Code
│   ├── Codex
│   └── local model
│
└── GPU workstation
    └── local models
```

The control plane should eventually be able to:

- Show which nodes are online.
- Show provider and model availability per node.
- Know which projects are available on which node.
- Start work on a selected node.
- Route work automatically when policy allows.
- Move or hand off a task when a node or provider becomes constrained.
- Preserve one task identity even when execution changes provider or machine.

This turns the local-first architecture from a constraint into a product advantage: the user's existing hardware becomes their private agent infrastructure.

## Web direction

Ambientic should not become a conventional cloud IDE or hosted-agent SaaS.

A pure web execution model would weaken the original wedge by introducing:

- Ambientic-paid inference and compute.
- Remote sandbox cost.
- Source-code replication.
- Credential custody.
- Development-environment reconstruction.
- Competition with hosted coding environments and provider clouds.

The web surface should instead provide:

- Account and trusted-device onboarding.
- Node status.
- Cross-project and cross-provider dashboards.
- Running, waiting, blocked, completed, and failed work.
- Lightweight transcript inspection.
- Reply, approve, reject, stop, resume, and start-task actions.
- Usage/capacity overview.
- Notifications and deep links back to the desktop when detailed local inspection is required.

Web reduces acquisition and access friction without becoming the execution plane.

## Mobile direction

Mobile should be optimized for supervision, not for reproducing a desktop IDE.

The five essential mobile questions are:

1. What is happening?
2. Which task needs me?
3. Can I approve or reject it?
4. Can I reply or redirect it?
5. Can I start another task?

A strong mobile experience should make ten-second interventions easy. The value is preventing expensive agent capacity from sitting idle because the user is away from their laptop.

The initial mobile surface should prioritize:

- Push notifications for needs-input, approval, failure, and completion.
- Unified queue of work needing human attention.
- Reply to an agent.
- Approve/reject consequential actions.
- Stop or resume a task.
- Start a task against a known project/provider/node.
- View artifacts and summaries where practical.

Detailed diff review, local configuration, provider installation, MCP setup, hardware mapping, and sensitive credential configuration remain desktop-first.

## Product identity

Ambientic should progressively move from:

> A local desktop controller for Claude Code and Codex.

Toward:

> A provider-neutral control plane for all of a builder's AI engineering capacity.

And eventually:

> All your agents, subscriptions, and machines — one control plane.

This positioning is more durable than competing with provider-specific agent UIs because providers remain execution backends inside Ambientic rather than defining the Ambientic product boundary.

## Roadmap direction

This direction does not replace the existing workflow, context-kernel, hardware, or Coach roadmap. It changes the architectural trajectory underneath and after those systems.

### Direction A — formalize the execution substrate

- Define the provider-neutral runtime contract around current Claude, Codex, and Hermes integrations.
- Make lifecycle events, usage, artifacts, context injection, interruption, and task start/resume explicit runtime capabilities.
- Keep existing provider behavior working through adapters rather than rewriting all integrations at once.

**Exit signal:** a new runtime can be added without teaching the rest of the product provider-specific session semantics.

### Direction B — make the local runtime independently controllable

- Separate execution state from assumptions about an active Electron renderer.
- Define a local authenticated command/event API for the Ambientic Node.
- Keep tasks and workflows running when the desktop UI is closed where provider runtimes permit it.

**Exit signal:** the desktop renderer can disconnect and reconnect without losing execution ownership or normalized state.

### Direction C — remote supervision MVP

- Add secure device identity and pairing.
- Sync only the minimum control-plane state required for remote supervision.
- Build a thin remote surface for node health, task state, needs-input, reply, approve, stop, resume, and start.
- Prefer end-to-end protected payloads and metadata minimization where practical.

**Exit signal:** a user can leave their Mac running and safely unblock a Claude or Codex task from another device.

### Direction D — multi-node Ambientic

- Register multiple trusted Ambientic Nodes.
- Track project/provider/model availability per node.
- Allow explicit node selection when starting work.
- Preserve one provider-neutral task identity across nodes.

**Exit signal:** one account can supervise and start work across at least two machines without confusing task identity or credentials.

### Direction E — capacity-aware routing

- Normalize available provider capacity and reset pressure.
- Add routing policies that consider provider, node, project, quota, capability, and user preference.
- Surface routing explanations so automatic decisions remain inspectable.
- Extend existing rate-limit handover into proactive task placement.

**Exit signal:** Ambientic can recommend or choose an eligible execution backend based on actual available engineering capacity.

### Direction F — Ambientic-native and local runtimes

- Implement one small runtime behind the same contract using a raw model API or local model.
- Reuse the Ambientic context kernel and capability gateway rather than recreating memory and tool access inside the runtime.
- Validate local-model task classes before expanding them broadly.

**Exit signal:** the same Ambientic workflow can choose between a native provider agent and an Ambientic-managed raw/local model step without changing the workflow's task semantics.

## Near-term product discipline

This direction should not trigger a premature cloud rewrite.

Near-term rules:

- Keep the existing macOS experience excellent.
- Finish current core roadmap commitments before broad multi-platform UI expansion.
- Introduce runtime boundaries opportunistically while touching provider integrations.
- Treat remote supervision as a thin product first, not a second full Ambientic UI.
- Do not move source code, credentials, or provider execution into Ambientic Cloud merely to simplify remote access.
- Do not build local-model features for novelty; use them where they expand usable capacity or lower cost for a clear task class.
- Measure whether users actually run concurrent cross-provider work and hit provider limits before over-automating routing.

## Product tests for future decisions

When evaluating a major feature, ask:

1. Does this help Ambientic own the work rather than merely mirror a provider UI?
2. Does it increase usable engineering capacity from subscriptions or user-owned compute?
3. Does it preserve provider replaceability?
4. Can the execution remain on a trusted user-controlled node?
5. Does it reduce idle-agent time or human switching cost?
6. Does it strengthen provider-neutral task continuity?
7. Does it keep credentials behind capabilities rather than exposing them to agents?
8. Does it make multi-device control simpler without turning Ambientic into a hosted IDE?

If a feature fails most of these tests, it is probably outside the durable product direction.
