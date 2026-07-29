import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('starts in a private workspace without forcing a folder chooser', () => {
  const source = readFileSync(new URL('../src/renderer/Workspace.jsx', import.meta.url), 'utf8')
  const modal = source.slice(source.indexOf('function NewTask'), source.indexOf('function compactUsage'))
  assert.match(modal, /New private workspace/)
  assert.match(modal, /Use existing project/)
  assert.match(modal, /getRecentProjects/)
  assert.match(modal, /cwd: cwd\.trim\(\)/)
  assert.doesNotMatch(modal, /Choose a project folder so the agent knows where to work/)
  assert.doesNotMatch(modal, /workingDirectory = await chooseFolder/)
})
