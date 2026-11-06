import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OrchestrationService } from '../src/main/orchestration-service.mjs'

export function readout (job, status = 'complete') {
  return `# Fixture only — no production data\n- Readout ID: fixture-${job.id}\n- Request ID: ${job.requestId}\n- Status: ${status}\n- Analyst/provider: fixture\n- Observed at: 2026-11-06T12:00:00Z\n- Measurement window and timezone: fixture, UTC\n- Sources and methodology: synthetic fixture\n- Metrics / units / denominators: not applicable\n- Limitations / missing evidence: no real analysis performed\n- Recommendation (not an approved decision): verify live tools before production\n`
}

function fixture (t) {
  const directory = mkdtempSync(join(tmpdir(), 'ambientic-orchestration-'))
  const root = join(directory, 'context')
  const cwd = join(directory, 'worker')
  mkdirSync(root); mkdirSync(cwd)
  const requestPath = join(root, 'request.md')
  const instructionsPath = join(cwd, 'specialist.md')
  writeFileSync(requestPath, '# Fixture\n- Request ID: fixture-1\nRead-only fixture.')
  writeFileSync(instructionsPath, 'Return synthetic evidence only.')
  const workspace = new EventEmitter()
  workspace.activeTurns = new Map()
  workspace.calls = []
  workspace.create = async (args) => { workspace.calls.push(['create', args]); return 'fixture-session' }
  workspace.send = async (id, prompt, options) => { workspace.calls.push(['send', id, prompt, options]); workspace.activeTurns.set(id, true) }
  workspace.interrupt = (id) => { workspace.activeTurns.delete(id); workspace.emit('turn-completed', { sessionId: id, error: 'interrupted' }) }
  const file = join(directory, 'queue.db')
  let queue = new OrchestrationService({ file, workspace })
  t.after(() => { queue.close(); rmSync(directory, { recursive: true, force: true }) })
  const input = { specialist: 'experiment-analyst', requestId: 'fixture-1', revision: '1', requestPath }
  return { root, cwd, workspace, input, instructionsPath,
    get queue () { return queue },
    register: () => queue.register(root, { specialist: input.specialist, cwd, instructionsPath, enabled: true, toolsVerified: true }),
    restart: () => { queue.close(); queue = new OrchestrationService({ file, workspace }) },
    complete: (job, status) => { writeFileSync(job.resultPath, readout(job, status)); workspace.activeTurns.delete(job.sessionId); workspace.emit('turn-completed', { sessionId: job.sessionId }) }
  }
}

test('first-run fixture: one request, one worker, validated result, explicit incorporation', async (t) => {
  const f = fixture(t)
  assert.equal(f.queue.list(f.root).specialists.every((item) => item.status === 'setup_required'), true)
  f.register()
  const job = f.queue.enqueue(f.root, f.input)
  assert.equal(f.queue.enqueue(f.root, f.input).id, job.id)
  const running = await f.queue.run(f.root, job.id)
  await f.queue.run(f.root, job.id)
  assert.equal(f.workspace.calls.filter(([name]) => name === 'send').length, 1)
  assert.throws(() => f.queue.incorporate(f.root, job.id, 'review'), /validated result/)
  f.complete(running)
  const result = f.queue.get(f.root, job.id)
  assert.equal(result.status, 'result_ready')
  assert.equal(result.analysisStatus, 'complete')
  assert.match(result.result, /synthetic fixture/)
  assert.equal(f.queue.incorporate(f.root, job.id, 'reviews/fixture.md @ fixture-publication').status, 'incorporated')
  f.restart()
  assert.equal(f.queue.enqueue(f.root, f.input).status, 'incorporated')
  assert.equal(f.workspace.calls.filter(([name]) => name === 'send').length, 1)
})

test('disabled specialists never start and changed requests cannot reuse a revision', async (t) => {
  const f = fixture(t)
  const job = f.queue.enqueue(f.root, f.input)
  await assert.rejects(f.queue.run(f.root, job.id), /setup is still open/)
  assert.equal(f.workspace.calls.length, 0)
  writeFileSync(f.input.requestPath, '- Request ID: fixture-1\nChanged instructions')
  assert.throws(() => f.queue.enqueue(f.root, f.input), /new revision/)
  assert.throws(() => f.queue.register(f.root, { specialist: f.input.specialist, cwd: f.cwd, instructionsPath: f.instructionsPath, enabled: true }), /Verify.*tools/)
})

test('restart never repeats an ambiguous dispatch and valid evidence can be reconciled', async (t) => {
  const f = fixture(t); f.register()
  const running = await f.queue.run(f.root, f.queue.enqueue(f.root, f.input).id)
  f.restart()
  assert.equal((await f.queue.run(f.root, running.id)).status, 'needs_reconciliation')
  assert.equal(f.workspace.calls.filter(([name]) => name === 'send').length, 1)
  assert.throws(() => f.queue.collect(f.root, running.id), /worker to finish/)
  writeFileSync(running.resultPath, readout(running))
  f.workspace.activeTurns.clear()
  assert.equal(f.queue.collect(f.root, running.id).status, 'result_ready')
})

test('parallel calls cannot launch two jobs into the same worker directory', async (t) => {
  const f = fixture(t); f.register()
  const a = f.queue.enqueue(f.root, f.input)
  const b = f.queue.enqueue(f.root, { ...f.input, revision: '2' })
  const outcomes = await Promise.allSettled([f.queue.run(f.root, a.id), f.queue.run(f.root, b.id)])
  assert.equal(outcomes.filter((item) => item.status === 'rejected').length, 1)
  assert.equal(f.workspace.calls.filter(([name]) => name === 'send').length, 1)
})

test('missing, mismatched and partial results remain honest', async (t) => {
  const f = fixture(t); f.register()
  const running = await f.queue.run(f.root, f.queue.enqueue(f.root, f.input).id)
  f.workspace.activeTurns.clear()
  f.workspace.emit('turn-completed', { sessionId: running.sessionId })
  assert.equal(f.queue.get(f.root, running.id).status, 'needs_reconciliation')
  writeFileSync(running.resultPath, readout(running).replace('Request ID: fixture-1', 'Request ID: wrong'))
  assert.throws(() => f.queue.collect(f.root, running.id), /does not match/)
  writeFileSync(running.resultPath, readout(running, 'partial'))
  assert.equal(f.queue.collect(f.root, running.id).analysisStatus, 'partial')
})

test('cancellation and timeouts cannot be overwritten by late completion', async (t) => {
  const f = fixture(t); f.register()
  const running = await f.queue.run(f.root, f.queue.enqueue(f.root, f.input).id)
  f.queue.cancel(f.root, running.id)
  f.complete(running)
  assert.equal(f.queue.get(f.root, running.id).status, 'cancelled')
  const second = await f.queue.run(f.root, f.queue.enqueue(f.root, { ...f.input, revision: '2' }).id)
  f.queue.now = () => second.startedAt + 3_600_001
  f.queue.expire()
  assert.equal(f.queue.get(f.root, second.id).status, 'needs_reconciliation')
  assert.equal(f.workspace.activeTurns.size, 0)
})

test('project isolation and symlink escapes are rejected', (t) => {
  const f = fixture(t)
  const job = f.queue.enqueue(f.root, f.input)
  assert.throws(() => f.queue.get(f.cwd, job.id), /not found/)
  symlinkSync(f.instructionsPath, join(f.root, 'escape.md'))
  assert.throws(() => f.queue.enqueue(f.root, { ...f.input, requestPath: join(f.root, 'escape.md'), revision: '2' }), /inside the bound project/)
})

test('worker errors preserve uncertain state and do not retry', async (t) => {
  const f = fixture(t); f.register()
  f.workspace.send = async () => { throw new Error('provider limit') }
  const job = await f.queue.run(f.root, f.queue.enqueue(f.root, f.input).id)
  assert.equal(job.status, 'needs_reconciliation')
  assert.match(job.error, /provider limit/)
})
