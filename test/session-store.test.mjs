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
