import test from 'node:test'
import assert from 'node:assert/strict'
import { padDestination, padOpenTarget } from '../src/shared/pad-navigation.mjs'

test('pads follow the destination preference and never select a preview', () => {
  const codex = { deepLink: 'codex://threads/example', companionUrl: 'http://localhost:3000' }
  assert.equal(padOpenTarget(undefined), 'native')
  assert.equal(padDestination(codex, 'native'), 'native')
  assert.equal(padDestination(codex, 'ambientic'), 'ambientic')
  assert.equal(padDestination({ tty: 'ttys001' }, 'native'), 'native')
  assert.equal(padDestination({ companionUrl: 'http://localhost:3000' }, 'native'), 'ambientic')
  assert.equal(padDestination(codex, 'native', true), 'ambientic')
  assert.equal(padDestination(null, 'native'), 'unavailable')
})
