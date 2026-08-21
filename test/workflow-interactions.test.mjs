import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const builder = readFileSync(new URL('../src/renderer/WorkflowBuilder.jsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../src/renderer/Workspace.jsx', import.meta.url), 'utf8')
const renderer = readFileSync(new URL('../src/renderer/main.jsx', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')
const workflowStyles = readFileSync(new URL('../src/renderer/workflows.css', import.meta.url), 'utf8')
const studio = readFileSync(new URL('../src/renderer/WorkflowStudio.jsx', import.meta.url), 'utf8')

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

test('Workflow Studio can install Career OS through progressive private setup', () => {
  assert.match(studio, /Install Career OS/)
  assert.match(studio, /Start Career Daily/)
  assert.match(studio, /private on this Mac/)
  assert.match(studio, /CareerPackSetup/)
  assert.match(studio, /chooseCareerProfileFile/)
  assert.match(studio, /CareerMemoryImport/)
  assert.match(studio, /Review profile/)
  assert.match(studio, /CareerProfileReview/)
  assert.match(studio, /Approve profile/)
  assert.match(studio, /Open agent request/)
  assert.match(workflowStyles, /\.career-pack-modal/)
  assert.match(workflowStyles, /\.career-pack-card/)
  assert.match(studio, /CareerOsHome/)
  assert.match(studio, /Workflow catalog/)
  assert.match(studio, /Your workflows/)
  assert.match(studio, /Market results/)
  assert.match(studio, /View job/)
  assert.match(studio, /OpportunityLimitControl/)
  assert.match(studio, /PASS_REASONS/)
  assert.match(workflowStyles, /\.career-opportunity/)
  assert.match(workflowStyles, /\.workflow-catalog/)
})
