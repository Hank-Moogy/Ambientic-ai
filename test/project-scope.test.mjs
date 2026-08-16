import test from 'node:test'
import assert from 'node:assert/strict'
import { canInspectProjectRoot, isBroadProjectRoot, projectLaunchAccess, protectedHomeChild } from '../src/main/project-scope.mjs'

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
  assert.equal(canInspectProjectRoot('/Users/person/Music/project', home), false)
  assert.equal(canInspectProjectRoot('/Users/person/Pictures/project', home), false)
  assert.equal(canInspectProjectRoot('/Users/person/Documents/project', home), false)
})

test('describes provider access separately from Ambientic background inspection', () => {
  assert.deepEqual(projectLaunchAccess('/Users/person/projects/ambientic', home), {
    broad: false,
    protectedCollection: '',
    ambienticCanInspect: true,
    providerRunsInWorkspace: true,
    warning: ''
  })
  const protectedProject = projectLaunchAccess('/Users/person/Documents/ambientic', home)
  assert.equal(protectedProject.providerRunsInWorkspace, true)
  assert.equal(protectedProject.ambienticCanInspect, false)
  assert.equal(protectedProject.protectedCollection, 'Documents')
  assert.match(protectedProject.warning, /under Ambientic's name/)
})
