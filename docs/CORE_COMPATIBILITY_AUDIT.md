# Reduced-scope core compatibility audit

Reviewed 2026-11-06 after the owner explicitly confirmed that Career OS and Workflow Studio should remain removed, while chat quality of life and provider-management improvements must be preserved.

## Compared versions and conclusion

- Signing-Mac baseline: `3ad86600b55958776e2d9ae322a64635b7d0abfb`, preserved on `feature/career-os-mvp`.
- Original reduced-scope PR #9: `25fe690807b4939a66935029e1db9f564221662e`.
- Reconciled source: `d74262c`, packaged in the clean 0.8.2 release commit `f80c9861df78886dd9f38a7c970158627ceeda4b`.

The original PR would have regressed several local chat improvements. The earlier reconciliation already ported them into the reduced app. This follow-up audit found no additional missing core functionality within the compared branches. No runtime change or replacement binary is required by this audit; the previously delivered 0.8.2 ZIP already contains these ports. This is a source/automated compatibility finding, not a claim of complete live acceptance for every installed provider version.

## Core behavior retained or improved

| Area | Reduced-scope result | Implementation / verification evidence |
| --- | --- | --- |
| Readable Claude conversations | Retains the signing Mac's parser, folds tool results into their own calls, hides machine rows, and preserves human text in mixed rows and structured question replies. | `claude-transcript.mjs`, `conversation-messages.mjs`; transcript tests |
| Chat activity display | Retains in-place collapsible step groups between messages, human-readable tool names, failures, and live-tail behavior. | `Workspace.jsx`, unchanged `thread-transcript.mjs` |
| Names and aliases | Retains user names across provider refresh/restart, protects them from late inference, cleans provider prompt machinery, and reconciles canonical/legacy Codex alias keys. | `thread-title.mjs`, `summarizer.js`, `sessions.js`, `WorkspaceService.resolveTitle`; title/naming/session tests |
| Copy, reading position, and thread discovery | Keeps message/chat copy, Markdown, provider/search filters, recent/earlier lanes, latest-opened ordering, and Jump to latest without forcing readers away from history. | `Workspace.jsx`; unchanged `thread-scroll.mjs` and `thread-order.mjs`; ordering/scroll tests |
| Starting and continuing work | Keeps model/effort selection, Build/Plan/Ask, explicit project selection, scratch workspaces, attachments/native Codex mentions, exact-turn steering, interruption, and first-turn initialization. | `WorkspaceService.create/send/startProviderTurn`; workspace/provider-context tests |
| Provider lifecycle and recovery | Retains unified running state, managed-session foreground focus, failed-start recovery, stale Codex completion protection, Claude resume/compaction/error reporting, and full Hermes transcript reconciliation. Adds stale-Claude-child isolation and spawn-error handling. | `workspace-service.mjs`, `index.js`; workspace/compaction/result tests |
| Authentication and discovery | Keeps provider-owned credential stores and existing Codex browser/Claude authentication flows. Adds nested Claude Desktop discovery and concurrent/non-blocking startup probes. | Unchanged `claude-auth-service.mjs`; `claude-binary.mjs`, `connectors.js`; auth/discovery tests |
| Approval ownership and remembered choices | Keeps approvals inside their owning runtime. Adds provider-supported once/thread/always choices, explicit permission profiles, persistent grants/revocation, and immediate hardware-state synchronization. Passive native Claude sessions cannot become blocked on Ambientic. | `approval-profile.mjs`, `permission-grants.mjs`, `permission-policy.mjs`, `WorkspaceService`; approval/broker tests |
| Cross-provider handoffs | Keeps handover generation and continuation; improves canonical project resolution, binding correction, fresh handover capture, and visible failures instead of silent no-ops. | `handover-service.mjs`, `Workspace.jsx`; handover/project tests |
| Goals, context, memory, and connected tools | Retains Goals, project/session bindings, reviewed memory/consent, frozen capsules, scoped recall, tool authorization, and auditing. Project normalization repoints bindings/memory before deduplicating roots. Only Career-specific tool schemas/scopes and workflow dependency reporting are removed. | Unchanged `context-engine.mjs`; `context-store.mjs`, `capability-gateway.mjs`; provider-context/context/gateway coverage in the full release gate |
| Usage, limits, and inference | Keeps quota/billing and local capacity history, hosted utility inference with local fallback, and keychain storage. Adds live Claude usage/limit evidence and corrected keychain persistence. | `usage.js`, `inference-service.mjs`; full release gate usage/inference tests |
| Voice, previews, and native hardware | Keeps APC40 MKII native protocol, selected-column hold-to-record/release-to-send, custom mappings, confirmation boundaries, Vibe restoration, and manual preview controls. Adds hot-plug recovery and sparse-grid-safe voice targeting. | Unchanged `voice-input.mjs` and `companions.js`; APC/voice/MIDI tests |

## Deliberate differences, not missing ports

- Career OS services, job discovery, workflow canvas/library/runtime/scheduler, pack schemas, related IPC, and workflow-specific hardware actions remain removed. Their local data files are preserved, not deleted or migrated into the download. Goals, generic context/memory, agent handoffs, and tool access do not depend on restoring those services.
- Pad selection follows the saved Native/Ambientic destination and falls back to Ambientic where appropriate. Manual previews remain available; opening a pad no longer automatically arranges a browser preview.
- Connected providers share the recent-conversation grid rather than the earlier permanently assigned live-only roster. Native APC behavior remains the first hardware target.
- Ordinary prose ending in a question does not fabricate a pending approval. Explicit provider input/approval signals remain actionable, and completed work retains an acknowledgeable unseen notification. Historical tests for punctuation-based attention and passive Codex app-server takeover were intentionally replaced with tests of these newer ownership contracts.
- The newer explicit permission profiles are retained. The application host defaults an unset profile to “Approve routine work”; existing saved profiles are honored. This is a visible provider-permission behavior change from the older local broker, not removal of the permission UI or ownership boundary.
- The orchestration pilot remains a separate explicitly dispatched capability with zero enabled specialists/jobs at release. It does not restore a general workflow scheduler or enable background workers.

## Verification and limits

A focused follow-up run on Node.js 22.23.4 with `AMBIENTIC_SOCKET_TESTS=1` passed **144 tests, zero failures, zero skips** across workspace/provider context, thread naming/aliases/order/scroll, Claude transcripts/authentication/compaction/errors, sessions, handoffs, grants/profiles, context assembly, voice, APC40 MKII, and MIDI lifecycle. All baseline thread-title, Claude-transcript, and session-store test names remain present. The historical workspace tests absent by name cover the deliberate ownership/question-policy changes above; their replacement cases remain in the suite.

The earlier complete clean release gate passed **345 tests**, production build, nine Electron orchestration tests, Electron and packaged/extracted-ZIP SQLite/FTS5, strict code signatures, installed build identity, and actual health JSON. Its installed UI also opened the correct on-screen pad/thread with the preserved folded transcript.

No source, build configuration, dependency, or asset changes result from this follow-up audit. Physical APC40 MKII, live Claude/specialist acceptance, and receiving-Mac macOS 27.0 acceptance are still open. Notarization remains blocked by missing Apple service credentials; see `DISTRIBUTION_0_8_2.md`. None of those limits is solved by restoring Career OS or Workflows.
