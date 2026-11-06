# Codex → Ambientic → Claude Code pilot

Status: implemented plumbing; specialist setup and live provider acceptance are open.
No production worker, scheduled dispatcher, or external publication is enabled by this change.

## Responsibilities

- Codex owns sequencing and Markdown reconciliation.
- Ambientic owns dispatch intent, provider sessions, approvals, result collection, and recovery.
- Claude Code performs development or read-only analysis using a verified specialist instruction file.
- The context repository remains the source of truth for requests, evidence, priorities, and procedures.
- Ambientic's private `orchestration.db` stores operational jobs and specialist registrations. It is not committed or synced between Macs. Provider authentication stays in provider-owned stores.

## Open tasks

- [ ] **Sam: build the experiment-analyst specialist.** Define its instruction file, working directory, analytical sources, and read-only permissions. Verify the actual managed Claude runtime can access the required tools.
- [ ] **Sam: build the development specialist.** Define its instruction file and repository/worktree, checks, and local-only execution boundaries.
- [ ] Register and explicitly enable each specialist after tool verification. They appear as `setup_required` until registered. No existing specialist is assumed.
- [ ] Run one synthetic live handoff before any real experiment read. Then run one specifically authorized analytical request.
- [ ] Verify on the signing Mac and complete the canonical signed local release gate.

Sam requested a reminder for Monday, November 9, 2026 at 10:00 Europe/Paris; it is configured in the Codex chat. The reminder does not start workers.

## Connection and launch

1. Use Node 22 and the repository's locked dependencies. Start this build of Ambientic (`npm run dev` for development, or a signed release).
2. Add/bind the Markdown context repository as an Ambientic project. Start a **Codex thread through Ambientic** in that project, with Ambientic context enabled. Select GPT-6.1 Sol / Medium if available.
3. Ask that thread to list `ambientic_orchestration`. It is delivered by the existing authenticated Ambientic MCP shim and Unix socket, with the new `orchestration:manage` scope. Restart an older thread if its previously issued token lacks the scope.
4. Start with `{"action":"list"}`. Expect two disabled/setup-required specialists and no jobs on a new profile.

This tool is scoped to the coordinator's bound project. Claude workers do not receive it and cannot invoke it. Queue mutations use the existing Ambientic approval broker; approval to run a worker does not waive its native tool permissions. No new unauthenticated HTTP endpoint or credential export is used.

An independently launched Codex desktop conversation does **not** automatically inherit Ambientic's MCP configuration. The pilot coordinator must run through Ambientic. Existing Codex morning/evening automations are unchanged; attaching those to this runner is a later activation step after live acceptance. Keep exactly one schedule owner.

## Register a specialist

Call `ambientic_orchestration` from the bound Codex coordinator:

```json
{
  "action": "register",
  "specialist": "experiment-analyst",
  "cwd": "/absolute/path/to/analyst-workspace",
  "instructionsPath": "/absolute/path/to/analyst-workspace/SPECIALIST.md",
  "enabled": false,
  "toolsVerified": false
}
```

Use `development` for the other specialist. Paths are local configuration, never repository defaults. Instructions must exist inside the specialist workspace. Once Sam's setup and tool checks are complete, register again with `enabled: true` and `toolsVerified: true`. Changing the instruction file invalidates its verification until registration is repeated.

Omit `sessionId` to create a fresh Claude session per job, using the durable instruction file. Optionally supply an actual Ambientic-discovered Claude session ID for continuation; its provider, directory, and idle state are checked. A UI chat title is not a session ID. A Claude Desktop/Cowork conversation is not assumed resumable by Claude Code.

**Tool parity matters:** Ambientic managed Claude turns use its configured MCP gateway with `--strict-mcp-config`. Verify the required analytical sources through that runtime; tools available in another Claude surface may not be available here. Missing access must produce a blocked readout, never invented metrics.

## First run without specialists or provider usage

```sh
npm run test:orchestration
AMBIENTIC_SOCKET_TESTS=1 npm run test:orchestration
```

The first command uses temporary workspaces and a simulated worker: enqueue → dispatch → readout validation → incorporation acknowledgement → restart/deduplication. It makes no model calls and publishes no real records. The second also exercises the real Unix socket and stdio MCP shim against the durable queue; local socket permissions are required.

## First live synthetic handoff

Copy `docs/orchestration/fixture-request.md` into a **disposable context project**, not the production handoff queue. Bind the coordinator to that project. Register one completed specialist there. The fixture instructs the worker to use no external sources.

1. Enqueue the absolute path:

   ```json
   {
     "action": "enqueue",
     "specialist": "experiment-analyst",
     "requestId": "ambientic-pilot-fixture-1",
     "revision": "1",
     "requestPath": "/absolute/path/to/disposable-context/fixture-request.md"
   }
   ```

2. Repeat the same enqueue. It must return the same job ID. Changing the request requires a new revision; inspect the earlier job before authorizing additional work.
3. Call `{"action":"run","jobId":"RETURNED_ID"}`. This returns after starting the turn, not after the analysis finishes. Repeat calls never relaunch that job. The specialist must be enabled first.
4. Inspect the worker through Ambientic Threads and inspect the queue using `get` or `list`. Completion automatically validates and snapshots `inbox/readouts/<job-id>.md`. Pending approvals display in the existing thread UI; the queue reports `waiting_input` when that signal is available.
5. Expect `result_ready`, `analysisStatus: complete`, and explicit synthetic/no-production wording. A fixture result is transport evidence, not an experiment result.
6. In the disposable context project, save a review record, commit it, then call `incorporate` with the job ID and a `receipt` containing the review path and commit. This is the coordinator's explicit acknowledgement of publication; Ambientic does not independently prove the receipt or mutate canonical Markdown.
7. Restart Ambientic and enqueue the same request/revision. The same incorporated job must remain, with no new worker.

For real work, use the context repository's existing readout validator, publication lock/journal, and readout ledger before acknowledgement. A `partial` or `blocked` readout can be incorporated as evidence while its underlying request remains open. `incorporated` never means a recommendation was approved.

## Recovery and constraints

| State | Meaning / next step |
| --- | --- |
| `queued` | Persisted, no worker launched. Explicit `run` required. |
| `starting` / `running` | Dispatch underway / worker launched. |
| `waiting_input` | Worker needs an approval or input; handle it in Ambientic. |
| `needs_reconciliation` | Restart, timeout, provider error, or invalid/missing result. Inspect evidence; never blindly retry. |
| `result_ready` | Result passed structural checks and is stored durably; Codex must assess sufficiency and publish. |
| `incorporated` | Codex acknowledged successful publication with a receipt. |
| `cancelled` | Cancelled intent; already-performed work is not rolled back. |

- `collect` explicitly accepts an existing valid result after reconciliation; it refuses while Ambientic owns an active turn. Following a restart, independently verify that an orphaned/native provider process has stopped before collecting or cancelling. The pilot does not automatically adopt surviving processes.
- Active or ambiguous jobs reserve their specialist directory/session. Reconcile or cancel before changing the registration or starting another job there. Use separate development worktrees for independent concurrent work.
- Worker runtime is bounded to one hour. Timeout interrupts the managed turn and retains ambiguous state; no automatic retry is attempted.
- `cancel` interrupts a currently managed worker. Cancellation after restart does not prove an orphaned process was stopped. Check it first.
- The queue stores the exact request snapshot. Structural readout checks do not prove analytical correctness; Codex still reviews sources, measurement windows, and contradictions.
- No automatic Codex wake-up, recurring dispatch, publishing, pushing, merging, or deployment is added. Codex collects on its next turn. This keeps the first run explicit and inspectable.
- Prompt boundaries guide workers; provider permission settings and tool configuration enforce access. This is not a new filesystem security sandbox.
- Do not move the private database between Macs or share session IDs as portable configuration. Re-register paths and provider sessions on the target Mac.

## GitHub / signing-Mac handoff

The implementation is in the Ambientic repository and uses existing dependencies. Include the service, gateway/schema changes, runtime lifecycle events, tests, and this runbook together. A service file alone is not a connected implementation.

The branch is `codex/orchestration-pilot`, based on the existing `codex/mac-handoff-provider-pads` work. Push it with `git push -u origin codex/orchestration-pilot` when ready. For an incremental review before the earlier branch merges, use that branch as the PR base; otherwise compare against the updated `main` and review the complete diff. Do not silently omit the earlier dependency commits.

On the signing Mac: follow `docs/MAC_RELEASE_HANDOFF.md`, preserve local work, run the complete regression suite plus socket-enabled orchestration checks, build, and execute `npm run release:local`. Confirm installed build identity and `/health`. This development Mac currently has no valid signing identity; no signed-install acceptance is claimed.
