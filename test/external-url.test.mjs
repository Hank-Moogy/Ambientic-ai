import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeExternalUrl } from '../src/main/external-url.mjs'

test('allows normal web, localhost, and email links', () => {
  assert.equal(normalizeExternalUrl('https://example.com/docs?q=agent'), 'https://example.com/docs?q=agent')
  assert.equal(normalizeExternalUrl('http://localhost:3000/preview'), 'http://localhost:3000/preview')
  assert.equal(normalizeExternalUrl('mailto:hello@example.com'), 'mailto:hello@example.com')
})

test('rejects local files, scripts, relative paths, and credential-bearing URLs', () => {
  assert.equal(normalizeExternalUrl('javascript:alert(1)'), '')
  assert.equal(normalizeExternalUrl('file:///Users/test/private.txt'), '')
  assert.equal(normalizeExternalUrl('/relative/path'), '')
  assert.equal(normalizeExternalUrl('https://user:secret@example.com'), '')
})
