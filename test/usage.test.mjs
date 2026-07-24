import test from 'node:test'
import assert from 'node:assert/strict'
import { knownUsageCommandCandidates, parseCodexRateLimits } from '../src/main/usage.js'

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
