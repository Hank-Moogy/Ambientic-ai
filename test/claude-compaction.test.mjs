import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService } from '../src/main/workspace-service.mjs'

function writeTranscript (rows) {
  const dir = mkdtempSync(join(tmpdir(), 'agentbase-compact-'))
  const path = join(dir, 'session.jsonl')
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n'))
  return path
}

test('compactClaudeContext keeps the recent tail within budget and notes omissions', () => {
  const rows = []
  for (let i = 0; i < 40; i += 1) {
    rows.push({ type: 'user', uuid: `u${i}`, message: { content: `User message ${i} ${'x'.repeat(500)}` } })
    rows.push({ type: 'assistant', uuid: `a${i}`, message: { content: [{ type: 'text', text: `Assistant reply ${i} ${'y'.repeat(500)}` }] } })
  }
  const transcriptPath = writeTranscript(rows)
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])

  const compacted = service.compactClaudeContext({ id: 'big', transcriptPath }, 4000)

  assert.match(compacted, /exceeded the model/i)          // header present
  assert.match(compacted, /Assistant reply 39/)           // most recent kept
  assert.match(compacted, /earlier message\(s\) were omitted/) // older dropped
  assert.ok(!compacted.includes('User message 0'))        // oldest not kept
  assert.ok(compacted.length < 6000)                      // stays near budget
})

test('claudeSessionId and transcript follow the compaction remap', () => {
  const service = new WorkspaceService({ list: () => [], ingest: () => {} }, () => [])
  const session = { id: 'thread-1', agent: 'claude' }
  assert.equal(service.claudeSessionId(session), 'thread-1')
  service.claudeRemap.set('thread-1', 'compacted-2')
  assert.equal(service.claudeSessionId(session), 'compacted-2')
})
