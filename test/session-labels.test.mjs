import test from 'node:test'
import assert from 'node:assert/strict'
import { meaningfulProject, sessionLabels } from '../src/renderer/session-labels.mjs'

test('uses a captured task as the card name and identifies Codex Desktop', () => {
  assert.deepEqual(sessionLabels({
    agent: 'codex',
    term_program: 'codex-desktop',
    project: 'samori',
    cwd: '/Users/samori',
    task: 'Ambientic'
  }), {
    primary: 'Ambientic',
    secondary: 'Codex Desktop',
    provider: 'Codex Desktop',
    placeholder: false
  })
})

test('suppresses a home-directory username and falls back to the provider', () => {
  const session = { agent: 'claude', project: 'samori', cwd: '/Users/samori' }
  assert.equal(meaningfulProject(session), '')
  assert.deepEqual(sessionLabels(session), {
    primary: 'Claude Code',
    secondary: 'Terminal session',
    provider: 'Claude Code',
    placeholder: true
  })
})

test('uses a meaningful project when no task title is available', () => {
  assert.deepEqual(sessionLabels({
    agent: 'hermes', project: 'vibe-controller', cwd: '/Users/samori/vibe-controller'
  }), {
    primary: 'vibe-controller',
    secondary: 'Hermes',
    provider: 'Hermes',
    placeholder: false
  })
})
