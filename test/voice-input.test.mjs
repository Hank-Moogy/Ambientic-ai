import test from 'node:test'
import assert from 'node:assert/strict'
import { localVoiceTools } from '../src/main/voice-input.mjs'

test('accepts explicit local audio and transcription tools', () => {
  const tools = localVoiceTools({ ffmpegPath: '/bin/sh', whisperPath: '/bin/sh' })
  assert.deepEqual(tools, { ffmpeg: '/bin/sh', whisper: '/bin/sh', ready: true })
})
