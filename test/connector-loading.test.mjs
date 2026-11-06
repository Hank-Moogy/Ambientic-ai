import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONNECTOR_IDS, pendingConnectorState } from '../src/main/connectors.js'

// Overview draws its provider pads before any provider CLI has been spawned.
// The placeholder therefore has to be honest: present, named, and visibly
// checking — never claiming an install, a login, or a missing binary.
test('the pre-probe connector state is checking, not a verdict', () => {
  const pending = pendingConnectorState()

  assert.deepEqual(pending.map((connector) => connector.id), CONNECTOR_IDS)
  for (const connector of pending) {
    assert.equal(connector.checking, true, `${connector.id} must read as checking`)
    assert.ok(connector.label, `${connector.id} must still name itself`)
    assert.equal(connector.installed, false)
    assert.equal(connector.ready, false)
    assert.equal(connector.authenticated, false)
    // `manageable === false` is what the interface renders as "Login required".
    // A provider that has not been read yet must not accuse the user of that.
    assert.equal(connector.manageable, undefined, `${connector.id} must not claim a login state`)
  }
})
