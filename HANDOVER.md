<!-- ambientic-handover -->
# AgentBase handover

Updated: 2026-07-29
Product: Ambientic
Repository: `/Users/samori/AgentBase`
Branch: `samori/apc40-midi-connector`

## Continue from here

Read `AGENTS.md`, `README.md`, `PRODUCT.md`, and `NEXT_STEPS.md`. Inspect the working tree before editing and preserve unrelated changes. Keep the shipped product name **Ambientic**; AgentBase is the checkout and GitHub repository name.

## Current objective

Build the first Workflow Builder vertical slice on top of one provider-neutral semantic action registry. The initial increment is a local, deterministic, resumable linear workflow engine with a compact editor—not a marketplace and not an unconstrained node canvas.

Start with:

1. A versioned portable workflow schema and three example manifests.
2. A semantic action registry with typed input/output, capability, permission, compatibility, and idempotency metadata.
3. Atomic local stores for workflow definitions, templates, and run journals.
4. A headless ordered-step runner with dry run, approval, cancel, resume, retry, timeout, and restart recovery.
5. One action proven through the UI, a workflow step, and existing MIDI Learn.

## Core roadmap

Ambientic's next three major initiatives share the same action and capability layer:

- **Workflow Builder:** reusable sequences across agents, humans, goals, artifacts, usage signals, and hardware.
- **Universal Hardware Mapping:** customizable MIDI and keyboard profiles with layers, banks, modifiers, feedback, diagnostics, and portable community bundles.
- **Ambientic Coach:** opt-in local analysis of conversations and selected external sources that produces evidence-backed draft workflows, mappings, goal tasks, skills, provider choices, and cost improvements.

Community sharing begins with privacy-safe local import/export. Accounts, public discovery, ratings, and moderation come only after clean-profile bundle exchange works reliably.

The complete phase order and exit criteria are in `NEXT_STEPS.md`. Product contracts, trust boundaries, context strategy, and success measures are in `PRODUCT.md`. The same work is captured as tickets in the live **Build Ambientic** goal.

## Architecture direction

```text
Triggers: UI / MIDI / Keyboard / Schedule / Agent state / Coach
                              │
                              ▼
              Versioned semantic action registry
                 │              │              │
                 ▼              ▼              ▼
          Workflow runner   Ambientic core  Hardware feedback
                 │              │              │
                 └──── local result + audit ───┘
                              │
                              ▼
             Goals / artifacts / run history

Provider capability resolver
    ├── Codex adapter
    ├── Claude Code adapter
    ├── Hermes adapter
    └── future adapters
```

Canonical goals, workflow state, mappings, execution evidence, and recommendations live outside provider transcripts. Agents receive bounded context capsules and retrieve deeper context only when required.

## Material current state

- Goals is a first-class local workspace with atomic `goals.json` persistence, audit events, milestones, task ownership, and a six-state board.
- The local **Build Ambientic** goal contains the upcoming Workflow, Hardware Mapping, Coach, Community, and shared-foundation tickets.
- Claude Code, Codex, and Hermes are normalized behind the workspace bridge while credentials remain provider-owned.
- APC40 MKII and APC mini mk2 have native layouts, truthful green/red/blue state feedback, push-to-talk, MIDI Learn, and Vibe lighting.
- Provider usage, rate-limit handover, goals, artifacts, approvals, onboarding, and the full-screen Overview/Threads workspace are present.
- Background provider probes run from `~/.ambientic/provider-runtime`; automatic Claude usage refresh is passive, preventing unrelated Music, Photos, Documents, Desktop, and Downloads prompts.
- Latest installed privacy-fixed build before this roadmap update: commit `77e6c49`, healthy on local port `47600`.

## Non-negotiable constraints

- Local-first personal use remains functional without an Ambientic account.
- Provider credentials stay in provider-owned stores.
- APC40 MKII native behavior must not regress while generic hardware support expands.
- Unsupported provider capabilities are explicit; do not silently fall back to brittle UI automation.
- Consequential workflow and Coach actions require visible permission boundaries and local audit history.
- Community exports exclude secrets, private paths, raw transcripts, and private artifact data by default.
- Revisit `ART_DIRECTION.md` for material UI, motion, lighting, sound, or hardware-expression changes.
- Update `README.md` status and verification before completing every coding task.

## Recent commits

```text
77e6c49 Prevent protected-folder prompts from provider probes
02ae711 Allow scoped local release test override
c28ec6f Add local goals workspace foundation
d71ff41 Remove background automation and legacy terminal integration
63749c6 Fix Overview managed task creation
```

## First implementation action

Create the workflow manifest/schema tests before UI work. Validate three examples: rate-limit handover, build/test/review, and repetitive request → goal task → agent execution → artifact review. Keep schema and engine provider-neutral; provider selection is a capability-resolution concern.
