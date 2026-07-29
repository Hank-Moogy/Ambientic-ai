import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { providerRuntimeDirectory } from '../src/main/provider-runtime.mjs'
import { canInspectProjectRoot, protectedHomeChild } from '../src/main/project-scope.mjs'

test('provider probes run from a private hidden directory instead of home or protected folders', () => {
  const home = mkdtempSync(join(tmpdir(), 'ambientic-provider-home-'))
  const directory = providerRuntimeDirectory(home)
  assert.equal(directory, join(home, '.ambientic', 'provider-runtime'))
  assert.equal(statSync(directory).isDirectory(), true)
  assert.equal(protectedHomeChild(directory, home), '')
  assert.equal(canInspectProjectRoot(directory, home), true)
})
