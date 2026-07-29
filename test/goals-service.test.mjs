import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GoalsService } from '../src/main/goals-service.mjs'

function service () {
  let clock = 1_700_000_000_000
  let sequence = 0
  const directory = mkdtempSync(join(tmpdir(), 'ambientic-goals-'))
  const file = join(directory, 'goals.json')
  return {
    file,
    goals: new GoalsService({
      file,
      now: () => ++clock,
      id: () => `id-${++sequence}`
    })
  }
}

test('persists a goal and derives task progress', () => {
  const { goals, file } = service()
  const goal = goals.createGoal({ title: 'Ship Ambientic', outcome: 'Release a useful goals workspace.' })
  const first = goals.createTask(goal.id, { title: 'Build the board', status: 'done', ownerType: 'agent' })
  goals.createTask(goal.id, { title: 'Test the flow', status: 'blocked', ownerType: 'human' })

  const snapshot = goals.list()
  assert.equal(snapshot.goals[0].summary.total, 2)
  assert.equal(snapshot.goals[0].summary.done, 1)
  assert.equal(snapshot.goals[0].summary.blocked, 1)
  assert.equal(snapshot.goals[0].summary.progress, 50)
  assert.ok(snapshot.goals[0].tasks.some((task) => task.id === first.id))
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).goals[0].title, 'Ship Ambientic')
})

test('moves tasks between board states and records an audit event', () => {
  const { goals } = service()
  const goal = goals.createGoal({ title: 'Find a job' })
  const task = goals.createTask(goal.id, { title: 'Build shortlist', status: 'ready' })
  goals.updateTask(task.id, { status: 'in_progress', ownerType: 'mixed', ownerName: 'Samori + Codex' })

  const snapshot = goals.list()
  assert.equal(snapshot.goals[0].tasks[0].status, 'in_progress')
  assert.equal(snapshot.goals[0].tasks[0].ownerType, 'mixed')
  assert.equal(snapshot.events[0].action, 'updated')
  assert.equal(snapshot.events[0].changes.status, 'in_progress')
})

test('rejects empty goal and task names', () => {
  const { goals } = service()
  assert.throws(() => goals.createGoal({ title: '  ' }), /name/)
  const goal = goals.createGoal({ title: 'Learn piano' })
  assert.throws(() => goals.createTask(goal.id, { title: '' }), /name/)
})
