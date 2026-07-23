import midi from '@julusian/midi'
import { APC40, gridLedMessages, gridSessions, padForMessage, recordArmForMessage, selectedSessionForRecordColumn } from './apc40.mjs'
import { APC40_ACTIONS, midiControlForMessage, normalizeMappings } from './midi-mappings.mjs'

const RECONNECT_MS = 3000

function portIndex (device, pattern) {
  for (let index = 0; index < device.getPortCount(); index++) {
    if (pattern.test(device.getPortName(index))) return index
  }
  return -1
}

export function createMidiController (store, { onPadPress, onAction, onRecordStart, onRecordStop, onRecordUnavailable, mappings: initialMappings, onMappingsChange } = {}) {
  let input = null
  let output = null
  let timer = null
  let selectedSessionId = null
  let mappings = normalizeMappings(initialMappings)
  let learningAction = ''
  let recording = null
  let status = { connected: false, device: '', error: '' }
  const listeners = new Set()

  function snapshot () {
    return {
      ...status,
      model: 'Akai APC40 MKII',
      mappings: { ...mappings },
      learningAction,
      actions: APC40_ACTIONS
    }
  }

  function notify () {
    const value = snapshot()
    for (const listener of listeners) listener(value)
  }

  function setStatus (next) {
    if (JSON.stringify(next) === JSON.stringify(status)) return
    status = next
    notify()
  }

  function saveMappings () {
    onMappingsChange?.({ ...mappings })
    notify()
  }

  function learnMessage (control) {
    if (!learningAction || !control) return false
    for (const [key, action] of Object.entries(mappings)) {
      if (action === learningAction) delete mappings[key]
    }
    mappings[control.key] = learningAction
    learningAction = ''
    saveMappings()
    return true
  }

  function close () {
    try { input?.closePort() } catch {}
    try { output?.closePort() } catch {}
    input = null
    output = null
  }

  function render () {
    if (!output) return
    try {
      for (const message of gridLedMessages(store.list())) output.sendMessage(message)
      // Clear the old global transport Record LED and own all eight Record Arm
      // LEDs. Only the held PTT column lights while audio is being captured.
      output.sendMessage([0x90, APC40.NOTE.RECORD, 0])
      for (let column = 0; column < 8; column++) {
        output.sendMessage([0x90 | column, APC40.NOTE.RECORD_ARM, recording?.column === column ? 1 : 0])
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
        const recordArm = recordArmForMessage(message)
        if (recordArm) {
          if (recordArm.pressed) {
            if (recording) return
            const session = selectedSessionForRecordColumn(store.list(), selectedSessionId, recordArm.column)
            if (!session) {
              console.log(`[midi] Record Arm column ${recordArm.column + 1} ignored — select an agent in that column first`)
              Promise.resolve(onRecordUnavailable?.({ column: recordArm.column, selectedSessionId })).catch(() => {})
              return
            }
            const sessionId = session.id
            const start = Promise.resolve().then(() => onRecordStart?.(sessionId))
            recording = { column: recordArm.column, sessionId, start }
            render()
            start.catch((error) => {
              if (recording?.start === start) recording = null
              render()
              console.error(`[midi] voice prompt failed: ${error.message}`)
            })
          } else if (recording?.column === recordArm.column) {
            const current = recording
            recording = null
            render()
            current.start.then(() => onRecordStop?.(current.sessionId)).catch(() => {})
          }
          return
        }
        const control = midiControlForMessage(message)
        if (learnMessage(control)) return
        const mappedAction = control ? mappings[control.key] : ''
        if (mappedAction && (control.type !== 'cc' || control.value >= 64)) {
          Promise.resolve(onAction?.(mappedAction)).catch((error) => {
            console.error(`[midi] AgentBase action ${mappedAction} failed: ${error.message}`)
          })
          return
        }
        const pad = padForMessage(message)
        if (pad === null) return
        const session = gridSessions(store.list())[pad]
        if (!session) {
          console.log(`[midi] pad ${pad + 1} pressed (unassigned)`)
        } else if (onPadPress) {
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
    // Refresh the entire owned surface as well as checking the connection.
    // This corrects LED drift if the APC firmware or another MIDI client
    // clears a pad after AgentBase's initial state render.
    timer = setInterval(() => {
      if (!input || !output) connect()
      else render()
    }, RECONNECT_MS)
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
    setVoiceActive: (active) => {
      if (!active && recording) recording = null
      render()
    },
    select: (sessionId) => {
      selectedSessionId = sessionId
      render()
    },
    learn: (actionId) => {
      if (!APC40_ACTIONS.some((action) => action.id === actionId)) return false
      learningAction = actionId
      notify()
      return true
    },
    cancelLearn: () => { learningAction = ''; notify() },
    clearAction: (actionId) => {
      let changed = false
      for (const [key, action] of Object.entries(mappings)) {
        if (action === actionId) { delete mappings[key]; changed = true }
      }
      if (changed) saveMappings()
      return changed
    },
    resetMappings: () => { mappings = {}; learningAction = ''; saveMappings() },
    getStatus: snapshot,
    onStatus: (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
  }
}
