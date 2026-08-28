# Ambientic handover

Updated: 2026-08-28

## Product direction

Ambientic is **the hub for all your agents and all your sources of intelligence**.

The active product is the local-first provider-neutral layer for:

- Claude Code, Codex, and Hermes sessions;
- Overview, Threads, artifacts, previews, approvals, and interruption;
- Goals, project context, reviewed memory, and provenance;
- connected tools and information sources through the scoped capability gateway;
- provider usage, hosted-inference routing, handovers, settings, and diagnostics;
- APC40 MKII, APC mini mk2, MIDI, and keyboard control.

Specialized vertical products live in separate repositories and may connect through standard capability boundaries. Do not reintroduce removed product surfaces under a new name.

## Current change

The current uncommitted change simplifies Ambientic to this boundary. It removes inactive product surfaces and their runtime services, repositories, IPC/preload methods, capability scopes, renderer components, semantic actions, styling, and dedicated tests.

Upgrade safety is intentional:

- Existing retired private files are not opened, rewritten, or deleted.
- Existing provider threads remain ordinary Ambientic threads.
- Goals, memory, aliases, permissions, usage, inference settings, and hardware templates remain intact.
- Unsupported legacy hardware assignments are dropped during normalization while valid assignments and physical bindings are preserved.

## Acceptance

- Sidebar contains Overview, Goals, Hardware, Threads, and Settings.
- Main-process startup contains only retained services.
- Preload exposes only retained controller methods and events.
- Hardware offers only supported semantic actions.
- Tool connection dependencies describe active sessions accurately.
- Goals, threads, providers, context, connected tools, handovers, usage, inference, and hardware tests pass.
- Public product documents and GitHub metadata use the current positioning.

## Verification

Completed on 2026-08-28:

- retirement reference scans: clean;
- `git diff --check`: clean;
- `npm run test:local-release`: 267 tests, 265 passed, 2 intentional transport skips, 0 failures;
- `npm run build`: passed for main, preload, and renderer bundles.

```bash
git diff --check
npm run test:local-release
npm run build
```

Remaining release handoff: commit the completed milestone, run `npm run release:local`, inspect the installed build identity, and smoke the health endpoint plus retained primary navigation and physical APC state.
