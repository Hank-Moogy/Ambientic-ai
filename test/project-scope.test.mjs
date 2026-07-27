import test from 'node:test'
import assert from 'node:assert/strict'
import { canInspectProjectRoot, isBroadProjectRoot, protectedHomeChild } from '../src/main/project-scope.mjs'

const home = '/Users/person'

test('rejects filesystem and home roots that would traverse protected folders', () => {
  assert.equal(isBroadProjectRoot('/', home), true)
  assert.equal(isBroadProjectRoot('/Users/person', home), true)
  assert.equal(isBroadProjectRoot('/Users', home), true)
  assert.equal(canInspectProjectRoot('/Users/person', home), false)
})

test('allows a specific project directory without granting broad home access', () => {
  assert.equal(canInspectProjectRoot('/Users/person/projects/ambientic', home), true)
  assert.equal(protectedHomeChild('/Users/person/projects/ambientic', home), '')
})

test('identifies macOS protected home collections', () => {
  assert.equal(protectedHomeChild('/Users/person/Music/library.musiclibrary', home), 'Music')
  assert.equal(protectedHomeChild('/Users/person/Pictures/Photos Library.photoslibrary', home), 'Pictures')
  assert.equal(protectedHomeChild('/Users/person/Documents/project', home), 'Documents')
})
