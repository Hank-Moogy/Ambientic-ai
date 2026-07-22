import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('controller', {
  getState: () => ipcRenderer.invoke('get-state'),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getCompanions: () => ipcRenderer.invoke('get-companions'),
  refreshUsage: () => ipcRenderer.invoke('refresh-usage'),
  focus: (id) => ipcRenderer.invoke('focus', id),
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
  onInstaller: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('installer', handler)
    return () => ipcRenderer.removeListener('installer', handler)
  },
  onSys: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('sys', handler)
    return () => ipcRenderer.removeListener('sys', handler)
  },
  requestAccessibility: () => ipcRenderer.invoke('request-accessibility')
})
