import test from 'node:test'
import assert from 'node:assert/strict'
import { parseClaudeActivity, collectClaudeActivity } from '../src/main/claude-activity.mjs'

const NOW = Date.parse('2026-07-24T12:00:00')

test('parseClaudeActivity sums only the last 7 days of activity', () => {
  const cache = {
    lastComputedDate: '2026-07-23',
    dailyActivity: [
      { date: '2026-07-22', messageCount: 6, sessionCount: 2, toolCallCount: 1 },
      { date: '2026-07-20', messageCount: 10, sessionCount: 1, toolCallCount: 4 },
      { date: '2026-06-01', messageCount: 999, sessionCount: 9, toolCallCount: 9 } // outside window
    ],
    dailyModelTokens: [
      { date: '2026-07-22', tokensByModel: { 'claude-opus-4-8': 1000, 'claude-sonnet-5': 500 } },
      { date: '2026-06-01', tokensByModel: { 'claude-opus-4-8': 999999 } } // outside window
    ]
  }
  const result = parseClaudeActivity(cache, NOW)
  assert.equal(result.available, true)
  assert.equal(result.weekly.messages, 16)
  assert.equal(result.weekly.sessions, 3)
  assert.equal(result.weekly.tokens, 1500)
  assert.deepEqual(result.weekly.byModel, { 'claude-opus-4-8': 1000, 'claude-sonnet-5': 500 })
})

test('parseClaudeActivity reports unavailable for an empty cache', () => {
  const result = parseClaudeActivity({}, NOW)
  assert.equal(result.available, false)
})

test('collectClaudeActivity returns available:false when the cache is missing', async () => {
  const result = await collectClaudeActivity('/nonexistent/stats-cache.json', NOW)
  assert.equal(result.available, false)
  assert.match(result.reason, /has not recorded/i)
})
