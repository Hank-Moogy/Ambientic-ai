import test from 'node:test'
import assert from 'node:assert/strict'
import { claudeCommandCandidates, compareClaudeVersionTuples, parseClaudeVersion, pickNewestClaudeCommand } from '../src/main/claude-binary.mjs'

test('parses the version out of Claude Code --version output', () => {
  assert.deepEqual(parseClaudeVersion('2.1.220 (Claude Code)'), [2, 1, 220])
  assert.deepEqual(parseClaudeVersion('2.1.31 (Claude Code)'), [2, 1, 31])
  assert.equal(parseClaudeVersion('not a version'), null)
  assert.equal(parseClaudeVersion(''), null)
})

test('orders versions numerically, not lexically', () => {
  // The bug this guards: "2.1.31" sorts above "2.1.220" as a string.
  const sorted = [[2, 1, 31], [2, 1, 220], [2, 2, 0], [2, 1, 9]].sort(compareClaudeVersionTuples)
  assert.deepEqual(sorted, [[2, 2, 0], [2, 1, 220], [2, 1, 31], [2, 1, 9]])
})

// The real-world case: a stale Homebrew cask listed first, a current native
// install listed last. Position must not decide the winner.
test('prefers the newest install regardless of candidate order', () => {
  const chosen = pickNewestClaudeCommand([
    { path: '/opt/homebrew/bin/claude', version: [2, 1, 31] },
    { path: '/Users/x/.local/bin/claude', version: [2, 1, 220] },
    { path: '/Applications/Claude.app/claude', version: [2, 1, 217] }
  ])
  assert.equal(chosen, '/Users/x/.local/bin/claude')
})

test('falls back sensibly when a version cannot be read', () => {
  // A readable version always beats an unreadable one.
  assert.equal(pickNewestClaudeCommand([
    { path: '/broken/claude', version: null },
    { path: '/good/claude', version: [2, 0, 0] }
  ]), '/good/claude')
  // With nothing readable, the first candidate is still better than giving up.
  assert.equal(pickNewestClaudeCommand([
    { path: '/broken/claude', version: null }
  ]), '/broken/claude')
  assert.equal(pickNewestClaudeCommand([]), '')
})

test('still looks in the standard install locations', () => {
  const candidates = claudeCommandCandidates('/Users/tester')
  assert.ok(candidates.includes('/opt/homebrew/bin/claude'))
  assert.ok(candidates.includes('/Users/tester/.local/bin/claude'))
})
