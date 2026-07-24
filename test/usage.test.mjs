import test from 'node:test'
import assert from 'node:assert/strict'
import { knownUsageCommandCandidates, parseClaudeStatusLineUsage, parseCodexRateLimits } from '../src/main/usage.js'

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
