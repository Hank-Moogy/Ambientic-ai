import test from 'node:test'
import assert from 'node:assert/strict'
import { taskCreationError } from '../src/renderer/new-task-state.mjs'

test('shows the useful provider error from a failed managed-task IPC request', () => {
  assert.equal(
    taskCreationError(new Error("Error invoking remote method 'create-managed-thread': Error: Claude Code is not logged in.")),
    'Claude Code is not logged in.'
  )
})

test('provides a stable fallback when task startup fails without a message', () => {
  assert.match(taskCreationError(null), /could not start this task/i)
})
