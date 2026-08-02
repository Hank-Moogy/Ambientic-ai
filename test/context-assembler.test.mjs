import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleProviderPrompt } from '../src/main/context-assembler.mjs'

test('provider context assembler preserves the legacy byte format', () => {
  assert.equal(assembleProviderPrompt('Do it.', { mode: 'build', attachments: [], projectContext: null }), 'Do it.')
  assert.equal(
    assembleProviderPrompt('Inspect this.', {
      mode: 'plan',
      projectContext: { name: 'Ambientic', cwd: '/tmp/Ambientic' },
      attachments: [{ kind: 'file', path: '/tmp/spec.md' }]
    }),
    '<ambientic-context mode="plan">\nPlanning mode: inspect and reason, but do not modify files or run destructive commands. Return a concise implementation plan.\nProject context: you are working on Ambientic at /tmp/Ambientic. Treat that directory as the project root. Before changing files, orient yourself by reading the nearest AGENTS.md and relevant README or project manifests, then inspect the current working tree. Do not treat this as an empty scratch workspace.\nAttached local context:\n- file: /tmp/spec.md\n</ambientic-context>\nInspect this.'
  )
})
