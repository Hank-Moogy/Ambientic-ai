import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isClaudeLimitRejection, knownUsageCommandCandidates, parseClaudeLimitError, parseClaudeRateLimitEvent, parseClaudeStatusLineUsage, parseCodexRateLimits, resetTextToEpoch, UsageService } from '../src/main/usage.js'

// Observing usage persists it. Tests must never write over the real reading in
// the user's home directory, so every service here gets a throwaway cache.
const CACHE_PATH = join(tmpdir(), `ambientic-usage-test-${process.pid}.json`)
const usageService = (options = {}) => new UsageService({ cachePath: CACHE_PATH, ...options })

test('finds the Codex binary bundled in ChatGPT when no shell command exists', () => {
  const candidates = knownUsageCommandCandidates('codex', '/Users/tester')
  assert.equal(candidates[0], '/Applications/ChatGPT.app/Contents/Resources/codex')
  assert.ok(candidates.includes('/Users/tester/.local/bin/codex'))
})

test('preserves provider window duration and accepts a weekly-only Codex response', () => {
  const result = parseCodexRateLimits({
    rateLimits: {
      planType: 'plus',
      primary: { usedPercent: 97, windowDurationMins: 10080, resetsAt: 1785259284 },
      secondary: null
    },
    rateLimitResetCredits: {
      availableCount: 1,
      credits: [{ id: 'reset-1', status: 'available', resetType: 'codexRateLimits', title: 'Full reset', grantedAt: 1, expiresAt: 2 }]
    }
  })
  assert.equal(result.plan, 'plus')
  assert.equal(result.resetCredits.availableCount, 1)
  assert.deepEqual(result.resetCredits.credits[0], {
    id: 'reset-1',
    resetType: 'codexRateLimits',
    status: 'available',
    title: 'Full reset',
    description: '',
    grantedAt: 1,
    expiresAt: 2
  })
  assert.deepEqual(result.windows, [{
    id: 'codex-primary',
    label: 'All models',
    period: 'week',
    durationMins: 10080,
    usedPercent: 97,
    resetAt: 1785259284,
    resetText: null
  }])
})

test('reads Claude subscription windows captured by the local status-line bridge', () => {
  const now = 1_800_000_000_000
  const result = parseClaudeStatusLineUsage({
    version: 1,
    provider: 'claude',
    observedAt: now - 1000,
    plan: 'subscription',
    windows: [
      { id: 'five-hour', label: 'All models', period: 'short', durationMins: 300, usedPercent: 12.4, resetAt: 1800001000 },
      { id: 'seven-day', label: 'All models', period: 'week', durationMins: 10080, usedPercent: 41, resetAt: 1800600000 }
    ]
  }, now)
  assert.equal(result.source, 'claude-status-line')
  assert.equal(result.observedAt, now - 1000)
  assert.deepEqual(result.windows.map(({ id, usedPercent }) => ({ id, usedPercent })), [
    { id: 'five-hour', usedPercent: 12.4 },
    { id: 'seven-day', usedPercent: 41 }
  ])
})

test('rejects stale Claude status-line limits instead of presenting them as current', () => {
  assert.throws(() => parseClaudeStatusLineUsage({
    provider: 'claude',
    observedAt: 1,
    windows: [{ id: 'seven-day', period: 'week', usedPercent: 20 }]
  }, 24 * 60 * 60 * 1000 + 2), /stale/i)
})

// A cached observation can sit inside the 24-hour age budget while the window it
// describes has already rolled over — a 5-hour window recorded at 100% kept
// reporting "rate limited" for hours after it reset.
test('discards a cached quota window whose reset time has already passed', () => {
  const now = 1_800_000_000_000
  assert.throws(() => parseClaudeStatusLineUsage({
    version: 1,
    provider: 'claude',
    observedAt: now - 60 * 60 * 1000,
    plan: 'subscription',
    windows: [
      { id: 'five-hour', label: 'All models', period: 'short', durationMins: 300, usedPercent: 100, resetAt: now / 1000 - 600 }
    ]
  }, now), /already reset/i)
})

test('keeps a still-open window when a sibling window has already reset', () => {
  const now = 1_800_000_000_000
  const result = parseClaudeStatusLineUsage({
    version: 1,
    provider: 'claude',
    observedAt: now - 60 * 60 * 1000,
    plan: 'subscription',
    windows: [
      { id: 'five-hour', label: 'All models', period: 'short', durationMins: 300, usedPercent: 100, resetAt: now / 1000 - 600 },
      { id: 'seven-day', label: 'All models', period: 'week', durationMins: 10080, usedPercent: 3, resetAt: now / 1000 + 400_000 }
    ]
  }, now)
  assert.deepEqual(result.windows.map(({ id, usedPercent }) => ({ id, usedPercent })), [
    { id: 'seven-day', usedPercent: 3 }
  ])
})

// Captured verbatim from `claude -p --output-format stream-json` on 2.1.246.
const RATE_LIMIT_EVENT = {
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed',
    resetsAt: 1788198000,
    rateLimitType: 'five_hour',
    unifiedWindows: {
      five_hour: { utilization: 0.12, resetsAt: 1788198000 },
      seven_day: { utilization: 0.19, resetsAt: 1788404400 }
    }
  }
}

test('a managed turn reports both Claude windows as live percentages', () => {
  const reading = parseClaudeRateLimitEvent(RATE_LIMIT_EVENT)
  assert.equal(reading.source, 'claude-turn-stream')
  assert.deepEqual(reading.windows, [
    { id: 'five-hour', label: 'All models', period: 'short', durationMins: 300, usedPercent: 12, resetAt: 1788198000, resetText: null },
    { id: 'seven-day', label: 'All models', period: 'week', durationMins: 10080, usedPercent: 19, resetAt: 1788404400, resetText: null }
  ])
})

test('a turn observation supplies the 5-hour window the /usage panel omits', async () => {
  const service = usageService({
    collectors: {
      // What the panel scrape returns while the session window is exhausted.
      claude: async () => ({ plan: 'subscription', windows: [{ id: 'seven-day', period: 'week', usedPercent: 19 }] }),
      codex: async () => ({ windows: [] }),
      kimi: async () => ({ windows: [] })
    }
  })
  const future = Math.floor(Date.now() / 1000) + 3600
  const event = { ...RATE_LIMIT_EVENT, rate_limit_info: { ...RATE_LIMIT_EVENT.rate_limit_info, unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: future }, seven_day: { utilization: 0.19, resetsAt: future } } } }

  assert.equal(service.observeClaudeWindows(event), true)
  await service.refresh()

  const windows = service.getState().providers.claude.windows
  assert.equal(windows.find((window) => window.id === 'five-hour').usedPercent, 42)
  assert.equal(windows.find((window) => window.id === 'seven-day').usedPercent, 19)
})

test('a successful turn clears a limit rejection the account has moved past', () => {
  const service = usageService({ collectors: {} })
  const future = Math.floor(Date.now() / 1000) + 3600
  service.observeClaudeLimit(`You've hit your session limit · resets ${new Date(future * 1000).getHours() % 12 || 12}:00pm`)
  assert.equal(service.getState().providers.claude.quotaStatus, 'CLAUDE_RATE_LIMITED')

  service.observeClaudeWindows({ ...RATE_LIMIT_EVENT, rate_limit_info: { ...RATE_LIMIT_EVENT.rate_limit_info, unifiedWindows: { five_hour: { utilization: 0.05, resetsAt: future } } } })

  const claude = service.getState().providers.claude
  assert.equal(claude.quotaStatus, null)
  assert.equal(claude.windows.find((window) => window.id === 'five-hour').usedPercent, 5)
})

test('a stream event without unified windows is ignored rather than blanking the gauge', () => {
  assert.equal(parseClaudeRateLimitEvent({ type: 'result', is_error: false }), null)
  assert.equal(parseClaudeRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }), null)
  assert.equal(usageService({ collectors: {} }).observeClaudeWindows('not json'), false)
})

test('turn rejection becomes a 100% Claude session window with its real reset', () => {
  const observedAt = new Date(2026, 7, 28, 18, 45).getTime()
  const result = parseClaudeLimitError("You've hit your session limit · resets 9:10pm (Europe/Paris)", observedAt)
  assert.deepEqual({
    id: result.id,
    period: result.period,
    durationMins: result.durationMins,
    usedPercent: result.usedPercent,
    resetHour: new Date(result.resetAt * 1000).getHours(),
    resetMinute: new Date(result.resetAt * 1000).getMinutes()
  }, {
    id: 'five-hour',
    period: 'short',
    durationMins: 300,
    usedPercent: 100,
    resetHour: 21,
    resetMinute: 10
  })
})

test('observed Claude limit survives a weekly-only usage refresh until reset', async () => {
  const observedAt = Date.now()
  const reset = new Date(observedAt + 2 * 60 * 60 * 1000)
  const hours = reset.getHours() % 12 || 12
  const resetText = `${hours}:${String(reset.getMinutes()).padStart(2, '0')}${reset.getHours() >= 12 ? 'pm' : 'am'} (local)`
  const service = usageService({
    collectors: {
      claude: async () => ({ plan: 'subscription', windows: [{ id: 'seven-day', period: 'week', usedPercent: 18 }] }),
      codex: async () => ({ windows: [] }),
      kimi: async () => ({ windows: [] })
    }
  })

  assert.equal(service.observeClaudeLimit(`You've hit your session limit · resets ${resetText}`, observedAt), true)
  assert.equal(service.getState().providers.claude.windows.find((window) => window.id === 'five-hour').usedPercent, 100)

  await service.refresh()
  const windows = service.getState().providers.claude.windows
  assert.equal(windows.find((window) => window.id === 'five-hour').usedPercent, 100)
  assert.equal(windows.find((window) => window.id === 'seven-day').usedPercent, 18)
})

test('the refusals Claude actually sends for an exhausted window are read as a limit', () => {
  // The account these came from had `overageStatus: rejected` with
  // `overageDisabledReason: out_of_credits`, so a full 5-hour window surfaced
  // as a billing or administrator problem instead of a limit. Reading only the
  // "hit your ... limit" wording left the Overview showing 27% while every turn
  // in the thread was refused.
  const refusals = [
    'Your organization has disabled Claude subscription access for Claude Code \u00b7 Use an Anthropic API key instead, or ask your admin to enable access',
    "You're out of usage credits. Switch to another model, or manage usage credits at claude.ai/settings/usage?from=cc_cli_limit_message, to continue."
  ]
  for (const text of refusals) {
    assert.equal(isClaudeLimitRejection(text), true)
    const window = parseClaudeLimitError(text)
    assert.equal(window.id, 'five-hour')
    assert.equal(window.usedPercent, 100)
    assert.equal(window.resetAt, null)
  }

  assert.equal(isClaudeLimitRejection('Claude exited with code 1'), false)
  assert.equal(parseClaudeLimitError('Claude exited with code 1'), null)
})

test('a limit rejection with no reset time is reported without a null reset', () => {
  const service = usageService({ collectors: {} })
  service.observeClaudeLimit("You're out of usage credits. Switch to another model, to continue.")
  const claude = service.getState().providers.claude
  assert.equal(claude.quotaStatus, 'CLAUDE_RATE_LIMITED')
  assert.equal(claude.quotaError, 'Claude session limit reached')
})

test('a limit whose reset time cannot be parsed expires with its own window', async () => {
  const service = usageService({
    collectors: {
      claude: async () => ({ plan: 'subscription', windows: [{ id: 'seven-day', period: 'week', usedPercent: 18 }] }),
      codex: async () => ({ windows: [] }),
      kimi: async () => ({ windows: [] })
    }
  })

  // Claude phrases some rejections relatively, which leaves no reset timestamp
  // to expire on. Treating that as permanent kept the Overview and the
  // in-thread handover banner claiming a limit long after it had lifted.
  const observedAt = Date.now() - 6 * 60 * 60 * 1000
  assert.equal(service.observeClaudeLimit("You've hit your session limit \u00b7 resets in 42 minutes", observedAt), true)
  assert.equal(parseClaudeLimitError("You've hit your session limit \u00b7 resets in 42 minutes", observedAt).resetAt, null)

  await service.refresh()
  const windows = service.getState().providers.claude.windows
  assert.equal(windows.find((window) => window.id === 'five-hour'), undefined)
  assert.equal(windows.find((window) => window.id === 'seven-day').usedPercent, 18)
})

test('a limit whose reset time cannot be parsed still holds for its window', async () => {
  const service = usageService({
    collectors: {
      claude: async () => ({ plan: 'subscription', windows: [{ id: 'seven-day', period: 'week', usedPercent: 18 }] }),
      codex: async () => ({ windows: [] }),
      kimi: async () => ({ windows: [] })
    }
  })

  assert.equal(service.observeClaudeLimit("You've hit your session limit \u00b7 resets in 42 minutes", Date.now()), true)

  await service.refresh()
  const windows = service.getState().providers.claude.windows
  assert.equal(windows.find((window) => window.id === 'five-hour').usedPercent, 100)
})

test('queues a genuinely fresh provider pass when login completes during a refresh', async () => {
  let releaseFirst
  let claudeCalls = 0
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })
  const usage = (provider) => ({ plan: 'test', windows: [{ id: `${provider}-week`, period: 'week', usedPercent: 1 }] })
  const service = usageService({
    collectors: {
      claude: async () => {
        claudeCalls += 1
        if (claudeCalls === 1) await firstGate
        return usage('claude')
      },
      codex: async () => usage('codex'),
      kimi: async () => usage('kimi')
    }
  })

  const initial = service.refresh()
  const afterLogin = service.refresh(true)
  releaseFirst()
  await Promise.all([initial, afterLogin])
  assert.equal(claudeCalls, 2)
})

// Claude's /usage TUI repositions the cursor mid-word, so ANSI stripping can
// deliver "Resets 3:10pm" as "ets 3:10pm". That must still yield a countdown,
// without a dated reset being mistaken for a bare time.
test('parses a reset time whose label was truncated by the TUI', () => {
  const at = resetTextToEpoch('ets 3:10pm (Europe/Paris)')
  assert.ok(Number.isFinite(at), 'expected an epoch for a truncated label')
  const clean = resetTextToEpoch('Resets 3:10pm (Europe/Paris)')
  assert.equal(at, clean, 'a truncated label must resolve the same as an intact one')
})

test('keeps the date of a dated weekly reset instead of treating it as a bare time', () => {
  const dated = resetTextToEpoch('Aug 6 at 5am (Europe/Paris)')
  assert.ok(Number.isFinite(dated))
  const parsed = new Date(dated * 1000)
  assert.equal(parsed.getMonth(), 7, 'expected August')
  assert.equal(parsed.getDate(), 6, 'expected the 6th, not the next 5am')
})

// The status-line bridge can no longer fill the usage cache (current Claude
// builds omit rate_limits from its payload), so a forced scrape now writes it
// and passive refreshes read it back. Writer and reader must agree on the
// schema, or usage silently reverts to "waiting for an observation".
test('a scraped observation round-trips through the usage cache reader', () => {
  const now = Date.now()
  // Exactly the document collectClaude persists after a successful scrape.
  const persisted = {
    version: 1,
    provider: 'claude',
    observedAt: now,
    plan: 'subscription',
    windows: [
      { id: 'five-hour', label: 'Current session', period: 'short', durationMins: 300, usedPercent: 44, resetAt: Math.floor(now / 1000) + 1800, resetText: 'ets 3:10pm (Europe/Paris)' },
      { id: 'seven-day', label: 'all models', period: 'week', durationMins: 10080, usedPercent: 5, resetAt: Math.floor(now / 1000) + 500000, resetText: 'Aug 6 at 5am (Europe/Paris)' }
    ]
  }
  const result = parseClaudeStatusLineUsage(JSON.stringify(persisted), now)
  assert.equal(result.plan, 'subscription')
  assert.deepEqual(result.windows.map(({ id, usedPercent }) => ({ id, usedPercent })), [
    { id: 'five-hour', usedPercent: 44 },
    { id: 'seven-day', usedPercent: 5 }
  ])
})
