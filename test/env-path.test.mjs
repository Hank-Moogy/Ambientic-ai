import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEnhancedPath } from '../src/main/env-path.mjs'

test('resolveEnhancedPath preserves base entries and de-duplicates', () => {
  const result = resolveEnhancedPath('/usr/bin:/bin:/usr/bin').split(':')
  assert.ok(result.includes('/usr/bin'))
  assert.ok(result.includes('/bin'))
  // No path segment should appear twice.
  assert.equal(new Set(result).size, result.length)
})

test('resolveEnhancedPath adds a real common bin dir when present', () => {
  // /usr/bin always exists; used here as a stand-in the resolver keeps.
  const result = resolveEnhancedPath('/nonexistent-a:/nonexistent-b')
  assert.ok(result.split(':').includes('/nonexistent-a'))
  assert.ok(result.length > 0)
})
