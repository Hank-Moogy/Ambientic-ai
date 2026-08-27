<!-- ambientic-handover -->
# AgentBase handover

Generated: 2026-08-26T16:31:21.334Z  
Source provider: claude  
Source task: Locate missing packagejson file  
Reason: 100% used · Current session

## Continue from here

Work in `/Users/samori/AgentBase`. Read this file, inspect the working tree, and continue the current objective. Preserve existing uncommitted work. Do not ask for the prior chat, and do not spend a turn re-summarizing this handover unless the repository contradicts it.

## Product direction

Ambientic should become the interface above agent providers:

- See every active agent, project, task, state, context, and usage signal in one place.
- Start, resume, interrupt, and supervise agents without navigating between terminal windows.
- Inspect agent-created files, diffs, localhost websites, simulators, screenshots, and other artifacts visually.
- Use the best provider for each task without changing the control surface or learned workflow.
- Map semantic actions to physical controls so repeated operations become muscle memory.
- Keep a local-first trust model while allowing optional remote access and synchronization later.
- Help users improve their agentic engineering through continuity coaching, prompt and workflow insights, skill suggestions, and provider-neutral best practices derived from their own work.

The product should own the user experience and normalized session model, not provider credentials or private authentication formats. Provider-specific hooks, ACP implementations, SDKs, and CLIs are adapters behind a stable Ambientic interface.

## Current objective

Locate missing packagejson file

## Completed and material state

Recent commits:

```text
7774eaa Let an approval be answered once, for a thread, or for good
71a88c0 Merge commit 'f4a7ba4' into codex/acknowledge-opened-threads
f4a7ba4 Stop pre-granting the access the user asked to be consulted about
5d77d9c Light a pad orange while it waits on you
1a759a5 Merge commit '4154f10a82e1b57eed94c1159827eb674c425e72' into codex/acknowledge-opened-threads
```

Current working tree (preserve these changes):

```text
M HANDOVER.md
```

Change footprint:

```text
HANDOVER.md | 28 +++-------------------------
 1 file changed, 3 insertions(+), 25 deletions(-)
```

## Remaining direction

- Ambientic accounts or a cloud backend.
- Universal monetary spend totals from consumer subscriptions. Exact currency reporting requires an optional provider billing connection (for example an OpenAI organization Admin API key); Claude subscription spend is not exposed by the local CLI, and Hermes costs belong to its configured upstream provider.
- Archived/deleted-provider sessions and Claude internal subagent transcripts; the workspace intentionally indexes top-level user conversations only.
- Rich diff rendering, image galleries, or embedded localhost web previews inside the full workspace; this increment lists touched files and retains the existing companion-preview system.
- Fully interactive Claude tool approvals inside Ambientic. Claude managed turns currently use the CLI's `acceptEdits` permission mode; unsupported permission prompts are reported and can be continued in the native surface.
- Windows or Linux support.
- Generic MIDI-controller output profiles.
- Public auto-update infrastructure.
- OpenClaw integration.
- Linking an existing provider thread or artifact to a goal task, assignment leases, approval-gated agent mutations, or automated next-action reviews.
- Agent-powered natural-language workflow authoring and native inbox/calendar connectors. The current prompt uses a deterministic local parser; live workflow steps run through managed AI providers, while direct app actions still require normalized adapters and confirmed tool evidence.

## Architecture

```text
Claude hooks ─┐
Codex hooks  ─┼──> local event server ──> normalized session store ──> React UI
Hermes plugin ┘                                  │                       │
                                                 ├──> terminal focus     │
Process discovery ───────────────────────────────┤                       │
Codex local task index ──> Codex deep links ────┤                       │
                                                 ├──> previews           │
APC40 MKII MIDI input ──> action mappings ──────┴───────────────────────┘
APC40 MKII MIDI output <── session state and selection LEDs

Codex app-server ─┐
Claude local CLI ─┼──> normalized workspace bridge ──> transcript / composer / artifacts
Hermes ACP ───────┘                                      │
                                                        └──> approvals / interrupt / state

Provider quota adapters ──> current capacity ──> local consumption ledger ──> Overview history
Provider billing APIs (future, optional) ────────────────────────────────────> currency spend

Implemented — context kernel and tool gateway (PRODUCT.md, NEXT_STEPS.md Phase 1.6):

goal + task events ─┐
approved tool calls ┼─> turn observer ─> candidates ─> corroboration ─> memory records
normalized turns ───┘                                                        │
                                                                             ▼
   projects + session binding (inference: selection > binding > cwd >    context kernel
   recent task > active goal > lexical > project-only)                        │
                                              ┌──────────────────────────────┴────┐
                                     frozen capsule (~900 tok, 1200 cap)   recall on demand
                                        

## Recent decision context

- **Agent result:** Backed up. Now quitting Ambientic so it can't overwrite the cache while I clean:
- **User direction:** Exit code 137
- **User direction:** On ambientic's overview, below the various ai providers/agents and instead of the mozaic I would like to see a visualisation of the threads/agents I have  displayed on my pad. I want the UI to respect the art direction of the project and have a 3d , texture feel of a generic pad with ambient light corresponding of what I see on my apc. + I want clear names of the thread well visible for each pad so I cna easly anderstand what pad is what thread. Remove the thread mozaic its not useful
- **Agent result:** A screen surface mirroring the hardware — per `AGENTS.md` that's an art-direction change too. Let me look at the mosaic and the LED source of truth first.
- **User direction:** src/renderer/Workspace.jsx:727:function ThreadMosaicCard ({ session, index, onOpen }) { src/renderer/Workspace.jsx:729:    <button className="mosaic-card" data-session-state={session.state} data-size={index % 7 === 0 ? 'wide' : index % 5 === 0 ? 'tall' : 'standard'} type="button" onClick={() => onOpen(session.id)}> src/renderer/Workspace.jsx:730:      <header><span className="mosaic-card__agent"><AgentIcon agent={session.agent} /></span><span>{session.agent}</span><i data-state={session.state} /></header> src/renderer/Workspace.jsx:758:        <section className="mosaic-section"> src/renderer/Workspace.jsx:759:          <header><div><span className="eyebrow">Across every provider</span><h2>Y
- **User direction:** context-contract.mjs semantic-actions.mjs 5:  PAD_COUNT: 40, 34:  if (!Number.isInteger(note) || note < 0 || note >= APC40.PAD_COUNT) return null 59:  if (!Number.isInteger(pad) || pad < 0 || pad >= APC40.PAD_COUNT) return null 94:export function gridSessions (sessions = []) { 95:  return sessions.slice(0, APC40.PAD_COUNT) 100:  const grid = gridSessions(sessions) 106:  const grid = gridSessions(sessions) 107:  return Array.from({ length: APC40.PAD_COUNT }, (_, pad) => {

## Material artifacts

- No task artifacts were recorded. Inspect the working tree.

## First action

Run `git status --short`, read the directly relevant files, and continue the current objective with the smallest verifiable increment.
