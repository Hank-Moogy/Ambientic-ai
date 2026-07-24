import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsumptionLedger } from '../src/main/consumption-ledger.mjs'

function usage (updatedAt, { usedPercent, resetAt, resets, balance = '0' }) {
  return {
    updatedAt,
    providers: {
      codex: {
        status: 'ok',
        plan: 'plus',
        credits: { hasCredits: Number(balance) > 0, balance },
        resetCredits: { availableCount: resets, credits: [] },
        windows: [{ id: 'codex-primary', period: 'week', usedPercent, resetAt }]
      }
    }
  }
}

test('persists an exact Codex reset-use transition once', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'agentbase-ledger-')), 'ledger.json')
  const ledger = new ConsumptionLedger({ file })
  ledger.observe(usage(1_000, { usedPercent: 97, resetAt: 10, resets: 1 }))
  const state = ledger.observe(usage(2_000, { usedPercent: 0, resetAt: 20, resets: 0 }))
  ledger.observe(usage(2_000, { usedPercent: 0, resetAt: 20, resets: 0 }))

  assert.equal(state.summary.resetUses, 1)
  assert.equal(state.events[0].type, 'reset-used')
  assert.equal(state.events[0].beforePercent, 97)
  assert.equal(state.events[0].afterPercent, 0)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).events.length, 1)
})

test('tracks purchased credit balance additions and consumption without claiming currency', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'agentbase-ledger-')), 'ledger.json')
  const ledger = new ConsumptionLedger({ file })
  ledger.observe(usage(1_000, { usedPercent: 10, resetAt: 100, resets: 0, balance: '0' }))
  ledger.observe(usage(2_000, { usedPercent: 10, resetAt: 100, resets: 0, balance: '50' }))
  const state = ledger.observe(usage(3_000, { usedPercent: 12, resetAt: 100, resets: 0, balance: '45' }))

  assert.equal(state.summary.creditsAdded, 50)
  assert.equal(state.summary.creditsUsed, 5)
  assert.equal(state.summary.currentBalances.codex, 45)
})

test('labels a due quota rollover as a natural window reset', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'agentbase-ledger-')), 'ledger.json')
  const ledger = new ConsumptionLedger({ file })
  ledger.observe(usage(1_000, { usedPercent: 90, resetAt: 2, resets: 0 }))
  const state = ledger.observe(usage(3_000, { usedPercent: 0, resetAt: 20, resets: 0 }))

  assert.equal(state.summary.resetUses, 0)
  assert.equal(state.events[0].type, 'window-reset')
})
