import test from 'node:test'
import assert from 'node:assert/strict'
import { applicableGrants, describeGrant, grantForRequest, grantMatches, persistableGrants } from '../src/main/permission-grants.mjs'

test('approving a file grants its folder, so its neighbours stop asking', () => {
  const grant = grantForRequest({ tool: 'Read', paths: ['/p/notes/spec.md'], scope: 'always' })
  assert.equal(grant.root, '/p/notes')
  assert.equal(grantMatches(grant, { tool: 'Read', paths: ['/p/notes/other.md'] }), true)
  assert.equal(grantMatches(grant, { tool: 'Read', paths: ['/p/elsewhere/x.md'] }), false)
})

test('a read-only grant never quietly authorises a change', () => {
  const readGrant = grantForRequest({ tool: 'Read', paths: ['/p/notes/spec.md'], scope: 'always' })
  assert.equal(readGrant.write, false)
  assert.equal(grantMatches(readGrant, { tool: 'Edit', paths: ['/p/notes/spec.md'] }), false)
  const writeGrant = grantForRequest({ tool: 'Edit', paths: ['/p/src/a.js'], scope: 'always' })
  assert.equal(writeGrant.write, true)
  assert.equal(grantMatches(writeGrant, { tool: 'Read', paths: ['/p/src/a.js'] }), true)
})

test('a shell command is remembered where it runs, not everywhere', () => {
  const grant = grantForRequest({ tool: 'Bash', paths: [], cwd: '/p/app', scope: 'always' })
  assert.equal(grant.tool, 'Bash')
  assert.equal(grantMatches(grant, { tool: 'Bash', paths: [], cwd: '/p/app' }), true)
  assert.equal(grantMatches(grant, { tool: 'Bash', paths: [], cwd: '/p/other' }), false)
  // And it is a grant for Bash, not a blanket pass for every tool in that folder.
  assert.equal(grantMatches(grant, { tool: 'WebFetch', paths: [], cwd: '/p/app' }), false)
})

test('a thread grant applies to its own thread only, and is never persisted', () => {
  const mine = { id: '1', scope: 'session', threadId: 'thread-a', tool: '', root: '/p', write: true }
  const theirs = { id: '2', scope: 'session', threadId: 'thread-b', tool: '', root: '/p', write: true }
  const standing = { id: '3', scope: 'always', threadId: '', tool: '', root: '/p', write: true }
  assert.deepEqual(applicableGrants([mine, theirs, standing], 'thread-a').map((g) => g.id), ['1', '3'])
  // "For this session" surviving a restart would be a promise the app broke.
  assert.deepEqual(persistableGrants([mine, theirs, standing]).map((g) => g.id), ['3'])
})

test('an always grant is not tied to the thread that created it', () => {
  const grant = grantForRequest({ tool: 'Read', paths: ['/p/notes/a.md'], scope: 'always', threadId: 'thread-a' })
  assert.equal(grant.threadId, '')
  assert.deepEqual(applicableGrants([grant], 'any-other-thread').map((g) => g.id), [grant.id])
})

test('grants describe themselves in terms a person can revoke confidently', () => {
  assert.equal(describeGrant({ tool: 'Bash', root: '/Users/p/app', write: true }), 'Bash in app')
  assert.equal(describeGrant({ tool: '', root: '/Users/p/notes', write: false }), 'Read files in notes')
})
