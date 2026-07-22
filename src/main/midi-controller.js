import midi from '@julusian/midi'
import { APC40, gridSessions, ledForSession, padForMessage } from './apc40.mjs'

const RECONNECT_MS = 3000

function portIndex (device, pattern) {
  for (let index = 0; index < device.getPortCount(); index++) {
    if (pattern.test(device.getPortName(index))) return index
  }
  return -1
}

export function createMidiController (store, { onPadPress } = {}) {
  let input = null
  let output = null
  let timer = null
  let selectedSessionId = null
  let status = { connected: false, device: '', error: '' }
  const listeners = new Set()

  function setStatus (next) {
    if (JSON.stringify(next) === JSON.stringify(status)) return
    status = next
    for (const listener of listeners) listener(status)
  }

  function close () {
    try { input?.closePort() } catch {}
    try { output?.closePort() } catch {}
    input = null
    output = null
  }

  function render () {
    if (!output) return
    const sessions = gridSessions(store.list())
    try {
      for (let note = 0; note < APC40.PAD_COUNT; note++) {
        const session = sessions[note]
        const led = ledForSession(session, session?.id === selectedSessionId)
        output.sendMessage([0x90 | led.channel, note, led.color])
      }
    } catch (error) {
      close()
      setStatus({ connected: false, device: '', error: error.message })
    }
  }

  function connect () {
    if (input || output) return
    let candidateInput = null
    let candidateOutput = null
    try {
      candidateInput = new midi.Input()
      candidateOutput = new midi.Output()
      const inputIndex = portIndex(candidateInput, APC40.DEVICE_NAME)
      const outputIndex = portIndex(candidateOutput, APC40.DEVICE_NAME)
      if (inputIndex < 0 || outputIndex < 0) {
        candidateInput.closePort()
        candidateOutput.closePort()
        setStatus({ connected: false, device: '', error: '' })
        return
      }

      const device = candidateInput.getPortName(inputIndex)
      candidateInput.ignoreTypes(false, false, false)
      candidateInput.on('message', (_deltaTime, message) => {
        const pad = padForMessage(message)
        if (pad === null) return
        const session = gridSessions(store.list())[pad]
        if (session && onPadPress) {
          Promise.resolve(onPadPress(session.id)).catch((error) => {
            console.error(`[midi] could not focus pad ${pad + 1}: ${error.message}`)
          })
        }
      })
      candidateInput.openPort(inputIndex)
      candidateOutput.openPort(outputIndex)
      input = candidateInput
      output = candidateOutput
      output.sendMessage(APC40.INTRO_ALT_MODE)
      setStatus({ connected: true, device, error: '' })
      render()
    } catch (error) {
      try { candidateInput?.closePort() } catch {}
      try { candidateOutput?.closePort() } catch {}
      input = null
      output = null
      setStatus({ connected: false, device: '', error: error.message })
    }
  }

  function start () {
    connect()
    timer = setInterval(connect, RECONNECT_MS)
    if (timer.unref) timer.unref()
  }

  function stop () {
    if (timer) clearInterval(timer)
    timer = null
    close()
  }

  return {
    start,
    stop,
    reconnect: () => { close(); connect() },
    render,
    select: (sessionId) => { selectedSessionId = sessionId; render() },
    getStatus: () => ({ ...status }),
    onStatus: (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
  }
}
