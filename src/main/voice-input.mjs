import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const FFMPEG_PATHS = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
const WHISPER_PATHS = ['/opt/homebrew/bin/whisper', '/usr/local/bin/whisper']

export function localVoiceTools ({ ffmpegPath = '', whisperPath = '' } = {}) {
  const ffmpeg = [ffmpegPath, process.env.AGENTBASE_FFMPEG_PATH, ...FFMPEG_PATHS].find((path) => path && existsSync(path)) || ''
  const whisper = [whisperPath, process.env.AGENTBASE_WHISPER_PATH, ...WHISPER_PATHS].find((path) => path && existsSync(path)) || ''
  return { ffmpeg, whisper, ready: Boolean(ffmpeg && whisper) }
}

function waitForExit (child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code))
  })
}

function run (command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000) })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `${basename(command)} exited with code ${code}`))
    })
  })
}

export function createVoiceInput ({ tempRoot, ffmpegPath = '', whisperPath = '', onTranscript } = {}) {
  const events = new EventEmitter()
  const tools = localVoiceTools({ ffmpegPath, whisperPath })
  let capture = null
  let state = { recording: false, transcribing: false, sessionId: '', error: '', transcript: '', toolsReady: tools.ready }

  function publish (next) {
    state = { ...state, ...next }
    events.emit('change', { ...state })
    if (!state.recording && !state.transcribing && (state.error || state.transcript)) {
      const error = state.error
      const transcript = state.transcript
      const timer = setTimeout(() => {
        if (state.recording || state.transcribing || state.error !== error || state.transcript !== transcript) return
        publish({ error: '', transcript: '' })
      }, 8000)
      if (timer.unref) timer.unref()
    }
  }

  async function cleanup (directory) {
    if (!directory) return
    try { await rm(directory, { recursive: true, force: true }) } catch {}
  }

  async function start (sessionId) {
    if (capture) return stop()
    if (!sessionId) throw new Error('Select an agent before recording a prompt.')
    if (!tools.ready) throw new Error('Local voice input requires ffmpeg and Whisper.')

    const directory = join(tempRoot, `voice-${randomUUID()}`)
    const audioPath = join(directory, 'prompt.wav')
    await mkdir(directory, { recursive: true })
    const child = spawn(tools.ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'avfoundation', '-i', ':0',
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', audioPath
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    const current = { child, directory, audioPath, sessionId, stopping: false, stderr: '' }
    capture = current
    child.stderr.on('data', (chunk) => { current.stderr = (current.stderr + chunk).slice(-8000) })
    child.once('error', (error) => {
      if (capture !== current) return
      capture = null
      publish({ recording: false, transcribing: false, error: error.message })
      void cleanup(directory)
    })
    child.once('exit', (code) => {
      if (capture !== current || current.stopping) return
      capture = null
      const error = current.stderr.trim() || `Audio capture stopped with code ${code}`
      publish({ recording: false, transcribing: false, error })
      void cleanup(directory)
    })
    publish({ recording: true, transcribing: false, sessionId, error: '', transcript: '' })
    return { ok: true, recording: true, sessionId }
  }

  async function stop () {
    const current = capture
    if (!current) return { ok: false, reason: 'not-recording' }
    current.stopping = true
    publish({ recording: false, transcribing: true, error: '' })
    current.child.kill('SIGINT')

    try {
      await waitForExit(current.child)
      const model = process.env.AGENTBASE_WHISPER_MODEL || 'base'
      await run(tools.whisper, [
        current.audioPath,
        '--model', model,
        '--output_dir', current.directory,
        '--output_format', 'txt',
        '--verbose', 'False',
        '--fp16', 'False'
      ])
      const transcript = (await readFile(join(current.directory, 'prompt.txt'), 'utf8')).trim()
      if (!transcript) throw new Error('No speech was detected.')
      await onTranscript?.(current.sessionId, transcript)
      publish({ recording: false, transcribing: false, sessionId: current.sessionId, error: '', transcript })
      return { ok: true, transcript, sessionId: current.sessionId }
    } catch (error) {
      publish({ recording: false, transcribing: false, error: error.message })
      throw error
    } finally {
      if (capture === current) capture = null
      await cleanup(current.directory)
    }
  }

  return {
    start,
    stop,
    toggle: (sessionId) => capture ? (capture.stopping ? { ok: false, reason: 'transcribing' } : stop()) : start(sessionId),
    reportError: (error) => publish({ recording: false, transcribing: false, error: error?.message || String(error), transcript: '' }),
    getStatus: () => ({ ...state }),
    onStatus: (listener) => { events.on('change', listener); return () => events.off('change', listener) },
    dispose: () => {
      if (capture) {
        capture.stopping = true
        capture.child.kill('SIGINT')
        void cleanup(capture.directory)
        capture = null
      }
    }
  }
}
