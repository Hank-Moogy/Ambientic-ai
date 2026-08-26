import test from 'node:test'
import assert from 'node:assert/strict'
import { decideToolPermission, grantedBy, toolPaths } from '../src/main/permission-policy.mjs'

const home = '/Users/person'
const base = { cwd: '/Users/person/projects/ambientic', projectRoots: ['/Users/person/projects/memoli'], home }

test('reading inside a project the user already works in does not interrupt them', () => {
  for (const file of ['/Users/person/projects/ambientic/src/main/index.js', '/Users/person/projects/memoli/router.ts']) {
    assert.equal(decideToolPermission({ ...base, tool: 'Read', input: { file_path: file } }).decision, 'allow')
  }
  assert.equal(decideToolPermission({ ...base, tool: 'Grep', input: { pattern: 'x' } }).decision, 'allow')
})

test('anything outside the project asks rather than failing', () => {
  const result = decideToolPermission({ ...base, tool: 'Read', input: { file_path: '/Users/person/notes/spec.md' } })
  assert.equal(result.decision, 'ask')
  // The scope is what a "remember" would grant, so it has to be the real path.
  assert.equal(result.scope, '/Users/person/notes/spec.md')
})

test('writes are confirmed, and a grant stops asking for every file in the folder', () => {
  const file = '/Users/person/projects/ambientic/src/main/index.js'
  assert.equal(decideToolPermission({ ...base, tool: 'Edit', input: { file_path: file } }).decision, 'ask')
  const grants = [{ scope: 'session', threadId: 't', tool: '', root: '/Users/person/projects/ambientic/src/main', write: true }]
  assert.equal(decideToolPermission({ ...base, tool: 'Edit', input: { file_path: file }, grants }).decision, 'allow')
  // A read-only grant must never quietly authorise a change.
  const readOnly = [{ scope: 'always', tool: '', root: '/Users/person/notes', write: false }]
  assert.equal(decideToolPermission({ ...base, tool: 'Read', input: { file_path: '/Users/person/notes/a.md' }, grants: readOnly }).decision, 'allow')
  assert.equal(decideToolPermission({ ...base, tool: 'Write', input: { file_path: '/Users/person/notes/a.md' }, grants: readOnly }).decision, 'ask')
})

test('a shell command can be remembered, so it stops asking on every call', () => {
  // Without a scope the card offers no way to remember, which is what made a
  // shell command prompt on every single invocation.
  const asked = decideToolPermission({ ...base, tool: 'Bash', input: { command: 'npm test' } })
  assert.equal(asked.decision, 'ask')
  assert.equal(asked.scope, base.cwd)
  const grants = [{ scope: 'always', tool: 'Bash', root: base.cwd, write: true }]
  assert.equal(decideToolPermission({ ...base, tool: 'Bash', input: { command: 'npm test' }, grants }).decision, 'allow')
  // That grant is for Bash in this project, not Bash everywhere.
  assert.equal(decideToolPermission({ ...base, cwd: '/Users/person/other', tool: 'Bash', input: { command: 'rm -rf .' }, grants }).decision, 'ask')
})

test('a standing grant can never widen into the home folder', () => {
  const grants = [{ scope: 'always', tool: '', root: '/Users/person', write: true }]
  assert.equal(decideToolPermission({ ...base, tool: 'Read', input: { file_path: '/Users/person/Documents' }, grants }).decision, 'deny')
})

test('a shell command is never auto-granted from its arguments', () => {
  // `cd /Users/person/projects/ambientic && rm -rf ~` names a trusted path and
  // reaches far outside it, so Bash is judged by what it is, not what it says.
  const result = decideToolPermission({ ...base, tool: 'Bash', input: { command: 'cd /Users/person/projects/ambientic && cat ~/.ssh/id_rsa' } })
  assert.equal(result.decision, 'ask')
})

test('the home folder and whole protected collections are refused, not offered', () => {
  for (const target of ['/Users/person', '/Users/person/Documents', '/']) {
    assert.equal(decideToolPermission({ ...base, tool: 'Read', input: { file_path: target } }).decision, 'deny')
  }
  // A real project inside a protected collection is still askable.
  assert.equal(decideToolPermission({ ...base, tool: 'Read', input: { file_path: '/Users/person/Documents/coding/app/main.js' } }).decision, 'ask')
})

test('every file a multi-edit touches is considered, not just the first', () => {
  assert.deepEqual(toolPaths({ edits: [{ file_path: '/a/one.js' }, { file_path: '/b/two.js' }] }), ['/a/one.js', '/b/two.js'])
  const result = decideToolPermission({ ...base, tool: 'Edit', input: { edits: [{ file_path: '/Users/person/projects/ambientic/a.js' }, { file_path: '/Users/person/secrets/b.js' }] } })
  assert.equal(result.decision, 'ask')
  assert.equal(result.scope, '/Users/person/secrets/b.js')
  assert.equal(grantedBy(['/Users/person/projects/ambientic'], '/Users/person/secrets/b.js'), '')
})
