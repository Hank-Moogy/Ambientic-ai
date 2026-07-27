import test from 'node:test'
import assert from 'node:assert/strict'
import { isNearThreadBottom } from '../src/renderer/thread-scroll.mjs'

test('detects when a transcript needs a jump-to-latest control', () => {
  assert.equal(isNearThreadBottom({ scrollHeight: 2000, scrollTop: 200, clientHeight: 600 }), false)
  assert.equal(isNearThreadBottom({ scrollHeight: 2000, scrollTop: 1290, clientHeight: 600 }), true)
  assert.equal(isNearThreadBottom(null), true)
})
