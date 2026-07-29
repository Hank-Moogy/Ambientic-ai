import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/renderer/Goals.jsx', import.meta.url), 'utf8')

function between (start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

test('keeps board ticket cards title-only and opens details on selection', () => {
  const card = between('function TaskCard', 'function TaskDetailModal')
  assert.match(card, /<h3>\{task\.title\}<\/h3>/)
  assert.match(card, /onClick=\{\(\) => onOpen\(task\.id\)\}/)
  assert.doesNotMatch(card, /<select/)
  assert.doesNotMatch(card, /task\.description|task\.acceptanceCriteria|task\.ownerName|task\.milestone/)
})

test('moves ticket metadata and status control into the detail dialog', () => {
  const detail = between('function TaskDetailModal', 'function GoalDetail')
  assert.match(detail, /role="dialog"/)
  assert.match(detail, /<select value=\{task\.status\}/)
  assert.match(detail, /task\.milestone/)
  assert.match(detail, /task\.description/)
  assert.match(detail, /task\.acceptanceCriteria/)
})

test('collapses goal context while leaving the name and board visible', () => {
  const detail = between('function GoalDetail', 'export function GoalsWorkspace')
  assert.match(detail, /<h1>\{goal\.title\}<\/h1>/)
  assert.match(detail, /aria-expanded=\{showGoalDetails\}/)
  assert.match(detail, /showGoalDetails && <div className="goal-detail__disclosure"/)
  assert.match(detail, /<h2>\{goal\.tasks\.length\} tickets<\/h2>/)
})
