import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBuildInfo } from '../src/main/build-info.mjs'

test('build identity normalizes packaged release metadata', () => {
  assert.deepEqual(normalizeBuildInfo({
    version: '0.8.1',
    commit: '4c871e4abc',
    branch: 'feature/local-release',
    builtAt: '2026-07-27T12:00:00.000Z',
    dirty: false
  }), {
    version: '0.8.1',
    commit: '4c871e4abc',
    branch: 'feature/local-release',
    builtAt: '2026-07-27T12:00:00.000Z',
    dirty: false
  })
})

test('build identity has safe development fallbacks', () => {
  assert.deepEqual(normalizeBuildInfo({}, '0.9.0'), {
    version: '0.9.0',
    commit: 'development',
    branch: 'local',
    builtAt: null,
    dirty: true
  })
})
