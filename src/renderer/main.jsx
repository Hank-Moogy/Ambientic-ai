import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Workspace from './Workspace.jsx'
import { WorkflowBuilder } from './WorkflowBuilder.jsx'
import './styles.css'

const surface = new URLSearchParams(window.location.search).get('surface')
const developmentWorkflowPreview = import.meta.env.DEV && surface === 'workflow-preview'
createRoot(document.getElementById('root')).render(
  surface === 'controller'
    ? <App />
    : developmentWorkflowPreview
        ? <main className="workflow-preview-shell"><WorkflowBuilder /></main>
        : <Workspace />
)
