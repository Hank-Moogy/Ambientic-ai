import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Workspace from './Workspace.jsx'
import { WorkflowBuilder } from './WorkflowBuilder.jsx'
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
          <p>Your local agents and workflow draft are still stored. Reload the interface to return to a clean Overview instead of staying on a black screen.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
          <details><summary>Technical detail</summary><code>{this.state.error?.message || 'Unknown renderer error'}</code></details>
        </div>
      </main>
    )
  }
}

const surface = new URLSearchParams(window.location.search).get('surface')
const developmentWorkflowPreview = import.meta.env.DEV && surface === 'workflow-preview'
createRoot(document.getElementById('root')).render(
  <RendererRecoveryBoundary>
    {surface === 'controller'
      ? <App />
      : developmentWorkflowPreview
          ? <main className="workflow-preview-shell"><WorkflowBuilder /></main>
          : <Workspace />}
  </RendererRecoveryBoundary>
)
