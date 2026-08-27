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

test('expires stale running hooks for every terminal provider without removing the thread', () => {
  for (const agent of ['codex', 'claude', 'hermes']) {
    const store = new SessionStore()
    const tty = `/dev/${agent}`
    const id = `${agent}-hook`
    store.ingest({ event: 'prompt', session_id: id, agent, tty, cwd: '/tmp/project' })
    store.map.get(id).lastSeen = Date.now() - 16 * 60 * 1000

    store.syncDiscovered([{ id: `discovered:${tty}`, agent, tty, cwd: '/tmp/project', project: 'project' }])

    assert.equal(store.list().length, 1)
    assert.equal(store.list()[0].state, 'idle', agent)
    clearInterval(store._reaper)
  }
})

test('does not expire user-required or recently active terminal states', () => {
  const store = new SessionStore()
  store.ingest({ event: 'prompt', session_id: 'active', agent: 'claude', tty: '/dev/active' })
  store.ingest({ event: 'stop', session_id: 'waiting', agent: 'hermes', tty: '/dev/waiting' })
  store.map.get('waiting').lastSeen = Date.now() - 60 * 60 * 1000

  store.syncDiscovered([
    { id: 'discovered:active', agent: 'claude', tty: '/dev/active' },
    { id: 'discovered:waiting', agent: 'hermes', tty: '/dev/waiting' }
  ])

  assert.equal(store.map.get('active').state, 'running')
  assert.equal(store.map.get('waiting').state, 'waiting')
  clearInterval(store._reaper)
})
