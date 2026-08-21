import React, { useEffect, useMemo, useRef, useState } from 'react'
import { WorkflowBuilder } from './WorkflowBuilder.jsx'
import { WORKFLOW_STORAGE_KEY, createStarterWorkflow, draftWorkflowFromPrompt } from './workflow-model.mjs'
import { CAREER_OS_PACK } from '../shared/career-os-pack.mjs'
import { portableWorkflowPack } from '../shared/workflow-pack.mjs'
import './workflows.css'

const EMPTY_SNAPSHOT = { version: 2, workflows: [], runs: [], packs: [], updatedAt: null }
const EMPTY_CAREER = { version: 1, configured: false, preferences: { routineMinutes: 45, maxDailyOpportunities: 5 }, opportunities: [], pipeline: {}, dailyQueue: { minutes: 45, plannedMinutes: 0, remainingMinutes: 45, items: [] }, market: {}, feedbackSummary: {}, updatedAt: null }
const ACTIVE_STATUSES = new Set(['queued', 'running', 'awaiting_approval', 'needs_attention'])
const PASS_REASONS = ['Salary', 'Location', 'Company', 'Industry', 'Too junior', 'Too senior', 'Not technical enough', 'Not interesting', 'Other']

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

function initialPackValues () {
  const values = {}
  for (const stage of CAREER_OS_PACK.setup.stages) {
    for (const field of stage.fields) values[field.id] = field.defaultValue ?? (field.type === 'multi-select' ? [] : '')
  }
  values.sources = ['Public ATS feeds', 'Curated company watchlist']
  values.routineTime = '08:30'
  return values
}

function PackField ({ field, value, onChange }) {
  if (field.type === 'multi-select') {
    const selected = Array.isArray(value) ? value : []
    return <fieldset className="career-pack-choices"><legend>{field.label}{field.required && <i>Required</i>}</legend><div>{field.options.map((option) => {
      const active = selected.includes(option.value)
      return <button type="button" key={option.value} data-selected={active} onClick={() => onChange(active ? selected.filter((item) => item !== option.value) : [...selected, option.value])}>{option.label}</button>
    })}</div></fieldset>
  }
  if (field.type === 'select') {
    return <label className="career-pack-field"><span>{field.label}{field.required && <i>Required</i>}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  }
  if (field.type === 'textarea') {
    return <label className="career-pack-field"><span>{field.label}{field.required && <i>Required</i>}</span><textarea rows="4" value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} /></label>
  }
  return <label className="career-pack-field"><span>{field.label}{field.required && <i>Required</i>}</span><input type={['number', 'time'].includes(field.type) ? field.type : 'text'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} /></label>
}

function CareerPackSetup ({ onClose, onInstall }) {
  const [stageIndex, setStageIndex] = useState(0)
  const [values, setValues] = useState(initialPackValues)
  const [error, setError] = useState('')
  const [installing, setInstalling] = useState(false)
  const stage = CAREER_OS_PACK.setup.stages[stageIndex]
  const isLast = stageIndex === CAREER_OS_PACK.setup.stages.length - 1

  const continueSetup = async () => {
    const missing = stage.fields.filter((field) => field.required && (Array.isArray(values[field.id]) ? !values[field.id].length : !String(values[field.id] || '').trim()))
    if (missing.length) {
      setError(`Complete ${missing.map((field) => field.label.toLocaleLowerCase()).join(', ')} to continue.`)
      return
    }
    setError('')
    if (!isLast) return setStageIndex((current) => current + 1)
    setInstalling(true)
    try {
      await onInstall(values)
    } catch (reason) {
      setInstalling(false)
      setError(reason?.message || 'Career OS could not be installed.')
    }
  }

  return <div className="career-pack-modal" role="dialog" aria-modal="true" aria-labelledby="career-pack-title">
    <section>
      <header><button type="button" onClick={onClose} aria-label="Close Career OS setup">×</button><div className="career-pack-progress" aria-label={`Step ${stageIndex + 1} of ${CAREER_OS_PACK.setup.stages.length}`}>{CAREER_OS_PACK.setup.stages.map((item, index) => <i key={item.id} data-active={index <= stageIndex} />)}</div><small>About {CAREER_OS_PACK.setup.estimatedMinutes} minutes</small></header>
      <main>
        <span>{stage.title} · {stageIndex + 1}/{CAREER_OS_PACK.setup.stages.length}</span>
        <h2 id="career-pack-title">{stage.prompt}</h2>
        <p>{stage.id === 'profile' ? 'Your answers stay in Ambientic’s private local workflow store. The shared pack never contains your resume or personal state.' : stage.id === 'connect' ? 'Connections are optional and progressive. Selecting a private source records your intent; it does not claim the integration is already connected.' : 'Career OS uses this to spend your limited search time on higher-value opportunities.'}</p>
        <div className="career-pack-fields">{stage.fields.map((field) => <PackField key={field.id} field={field} value={values[field.id]} onChange={(value) => { setValues((current) => ({ ...current, [field.id]: value })); setError('') }} />)}</div>
        {error && <div className="career-pack-error" role="alert">{error}</div>}
      </main>
      <footer>{stageIndex > 0 ? <button type="button" onClick={() => { setStageIndex((current) => current - 1); setError('') }}>Back</button> : <span />}<button className="primary" type="button" disabled={installing} onClick={() => void continueSetup()}>{installing ? 'Installing…' : isLast ? 'Install Career OS' : 'Continue'}</button></footer>
    </section>
  </div>
}

function CareerPackCard ({ installed, workflows, runs, onInstall, onOpen, onRun, onCopy }) {
  const [copied, setCopied] = useState(false)
  const daily = workflows.find((workflow) => workflow.packRole === 'daily')
  const scout = workflows.find((workflow) => workflow.packRole === 'scout')
  const scoutRun = scout && runs.find((run) => run.workflowId === scout.id)
  const dailyRun = daily && runs.find((run) => run.workflowId === daily.id)
  const routine = installed?.summary?.routineMinutes || '45'

  return <article className="career-pack-card" data-installed={Boolean(installed)}>
    <div className="career-pack-card__mark"><span>◎</span><i /></div>
    <div className="career-pack-card__copy"><small>Ambientic workflow pack · Career</small><h2>Career OS</h2><p>{installed ? `${routine}-minute daily routine for the opportunities most worth your time.` : CAREER_OS_PACK.description}</p><div className="career-pack-card__route"><span>Discover</span><i /> <span>Rank</span><i /> <span>Prepare</span><i /> <span>Learn</span></div></div>
    {installed
      ? <div className="career-pack-card__status"><span><i data-status={scoutRun?.status || 'idle'} />{scoutRun?.status === 'completed' ? `Market scan ready · ${relativeTime(scoutRun.createdAt)}` : scoutRun ? statusLabel(scoutRun.status) : 'First market scan pending'}</span><b>{workflows.length} private routines installed</b><div><button type="button" onClick={() => { void onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>{copied ? 'Pack copied' : 'Copy pack'}</button><button type="button" onClick={() => onOpen(daily)}>Inspect</button><button className="primary" type="button" disabled={!daily || ACTIVE_STATUSES.has(dailyRun?.status)} onClick={() => onRun(daily)}>{ACTIVE_STATUSES.has(dailyRun?.status) ? statusLabel(dailyRun.status) : 'Start Career Daily'}</button></div></div>
      : <div className="career-pack-card__install"><span>10–15 minute setup</span><b>Workflow logic is portable.<br />Your career context stays private.</b><div><button type="button" onClick={() => { void onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>{copied ? 'Pack copied' : 'Copy manifest'}</button><button className="primary" type="button" onClick={onInstall}>Install Career OS</button></div></div>}
  </article>
}

function salaryLabel (opportunity) {
  if (opportunity.salaryMin == null && opportunity.salaryMax == null) return 'Compensation unknown'
  const symbol = { EUR: '€', USD: '$', GBP: '£' }[opportunity.currency] || `${opportunity.currency || ''} `
  const compact = (value) => value == null ? '—' : value >= 1000 ? `${Math.round(value / 1000)}k` : value
  const range = opportunity.salaryMin != null && opportunity.salaryMax != null ? `${symbol}${compact(opportunity.salaryMin)}–${compact(opportunity.salaryMax)}` : `${symbol}${compact(opportunity.salaryMin ?? opportunity.salaryMax)}`
  return `${range}${opportunity.salarySource === 'Inferred' ? ' estimated' : ''}`
}

function CareerOpportunityCard ({ opportunity, onUpdate, onPass }) {
  const [passing, setPassing] = useState(false)
  return <article className="career-opportunity" data-status={opportunity.status}>
    <header><div><span>{opportunity.company}</span><h3>{opportunity.roleTitle}</h3></div><strong><b>{opportunity.opportunityScore}</b><small>Opportunity</small></strong></header>
    <div className="career-opportunity__facts"><span>{opportunity.remotePolicy}</span><span>{salaryLabel(opportunity)}</span><span>{opportunity.salaryConfidence} confidence</span><span>{opportunity.status}</span></div>
    <div className="career-opportunity__scores"><span><i style={{ '--score': `${opportunity.candidateFitScore}%` }} />Candidate fit <b>{opportunity.candidateFitScore}</b></span><span><i style={{ '--score': `${opportunity.careerFitScore}%` }} />Career fit <b>{opportunity.careerFitScore}</b></span></div>
    <div className="career-opportunity__reason"><section><span>Why it fits</span><ul>{(opportunity.whyFits || []).slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}{!opportunity.whyFits?.length && <li>Awaiting Judge analysis</li>}</ul></section><section><span>Concerns</span><ul>{(opportunity.concerns || []).slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}{!opportunity.concerns?.length && <li>No explicit concern recorded</li>}</ul></section></div>
    {opportunity.candidateEdge && <blockquote><span>Your edge</span>{opportunity.candidateEdge}</blockquote>}
    {passing && <div className="career-pass-reasons"><span>Why pass?</span>{PASS_REASONS.map((reason) => <button type="button" key={reason} onClick={() => { void onPass(opportunity.id, reason); setPassing(false) }}>{reason}</button>)}</div>}
    <footer><button type="button" onClick={() => void onUpdate(opportunity.id, { status: 'Saved', nextAction: 'Review later' })}>Save</button><button type="button" onClick={() => setPassing((current) => !current)}>Pass</button><button className="primary" type="button" onClick={() => void onUpdate(opportunity.id, { status: 'Pursuing', nextAction: 'Run pursued-opportunity preparation' })}>Pursue</button></footer>
  </article>
}

function CareerOsHome ({ snapshot, onUpdate, onPass, onRunScout, onRunDaily, scoutActive, dailyActive }) {
  const queueIds = new Set(snapshot.dailyQueue.items.map((item) => item.opportunityId))
  const opportunities = snapshot.opportunities.filter((opportunity) => queueIds.has(opportunity.id) && !['Archived', 'Rejected', 'Withdrawn'].includes(opportunity.status))
  const active = Object.entries(snapshot.pipeline).filter(([status]) => ['Saved', 'Pursuing', 'Application Ready', 'Applied', 'Recruiter Screen', 'Interview', 'Final Round'].includes(status)).reduce((sum, [, count]) => sum + count, 0)
  const interviewing = (snapshot.pipeline['Recruiter Screen'] || 0) + (snapshot.pipeline.Interview || 0) + (snapshot.pipeline['Final Round'] || 0)

  return <section className="career-home">
    <header><div><span>Career OS</span><h2>Good morning</h2><p><b>{snapshot.dailyQueue.minutes}-minute Career Daily</b> · {snapshot.dailyQueue.items.length ? `${snapshot.dailyQueue.items.length} high-value actions planned` : 'Your queue is waiting for its first market scan'}</p></div><button className="primary" type="button" disabled={dailyActive} onClick={onRunDaily}>{dailyActive ? 'Career Daily running' : 'Start Career Daily'}</button></header>
    <div className="career-home__summary">
      <section><span>Today</span>{snapshot.dailyQueue.items.length ? <ol>{snapshot.dailyQueue.items.map((item) => <li key={item.id}><span>{item.label}</span><b>{item.minutes} min</b></li>)}</ol> : <div className="career-home__empty"><b>No ranked opportunities yet</b><p>Run the market scan to search canonical ATS postings, normalize eligibility, and prepare the first shortlist.</p><button type="button" disabled={scoutActive} onClick={onRunScout}>{scoutActive ? 'Market scan running' : 'Run first market scan'}</button></div>}</section>
      <aside><div><span>Market</span><b>{snapshot.market.processed || 0}</b><small>roles processed</small></div><div><span>Pipeline</span><b>{active}</b><small>active opportunities</small></div><div><span>Interviews</span><b>{interviewing}</b><small>processes moving</small></div></aside>
    </div>
    {opportunities.length > 0 && <section className="career-home__opportunities"><header><div><span>Worth your attention</span><small>Candidate fit and career fit stay separate</small></div><b>{opportunities.length} in today’s queue · max {snapshot.preferences.maxDailyOpportunities || 5} new</b></header><div>{opportunities.map((opportunity) => <CareerOpportunityCard key={opportunity.id} opportunity={opportunity} onUpdate={onUpdate} onPass={onPass} />)}</div></section>}
  </section>
}

export function WorkflowStudio ({ onOpenThread }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [career, setCareer] = useState(EMPTY_CAREER)
  const [selectedId, setSelectedId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCareerSetup, setShowCareerSetup] = useState(false)
  const pendingRef = useRef(new Map())
  const timersRef = useRef(new Map())

  useEffect(() => {
    let disposed = false
    const initialize = async () => {
      const careerState = await window.controller.getCareerOs()
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
        setCareer(careerState)
        setLoading(false)
      }
    }
    void initialize()
    const dispose = window.controller.onWorkflows((state) => {
      if (!disposed) setSnapshot(state)
    })
    const disposeCareer = window.controller.onCareerOs((state) => {
      if (!disposed) setCareer(state)
    })
    return () => {
      disposed = true
      dispose?.()
      disposeCareer?.()
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      for (const [workflowId, workflow] of pendingRef.current) void window.controller.updateWorkflow(workflowId, workflow)
    }
  }, [])

  const selected = snapshot.workflows.find((workflow) => workflow.id === selectedId)
  const installedCareer = snapshot.packs?.find((pack) => pack.id === CAREER_OS_PACK.id)
  const careerWorkflows = snapshot.workflows.filter((workflow) => workflow.packId === CAREER_OS_PACK.id)
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

  const installCareerOs = async (setup) => {
    await window.controller.installCareerOs(setup)
    setSnapshot(await window.controller.getWorkflows())
    setCareer(await window.controller.getCareerOs())
    setShowCareerSetup(false)
  }

  const removeWorkflow = async (workflow) => {
    if (!window.confirm(`Delete “${workflow.name}”? Its run history will remain local until Ambientic rotates old history.`)) return
    await window.controller.deleteWorkflow(workflow.id)
  }

  const careerScout = careerWorkflows.find((workflow) => workflow.packRole === 'scout')
  const careerDaily = careerWorkflows.find((workflow) => workflow.packRole === 'daily')
  const activeCareerRun = (workflow) => workflow && snapshot.runs.some((run) => run.workflowId === workflow.id && ACTIVE_STATUSES.has(run.status))

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
      {showCareerSetup && <CareerPackSetup onClose={() => setShowCareerSetup(false)} onInstall={installCareerOs} />}
      <main>
        <header className="workflow-library__header"><div><span>Workflow studio</span><h1>All workflows</h1><p>Reusable, provider-neutral routines that your agents can run on demand or on schedule.</p></div><button type="button" onClick={() => createWorkflow(createStarterWorkflow())}>＋ New workflow</button></header>
        <CareerPackCard installed={installedCareer} workflows={careerWorkflows} runs={snapshot.runs} onInstall={() => setShowCareerSetup(true)} onOpen={(workflow) => workflow && setSelectedId(workflow.id)} onRun={(workflow) => workflow && window.controller.runWorkflow(workflow.id)} onCopy={() => window.controller.copyText(JSON.stringify(portableWorkflowPack(CAREER_OS_PACK), null, 2))} />
        {installedCareer && <CareerOsHome snapshot={career} onUpdate={(id, patch) => window.controller.careerUpdateOpportunity(id, patch)} onPass={(id, reason) => window.controller.careerPassOpportunity(id, reason)} onRunScout={() => careerScout && window.controller.runWorkflow(careerScout.id)} onRunDaily={() => careerDaily && window.controller.runWorkflow(careerDaily.id)} scoutActive={activeCareerRun(careerScout)} dailyActive={activeCareerRun(careerDaily)} />}
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
