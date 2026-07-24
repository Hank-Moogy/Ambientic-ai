import midi from '@julusian/midi'
import { APC40, gridLedMessages, gridSessions, padForMessage, recordArmForMessage, selectedSessionForRecordColumn } from './apc40.mjs'
import {
  APC_MINI_MK2,
  miniGridLedMessages,
  miniGridSessions,
  miniPadForMessage,
  miniRecordButtonForMessage,
  miniRecordLedMessages,
  miniSelectedSessionForRecordColumn
} from './apc-mini-mk2.mjs'
import { APC40_ACTIONS, midiControlForMessage, normalizeMappings } from './midi-mappings.mjs'
import { VIBE_SEQUENCE, VIBE_VARIANTS, vibeLedMessages } from './vibe-sequence.mjs'

const RECONNECT_MS = 3000
const AUTO_PROFILE = 'auto'

const PROFILES = [
  {
    id: 'apc40-mkii',
    label: 'Akai APC40 MKII',
    shortLabel: 'APC40 MKII',
    portPattern: APC40.DEVICE_NAME,
    padCount: APC40.PAD_COUNT,
    gridLabel: '5×8',
    intro: APC40.INTRO_ALT_MODE,
    padForMessage,
    gridSessions,
    gridLedMessages,
    recordForMessage: recordArmForMessage,
    selectedSessionForRecordColumn,
    recordLedMessages: (recording) => [
      [0x90, APC40.NOTE.RECORD, 0],
      ...Array.from({ length: 8 }, (_, column) => [0x90 | column, APC40.NOTE.RECORD_ARM, recording?.column === column ? 1 : 0])
    ]
  },
  {
    id: APC_MINI_MK2.ID,
    label: APC_MINI_MK2.LABEL,
    shortLabel: 'APC mini mk2',
    portPattern: APC_MINI_MK2.DEVICE_NAME,
    padCount: APC_MINI_MK2.PAD_COUNT,
    gridLabel: '8×8',
    intro: APC_MINI_MK2.INTRO,
    padForMessage: miniPadForMessage,
    gridSessions: miniGridSessions,
    gridLedMessages: miniGridLedMessages,
    recordForMessage: miniRecordButtonForMessage,
    selectedSessionForRecordColumn: miniSelectedSessionForRecordColumn,
    recordLedMessages: miniRecordLedMessages
  }
]

export const MIDI_PROFILE_OPTIONS = [
  { id: AUTO_PROFILE, label: 'Automatic', description: 'Use the first supported APC controller found.' },
  ...PROFILES.map(({ id, label, gridLabel }) => ({ id, label, description: `${gridLabel} native AgentBase layout` }))
]

function portIndex (device, pattern) {
  for (let index = 0; index < device.getPortCount(); index++) {
    if (pattern.test(device.getPortName(index))) return index
  }
  return -1
}

export function createMidiController (store, {
  onPadPress,
  onAction,
  onRecordStart,
  onRecordStop,
  onRecordUnavailable,
  selectedProfile: initialProfile = AUTO_PROFILE,
  mappings: legacyMappings,
  mappingsByProfile: initialMappingsByProfile,
  onPreferencesChange
} = {}) {
  let input = null
  let output = null
  let timer = null
  let selectedSessionId = null
  let selectedProfile = MIDI_PROFILE_OPTIONS.some((profile) => profile.id === initialProfile) ? initialProfile : AUTO_PROFILE
  let activeProfile = null
  let mappingsByProfile = {
    'apc40-mkii': normalizeMappings(initialMappingsByProfile?.['apc40-mkii'] || legacyMappings),
    [APC_MINI_MK2.ID]: normalizeMappings(initialMappingsByProfile?.[APC_MINI_MK2.ID])
  }
  let mappings = mappingsByProfile[selectedProfile === AUTO_PROFILE ? 'apc40-mkii' : selectedProfile] || {}
  let learningAction = ''
  let recording = null
  let vibeTimer = null
  let vibeActive = false
  let vibeIndex = 0
  let vibeVariant = null
  let status = { connected: false, device: '', error: '' }
  const listeners = new Set()

  function snapshot () {
    const selected = PROFILES.find((profile) => profile.id === selectedProfile)
    return {
      ...status,
      model: activeProfile?.label || selected?.label || 'Akai APC controller',
      shortModel: activeProfile?.shortLabel || selected?.shortLabel || 'APC',
      selectedProfile,
      activeProfile: activeProfile?.id || '',
      gridLabel: activeProfile?.gridLabel || selected?.gridLabel || '',
      padCount: activeProfile?.padCount || selected?.padCount || 0,
      profiles: MIDI_PROFILE_OPTIONS,
      mappings: { ...mappings },
      learningAction,
      actions: APC40_ACTIONS,
      vibeActive,
      vibeVariant,
      nextVibeVariant: VIBE_VARIANTS[vibeIndex]
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
    const mappingProfile = activeProfile?.id || (selectedProfile === AUTO_PROFILE ? 'apc40-mkii' : selectedProfile)
    mappingsByProfile = { ...mappingsByProfile, [mappingProfile]: { ...mappings } }
    onPreferencesChange?.({ selectedProfile, mappingsByProfile })
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
    if (vibeTimer) clearInterval(vibeTimer)
    vibeTimer = null
    vibeActive = false
    vibeVariant = null
    try { input?.closePort() } catch {}
    try { output?.closePort() } catch {}
    input = null
    output = null
    activeProfile = null
  }

  function render () {
    if (!output || !activeProfile) return
    if (vibeActive) return
    try {
      for (const message of activeProfile.gridLedMessages(store.list())) output.sendMessage(message)
      for (const message of activeProfile.recordLedMessages(recording)) output.sendMessage(message)
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
      const candidates = selectedProfile === AUTO_PROFILE
        ? PROFILES
        : PROFILES.filter((profile) => profile.id === selectedProfile)
      const match = candidates
        .map((profile) => ({
          profile,
          inputIndex: portIndex(candidateInput, profile.portPattern),
          outputIndex: portIndex(candidateOutput, profile.portPattern)
        }))
        .find((entry) => entry.inputIndex >= 0 && entry.outputIndex >= 0)
      if (!match) {
        candidateInput.closePort()
        candidateOutput.closePort()
        setStatus({ connected: false, device: '', error: '' })
        return
      }

      activeProfile = match.profile
      mappings = normalizeMappings(mappingsByProfile[activeProfile.id])
      const device = candidateInput.getPortName(match.inputIndex)
      candidateInput.ignoreTypes(false, false, false)
      candidateInput.on('message', (_deltaTime, message) => {
        const recordArm = activeProfile.recordForMessage(message)
        if (recordArm) {
          if (recordArm.pressed) {
            if (recording) return
            const session = activeProfile.selectedSessionForRecordColumn(store.list(), selectedSessionId, recordArm.column)
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
        const pad = activeProfile.padForMessage(message)
        if (pad === null) return
        const session = activeProfile.gridSessions(store.list())[pad]
        if (!session) {
          console.log(`[midi] pad ${pad + 1} pressed (unassigned)`)
        } else if (onPadPress) {
          Promise.resolve(onPadPress(session.id)).catch((error) => {
            console.error(`[midi] could not focus pad ${pad + 1}: ${error.message}`)
          })
        }
      })
      candidateInput.openPort(match.inputIndex)
      candidateOutput.openPort(match.outputIndex)
      input = candidateInput
      output = candidateOutput
      if (activeProfile.intro) output.sendMessage(activeProfile.intro)
      setStatus({ connected: true, device, error: '' })
      render()
    } catch (error) {
      try { candidateInput?.closePort() } catch {}
      try { candidateOutput?.closePort() } catch {}
      input = null
      output = null
      activeProfile = null
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

  function triggerVibe () {
    if (!output || !activeProfile) return false
    if (vibeTimer) clearInterval(vibeTimer)
    vibeActive = true
    vibeVariant = VIBE_VARIANTS[vibeIndex]
    let frame = 0
    const paint = () => {
      if (!output || !activeProfile) {
        if (vibeTimer) clearInterval(vibeTimer)
        vibeTimer = null
        vibeActive = false
        vibeVariant = null
        notify()
        return
      }
      try {
        for (const message of vibeLedMessages(activeProfile.id, frame, vibeVariant.id)) output.sendMessage(message)
      } catch (error) {
        close()
        setStatus({ connected: false, device: '', error: error.message })
        return
      }
      frame += 1
      if (frame < VIBE_SEQUENCE.frameCount) return
      clearInterval(vibeTimer)
      vibeTimer = null
      vibeActive = false
      vibeVariant = null
      vibeIndex = (vibeIndex + 1) % VIBE_VARIANTS.length
      render()
      notify()
    }
    paint()
    vibeTimer = setInterval(paint, VIBE_SEQUENCE.frameIntervalMs)
    notify()
    return true
  }

  return {
    start,
    stop,
    reconnect: () => { close(); connect() },
    triggerVibe,
    setProfile: (profileId) => {
      if (!MIDI_PROFILE_OPTIONS.some((profile) => profile.id === profileId)) return false
      if (selectedProfile === profileId) return true
      selectedProfile = profileId
      learningAction = ''
      recording = null
      close()
      const mappingProfile = selectedProfile === AUTO_PROFILE ? 'apc40-mkii' : selectedProfile
      mappings = normalizeMappings(mappingsByProfile[mappingProfile])
      onPreferencesChange?.({ selectedProfile, mappingsByProfile })
      setStatus({ connected: false, device: '', error: '' })
      connect()
      return true
    },
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
