import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkspaceService } from '../src/main/workspace-service.mjs'

test('claudeResultError turns "Prompt is too long" into actionable guidance', () => {
  const session = { id: 'claude-big', agent: 'claude', cwd: '/Users/me/project' }
  const service = new WorkspaceService({ list: () => [session], ingest: () => {} }, () => [])

  const hint = service.claudeResultError(session.id, 'Prompt is too long')
  assert.match(hint, /too long/i)
  assert.match(hint, /new task/i)
  assert.match(hint, /\/compact/)
  assert.match(hint, /claude --resume claude-big/)
  assert.match(hint, /\/Users\/me\/project/)
})

test('claudeResultError passes through unrelated errors unchanged', () => {
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  assert.equal(service.claudeResultError('x', 'Some other failure'), 'Some other failure')
  assert.equal(service.claudeResultError('x', ''), 'Claude returned an error')
})
