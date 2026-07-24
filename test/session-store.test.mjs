import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionStore } from '../src/main/sessions.js'

test('keeps a persistent Ambientic thread name across provider index refreshes', () => {
  const store = new SessionStore()
  const id = 'codex-desktop:thread-123'
  store.hydrateTasks({
    [`session:${id}`]: { label: 'Ambientic', source: 'user', agent: 'codex', cwd: '/Users/test/project' }
  })
  store.syncExternal('codex-desktop', [{ id, agent: 'codex', cwd: '/Users/test/project', task: 'New project. A very long first prompt', state: 'idle' }])
  assert.equal(store.list()[0].task, 'Ambientic')
  store.syncExternal('codex-desktop', [{ id, agent: 'codex', cwd: '/Users/test/project', task: 'Provider changed this title again', state: 'running' }])
  assert.equal(store.list()[0].task, 'Ambientic')
  assert.equal(store.list()[0].state, 'running')
  clearInterval(store._reaper)
})
