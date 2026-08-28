import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SessionStore } from '../src/main/sessions.js'

const main = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')

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

test('freezes the first provider title and lets a durable user alias win', () => {
  const store = new SessionStore()
  const incoming = { id: 'codex-desktop:thread-name', threadId: 'thread-name', agent: 'codex', task: 'Fix thread naming', state: 'idle' }
  store.syncExternal('codex-desktop', [incoming])
  store.syncExternal('codex-desktop', [{ ...incoming, task: 'Provider renamed this later' }])
  assert.equal(store.list()[0].task, 'Fix thread naming')

  store.hydrateAliases({ 'codex:thread-name': 'My permanent name' })
  store.syncExternal('codex-desktop', [{ ...incoming, task: 'Another provider name' }])
  store.updateTask(incoming.id, 'Late model result', 'old-request', 'model')
  assert.equal(store.list()[0].task, 'My permanent name')
  assert.equal(store.list()[0].taskSource, 'user')
  clearInterval(store._reaper)
})

test('opening a completed thread consumes that wait until a new turn finishes', () => {
  const store = new SessionStore()
  const id = 'codex-desktop:thread-ack'
  const waiting = { id, agent: 'codex', cwd: '/Users/test/project', task: 'Finished task', state: 'waiting' }

  store.syncExternal('codex-desktop', [waiting])
  assert.equal(store.list()[0].state, 'waiting')
  assert.equal(store.list()[0].unseen, true)

  assert.equal(store.acknowledge(id), true)
  assert.equal(store.list()[0].state, 'idle')
  assert.equal(store.list()[0].unseen, false)

  store.syncExternal('codex-desktop', [waiting])
  assert.equal(store.list()[0].state, 'idle')
  assert.equal(store.list()[0].unseen, false)

  store.syncExternal('codex-desktop', [{ ...waiting, state: 'running' }])
  store.syncExternal('codex-desktop', [waiting])
  assert.equal(store.list()[0].state, 'waiting')
  assert.equal(store.list()[0].unseen, true)
  clearInterval(store._reaper)
})

test('opening a thread does not hide a genuine attention request', () => {
  const store = new SessionStore()
  const id = 'codex-desktop:thread-approval'
  store.syncExternal('codex-desktop', [{ id, agent: 'codex', state: 'attention' }])

  assert.equal(store.acknowledge(id), true)
  assert.equal(store.list()[0].state, 'attention')
  assert.equal(store.list()[0].unseen, false)
  clearInterval(store._reaper)
})

test('an empty discovered process does not consume a hardware pad', () => {
  const store = new SessionStore()
  store.syncDiscovered([{ id: 'discovered:tty1', agent: 'hermes', cwd: '/Users/test/AgentBase', project: 'AgentBase', tty: 'tty1' }])
  assert.deepEqual(store.hardwareList(), [])

  store.ingest({ event: 'prompt', session_id: 'hermes-live', agent: 'hermes', cwd: '/Users/test/AgentBase', tty: 'tty1' })
  assert.deepEqual(store.hardwareList().map((session) => session.id), ['hermes-live'])
  clearInterval(store._reaper)
})

test('a cached name cannot make an empty discovered process consume a hardware pad', () => {
  const store = new SessionStore()
  store.hydrateTasks({
    'tty:tty1': {
      label: 'AgentBase', source: 'model', agent: 'hermes', cwd: '/Users/test/AgentBase', updatedAt: Date.now()
    }
  })

  store.syncDiscovered([{ id: 'discovered:tty1', agent: 'hermes', cwd: '/Users/test/AgentBase', project: 'AgentBase', tty: 'tty1' }])

  const session = store.list()[0]
  assert.equal(session.task, 'AgentBase')
  assert.equal(session.activityAt, 0)
  assert.equal(session.discovered, true)
  assert.equal(session.padIndex, null)
  assert.deepEqual(store.hardwareList(), [])
  clearInterval(store._reaper)
})

test('a managed provider thread earns a pad only after real conversation activity', () => {
  const store = new SessionStore()
  store.hydrateTasks({
    'session:managed-hermes': {
      label: 'Useful Hermes task', source: 'user', agent: 'hermes', cwd: '/Users/test/AgentBase', updatedAt: Date.now()
    }
  })

  store.ingest({ event: 'session_start', session_id: 'managed-hermes', agent: 'hermes', cwd: '/Users/test/AgentBase' })
  assert.deepEqual(store.hardwareList(), [])

  store.ingest({ event: 'prompt', session_id: 'managed-hermes', agent: 'hermes', cwd: '/Users/test/AgentBase' })
  assert.deepEqual(store.hardwareList().map((session) => session.id), ['managed-hermes'])
  clearInterval(store._reaper)
})

test('stand by persists an idle reminder on a pad and the next turn consumes it', () => {
  const store = new SessionStore()
  const persisted = []
  store.on('standby-cache', (keys) => persisted.push(keys))
  store.ingest({ event: 'session_start', session_id: 'check-later', agent: 'hermes', cwd: '/Users/test/AgentBase' })

  assert.equal(store.setStandby('check-later', true), true)
  assert.equal(store.list()[0].standby, true)
  assert.equal(store.list()[0].state, 'idle')
  assert.deepEqual(store.hardwareList().map((session) => session.id), ['check-later'])
  assert.deepEqual(persisted.at(-1), ['session:check-later'])

  store.ingest({ event: 'prompt', session_id: 'check-later', agent: 'hermes', cwd: '/Users/test/AgentBase' })
  assert.equal(store.list()[0].standby, false)
  assert.equal(store.list()[0].state, 'running')
  assert.deepEqual(persisted.at(-1), [])
  clearInterval(store._reaper)
})

test('stand by restores after relaunch but cannot mark a running or discovered placeholder', () => {
  const store = new SessionStore()
  store.hydrateStandby(['session:restored'])
  store.ingest({ event: 'session_start', session_id: 'restored', agent: 'codex', cwd: '/Users/test/project' })
  assert.equal(store.list()[0].standby, true)

  store.ingest({ event: 'prompt', session_id: 'running', agent: 'codex', cwd: '/Users/test/project' })
  assert.equal(store.setStandby('running', true), false)
  store.syncDiscovered([{ id: 'discovered:tty2', agent: 'hermes', tty: 'tty2', cwd: '/Users/test/project' }])
  assert.equal(store.setStandby('discovered:tty2', true), false)
  clearInterval(store._reaper)

  const runningStore = new SessionStore()
  runningStore.hydrateStandby(['session:already-running'])
  const runningPersisted = []
  runningStore.on('standby-cache', (keys) => runningPersisted.push(keys))
  runningStore.syncExternal('codex-desktop', [{
    id: 'already-running',
    agent: 'codex',
    cwd: '/Users/test/project',
    state: 'running'
  }])
  assert.equal(runningStore.list()[0].standby, false)
  assert.deepEqual(runningPersisted.at(-1), [])
  clearInterval(runningStore._reaper)
})

test('Codex Desktop discovery enriches a managed thread instead of duplicating its pad', () => {
  const store = new SessionStore()
  store.ingest({ event: 'session_start', session_id: 'thread-123', agent: 'codex', cwd: '/Users/test/project' })
  store.ingest({ event: 'prompt', session_id: 'thread-123', agent: 'codex', cwd: '/Users/test/project' })
  store.syncExternal('codex-desktop', [{
    id: 'codex-desktop:thread-123', threadId: 'thread-123', agent: 'codex', cwd: '/Users/test/project',
    task: 'The same thread', state: 'running', updatedAt: Date.now()
  }])

  assert.equal(store.list().length, 1)
  assert.equal(store.list()[0].id, 'thread-123')
  assert.equal(store.list()[0].deepLink, undefined)
  assert.deepEqual(store.hardwareList().map((session) => session.id), ['thread-123'])
  clearInterval(store._reaper)
})

test('the Ambientic thread selection bridge acknowledges the opened session', () => {
  const start = main.indexOf("ipcMain.handle('select-session'")
  assert.ok(start >= 0)
  assert.match(main.slice(start, start + 600), /store\.acknowledge\(id\)/)
})
