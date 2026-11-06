# Cross-Mac integration and signed release handoff

Prepared 2026-11-06. This branch transfers the current development work for review; it is not a signed release or a guarantee of non-breaking behavior.

## Source and destination

- GitHub repository: `Hank-Moogy/Ambientic-ai`, base branch `main`.
- Compared against fetched main `478229a`; source implementation tip `31225ed`. The initial handoff was six commits ahead, with no remote-only commits. PR #9 now also includes orchestration implementation `ccdd0f4` and its verification record `3ba6803`, carried together on `codex/mac-handoff-provider-pads`.
- Receiving Mac: Apple Silicon (`arm64`), macOS 27.0 build 26A428. Validated with Node.js 22.23.4, Electron 33, app package version 0.8.1.
- No Ambientic.app is installed in /Applications or ~/Applications on the receiving Mac. No valid signing identity is available there. Development source/build exists; do not interpret earlier September installed-release notes as this Mac's installation status.
- The signing Mac's local changes, installed version, certificate type, and OS remain unknown. Inspect them before merging or replacing its app.

## Commits and integration boundaries

| Commit | Change | Review guidance |
| --- | --- | --- |
| f41b2a2 | Bootstrap verification and hardware limits | Documentation of this environment, not global release acceptance. |
| 1923f0c | Desktop-managed Claude discovery and onboarding pending state | Supports nested version/build-hash executable layouts; preserve native provider login. |
| 90286f5 | Recent-thread grid and APC hot-plug detection | Changes the default hardware roster; preserve native APC controls and custom mappings. |
| 18681aa | Connected-provider allocation and draggable headers | Depends on the shared recent-thread grid; supersedes fixed two-column allocation. |
| a6f8c64 | Pad destination routing, approval ownership, conversation filtering | Keep main/preload/renderer/shared changes together; review lifecycle semantics carefully. |
| 31225ed | Prominent homepage Native/Ambientic switch | Depends on pad routing and its IPC/preference API. |
| ccdd0f4 | Durable Codex-to-Claude orchestration pilot | Include service, gateway scope/schema, runtime lifecycle changes, tests, and runbook together. |
| 3ba6803 | Orchestration verification and release-gate record | Full suite and Electron verification passed; signing stopped at missing identity. |

Do not cherry-pick UI commits without their shared helpers, preload APIs, runtime handlers, styles, and tests. If the signing Mac has divergent changes, compare against the common ancestor and reconcile on an integration branch. Preserve its uncommitted work first. Do not overwrite or force-push main.

## Compatibility-sensitive behavior

- New optional preferences are `padOpenTarget` (defaults to native) and `providerPadSplits` (per connected-provider combination). Existing preferences are spread into updates; invalid column widths fall back to automatic allocation.
- The original six commits do not change package/lockfile or database schema. The added orchestration pilot adds a package test script and a separate private `orchestration.db` with jobs/specialist registrations. It uses existing dependencies; bundle identifier and signing configuration are unchanged. Never sync this operational database between Macs.
- Orchestration adds project-bound `orchestration:manage` access for Codex coordinators launched through Ambientic. Older coordinator tokens may require a new thread. Specialists must be registered and verified separately on each Mac; no live workers or automatic dispatch schedules are enabled. Review cancellation, restart reconciliation, result validation, and Claude process ownership before live use. See [pilot runbook](ORCHESTRATION_PILOT.md).
- Pad layout now includes history, allocates all eight columns to eligible connected providers, and ranks pending requests/running jobs ahead of idle history. Check existing custom layouts and provider connection changes.
- Pad presses prefer a known native deep link/terminal, fall back to Ambientic, and keep Ambientic-owned approvals inside Ambientic. Focusing a conversation no longer automatically opens companion previews.
- Passive native Claude sessions must not enter Ambientic's permission broker. Ordinary assistant questions no longer synthesize needs-input state. Explicit approval/input signals still need acceptance testing.
- Native Codex activity is inferred from local rollout/index events, not subscribed native UI state. Approval expiry/resolution and separate app-server reads require review on the signing Mac's provider versions.
- Conversation filtering changes presentation only; validate real user replies remain visible and source transcripts remain untouched.
- Keep provider credentials in provider-owned stores. Do not transfer local databases, chat histories, tokens, signing keys, or user settings through this PR.

## Verification on 2026-11-06

Latest orchestration verification, recorded by the implementation chat in README at `3ba6803`:

- Node 22 `AMBIENTIC_SOCKET_TESTS=1 npm test`: all 324 tests passed, no skips, including Unix socket/MCP and OAuth lifecycle fixtures.
- Production build, Electron SQLite/FTS5 smoke, and all eight Electron orchestration tests passed.
- Canonical socket-enabled local release reran 324 tests from clean `ccdd0f4`, then stopped because this Mac has no signing identity. No installed app was replaced.
- Specialist setup and first live synthetic provider handoff remain open. This PR update fast-forwards the tested commits and changes documentation only; it does not claim a new live-provider or signed-release check.

Earlier pad/discovery verification before the orchestration addition:

- `npm run rebuild:sqlite:node` under Node.js 22.23.4 passed.
- `npm run test:local-release`: 312 tests, 310 passed, 2 skipped, 0 failures. This command deliberately excludes the simulated Claude OAuth callback lifecycle test; it is not a full `npm test` run.
- `npm run build`: main, preload, and renderer bundles passed.
- `npm run rebuild:sqlite` and `npm run test:sqlite`: Electron SQLite 3.48.0 + FTS5 smoke passed.
- `git diff --check` passed for the source changes.
- Earlier development checks observed an APC40 MKII connection and exercised the homepage destination toggle. Physical pad end-to-end behavior, live divider interactions, provider authorization, and packaged/signed distribution remain unverified here.

## Work for the signing Mac

1. Read AGENTS.md, README.md, and ART_DIRECTION.md. Fetch this PR; preserve local changes and compare the signing Mac's version before integration. Include compatible changes and their dependencies; explicitly list anything deferred and why.
2. Validate saved settings/data compatibility, native and Ambientic routing, approval ownership, missing-provider onboarding, provider split persistence, APC40 MKII reconnects/RGB/native controls, and conversation visibility. Test physical hardware if available; otherwise retain the limitation.
3. Use Node.js 22 and locked dependencies. Run `AMBIENTIC_SOCKET_TESTS=1 npm test`, build, and packaged SQLite smoke; complete the pilot runbook’s specialist verification and live synthetic acceptance before enabling real jobs. Update README with actual results and commit a clean tree before release.
4. Run the canonical `npm run release:local` gate from outside Ambientic. It installs/relaunches the app on the signing Mac; preserve its prior installer/build for rollback. Check installed build-info against the release commit, verify its signature, and request `/health` on port 47600 to confirm the response. The script currently waits for a TCP port; independently inspect the health JSON and running build identity.
5. For a downloaded app, inspect certificate capabilities. The local release uses development signing without hardened runtime or notarization, and is not itself a distribution pipeline. Prefer Developer ID signing, appropriate hardened runtime/entitlements, notarization, and stapling for the final DMG. Do not claim notarization or Gatekeeper acceptance without verifying the delivered artifact.
6. Build for the receiving Mac's arm64 architecture and validate its macOS compatibility. Preserve bundle ID and signing team where applicable. Do not reset user data or provider credentials to make an upgrade pass.
7. Arrange an approved download location with Sam; this PR does not publish a binary. Deliver the URL, SHA-256 checksum, version/commit, supported OS/architecture, included/deferred changes, verification limits, installation steps, and a rollback path preserving user data.

Do not merge solely because Git reports no conflicts. The goal is a reviewed compatible integration followed by a verified signed download.

## Signing-Mac reconciliation checkpoint — 2026-11-06

The signing Mac started clean at `3ad8660`, with installed 0.8.1 build `efa72073` and Developer ID team `K78PT544J5`. Integration is on `codex/pr9-signed-integration`; the original branch and a local-only rollback app/data snapshot are preserved. Local transcript/naming/lifecycle improvements are retained, rather than taking the PR's simpler transcript wholesale. A cancellation-during-session-creation race is fixed. See README's signing-Mac candidate record for current verification and pending release steps; earlier receiving-Mac limitations do not describe the signing Mac.

The user explicitly selected GitHub’s newer simplified scope, including retirement of Career OS/Workflow Studio, before final installation. Existing retired files are left untouched. Notarization credentials/profile and the final Gatekeeper result remain outstanding; a valid Developer ID identity and timestamp access have been verified independently. Google Drive is the requested private download destination; do not upload private app data or provider stores.

Final signing-Mac result: Ambientic 0.8.2 at `f80c9861df78886dd9f38a7c970158627ceeda4b` passed the clean canonical distribution gate, was installed/relaunched, and returned healthy JSON. The complete signed ZIP is privately delivered through Google Drive. Notarization is still blocked by missing service credentials; Gatekeeper explicitly rejects it as Unnotarized Developer ID. See [the exact release/installation record](DISTRIBUTION_0_8_2.md) for checksum, validation, included/deferred behavior, and rollback. No workers or schedules were enabled.
