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
import { APC40_ACTIONS, midiControlForMessage, midiEventForMessage, normalizeMappings } from './midi-mappings.mjs'
import { VIBE_SEQUENCE, VIBE_VARIANTS, changedVibeMessages, shouldCelebrateMidiConnection, vibeLedMessages } from './vibe-sequence.mjs'

const RECONNECT_MS = 3000
const AUTO_PROFILE = 'auto'
const GENERIC_MIDI_ID = 'generic-midi'

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
  { id: AUTO_PROFILE, label: 'Automatic', description: 'Prefer a native APC profile, then use the first available MIDI input.' },
  ...PROFILES.map(({ id, label, gridLabel }) => ({ id, label, description: `${gridLabel} native Ambientic layout` })),
  { id: GENERIC_MIDI_ID, label: 'Generic MIDI input', description: 'Learn notes, keys, pads, buttons, and CC controls from any MIDI input.' }
]

function genericProfile (deviceName = 'Generic MIDI input') {
  return {
    id: GENERIC_MIDI_ID,
    label: deviceName,
    shortLabel: 'MIDI',
    padCount: 0,
    gridLabel: 'Custom',
    inputOnly: true,
    padForMessage: () => null,
    gridSessions: () => [],
    gridLedMessages: () => [],
    recordForMessage: () => null,
    selectedSessionForRecordColumn: () => null,
    recordLedMessages: () => []
  }
}

function isGenericProfileId (profileId) { return profileId === GENERIC_MIDI_ID || String(profileId || '').startsWith(`${GENERIC_MIDI_ID}:`) }
function validProfileId (profileId) { return MIDI_PROFILE_OPTIONS.some((profile) => profile.id === profileId) || isGenericProfileId(profileId) }
function genericDeviceName (profileId) {
  if (!String(profileId || '').startsWith(`${GENERIC_MIDI_ID}:`)) return ''
  try { return decodeURIComponent(String(profileId).slice(GENERIC_MIDI_ID.length + 1)) } catch { return '' }
}

function portIndex (device, pattern) {
  for (let index = 0; index < device.getPortCount(); index++) {
    if (pattern.test(device.getPortName(index))) return index
  }
  return -1
}

export function createMidiController (store, {
  onPadPress,
  onAction,
  onControl,
  getFeedback,
  onRecordStart,
  onRecordStop,
  onRecordUnavailable,
  selectedProfile: initialProfile = AUTO_PROFILE,
  mappings: legacyMappings,
  mappingsByProfile: initialMappingsByProfile,
  onPreferencesChange,
  midiModule = midi
} = {}) {
  let input = null
  let output = null
  let inputListenerAttached = false
  let timer = null
  let selectedSessionId = null
  let selectedProfile = validProfileId(initialProfile) ? initialProfile : AUTO_PROFILE
  let activeProfile = null
  let mappingsByProfile = {
    'apc40-mkii': normalizeMappings(initialMappingsByProfile?.['apc40-mkii'] || legacyMappings),
    [APC_MINI_MK2.ID]: normalizeMappings(initialMappingsByProfile?.[APC_MINI_MK2.ID]),
    [GENERIC_MIDI_ID]: normalizeMappings(initialMappingsByProfile?.[GENERIC_MIDI_ID])
  }
  let mappings = mappingsByProfile[selectedProfile === AUTO_PROFILE ? 'apc40-mkii' : selectedProfile] || {}
  let learningAction = ''
  let recording = null
  let vibeTimer = null
  let vibeActive = false
  let vibeIndex = 0
  let vibeVariant = null
  let status = { connected: false, device: '', error: '' }
  let availableInputs = []
  const listeners = new Set()

  function snapshot () {
    const selected = PROFILES.find((profile) => profile.id === selectedProfile)
    const genericOptions = availableInputs.map((name) => ({ id: `${GENERIC_MIDI_ID}:${encodeURIComponent(name)}`, label: name, description: 'Generic MIDI input with user-defined mappings.' }))
    return {
      ...status,
      model: activeProfile?.label || selected?.label || 'Akai APC controller',
      shortModel: activeProfile?.shortLabel || selected?.shortLabel || 'APC',
      selectedProfile,
      activeProfile: activeProfile?.id || '',
      gridLabel: activeProfile?.gridLabel || selected?.gridLabel || '',
      padCount: activeProfile?.padCount || selected?.padCount || 0,
      profiles: [...MIDI_PROFILE_OPTIONS, ...genericOptions],
      availableInputs: [...availableInputs],
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
    const celebrate = shouldCelebrateMidiConnection(status, next)
    status = next
    notify()
    if (celebrate) {
      const timer = setTimeout(() => triggerVibe(), 180)
      if (timer.unref) timer.unref()
    }
  }

  function saveMappings () {
    const mappingProfile = isGenericProfileId(activeProfile?.id) ? GENERIC_MIDI_ID : (activeProfile?.id || (selectedProfile === AUTO_PROFILE ? 'apc40-mkii' : selectedProfile))
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
    activeProfile = null
  }

  function render () {
    if (!output || !activeProfile) return
    if (vibeActive) return
    try {
      const customFeedback = getFeedback?.()
      const gridMessages = customFeedback && !activeProfile.inputOnly
        ? customGridLedMessages(activeProfile, customFeedback)
        : activeProfile.gridLedMessages(store.list())
      for (const message of gridMessages) output.sendMessage(message)
      for (const message of activeProfile.recordLedMessages(recording)) output.sendMessage(message)
    } catch (error) {
      close()
      setStatus({ connected: false, device: '', error: error.message })
    }
  }

  function connect () {
    if (status.connected && activeProfile) return
    let candidateInput = null
    let candidateOutput = null
    try {
      // @julusian/midi owns a process-wide CoreMIDI singleton. Reconstructing
      // these objects during polling can abort in native code before a JS catch
      // block runs. Reuse one pair and only close/reopen their ports.
      candidateInput = input || new midiModule.Input()
      candidateOutput = output || new midiModule.Output()
      input = candidateInput
      output = candidateOutput
      availableInputs = Array.from({ length: candidateInput.getPortCount() }, (_, index) => candidateInput.getPortName(index))
      const candidates = selectedProfile === AUTO_PROFILE
        ? PROFILES
        : PROFILES.filter((profile) => profile.id === selectedProfile)
      let match = candidates
        .map((profile) => ({
          profile,
          inputIndex: portIndex(candidateInput, profile.portPattern),
          outputIndex: portIndex(candidateOutput, profile.portPattern)
        }))
        .find((entry) => entry.inputIndex >= 0 && entry.outputIndex >= 0)
      if (!match && (selectedProfile === AUTO_PROFILE || isGenericProfileId(selectedProfile)) && candidateInput.getPortCount() > 0) {
        const requestedName = genericDeviceName(selectedProfile)
        const requestedIndex = requestedName ? availableInputs.indexOf(requestedName) : -1
        const inputIndex = requestedIndex >= 0 ? requestedIndex : 0
        const inputName = candidateInput.getPortName(inputIndex)
        let outputIndex = -1
        for (let index = 0; index < candidateOutput.getPortCount(); index++) {
          if (candidateOutput.getPortName(index) === inputName) { outputIndex = index; break }
        }
        match = { profile: genericProfile(inputName), inputIndex, outputIndex }
      }
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
      if (!inputListenerAttached) candidateInput.on('message', (_deltaTime, message) => {
        const incomingControl = midiEventForMessage(message)
        if (incomingControl && onControl?.(incomingControl)) return
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
            console.error(`[midi] Ambientic action ${mappedAction} failed: ${error.message}`)
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
      inputListenerAttached = true
      candidateInput.openPort(match.inputIndex)
      if (match.outputIndex >= 0) candidateOutput.openPort(match.outputIndex)
      input = candidateInput
      output = candidateOutput
      if (activeProfile.intro) output.sendMessage(activeProfile.intro)
      setStatus({ connected: true, device, error: '' })
      render()
    } catch (error) {
      try { candidateInput?.closePort() } catch {}
      try { candidateOutput?.closePort() } catch {}
      activeProfile = null
      setStatus({ connected: false, device: '', error: error.message })
    }
  }

  function start () {
    connect()
    // Refresh the entire owned surface as well as checking the connection.
    // This corrects LED drift if the APC firmware or another MIDI client
    // clears a pad after Ambientic's initial state render.
    timer = setInterval(() => {
      if (!status.connected || !activeProfile) connect()
      else render()
    }, RECONNECT_MS)
    if (timer.unref) timer.unref()
  }

  function stop () {
    if (timer) clearInterval(timer)
    timer = null
    close()
    input = null
    output = null
    inputListenerAttached = false
  }

  function triggerVibe () {
    if (!output || !activeProfile || activeProfile.inputOnly) return false
    if (vibeTimer) clearInterval(vibeTimer)
    vibeActive = true
    vibeVariant = VIBE_VARIANTS[vibeIndex]
    let frame = 0
    let previousFrame = []
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
        const currentFrame = vibeLedMessages(activeProfile.id, frame, vibeVariant.id)
        for (const message of changedVibeMessages(previousFrame, currentFrame)) output.sendMessage(message)
        previousFrame = currentFrame
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
    reconnect: () => {
      close()
      setStatus({ connected: false, device: '', error: '' })
      connect()
    },
    triggerVibe,
    setProfile: (profileId) => {
      if (!validProfileId(profileId)) return false
      if (selectedProfile === profileId) return true
      selectedProfile = profileId
      learningAction = ''
      recording = null
      close()
      const mappingProfile = selectedProfile === AUTO_PROFILE ? 'apc40-mkii' : isGenericProfileId(selectedProfile) ? GENERIC_MIDI_ID : selectedProfile
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

function customGridLedMessages (profile, feedback = {}) {
  const mini = profile.id === APC_MINI_MK2.ID
  const channel = mini ? APC_MINI_MK2.ANIMATION.SOLID : APC40.ANIMATION.SOLID
  const colors = mini
    ? { off: APC_MINI_MK2.COLOR.OFF, red: APC_MINI_MK2.COLOR.RED, green: APC_MINI_MK2.COLOR.GREEN, blue: APC_MINI_MK2.COLOR.BLUE, violet: APC_MINI_MK2.COLOR.BLUE, cyan: APC_MINI_MK2.COLOR.BLUE, 'target-state': APC_MINI_MK2.COLOR.BLUE }
    : { off: APC40.COLOR.OFF, red: APC40.COLOR.RED, green: APC40.COLOR.GREEN, blue: APC40.COLOR.BLUE, violet: APC40.COLOR.BLUE, cyan: 45, 'target-state': APC40.COLOR.BLUE }
  const byNote = new Map()
  for (const [key, tone] of Object.entries(feedback)) {
    const match = key.match(/^note:\d+:(\d+)$/)
    if (match) byNote.set(Number(match[1]), colors[tone] ?? colors.blue)
  }
  return Array.from({ length: profile.padCount }, (_, note) => [0x90 | channel, note, byNote.get(note) ?? colors.off])
}
