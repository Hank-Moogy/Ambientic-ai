import test from 'node:test'
import assert from 'node:assert/strict'
import { codexDesktopState, parseCodexDesktopRows } from '../src/main/codex-desktop.mjs'

const event = (timestamp, type) => JSON.stringify({ timestamp, type: 'event_msg', payload: { type } })

test('maps Codex desktop rollout lifecycle to Ambientic states', () => {
  const now = Date.parse('2026-07-22T13:20:00Z')
  assert.equal(codexDesktopState([
    event('2026-07-22T13:10:00Z', 'task_started'),
    event('2026-07-22T13:11:00Z', 'agent_reasoning')
  ].join('\n'), now, Date.parse('2026-07-22T13:19:50Z')), 'running')
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

test('expires an unmatched Codex start after rollout activity stops', () => {
  const now = Date.parse('2026-07-22T13:20:00Z')
  const interrupted = [
    event('2026-07-22T13:10:00Z', 'task_started'),
    JSON.stringify({ timestamp: '2026-07-22T13:10:20Z', type: 'event_msg', payload: { type: 'agent_message' } })
  ].join('\n')

  assert.equal(codexDesktopState(interrupted, now), 'idle')
  assert.equal(codexDesktopState(interrupted, Date.parse('2026-07-22T13:10:50Z')), 'running')
})

test('keeps an explicit recent completion waiting despite a slightly newer index timestamp', () => {
  const now = Date.parse('2026-07-22T13:20:00Z')
  assert.equal(codexDesktopState([
    event('2026-07-22T13:10:00Z', 'task_started'),
    event('2026-07-22T13:19:00Z', 'task_complete')
  ].join('\n'), now, Date.parse('2026-07-22T13:19:05Z')), 'waiting')
})

test('creates stable Codex desktop session records and deep links', () => {
  const [session] = parseCodexDesktopRows(JSON.stringify([{
    id: 'thread-123', cwd: '/Users/test/Ambientic', title: '  Build   Ambientic  ', rollout_path: '/tmp/rollout.jsonl', activity_ms: 42
  }]))
  assert.equal(session.id, 'codex-desktop:thread-123')
  assert.equal(session.project, 'Ambientic')
  assert.equal(session.task, 'Build Ambientic')
  assert.equal(session.deepLink, 'codex://threads/thread-123')
})

test('uses the human request when Codex indexes an Ambientic context envelope', () => {
  const [session] = parseCodexDesktopRows(JSON.stringify([{
    id: 'thread-context', cwd: '/Users/test/Ambientic',
    title: '<ambientic-context mode="build"> Project context: truncated',
    preview: '<ambientic-context mode="build">\nProject context: hidden\n</ambientic-context>\nFix duplicate thread names'
  }]))
  assert.equal(session.task, 'Fix duplicate thread names')
})
