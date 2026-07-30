import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const builder = readFileSync(new URL('../src/renderer/WorkflowBuilder.jsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../src/renderer/Workspace.jsx', import.meta.url), 'utf8')
const renderer = readFileSync(new URL('../src/renderer/main.jsx', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')
const workflowStyles = readFileSync(new URL('../src/renderer/workflows.css', import.meta.url), 'utf8')

test('workflow canvas exposes trackpad navigation and keyboard editing', () => {
  assert.match(builder, /addEventListener\('wheel', navigateCanvas, \{ passive: false \}\)/)
  assert.match(builder, /event\.key === 'Delete'/)
  assert.match(builder, /event\.key === 'Backspace'/)
  assert.match(builder, /event\.key\.toLocaleLowerCase\(\) === 'z'/)
  assert.match(builder, /Collapse workflow prompt/)
  assert.match(builder, /<textarea/)
})

test('workspace navigation can collapse and persists that choice', () => {
  assert.match(workspace, /SIDEBAR_COLLAPSED_KEY/)
  assert.match(workspace, /data-sidebar-collapsed=\{sidebarCollapsed\}/)
  assert.match(workspace, /Show navigation sidebar/)
})

test('renderer failures show recovery UI and native crashes reload with a bound', () => {
  assert.match(renderer, /RendererRecoveryBoundary/)
  assert.match(renderer, /Reload workspace/)
  assert.match(main, /render-process-gone/)
  assert.match(main, /automatic recovery stopped after two failures/)
})

test('workflow overview has a complete responsive visual system', () => {
  assert.match(workflowStyles, /\.workflow-library\{/)
  assert.match(workflowStyles, /\.workflow-library__prompt\{/)
  assert.match(workflowStyles, /\.workflow-card\{/)
  assert.match(workflowStyles, /\.workflow-runs\{/)
  assert.match(workflowStyles, /@media\(max-width:1180px\)/)
  assert.match(workflowStyles, /@media\(prefers-reduced-motion:reduce\)/)
})
