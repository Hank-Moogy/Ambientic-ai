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
  getWorkflows: () => ipcRenderer.invoke('get-workflows'),
  createWorkflow: (input) => ipcRenderer.invoke('create-workflow', input),
  updateWorkflow: (workflowId, input) => ipcRenderer.invoke('update-workflow', workflowId, input),
  duplicateWorkflow: (workflowId) => ipcRenderer.invoke('duplicate-workflow', workflowId),
  deleteWorkflow: (workflowId) => ipcRenderer.invoke('delete-workflow', workflowId),
  setWorkflowEnabled: (workflowId, enabled) => ipcRenderer.invoke('set-workflow-enabled', workflowId, enabled),
  runWorkflow: (workflowId) => ipcRenderer.invoke('run-workflow', workflowId),
  approveWorkflowRun: (runId, allow) => ipcRenderer.invoke('approve-workflow-run', runId, allow),
  cancelWorkflowRun: (runId) => ipcRenderer.invoke('cancel-workflow-run', runId),
  getHardwareProfiles: () => ipcRenderer.invoke('get-hardware-profiles'),
  hardwareCreateTemplate: (input) => ipcRenderer.invoke('hardware-create-template', input),
  hardwareUpdateTemplate: (templateId, patch) => ipcRenderer.invoke('hardware-update-template', templateId, patch),
  hardwareDuplicateTemplate: (templateId) => ipcRenderer.invoke('hardware-duplicate-template', templateId),
  hardwareDeleteTemplate: (templateId) => ipcRenderer.invoke('hardware-delete-template', templateId),
  hardwareActivateTemplate: (templateId) => ipcRenderer.invoke('hardware-activate-template', templateId),
  hardwareSetMode: (mode) => ipcRenderer.invoke('hardware-set-mode', mode),
  hardwareAddView: (templateId, input) => ipcRenderer.invoke('hardware-add-view', templateId, input),
  hardwareRenameView: (templateId, viewId, name) => ipcRenderer.invoke('hardware-rename-view', templateId, viewId, name),
  hardwareDeleteView: (templateId, viewId) => ipcRenderer.invoke('hardware-delete-view', templateId, viewId),
  hardwareAssignPad: (templateId, viewId, slot, assignment) => ipcRenderer.invoke('hardware-assign-pad', templateId, viewId, slot, assignment),
  hardwareTriggerPad: (slot) => ipcRenderer.invoke('hardware-trigger-pad', slot),
  hardwareOpenView: (viewId) => ipcRenderer.invoke('hardware-open-view', viewId),
  hardwareLearnPad: (templateId, slot) => ipcRenderer.invoke('hardware-learn-pad', templateId, slot),
  hardwareCancelLearn: () => ipcRenderer.invoke('hardware-cancel-learn'),
  hardwareClearBinding: (templateId, slot) => ipcRenderer.invoke('hardware-clear-binding', templateId, slot),
  hardwareKeyInput: (code, modifiers, pressed = true) => ipcRenderer.invoke('hardware-key-input', code, modifiers, pressed),
  hardwareConfirmAction: (id, allow) => ipcRenderer.invoke('hardware-confirm-action', id, allow),
  hardwareExportTemplate: (templateId) => ipcRenderer.invoke('hardware-export-template', templateId),
  hardwareImportTemplate: () => ipcRenderer.invoke('hardware-import-template'),
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
  getMemoryBootstrap: () => ipcRenderer.invoke('memory-bootstrap-status'),
  startMemoryBootstrap: (options = {}) => ipcRenderer.invoke('memory-bootstrap-start', options),
  commitMemoryBootstrap: (options = {}) => ipcRenderer.invoke('memory-bootstrap-commit', options),
  resetMemoryBootstrap: () => ipcRenderer.invoke('memory-bootstrap-reset'),
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
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  getProviderTaskOptions: (provider) => ipcRenderer.invoke('get-provider-task-options', provider),
  sendThreadPrompt: (id, text, options = {}) => ipcRenderer.invoke('send-thread-prompt', id, text, options),
  interruptThread: (id) => ipcRenderer.invoke('interrupt-thread', id),
  createManagedThread: (options) => ipcRenderer.invoke('create-managed-thread', options),
  resolveApproval: (id, allow, remember = false) => ipcRenderer.invoke('resolve-approval', id, allow, remember),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  showController: () => ipcRenderer.invoke('show-controller'),
  hideController: () => ipcRenderer.invoke('hide-controller'),
  showWorkspace: (id) => ipcRenderer.invoke('show-workspace', id),
  openArtifact: (id, path) => ipcRenderer.invoke('open-artifact', id, path),
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
  onWorkflows: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('workflows', handler)
    return () => ipcRenderer.removeListener('workflows', handler)
  },
  onHardwareProfiles: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('hardware-profiles', handler)
    return () => ipcRenderer.removeListener('hardware-profiles', handler)
  },
  onHardwareNavigate: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('hardware-navigate', handler)
    return () => ipcRenderer.removeListener('hardware-navigate', handler)
  },
  onHardwareConfirmation: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('hardware-confirmation', handler)
    return () => ipcRenderer.removeListener('hardware-confirmation', handler)
  },
  onHardwareConfirmationExpired: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('hardware-confirmation-expired', handler)
    return () => ipcRenderer.removeListener('hardware-confirmation-expired', handler)
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
  onMemoryBootstrap: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('memory-bootstrap', handler)
    return () => ipcRenderer.removeListener('memory-bootstrap', handler)
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

// Provider-neutral context and capability contract. Keep it separate from the
// legacy controller surface so future agent runtimes can consume the same
// narrow API without inheriting unrelated window-management commands.
contextBridge.exposeInMainWorld('ambientic', {
  context: {
    listProjects: () => ipcRenderer.invoke('context-list-projects'),
    upsertProject: (input = {}) => ipcRenderer.invoke('context-upsert-project', input),
    inferLaunch: (input = {}) => ipcRenderer.invoke('context-infer-launch', input),
    launchAccess: (cwd = '') => ipcRenderer.invoke('context-launch-access', cwd),
    getBinding: (sessionId) => ipcRenderer.invoke('context-get-binding', sessionId),
    rebind: (sessionId, patch = {}) => ipcRenderer.invoke('context-rebind', sessionId, patch)
  },
  memory: {
    list: (options = {}) => ipcRenderer.invoke('memory-list', options),
    search: (options = {}) => ipcRenderer.invoke('memory-search', options),
    remember: (command = {}) => ipcRenderer.invoke('memory-remember', command),
    forget: (id) => ipcRenderer.invoke('memory-forget', id),
    resolveConflict: (id, resolution = {}) => ipcRenderer.invoke('memory-resolve-conflict', id, resolution),
    bootstrapStatus: () => ipcRenderer.invoke('memory-bootstrap-status'),
    bootstrapStart: (options = {}) => ipcRenderer.invoke('memory-bootstrap-start', options),
    bootstrapCommit: (options = {}) => ipcRenderer.invoke('memory-bootstrap-commit', options),
    bootstrapReset: () => ipcRenderer.invoke('memory-bootstrap-reset')
  },
  tools: {
    listConnections: () => ipcRenderer.invoke('tools-list-connections'),
    upsert: (connection = {}) => ipcRenderer.invoke('tools-upsert-connection', connection),
    test: (id) => ipcRenderer.invoke('tools-test-connection', id),
    disable: (id, options = {}) => ipcRenderer.invoke('tools-disable-connection', id, options),
    disconnect: (id) => ipcRenderer.invoke('tools-disconnect', id),
    listCapabilities: (connectionId = '') => ipcRenderer.invoke('tools-list-capabilities', connectionId)
  },
  audit: {
    list: (options = {}) => ipcRenderer.invoke('audit-list', options)
  }
})
