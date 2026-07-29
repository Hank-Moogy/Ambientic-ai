import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('controller', {
  getState: () => ipcRenderer.invoke('get-state'),
  getBuildInfo: () => ipcRenderer.invoke('get-build-info'),
  getWorkspaceThreads: () => ipcRenderer.invoke('get-workspace-threads'),
  getGoals: () => ipcRenderer.invoke('get-goals'),
  createGoal: (input) => ipcRenderer.invoke('create-goal', input),
  updateGoal: (goalId, patch) => ipcRenderer.invoke('update-goal', goalId, patch),
  createGoalTask: (goalId, input) => ipcRenderer.invoke('create-goal-task', goalId, input),
  updateGoalTask: (taskId, patch) => ipcRenderer.invoke('update-goal-task', taskId, patch),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getConsumptionLedger: () => ipcRenderer.invoke('get-consumption-ledger'),
  getAmbientMode: () => ipcRenderer.invoke('get-ambient-mode'),
  setAmbientMode: (enabled) => ipcRenderer.invoke('set-ambient-mode', enabled),
  continueAmbientMode: () => ipcRenderer.invoke('continue-ambient-mode'),
  setAmbientModeCheckIn: (minutes) => ipcRenderer.invoke('set-ambient-mode-check-in', minutes),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getCompanions: () => ipcRenderer.invoke('get-companions'),
  getConnectors: () => ipcRenderer.invoke('get-connectors'),
  refreshConnectors: () => ipcRenderer.invoke('refresh-connectors'),
  getProviderAuth: () => ipcRenderer.invoke('get-provider-auth'),
  dismissProviderAuth: (provider) => ipcRenderer.invoke('dismiss-provider-auth', provider),
  getOnboarding: () => ipcRenderer.invoke('get-onboarding'),
  saveOnboarding: (patch) => ipcRenderer.invoke('save-onboarding', patch),
  resetOnboarding: () => ipcRenderer.invoke('reset-onboarding'),
  getHandovers: () => ipcRenderer.invoke('get-handovers'),
  generateHandover: (sessionId) => ipcRenderer.invoke('generate-handover', sessionId),
  continueHandover: (sessionId, targetProvider) => ipcRenderer.invoke('continue-handover', sessionId, targetProvider),
  openAgentSetup: (agentId) => ipcRenderer.invoke('open-agent-setup', agentId),
  connectProvider: (agentId, options = {}) => ipcRenderer.invoke('connect-provider', agentId, options),
  claudeAuthInput: (input) => ipcRenderer.invoke('claude-auth-input', input),
  claudeAuthCancel: () => ipcRenderer.invoke('claude-auth-cancel'),
  getThread: (id) => ipcRenderer.invoke('get-thread', id),
  renameThread: (id, title) => ipcRenderer.invoke('rename-thread', id, title),
  chooseThreadContext: () => ipcRenderer.invoke('choose-thread-context'),
  chooseProjectFolder: () => ipcRenderer.invoke('choose-project-folder'),
  sendThreadPrompt: (id, text, options = {}) => ipcRenderer.invoke('send-thread-prompt', id, text, options),
  interruptThread: (id) => ipcRenderer.invoke('interrupt-thread', id),
  createManagedThread: (options) => ipcRenderer.invoke('create-managed-thread', options),
  resolveApproval: (id, allow, remember = false) => ipcRenderer.invoke('resolve-approval', id, allow, remember),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  showController: () => ipcRenderer.invoke('show-controller'),
  hideController: () => ipcRenderer.invoke('hide-controller'),
  showWorkspace: (id) => ipcRenderer.invoke('show-workspace', id),
  openArtifact: (path) => ipcRenderer.invoke('open-artifact', path),
  presentPreview: (id) => ipcRenderer.invoke('present-preview', id),
  getMidi: () => ipcRenderer.invoke('get-midi'),
  getVoice: () => ipcRenderer.invoke('get-voice'),
  toggleVoice: () => ipcRenderer.invoke('toggle-voice'),
  midiLearn: (actionId) => ipcRenderer.invoke('midi-learn', actionId),
  midiSetProfile: (profileId) => ipcRenderer.invoke('midi-set-profile', profileId),
  midiVibe: () => ipcRenderer.invoke('midi-vibe'),
  midiCancelLearn: () => ipcRenderer.invoke('midi-cancel-learn'),
  midiClearAction: (actionId) => ipcRenderer.invoke('midi-clear-action', actionId),
  midiResetMappings: () => ipcRenderer.invoke('midi-reset-mappings'),
  refreshUsage: () => ipcRenderer.invoke('refresh-usage'),
  focus: (id) => ipcRenderer.invoke('focus', id),
  selectSession: (id) => ipcRenderer.invoke('select-session', id),
  capturePreview: (id) => ipcRenderer.invoke('capture-preview', id),
  showDisplayMenu: () => ipcRenderer.invoke('show-display-menu'),
  showCompanionMenu: (id) => ipcRenderer.invoke('show-companion-menu', id),
  toggleCompanion: (id) => ipcRenderer.invoke('toggle-companion', id),
  dismiss: (id) => ipcRenderer.invoke('dismiss', id),
  installHooks: () => ipcRenderer.invoke('install-hooks'),
  resize: (height) => ipcRenderer.send('resize', height),
  startManualResize: (edge) => ipcRenderer.send('manual-resize-start', edge),
  endManualResize: () => ipcRenderer.send('manual-resize-end'),
  onState: (cb) => {
    const handler = (_e, list) => cb(list)
    ipcRenderer.on('state', handler)
    return () => ipcRenderer.removeListener('state', handler)
  },
  onWorkspaceThreads: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('workspace-threads', handler)
    return () => ipcRenderer.removeListener('workspace-threads', handler)
  },
  onGoals: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('goals', handler)
    return () => ipcRenderer.removeListener('goals', handler)
  },
  onUsage: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('usage', handler)
    return () => ipcRenderer.removeListener('usage', handler)
  },
  onConsumptionLedger: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('consumption-ledger', handler)
    return () => ipcRenderer.removeListener('consumption-ledger', handler)
  },
  onAmbientMode: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('ambient-mode', handler)
    return () => ipcRenderer.removeListener('ambient-mode', handler)
  },
  onDisplays: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('displays', handler)
    return () => ipcRenderer.removeListener('displays', handler)
  },
  onCompanions: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('companions', handler)
    return () => ipcRenderer.removeListener('companions', handler)
  },
  onConnectors: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('connectors', handler)
    return () => ipcRenderer.removeListener('connectors', handler)
  },
  onProviderAuth: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('provider-auth', handler)
    return () => ipcRenderer.removeListener('provider-auth', handler)
  },
  onHandovers: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('handovers', handler)
    return () => ipcRenderer.removeListener('handovers', handler)
  },
  onMidi: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('midi', handler)
    return () => ipcRenderer.removeListener('midi', handler)
  },
  onVoice: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('voice', handler)
    return () => ipcRenderer.removeListener('voice', handler)
  },
  onInstaller: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('installer', handler)
    return () => ipcRenderer.removeListener('installer', handler)
  },
  onThread: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('thread', handler)
    return () => ipcRenderer.removeListener('thread', handler)
  },
  onWorkspaceSelect: (cb) => {
    const handler = (_e, id) => cb(id)
    ipcRenderer.on('workspace-select', handler)
    return () => ipcRenderer.removeListener('workspace-select', handler)
  },
  onSys: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('sys', handler)
    return () => ipcRenderer.removeListener('sys', handler)
  },
  requestAccessibility: () => ipcRenderer.invoke('request-accessibility')
})
