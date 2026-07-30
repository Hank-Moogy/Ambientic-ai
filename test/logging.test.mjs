import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatLogLine, initFileLogging, logFilePath, redactSecrets, shouldRotate } from '../src/main/logging.mjs'

test('formats a log line with an ISO timestamp, level, and joined parts', () => {
  const line = formatLogLine('warn', ['[usage]', 'claude', { id: 'five-hour', usedPercent: 12 }], new Date('2026-07-30T10:00:00.000Z'))
  assert.equal(line, '2026-07-30T10:00:00.000Z [warn] [usage] claude {"id":"five-hour","usedPercent":12}\n')
})

test('serialises an Error with its stack instead of "{}"', () => {
  const line = formatLogLine('error', [new Error('boom')])
  assert.match(line, /\[error\] Error: boom/)
})

// Logs are written to disk and opened from a menu item, so a token that leaks
// into a message must not be persisted verbatim.
test('redacts provider tokens and secret-shaped values', () => {
  // A short identifying prefix is kept so a log stays useful; the rest is cut.
  const antKey = redactSecrets('key sk-ant-api03-ABCDEFGHijklmnopQRSTUV')
  assert.match(antKey, /<redacted>$/)
  assert.ok(!antKey.includes('ijklmnopQRSTUV'), antKey)
  assert.equal(redactSecrets('token sbp_1234567890abcdef'), 'token sbp_123456…<redacted>')
  assert.equal(redactSecrets('ghp_abcdefghijklmnopqrstuvwx'), 'ghp_abcdef…<redacted>')
  assert.match(redactSecrets('"access_token": "abcdef123456"'), /<redacted>/)
  assert.ok(!redactSecrets('"api_key":"supersecretvalue"').includes('supersecretvalue'))
})

test('leaves ordinary diagnostic text untouched', () => {
  const line = '[usage] claude collector using /opt/homebrew/bin/claude (force=true)'
  assert.equal(redactSecrets(line), line)
})

test('rotates only once the cap is reached', () => {
  assert.equal(shouldRotate(10, 100), false)
  assert.equal(shouldRotate(100, 100), true)
  assert.equal(shouldRotate(Number.NaN, 100), false)
})

test('tees console output into the log file under the given home', () => {
  const home = mkdtempSync(join(tmpdir(), 'ambientic-log-'))
  try {
    const fake = { log: () => {}, info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    const file = initFileLogging({ home, console: fake })
    assert.equal(file, logFilePath(home))
    fake.log('[usage] hello')
    fake.error('bad thing', new Error('nope'))
    const contents = readFileSync(file, 'utf8')
    assert.match(contents, /Ambientic log started/)
    assert.match(contents, /\[log\] \[usage\] hello/)
    assert.match(contents, /\[error\] bad thing Error: nope/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
