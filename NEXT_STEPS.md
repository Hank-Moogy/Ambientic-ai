# Ambientic — next-commit notes

Working notes for whoever makes the next commit. This repo has had two sessions
editing it concurrently; commits so far have been deliberately scoped.

## Committed so far

- `bdf31cf` — managed-Claude first-turn fix, PATH widening, single thread-state
  resolver, in-thread handover UX (retire Improve page), honest Claude-usage
  failure message.
- This commit — Claude auto-compaction + actionable "prompt too long" handling
  (main process only; see below).

## Still UNCOMMITTED in the working tree (the other session's in-flight work)

Do not assume these are mine. Review before committing:

- `src/main/usage.js`, `test/usage.test.mjs` — Claude usage via a status-line
  bridge hook.
- `hook/claude-statusline.py` (new), `hook/install.sh` — installs the status
  line that writes `~/.ambientic/claude-usage.json`.
- `src/renderer/Workspace.jsx`, `src/renderer/onboarding.css` (new),
  `src/renderer/spend.css` — onboarding + Usage/Billing UI.
- `src/main/{connectors,index,midi-controller,vibe-sequence}.js/.mjs`,
  `test/{discovery,vibe-sequence}.test.mjs`, `ART_DIRECTION.md`, `HANDOVER.md`,
  `README.md`, `src/preload/index.js` — mixed: APC "vibe" lighting, art
  direction, consumption ledger wiring, onboarding.

Full `electron-vite build` passes and `node --test test/*.mjs` is green as of
this commit, so the tree is in a working state — but the items above are the
other session's and may not be finished. Confirm with that session before
committing them.

## Follow-ups on my work (not yet done)

1. **Persist the Claude compaction remap.** `WorkspaceService.claudeRemap` is
   in-memory. After an app restart, the first prompt to a previously-compacted
   thread will re-resume the original oversized transcript and compact again
   (self-healing, but wasteful). Persist `threadId -> compactedSessionId` next
   to the thread aliases (`onAliasesChange` path in `index.js`) and rehydrate it
   in the `WorkspaceService` constructor.
2. **Better compaction.** `compactClaudeContext` keeps the recent tail verbatim
   within a char budget and drops older messages. Optionally LLM-summarize the
   dropped head (bounded) and prepend it, so long-range context survives.
3. **Claude usage display — wired; live reconnection remains.**

   Ambientic now uses a three-level local strategy: a fresh structured
   `~/.ambientic/claude-usage.json` status-line observation, Claude's interactive
   `/usage` panel, then honest seven-day activity from
   `~/.claude/stats-cache.json`. Current Claude documentation and newer clients
   can supply `rate_limits` to a custom status line, so that bridge must remain.

   A 2026-07-28 audit found that the profile metadata still describes Claude
   Pro while the current CLI authoritatively returns `loggedIn: false`.
   Ambientic now trusts `claude auth status --json`, never treats the words
   “API usage billing” alone as an account-mode signal, and handles both the
   legacy three-tab and Claude Code 2.1.220 four-tab `/usage` screens. The user
   must reconnect the Pro/Max account before accepting the five-hour/weekly
   gauges as live.
