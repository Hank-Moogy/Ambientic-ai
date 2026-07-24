import test from 'node:test'
import assert from 'node:assert/strict'
import { organizeThreads } from '../src/renderer/thread-order.mjs'

test('keeps the latest user-opened thread first and separates old history', () => {
  const now = 10 * 24 * 60 * 60 * 1000
  const sessions = [
    { id: 'provider-new', agent: 'codex', task: 'New provider activity', updatedAt: now - 1_000, state: 'history', history: true },
    { id: 'user-latest', agent: 'claude', task: 'Opened by user', updatedAt: 1, state: 'history', history: true },
    { id: 'old', agent: 'hermes', task: 'Old archive', updatedAt: 2, state: 'history', history: true }
  ]
  const result = organizeThreads(sessions, {
    now,
    interactions: { 'user-latest': now - 500 }
  })
  assert.deepEqual(result.recent.map((session) => session.id), ['user-latest', 'provider-new'])
  assert.deepEqual(result.earlier.map((session) => session.id), ['old'])
  assert.equal(result.latestInteractedId, 'user-latest')
})

test('retains provider and search filtering across both activity lanes', () => {
  const result = organizeThreads([
    { id: 'a', agent: 'codex', task: 'Ambientic', updatedAt: 100, state: 'running' },
    { id: 'b', agent: 'claude', task: 'Other', updatedAt: 1, state: 'history' }
  ], { now: 200, provider: 'codex', query: 'ambient' })
  assert.deepEqual(result.recent.map((session) => session.id), ['a'])
  assert.deepEqual(result.earlier, [])
})
