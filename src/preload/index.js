import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('controller', {
  getState: () => ipcRenderer.invoke('get-state'),
  getWorkspaceThreads: () => ipcRenderer.invoke('get-workspace-threads'),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getCompanions: () => ipcRenderer.invoke('get-companions'),
  getConnectors: () => ipcRenderer.invoke('get-connectors'),
  refreshConnectors: () => ipcRenderer.invoke('refresh-connectors'),
  openAgentSetup: (agentId) => ipcRenderer.invoke('open-agent-setup', agentId),
  getThread: (id) => ipcRenderer.invoke('get-thread', id),
  sendThreadPrompt: (id, text) => ipcRenderer.invoke('send-thread-prompt', id, text),
  interruptThread: (id) => ipcRenderer.invoke('interrupt-thread', id),
  createManagedThread: (options) => ipcRenderer.invoke('create-managed-thread', options),
  resolveApproval: (id, allow, remember = false) => ipcRenderer.invoke('resolve-approval', id, allow, remember),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  showController: () => ipcRenderer.invoke('show-controller'),
  showWorkspace: (id) => ipcRenderer.invoke('show-workspace', id),
  openArtifact: (path) => ipcRenderer.invoke('open-artifact', path),
  presentPreview: (id) => ipcRenderer.invoke('present-preview', id),
  getMidi: () => ipcRenderer.invoke('get-midi'),
  getVoice: () => ipcRenderer.invoke('get-voice'),
  toggleVoice: () => ipcRenderer.invoke('toggle-voice'),
  midiLearn: (actionId) => ipcRenderer.invoke('midi-learn', actionId),
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
  onUsage: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('usage', handler)
    return () => ipcRenderer.removeListener('usage', handler)
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
