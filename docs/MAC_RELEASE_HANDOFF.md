# Cross-Mac integration and signed release handoff

Prepared 2026-11-06. This branch transfers the current development work for review; it is not a signed release or a guarantee of non-breaking behavior.

## Source and destination

- GitHub repository: `Hank-Moogy/Ambientic-ai`, base branch `main`.
- Compared against fetched main `478229a`; source implementation tip `31225ed`. At preparation time the source was six commits ahead, with no remote-only commits.
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

Do not cherry-pick UI commits without their shared helpers, preload APIs, runtime handlers, styles, and tests. If the signing Mac has divergent changes, compare against the common ancestor and reconcile on an integration branch. Preserve its uncommitted work first. Do not overwrite or force-push main.

## Compatibility-sensitive behavior

- New optional preferences are `padOpenTarget` (defaults to native) and `providerPadSplits` (per connected-provider combination). Existing preferences are spread into updates; invalid column widths fall back to automatic allocation.
- No package/lockfile, database schema, bundle identifier, or signing configuration changes are in the six source commits. This narrows migration risk but does not prove runtime compatibility.
- Pad layout now includes history, allocates all eight columns to eligible connected providers, and ranks pending requests/running jobs ahead of idle history. Check existing custom layouts and provider connection changes.
- Pad presses prefer a known native deep link/terminal, fall back to Ambientic, and keep Ambientic-owned approvals inside Ambientic. Focusing a conversation no longer automatically opens companion previews.
- Passive native Claude sessions must not enter Ambientic's permission broker. Ordinary assistant questions no longer synthesize needs-input state. Explicit approval/input signals still need acceptance testing.
- Native Codex activity is inferred from local rollout/index events, not subscribed native UI state. Approval expiry/resolution and separate app-server reads require review on the signing Mac's provider versions.
- Conversation filtering changes presentation only; validate real user replies remain visible and source transcripts remain untouched.
- Keep provider credentials in provider-owned stores. Do not transfer local databases, chat histories, tokens, signing keys, or user settings through this PR.

## Verification on 2026-11-06

- `npm run rebuild:sqlite:node` under Node.js 22.23.4 passed.
- `npm run test:local-release`: 312 tests, 310 passed, 2 skipped, 0 failures. This command deliberately excludes the simulated Claude OAuth callback lifecycle test; it is not a full `npm test` run.
- `npm run build`: main, preload, and renderer bundles passed.
- `npm run rebuild:sqlite` and `npm run test:sqlite`: Electron SQLite 3.48.0 + FTS5 smoke passed.
- `git diff --check` passed for the source changes.
- Earlier development checks observed an APC40 MKII connection and exercised the homepage destination toggle. Physical pad end-to-end behavior, live divider interactions, provider authorization, and packaged/signed distribution remain unverified here.

## Work for the signing Mac

1. Read AGENTS.md, README.md, and ART_DIRECTION.md. Fetch this PR; preserve local changes and compare the signing Mac's version before integration. Include compatible changes and their dependencies; explicitly list anything deferred and why.
2. Validate saved settings/data compatibility, native and Ambientic routing, approval ownership, missing-provider onboarding, provider split persistence, APC40 MKII reconnects/RGB/native controls, and conversation visibility. Test physical hardware if available; otherwise retain the limitation.
3. Use Node.js 22 and locked dependencies. Run the full required tests, build, and packaged SQLite smoke. Update README with actual results and commit a clean tree before release.
4. Run the canonical `npm run release:local` gate from outside Ambientic. It installs/relaunches the app on the signing Mac; preserve its prior installer/build for rollback. Check installed build-info against the release commit, verify its signature, and request `/health` on port 47600 to confirm the response. The script currently waits for a TCP port; independently inspect the health JSON and running build identity.
5. For a downloaded app, inspect certificate capabilities. The local release uses development signing without hardened runtime or notarization, and is not itself a distribution pipeline. Prefer Developer ID signing, appropriate hardened runtime/entitlements, notarization, and stapling for the final DMG. Do not claim notarization or Gatekeeper acceptance without verifying the delivered artifact.
6. Build for the receiving Mac's arm64 architecture and validate its macOS compatibility. Preserve bundle ID and signing team where applicable. Do not reset user data or provider credentials to make an upgrade pass.
7. Arrange an approved download location with Sam; this PR does not publish a binary. Deliver the URL, SHA-256 checksum, version/commit, supported OS/architecture, included/deferred changes, verification limits, installation steps, and a rollback path preserving user data.

Do not merge solely because Git reports no conflicts. The goal is a reviewed compatible integration followed by a verified signed download.
