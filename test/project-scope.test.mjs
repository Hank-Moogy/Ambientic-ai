import test from 'node:test'
import assert from 'node:assert/strict'
import { DISCOVERY_ROOT_LIMIT, additionalToolRoots, canGrantToolRoot, discoveryToolRoots, canInspectProjectRoot, isBroadProjectRoot, projectLaunchAccess, protectedHomeChild } from '../src/main/project-scope.mjs'

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

test('grants tool roots for attachments that sit outside the project', () => {
  const roots = additionalToolRoots('/Users/person/projects/ambientic', [
    { path: '/Users/person/projects/ambientic/src/main/index.js', kind: 'file' },
    { path: '/Users/person/projects/memoli/spec.md', kind: 'file' },
    { path: '/Users/person/notes', kind: 'folder' }
  ], home)
  // The in-project attachment is already reachable and must not widen the grant.
  assert.deepEqual(roots, ['/Users/person/projects/memoli', '/Users/person/notes'])
})

test('never widens a turn to the home folder or a whole protected collection', () => {
  assert.equal(canGrantToolRoot('/Users/person', home), false)
  assert.equal(canGrantToolRoot('/', home), false)
  assert.equal(canGrantToolRoot('/Users/person/Documents', home), false)
  // A real project inside a protected collection is exactly what the user picked.
  assert.equal(canGrantToolRoot('/Users/person/Documents/coding/memoli', home), true)
  assert.deepEqual(additionalToolRoots('/Users/person/projects/ambientic', [
    { path: '/Users/person/Documents', kind: 'folder' },
    { path: '/Users/person', kind: 'folder' },
    { path: 'relative/path.md', kind: 'file' }
  ], home), [])
})

test('offers other known projects as discovery roots, bounded and never broad', () => {
  const projects = [
    { cwd: '/Users/person/projects/ambientic' },
    { cwd: '/Users/person/projects/ambientic/src' },
    { rootPath: '/Users/person/projects/memoli' },
    { cwd: '/Users/person/Documents/coding/router' },
    { cwd: '/Users/person' },
    { cwd: '/Users/person/Documents' }
  ]
  assert.deepEqual(discoveryToolRoots('/Users/person/projects/ambientic', projects, home), [
    '/Users/person/projects/memoli',
    '/Users/person/Documents/coding/router'
  ])
  // The bound must not be what stops an agent seeing a project: a realistic
  // number of local projects passes through untouched, and the ceiling only
  // engages against a list no real machine produces.
  const many = Array.from({ length: 40 }, (_, index) => ({ cwd: `/Users/person/p${index}` }))
  assert.equal(discoveryToolRoots('', many, home).length, 40)
  const absurd = Array.from({ length: DISCOVERY_ROOT_LIMIT + 50 }, (_, index) => ({ cwd: `/Users/person/q${index}` }))
  assert.equal(discoveryToolRoots('', absurd, home).length, DISCOVERY_ROOT_LIMIT)
})
