import test from 'node:test'
import assert from 'node:assert/strict'
import { createTaskSummarizer, namesThread } from '../src/main/summarizer.js'
import { assembleProviderPrompt } from '../src/main/context-assembler.mjs'

test('a thread is named once and keeps that name', () => {
  assert.equal(namesThread('Fix the MIDI clock drift', ''), true)
  // Later messages never rename it; only an explicit user rename does, and that
  // path does not run through the summarizer.
  assert.equal(namesThread('Now refactor the gateway layer', 'Fix the MIDI clock'), false)
  assert.equal(namesThread('What do you mean', 'Fix the MIDI clock'), false)
})

test('a prompt with no signal leaves the thread unnamed rather than naming it badly', () => {
  for (const text of ['go', 'ok', 'yes', 'status', '?', 'continue', 'do it', 'thanks']) {
    assert.equal(namesThread(text, ''), false, `"${text}" should not name a thread`)
  }
  assert.equal(namesThread('Fix login', ''), true)
})

test('naming reads the request, not the Ambientic preamble, and holds across the turn', () => {
  const labels = []
  const names = new Map()
  const store = {
    taskFingerprint: () => '',
    taskName: (id) => names.get(id) || '',
    updateTask: (id, label) => { names.set(id, label); labels.push(label) }
  }
  const summarizer = createTaskSummarizer(store)
  const withContext = (text) => assembleProviderPrompt(text, {
    mode: 'build',
    projectContext: { name: 'Ambientic', cwd: '/tmp/Ambientic' }
  })

  summarizer.enqueue('thread-1', withContext('Fix the MIDI clock drift on the APC40'))
  summarizer.enqueue('thread-1', withContext('go'))
  summarizer.enqueue('thread-1', withContext('Now look at the gateway instead'))

  assert.deepEqual(labels, ['Fix the MIDI clock'])
})
