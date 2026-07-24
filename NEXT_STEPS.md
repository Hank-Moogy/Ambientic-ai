# AgentBase — next-commit notes

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
  line that writes `~/.agentbase/claude-usage.json`.
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
3. **Claude usage display — RESOLVED as far as data goes; needs UI wiring.**

   Finding (verified empirically): Claude subscription quota % (the 5h/weekly
   meters, like Codex) is NOT obtainable from any clean local source.
   - `claude -p --output-format json` result carries no rate limits (only token
     counts under `usage`).
   - The status-line stdin payload has NO `rate_limits` field. Real top-level
     keys: context_window, cost, cwd, exceeds_200k_tokens, model, output_style,
     session_id, transcript_path, version, workspace.
   - Nothing on disk caches the quota windows.
   => The `hook/claude-statusline.py` + `collectClaude` (reads
      `~/.agentbase/claude-usage.json`) approach cannot populate and should be
      retired or repurposed. Quota % for Claude is only available via the
      interactive `/usage` TUI (fragile scrape) or the credentialed API
      (off-limits). Do not fake a percentage.

   Clean, working alternative (implemented): `src/main/claude-activity.mjs`
   reads `~/.claude/stats-cache.json` and returns real weekly Claude *activity*
   (messages, sessions, tool calls, tokens by model). Always available, zero
   setup, updates whenever Claude is used. Tested in
   `test/claude-activity.test.mjs`.

   To wire it into the app (one small edit, left undone to avoid colliding with
   the concurrent Usage/Billing rework in `usage.js`/`Workspace.jsx`):
   - In `src/main/usage.js` `collectClaude`, on the ENOENT branch (no status-line
     cache) call `collectClaudeActivity()` and return
     `{ status: 'ok', plan: 'subscription', windows: [], activity }` instead of
     throwing. Import from `./claude-activity.mjs`.
   - In the Overview/Usage UI, when a provider has `activity` and no `windows`,
     render "N messages · N sessions this week" (and optionally tokens) as an
     honest activity card instead of a quota meter or "Quota unavailable".
   - Label it "activity", never "quota" — the number is real usage, not a limit.
