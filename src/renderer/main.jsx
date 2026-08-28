import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Workspace from './Workspace.jsx'
import { ContextPreview } from './ContextPreview.jsx'
import { HardwareWorkspace } from './HardwareWorkspace.jsx'
import './styles.css'

class RendererRecoveryBoundary extends React.Component {
  constructor (props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError (error) {
    return { error }
  }

  componentDidCatch (error, detail) {
    console.error('[ambientic:workspace] renderer failed', error, detail?.componentStack || '')
  }

  render () {
    if (!this.state.error) return this.props.children
    return (
      <main className="renderer-recovery">
        <div>
          <span>◇</span>
          <small>Workspace recovery</small>
          <h1>Ambientic hit a rendering problem.</h1>
          <p>Your local agents and private data are still stored. Reload the interface to return to a clean Overview instead of staying on a black screen.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
          <details><summary>Technical detail</summary><code>{this.state.error?.message || 'Unknown renderer error'}</code></details>
        </div>
      </main>
    )
  }
}

const surface = new URLSearchParams(window.location.search).get('surface')
const developmentContextPreview = import.meta.env.DEV && surface === 'context-preview'
const developmentHardwarePreview = import.meta.env.DEV && surface === 'hardware-preview'
const hardwarePreviewSnapshot = {
  version: 1,
  activeTemplateId: 'preview-deck',
  activeViewId: 'home',
  mode: 'edit',
  lastInput: { key: 'note:0:36', at: Date.now() },
  learning: null,
  actions: [
    { id: 'hardware.view.open', label: 'Open view', category: 'navigation', target: 'view', permission: 'none', feedback: 'violet' },
    { id: 'thread.open', label: 'Open thread', category: 'threads', target: 'thread', permission: 'none', feedback: 'target-state' },
    { id: 'goal.open', label: 'Open goal', category: 'goals', target: 'goal', permission: 'none', feedback: 'green' },
    { id: 'provider.start-thread', label: 'Start provider task', category: 'providers', target: 'provider', permission: 'confirm', feedback: 'cyan', inputs: ['prompt'] },
    { id: 'ambientic.overview', label: 'Open Overview', category: 'ambientic', target: 'none', permission: 'none', feedback: 'blue' }
  ],
  slots: Array.from({ length: 24 }, (_, index) => ({ id: `pad-${Math.floor(index / 6) + 1}-${(index % 6) + 1}`, row: Math.floor(index / 6), column: index % 6 })),
  templates: [{
    id: 'preview-deck', name: 'Studio command deck', description: 'Build, review, and guide your agent field from one calm instrument.', rows: 4, columns: 6, rootViewId: 'home', bindings: { 'note:0:36': 'pad-1-1', 'key:Meta+KeyR': 'pad-1-3' },
    views: [{ id: 'home', name: 'Command', assignments: {
      'pad-1-1': { actionId: 'thread.open', label: 'Current build', targetLabel: 'Ambientic hardware mapping', feedback: 'blue' },
      'pad-1-2': { actionId: 'goal.open', label: 'Ship check', targetId: 'goal-preview', targetLabel: 'Ship Ambientic', feedback: 'green' },
      'pad-1-3': { actionId: 'provider.start-thread', label: 'New Codex task', targetLabel: 'Codex', feedback: 'cyan' },
      'pad-2-1': { actionId: 'hardware.view.open', label: 'Review deck', targetLabel: 'Review', feedback: 'violet' },
      'pad-3-5': { actionId: 'ambientic.overview', label: 'Overview', feedback: 'blue' }
    } }, { id: 'review', name: 'Review', assignments: {} }]
  }, { id: 'ambientic-native-sessions', name: 'Ambientic Live Sessions', builtIn: true, rows: 8, columns: 8, views: [{ id: 'live', name: 'Live sessions', assignments: {} }] }]
}
createRoot(document.getElementById('root')).render(
  <RendererRecoveryBoundary>
    {surface === 'controller'
      ? <App />
      : developmentContextPreview
          ? <ContextPreview />
      : developmentHardwarePreview
          ? <HardwareWorkspace snapshot={hardwarePreviewSnapshot} midi={{ connected: true, model: 'Akai APC40 MKII', device: 'APC40 mkII', gridLabel: '5×8', activeProfile: 'apc40-mkii', padCount: 40 }} sessions={[]} goalsSnapshot={{ goals: [{ id: 'goal-preview', title: 'Ship Ambientic' }] }} connectors={[{ id: 'codex', label: 'Codex' }, { id: 'claude', label: 'Claude Code' }]} onOpenThread={() => {}} />
          : <Workspace />}
  </RendererRecoveryBoundary>
)
