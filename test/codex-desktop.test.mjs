import test from 'node:test'
import assert from 'node:assert/strict'
import { codexDesktopState, parseCodexDesktopRows } from '../src/main/codex-desktop.mjs'

const event = (timestamp, type) => JSON.stringify({ timestamp, type: 'event_msg', payload: { type } })

test('maps Codex desktop rollout lifecycle to AgentBase states', () => {
  const now = Date.parse('2026-07-22T13:20:00Z')
  assert.equal(codexDesktopState([
    event('2026-07-22T13:10:00Z', 'task_started'),
    event('2026-07-22T13:11:00Z', 'agent_reasoning')
  ].join('\n'), now), 'running')
  assert.equal(codexDesktopState([
    event('2026-07-22T13:10:00Z', 'task_started'),
    event('2026-07-22T13:19:00Z', 'task_complete')
  ].join('\n'), now), 'waiting')
  assert.equal(codexDesktopState([
    event('2026-07-22T12:00:00Z', 'task_started'),
    event('2026-07-22T12:01:00Z', 'task_complete')
  ].join('\n'), now), 'idle')
  assert.equal(codexDesktopState('', now, Date.parse('2026-07-22T13:19:50Z')), 'running')
})

test('creates stable Codex desktop session records and deep links', () => {
  const [session] = parseCodexDesktopRows(JSON.stringify([{
    id: 'thread-123', cwd: '/Users/test/AgentBase', title: '  Build   AgentBase  ', rollout_path: '/tmp/rollout.jsonl', activity_ms: 42
  }]))
  assert.equal(session.id, 'codex-desktop:thread-123')
  assert.equal(session.project, 'AgentBase')
  assert.equal(session.task, 'Build AgentBase')
  assert.equal(session.deepLink, 'codex://threads/thread-123')
})
