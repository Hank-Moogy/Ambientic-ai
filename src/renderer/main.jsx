import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Workspace from './Workspace.jsx'
import './styles.css'

const surface = new URLSearchParams(window.location.search).get('surface')
createRoot(document.getElementById('root')).render(surface === 'controller' ? <App /> : <Workspace />)
