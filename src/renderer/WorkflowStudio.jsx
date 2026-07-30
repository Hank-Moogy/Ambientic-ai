import React, { useEffect, useMemo, useRef, useState } from 'react'
import { WorkflowBuilder } from './WorkflowBuilder.jsx'
import { WORKFLOW_STORAGE_KEY, createStarterWorkflow, draftWorkflowFromPrompt } from './workflow-model.mjs'
import './workflows.css'

const EMPTY_SNAPSHOT = { version: 1, workflows: [], runs: [], updatedAt: null }
const ACTIVE_STATUSES = new Set(['queued', 'running', 'awaiting_approval', 'needs_attention'])

function relativeTime (value) {
  if (!value) return 'Never'
  const delta = Math.max(0, Date.now() - Number(value))
  if (delta < 60_000) return 'Just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}

function scheduleLabel (workflow) {
  return workflow.nodes.find((node) => node.kind === 'schedule')?.detail || 'Manual'
}

function statusLabel (status) {
  return {
    queued: 'Queued',
    running: 'Running',
    awaiting_approval: 'Needs approval',
    needs_attention: 'Agent needs you',
    completed: 'Completed',
    failed: 'Failed',
    denied: 'Denied',
    cancelled: 'Cancelled'
  }[status] || 'Never run'
}

function WorkflowCard ({ workflow, onOpen, onRun, onToggle, onDuplicate, onDelete }) {
  const lastRun = workflow.lastRun
  return (
    <article className="workflow-card" data-status={lastRun?.status || 'draft'}>
      <button className="workflow-card__open" type="button" onClick={onOpen}>
        <header><span>⌁</span><div><b>{workflow.name}</b><small>{workflow.description || 'No description yet'}</small></div><i>→</i></header>
        <div className="workflow-card__flow">{workflow.nodes.slice(0, 6).map((node, index) => <React.Fragment key={node.id}><span data-kind={node.kind} title={node.label}>{node.kind === 'schedule' ? '↻' : node.kind === 'web' ? '⌕' : node.kind === 'agent' ? '✦' : node.kind === 'approval' ? '◇' : node.kind === 'inbox' ? '↗' : node.kind === 'calendar' ? '□' : '⌁'}</span>{index < Math.min(workflow.nodes.length, 6) - 1 && <i />}</React.Fragment>)}</div>
        <dl><div><dt>Trigger</dt><dd>{scheduleLabel(workflow)}</dd></div><div><dt>Steps</dt><dd>{workflow.nodes.length}</dd></div><div><dt>Last run</dt><dd data-run-status={lastRun?.status}>{lastRun ? `${statusLabel(lastRun.status)} · ${relativeTime(lastRun.createdAt)}` : 'Never'}</dd></div></dl>
      </button>
      <footer>
        <label><input type="checkbox" checked={Boolean(workflow.enabled)} onChange={(event) => onToggle(event.target.checked)} /><span /><b>{workflow.enabled ? 'Scheduled' : 'Manual'}</b></label>
        <button type="button" onClick={onDuplicate}>Duplicate</button>
        <button type="button" onClick={onDelete}>Delete</button>
        <button className="primary" type="button" disabled={ACTIVE_STATUSES.has(lastRun?.status)} onClick={onRun}>{ACTIVE_STATUSES.has(lastRun?.status) ? statusLabel(lastRun.status) : 'Run now'}</button>
      </footer>
    </article>
  )
}

function RunTimeline ({ runs, onOpenThread }) {
  return (
    <aside className="workflow-runs">
      <header><span>Run history</span><small>Real managed agent activity</small></header>
      <div>
        {runs.slice(0, 12).map((run) => {
          const activeStep = run.steps.find((step) => ['running', 'awaiting_approval'].includes(step.status))
          const sessionId = activeStep?.sessionId || [...run.steps].reverse().find((step) => step.sessionId)?.sessionId
          return <article key={run.id} data-status={run.status}><i /><div><b>{run.workflowName}</b><span>{statusLabel(run.status)}{activeStep ? ` · ${activeStep.label}` : ''}</span><small>{relativeTime(run.createdAt)} · {run.source === 'schedule' ? 'Scheduled' : 'Manual'}</small></div>{sessionId && <button type="button" onClick={() => onOpenThread?.(sessionId)}>Thread ↗</button>}</article>
        })}
        {!runs.length && <section className="workflow-runs__empty"><span>◎</span><b>No runs yet</b><p>Run a workflow and its real provider steps, approvals, and outcome will appear here.</p></section>}
      </div>
    </aside>
  )
}

export function WorkflowStudio ({ onOpenThread }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [selectedId, setSelectedId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const pendingRef = useRef(new Map())
  const timersRef = useRef(new Map())

  useEffect(() => {
    let disposed = false
    const initialize = async () => {
      let state = await window.controller.getWorkflows()
      if (!state.workflows.length) {
        let first
        try {
          const stored = JSON.parse(window.localStorage.getItem(WORKFLOW_STORAGE_KEY) || 'null')
          first = stored?.nodes?.length ? stored : createStarterWorkflow()
        } catch {
          first = createStarterWorkflow()
        }
        await window.controller.createWorkflow({ ...first, enabled: false })
        state = await window.controller.getWorkflows()
      }
      if (!disposed) {
        setSnapshot(state)
        setLoading(false)
      }
    }
    void initialize()
    const dispose = window.controller.onWorkflows((state) => {
      if (!disposed) setSnapshot(state)
    })
    return () => {
      disposed = true
      dispose?.()
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      for (const [workflowId, workflow] of pendingRef.current) void window.controller.updateWorkflow(workflowId, workflow)
    }
  }, [])

  const selected = snapshot.workflows.find((workflow) => workflow.id === selectedId)
  const activeRun = useMemo(() => {
    if (!selectedId) return null
    return snapshot.runs.find((run) => run.workflowId === selectedId && ACTIVE_STATUSES.has(run.status)) ||
      snapshot.runs.find((run) => run.workflowId === selectedId) ||
      null
  }, [snapshot.runs, selectedId])

  const saveWorkflow = (workflow) => {
    pendingRef.current.set(workflow.id, workflow)
    setSnapshot((current) => ({
      ...current,
      workflows: current.workflows.map((candidate) => candidate.id === workflow.id ? { ...candidate, ...workflow } : candidate)
    }))
    clearTimeout(timersRef.current.get(workflow.id))
    timersRef.current.set(workflow.id, setTimeout(async () => {
      const pending = pendingRef.current.get(workflow.id)
      pendingRef.current.delete(workflow.id)
      timersRef.current.delete(workflow.id)
      if (pending) await window.controller.updateWorkflow(workflow.id, pending)
    }, 450))
  }

  const createWorkflow = async (input) => {
    const created = await window.controller.createWorkflow({ ...input, enabled: false })
    setSelectedId(created.id)
    setPrompt('')
  }

  const removeWorkflow = async (workflow) => {
    if (!window.confirm(`Delete “${workflow.name}”? Its run history will remain local until Ambientic rotates old history.`)) return
    await window.controller.deleteWorkflow(workflow.id)
  }

  if (selected) {
    return <WorkflowBuilder
      key={selected.id}
      initialWorkflow={selected}
      activeRun={activeRun}
      onChange={saveWorkflow}
      onBack={() => setSelectedId('')}
      onRun={(workflowId) => window.controller.runWorkflow(workflowId)}
      onApproveRun={(runId, allow) => window.controller.approveWorkflowRun(runId, allow)}
      onCancelRun={(runId) => window.controller.cancelWorkflowRun(runId)}
    />
  }

  return (
    <section className="workflow-library">
      <main>
        <header className="workflow-library__header"><div><span>Workflow studio</span><h1>All workflows</h1><p>Reusable, provider-neutral routines that your agents can run on demand or on schedule.</p></div><button type="button" onClick={() => createWorkflow(createStarterWorkflow())}>＋ New workflow</button></header>
        <form className="workflow-library__prompt" onSubmit={(event) => { event.preventDefault(); if (prompt.trim()) void createWorkflow(draftWorkflowFromPrompt(prompt)) }}>
          <span>✦</span><label><b>Build a new workflow with an agent</b><textarea rows="2" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Every weekday at 8:30, research competitor news, summarize it, let me approve, then email the brief…" /></label><button type="submit" disabled={!prompt.trim()}>Draft workflow ↑</button>
        </form>
        <section className="workflow-library__section">
          <header><div><span>Your workflows</span><small>{snapshot.workflows.length} private on this Mac</small></div><div className="workflow-library__legend"><i data-status="running" />Running<i data-status="awaiting_approval" />Needs you<i data-status="completed" />Complete</div></header>
          <div className="workflow-library__grid">
            {snapshot.workflows.map((workflow) => <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onOpen={() => setSelectedId(workflow.id)}
              onRun={() => window.controller.runWorkflow(workflow.id)}
              onToggle={(enabled) => window.controller.setWorkflowEnabled(workflow.id, enabled)}
              onDuplicate={() => window.controller.duplicateWorkflow(workflow.id)}
              onDelete={() => removeWorkflow(workflow)}
            />)}
          </div>
          {!loading && !snapshot.workflows.length && <div className="workflow-library__empty"><span>⌁</span><h2>Build your first reusable workflow</h2><p>Describe it above or start from a visual canvas.</p></div>}
        </section>
      </main>
      <RunTimeline runs={snapshot.runs} onOpenThread={onOpenThread} />
    </section>
  )
}
