# Ambientic next steps

Last updated: 2026-08-28

## Current milestone

Complete and release the simplified Ambientic product boundary: agent workspace, Goals, Hardware, context/reviewed memory, capabilities, approvals, handovers, usage, inference, and settings.

Exit conditions:

- The app starts without retired services, schedulers, navigation, preload APIs, or gateway tools.
- Overview, Goals, Hardware, Threads, and Settings remain functional.
- Existing unsupported hardware assignments are ignored narrowly while valid templates, views, bindings, and actions survive unchanged.
- Tool connection dependencies report active capability sessions accurately.
- The complete local-release suite and production build pass.
- The committed build is signed, installed into `/Applications`, relaunched, and verified through build identity and health.

## Next: workspace reliability

- Physically verify APC attention acknowledgement: an opened completed thread returns from red to blue while a pending approval remains orange.
- Keep thread names stable across discovery, managed-session creation, restart, and user rename.
- Improve transcript, artifact, and error rendering without introducing provider-specific behavior into shared UI state.
- Make approval, interruption, reconnection, and provider-offline states explicit and recoverable.

## Next: context and capability hardening

- Expand tests for context inference, capsule freezing, memory exclusions, conflict handling, forgetting, scope revocation, timeout, retry, and idempotency.
- Show capability provenance, permission policy, active-session dependency, health, and audit evidence consistently in Settings.
- Ensure broken or slow external servers cannot block provider launch.
- Verify that project context cannot leak across unrelated sessions or roots.

## Next: node separation and remote supervision

- Extract a renderer-independent local node boundary with durable event sequencing and restart recovery.
- Define device identity, encrypted pairing, revocation, and least-privilege command scopes.
- Build a read-first remote status client, then add approvals and replies only after audit and reconnect semantics are proven.
- Treat Telegram or mobile notifications as attention surfaces, not independent execution authorities.

## Next: routing and capacity

- Connect and verify one real hosted-inference account end to end without granting it project or agent-tool access.
- Improve provider availability and quota normalization while clearly separating estimates from authoritative data.
- Add transparent routing recommendations based on project location, provider capability, remaining capacity, privacy, load, and user preference.

## Ongoing release discipline

- Preserve native APC40 MKII behavior for every hardware change.
- Keep `README.md`, `PRODUCT.md`, `PRODUCT_DIRECTION.md`, `NEXT_STEPS.md`, and `ART_DIRECTION.md` synchronized with the shipped product.
- For each major milestone: test, document, commit a clean tree, build/sign, replace the installed app, relaunch, and verify build identity and health.
