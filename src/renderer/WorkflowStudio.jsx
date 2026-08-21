import React, { useEffect, useMemo, useRef, useState } from 'react'
import { WorkflowBuilder } from './WorkflowBuilder.jsx'
import { WORKFLOW_STORAGE_KEY, createStarterWorkflow, draftWorkflowFromPrompt } from './workflow-model.mjs'
import { CAREER_OS_PACK } from '../shared/career-os-pack.mjs'
import { portableWorkflowPack } from '../shared/workflow-pack.mjs'
import './workflows.css'

const EMPTY_SNAPSHOT = { version: 2, workflows: [], runs: [], packs: [], updatedAt: null }
const EMPTY_CAREER = { version: 1, configured: false, preferences: { routineMinutes: 45, maxDailyOpportunities: 5, resultsLimit: 0 }, opportunities: [], pipeline: {}, dailyQueue: { minutes: 45, plannedMinutes: 0, remainingMinutes: 45, items: [] }, market: {}, feedbackSummary: {}, updatedAt: null }
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
  const [choosing, setChoosing] = useState(false)
  if (field.type === 'opportunity-limit') {
    const all = value === 'all' || Number(value) === 0
    return <fieldset className="career-pack-limit"><legend>{field.label}{field.required && <i>Required</i>}</legend><p>Show every role found, or enter any maximum you prefer. The daily action queue stays time-boxed separately.</p><div><button type="button" data-selected={all} onClick={() => onChange('all')}>All jobs from the scan</button><label data-selected={!all}><span>Limit to</span><input type="number" min="1" max="1000" value={all ? '' : value} placeholder={field.placeholder} onFocus={() => { if (all) onChange('25') }} onChange={(event) => onChange(event.target.value)} /><small>jobs</small></label></div></fieldset>
  }
  if (field.type === 'file') {
    const name = String(value || '').split('/').filter(Boolean).at(-1)
    const choose = async () => {
      setChoosing(true)
      try {
        const selected = await window.controller.chooseCareerProfileFile(field.id === 'linkedinProfilePath' ? 'linkedin' : 'resume')
        if (selected?.path) onChange(selected.path)
      } finally {
        setChoosing(false)
      }
    }
    return <div className="career-pack-file" data-selected={Boolean(value)}><div><span>{field.label}{field.required && <i>Required</i>}</span><b>{name || (field.id === 'resumePath' ? 'PDF, DOCX, RTF, TXT, or Markdown' : 'Your LinkedIn “Save to PDF” export')}</b></div><button type="button" disabled={choosing} onClick={() => void choose()}>{choosing ? 'Choosing…' : name ? 'Replace' : field.buttonLabel || 'Choose file'}</button>{name && <button type="button" aria-label={`Remove ${name}`} onClick={() => onChange('')}>×</button>}</div>
  }
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
  return <label className="career-pack-field"><span>{field.label}{field.required && <i>Required</i>}</span><input type={['number', 'time', 'url'].includes(field.type) ? field.type : 'text'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} /></label>
}

function CareerMemoryImport ({ value, onChange }) {
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false
    Promise.resolve(window.ambientic?.memory?.list?.({ scope: 'user', status: 'active', limit: 24 }) || { memories: [] }).then((result) => {
      if (!disposed) setMemories((result?.memories || []).filter((item) => item.status === 'active').slice(0, 12))
    }).finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [])

  const selected = new Set(memories.filter((memory) => String(value || '').includes(memory.content)).map((memory) => memory.id))
  const toggle = (memory) => {
    const ids = new Set(selected)
    if (ids.has(memory.id)) ids.delete(memory.id); else ids.add(memory.id)
    onChange(memories.filter((item) => ids.has(item.id)).map((item) => `- ${item.content}`).join('\n'))
  }

  return <fieldset className="career-memory-import"><legend>Context Ambientic already knows <i>Optional</i></legend><p>Select only the reviewed memories that should inform your Career Profile. They are copied locally into this private workflow—not into the shared pack.</p>{loading ? <small>Reading reviewed local memory…</small> : memories.length ? <div>{memories.map((memory) => <button type="button" key={memory.id} data-selected={selected.has(memory.id)} onClick={() => toggle(memory)}><i>{selected.has(memory.id) ? '✓' : '+'}</i><span>{memory.content}</span><small>{memory.provenance?.provider || memory.kind || 'Ambientic memory'}</small></button>)}</div> : <aside><b>No reviewed Ambientic memories yet</b><span>Use Settings → Memory or replay provider-memory onboarding to import context your connected GPT and agent providers can safely expose.</span></aside>}</fieldset>
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
    if (stage.id === 'profile' && !String(values.resumePath || '').trim() && !String(values.careerProfile || '').trim()) {
      setError('Upload your CV or enter your career manually to continue.')
      return
    }
    if (stage.id === 'profile' && values.linkedinProfileUrl && !/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\//i.test(values.linkedinProfileUrl)) {
      setError('Enter a valid LinkedIn profile URL, or leave it empty and upload your LinkedIn PDF.')
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
        <p>{stage.id === 'profile' ? 'Career OS will mine only the evidence you choose, build a structured profile, and pause for your review. Files, memories, and extracted context stay in Ambientic’s private local stores.' : stage.id === 'connect' ? 'Connections are optional and progressive. Selecting a private source records your intent; it does not claim the integration is already connected.' : 'Career OS uses this to spend your limited search time on higher-value opportunities.'}</p>
        <div className="career-pack-fields">{stage.fields.map((field) => field.type === 'memory-import' ? <CareerMemoryImport key={field.id} value={values[field.id]} onChange={(value) => { setValues((current) => ({ ...current, [field.id]: value })); setError('') }} /> : <PackField key={field.id} field={field} value={values[field.id]} onChange={(value) => { setValues((current) => ({ ...current, [field.id]: value })); setError('') }} />)}</div>
        {error && <div className="career-pack-error" role="alert">{error}</div>}
      </main>
      <footer>{stageIndex > 0 ? <button type="button" onClick={() => { setStageIndex((current) => current - 1); setError('') }}>Back</button> : <span />}<button className="primary" type="button" disabled={installing} onClick={() => void continueSetup()}>{installing ? 'Installing…' : isLast ? 'Install Career OS' : 'Continue'}</button></footer>
    </section>
  </div>
}

function CareerPackCard ({ installed, workflows, runs, onInstall, onViewWorkflows, onOpenDashboard, onCopy }) {
  const [copied, setCopied] = useState(false)
  const scout = workflows.find((workflow) => workflow.packRole === 'scout')
  const scoutRun = scout && runs.find((run) => run.workflowId === scout.id)
  const routine = installed?.summary?.routineMinutes || '45'

  return <article className="career-pack-card" data-installed={Boolean(installed)}>
    <div className="career-pack-card__mark"><span>◎</span><i /></div>
    <div className="career-pack-card__copy"><small>Ambientic workflow pack · Career</small><h2>Career OS</h2><p>{installed ? `${routine}-minute daily routine for the opportunities most worth your time.` : CAREER_OS_PACK.description}</p><div className="career-pack-card__route"><span>Discover</span><i /> <span>Rank</span><i /> <span>Prepare</span><i /> <span>Learn</span></div></div>
    {installed
      ? <div className="career-pack-card__status"><span><i data-status={scoutRun?.status || 'idle'} />Installed · {scoutRun?.status === 'completed' ? `latest scan ${relativeTime(scoutRun.createdAt)}` : scoutRun ? statusLabel(scoutRun.status) : 'ready for its first run'}</span><b>{workflows.length} private routines installed</b><div><button type="button" onClick={() => { void onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>{copied ? 'Pack copied' : 'Copy pack'}</button><button type="button" onClick={onViewWorkflows}>View workflows</button><button className="primary" type="button" onClick={onOpenDashboard}>Open Career OS</button></div></div>
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

function CareerOpportunityCard ({ opportunity, onUpdate, onPass, onOpen }) {
  const [passing, setPassing] = useState(false)
  const jobUrl = opportunity.canonicalUrl || opportunity.sourceUrl
  return <article className="career-opportunity" data-status={opportunity.status}>
    <header><div><span>{opportunity.company}</span><h3>{opportunity.roleTitle}</h3></div><strong><b>{opportunity.opportunityScore}</b><small>Opportunity</small></strong></header>
    <div className="career-opportunity__facts"><span>{opportunity.remotePolicy}</span><span>{salaryLabel(opportunity)}</span><span>{opportunity.salaryConfidence} confidence</span><span>{opportunity.status}</span></div>
    <div className="career-opportunity__scores"><span><i style={{ '--score': `${opportunity.candidateFitScore}%` }} />Candidate fit <b>{opportunity.candidateFitScore}</b></span><span><i style={{ '--score': `${opportunity.careerFitScore}%` }} />Career fit <b>{opportunity.careerFitScore}</b></span></div>
    <div className="career-opportunity__reason"><section><span>Why it fits</span><ul>{(opportunity.whyFits || []).slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}{!opportunity.whyFits?.length && <li>Awaiting Judge analysis</li>}</ul></section><section><span>Concerns</span><ul>{(opportunity.concerns || []).slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}{!opportunity.concerns?.length && <li>No explicit concern recorded</li>}</ul></section></div>
    {opportunity.candidateEdge && <blockquote><span>Your edge</span>{opportunity.candidateEdge}</blockquote>}
    {passing && <div className="career-pass-reasons"><span>Why pass?</span>{PASS_REASONS.map((reason) => <button type="button" key={reason} onClick={() => { void onPass(opportunity.id, reason); setPassing(false) }}>{reason}</button>)}</div>}
    <footer><button className="job-link" type="button" disabled={!jobUrl} onClick={() => jobUrl && onOpen(jobUrl)}>{jobUrl ? 'View job ↗' : 'Link unavailable'}</button><button type="button" onClick={() => void onUpdate(opportunity.id, { status: 'Saved', nextAction: 'Review later' })}>Save</button><button type="button" onClick={() => setPassing((current) => !current)}>Pass</button><button className="primary" type="button" onClick={() => void onUpdate(opportunity.id, { status: 'Pursuing', nextAction: 'Run pursued-opportunity preparation' })}>Pursue</button></footer>
  </article>
}

function OpportunityLimitControl ({ value, onChange }) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : '')
  useEffect(() => { setDraft(value > 0 ? String(value) : '') }, [value])
  const apply = () => {
    const limit = Math.max(1, Math.min(1000, Number(draft) || 1))
    setDraft(String(limit))
    void onChange(limit)
  }
  return <div className="career-results-limit"><span>Results shown</span><button type="button" data-selected={value === 0} onClick={() => void onChange(0)}>All</button><form onSubmit={(event) => { event.preventDefault(); apply() }}><input aria-label="Maximum jobs shown" type="number" min="1" max="1000" value={draft} placeholder="Any number" onChange={(event) => setDraft(event.target.value)} /><button type="submit" disabled={!draft || Number(draft) === value}>Apply</button></form></div>
}

const PROFILE_LIST_FIELDS = [
  ['strongestAreas', 'Strongest areas'],
  ['achievements', 'Major achievements'],
  ['skills', 'Skills'],
  ['leadership', 'Leadership evidence'],
  ['projects', 'Projects'],
  ['technologies', 'Technologies'],
  ['domains', 'Domains'],
  ['uncertainties', 'Questions and conflicts']
]

function profileDraft (profile = {}) {
  return {
    headline: profile.headline || '',
    summary: profile.summary || '',
    yearsExperience: profile.yearsExperience ?? '',
    careerNarrative: profile.careerNarrative || '',
    sourceCoverage: profile.sourceCoverage || [],
    ...Object.fromEntries(PROFILE_LIST_FIELDS.map(([field]) => [field, (profile[field] || []).join('\n')]))
  }
}

function CareerProfileReview ({ profile, run, onClose, onSave, onApprove, onRun, onOpenAgent }) {
  const [draft, setDraft] = useState(() => profileDraft(profile))
  const [saving, setSaving] = useState(false)
  const hasProfile = Boolean(profile?.headline || profile?.summary)
  useEffect(() => { setDraft(profileDraft(profile)) }, [profile?.updatedAt])
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const payload = () => ({
    ...draft,
    yearsExperience: draft.yearsExperience === '' ? null : Number(draft.yearsExperience),
    ...Object.fromEntries(PROFILE_LIST_FIELDS.map(([field]) => [field, String(draft[field] || '').split('\n').map((item) => item.trim()).filter(Boolean)]))
  })
  const save = async () => {
    setSaving(true)
    try { await onSave(payload()) } finally { setSaving(false) }
  }
  const approve = async () => {
    setSaving(true)
    try { await onSave(payload()); await onApprove(); onClose() } finally { setSaving(false) }
  }

  return <div className="career-profile-review" role="dialog" aria-modal="true" aria-labelledby="career-profile-review-title">
    <div className="career-profile-review__panel">
      <header><div><span>Private Career Profile</span><h2 id="career-profile-review-title">Review what Career OS understood</h2><p>Correct the proposal before it becomes trusted ranking evidence. Nothing here is published or added to the shared pack.</p></div><button type="button" aria-label="Close profile review" onClick={onClose}>×</button></header>
      {run?.status === 'needs_attention' && <aside className="career-profile-review__attention"><div><b>The profile agent needs you</b><span>Resolve its permission or question in the agent thread, then this proposal will update automatically.</span></div><button type="button" onClick={onOpenAgent}>Open agent request ↗</button></aside>}
      {!hasProfile ? <main className="career-profile-review__empty"><b>No profile proposal is ready yet</b><p>{run?.status === 'failed' ? `The last build failed: ${run.error || 'Open its thread for details.'}` : 'Run the Profile Builder and this screen will fill with the evidence it extracted.'}</p><button type="button" disabled={['queued', 'running', 'needs_attention'].includes(run?.status)} onClick={onRun}>Run Profile Builder</button></main> : <main>
        <div className="career-profile-review__identity"><label><span>Headline</span><input value={draft.headline} onChange={(event) => set('headline', event.target.value)} /></label><label><span>Years of experience</span><input type="number" min="0" max="80" value={draft.yearsExperience} onChange={(event) => set('yearsExperience', event.target.value)} /></label></div>
        <label><span>Summary</span><textarea rows="5" value={draft.summary} onChange={(event) => set('summary', event.target.value)} /></label>
        <div className="career-profile-review__sources"><span>Evidence used</span>{draft.sourceCoverage.length ? draft.sourceCoverage.map((source) => <i key={source}>{source}</i>) : <small>No source labels were recorded.</small>}</div>
        <section>{PROFILE_LIST_FIELDS.map(([field, label]) => <label key={field}><span>{label}</span><textarea rows={field === 'achievements' || field === 'uncertainties' ? 6 : 4} value={draft[field]} onChange={(event) => set(field, event.target.value)} placeholder="One item per line" /></label>)}</section>
        <label><span>Career narrative</span><textarea rows="5" value={draft.careerNarrative} onChange={(event) => set('careerNarrative', event.target.value)} /></label>
      </main>}
      <footer><span>{profile?.status === 'reviewed' ? 'Reviewed profile' : 'Not used for ranking until approved'}</span><button type="button" onClick={onClose}>Close</button>{hasProfile && <button type="button" disabled={saving} onClick={() => void save()}>Save corrections</button>}{hasProfile && profile?.status !== 'reviewed' && <button className="primary" type="button" disabled={saving} onClick={() => void approve()}>{saving ? 'Saving…' : 'Approve profile'}</button>}</footer>
    </div>
  </div>
}

function CareerOsHome ({ snapshot, profileRun, onUpdate, onPass, onOpenJob, onUpdatePreferences, onRunScout, onRunDaily, onRunProfile, onSaveProfile, onApproveProfile, onOpenProfileAgent, scoutActive, dailyActive }) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const resultLimit = snapshot.preferences.resultsLimit ?? 0
  const allResults = snapshot.opportunities.filter((opportunity) => !['Archived', 'Rejected', 'Withdrawn'].includes(opportunity.status))
  const opportunities = resultLimit > 0 ? allResults.slice(0, resultLimit) : allResults
  const active = Object.entries(snapshot.pipeline).filter(([status]) => ['Saved', 'Pursuing', 'Application Ready', 'Applied', 'Recruiter Screen', 'Interview', 'Final Round'].includes(status)).reduce((sum, [, count]) => sum + count, 0)
  const interviewing = (snapshot.pipeline['Recruiter Screen'] || 0) + (snapshot.pipeline.Interview || 0) + (snapshot.pipeline['Final Round'] || 0)
  const hasProfile = Boolean(snapshot.profile?.headline || snapshot.profile?.summary)
  const profileBuildFailed = profileRun?.status === 'failed' && !hasProfile
  const profileNeedsAgent = profileRun?.status === 'needs_attention'
  const profileReviewed = snapshot.profile?.status === 'reviewed'

  return <section className="career-home" id="career-os-results">
    {reviewOpen && <CareerProfileReview profile={snapshot.profile} run={profileRun} onClose={() => setReviewOpen(false)} onSave={onSaveProfile} onApprove={onApproveProfile} onRun={onRunProfile} onOpenAgent={onOpenProfileAgent} />}
    <header><div><span>Career OS</span><h2>Good morning</h2><p><b>{snapshot.dailyQueue.minutes}-minute Career Daily</b> · {!profileReviewed ? 'Review your Career Profile to unlock ranking' : snapshot.dailyQueue.items.length ? `${snapshot.dailyQueue.items.length} high-value actions planned` : 'Your queue is waiting for its first market scan'}</p></div><button className="primary" type="button" disabled={dailyActive || !profileReviewed} onClick={onRunDaily}>{!profileReviewed ? 'Review profile first' : dailyActive ? 'Career Daily running' : 'Start Career Daily'}</button></header>
    <div className="career-profile-state" data-status={profileBuildFailed ? 'failed' : snapshot.profile?.status || 'pending'}><div><span>Career Profile</span><b>{snapshot.profile?.headline || (profileBuildFailed ? 'Profile build failed' : 'Mining your CV and selected context…')}</b><small>{profileNeedsAgent ? 'The profile agent needs a permission or answer before it can finish.' : snapshot.profile?.sourceCoverage?.length ? `Built from ${snapshot.profile.sourceCoverage.join(', ')}` : 'CV, LinkedIn, manual evidence, and selected Ambientic memories remain private on this Mac.'}</small></div>{snapshot.profile?.strongestAreas?.length > 0 && <ul>{snapshot.profile.strongestAreas.slice(0, 5).map((area) => <li key={area}>{area}</li>)}</ul>}<button type="button" onClick={() => setReviewOpen(true)}>{profileNeedsAgent ? 'Resolve & review' : snapshot.profile?.status === 'reviewed' ? 'Inspect profile' : 'Review profile'}</button><i>{profileNeedsAgent ? 'Agent needs you' : profileBuildFailed ? 'Failed' : snapshot.profile?.status === 'reviewed' ? 'Reviewed' : snapshot.profile?.status === 'needs_review' ? 'Needs review' : 'Building'}</i></div>
    <div className="career-home__summary">
      <section><span>Today</span>{snapshot.dailyQueue.items.length ? <ol>{snapshot.dailyQueue.items.map((item) => <li key={item.id}><span>{item.label}</span><b>{item.minutes} min</b></li>)}</ol> : <div className="career-home__empty"><b>{profileReviewed ? 'No ranked opportunities yet' : 'Your profile is waiting for review'}</b><p>{profileReviewed ? 'Run the market scan to search canonical ATS postings, normalize eligibility, and prepare the first shortlist.' : 'Review and approve the extracted evidence above before Career OS searches or ranks roles.'}</p><button type="button" disabled={scoutActive || !profileReviewed} onClick={onRunScout}>{!profileReviewed ? 'Review profile first' : scoutActive ? 'Market scan running' : 'Run first market scan'}</button></div>}</section>
      <aside><div><span>Market</span><b>{snapshot.market.processed || 0}</b><small>roles processed</small></div><div><span>Pipeline</span><b>{active}</b><small>active opportunities</small></div><div><span>Interviews</span><b>{interviewing}</b><small>processes moving</small></div></aside>
    </div>
    {allResults.length > 0 && <section className="career-home__opportunities"><header><div><span>Market results</span><small>Every discovered role remains available; ranking controls order, not access.</small></div><OpportunityLimitControl value={resultLimit} onChange={(resultsLimit) => onUpdatePreferences({ resultsLimit })} /></header><div>{opportunities.map((opportunity) => <CareerOpportunityCard key={opportunity.id} opportunity={opportunity} onUpdate={onUpdate} onPass={onPass} onOpen={onOpenJob} />)}</div><footer>Showing {opportunities.length} of {allResults.length} active roles from Career OS scans.</footer></section>}
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
  const careerProfile = careerWorkflows.find((workflow) => workflow.packRole === 'profile')
  const activeCareerRun = (workflow) => workflow && snapshot.runs.some((run) => run.workflowId === workflow.id && ACTIVE_STATUSES.has(run.status))
  const careerProfileRun = careerProfile && (snapshot.runs.find((run) => run.workflowId === careerProfile.id && ACTIVE_STATUSES.has(run.status)) || snapshot.runs.find((run) => run.workflowId === careerProfile.id))
  const careerProfileSessionId = careerProfileRun && (careerProfileRun.steps.find((step) => step.status === 'running')?.sessionId || [...careerProfileRun.steps].reverse().find((step) => step.sessionId)?.sessionId)

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
        <header className="workflow-library__header"><div><span>Workflow studio</span><h1>Workflows</h1><p>Install proven workflow packs or build your own, then run and monitor everything here.</p></div><button type="button" onClick={() => createWorkflow(createStarterWorkflow())}>＋ New workflow</button></header>
        <section className="workflow-library__section" id="installed-workflows">
          <header><div><span>Your workflows</span><small>{snapshot.workflows.length} installed and private on this Mac</small></div><div className="workflow-library__legend"><i data-status="running" />Running<i data-status="awaiting_approval" />Needs you<i data-status="completed" />Complete</div></header>
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
          {!loading && !snapshot.workflows.length && <div className="workflow-library__empty"><span>⌁</span><h2>No workflows installed yet</h2><p>Choose a pack from the catalog below or create your own.</p></div>}
        </section>
        {installedCareer && <CareerOsHome snapshot={career} profileRun={careerProfileRun} onUpdate={(id, patch) => window.controller.careerUpdateOpportunity(id, patch)} onPass={(id, reason) => window.controller.careerPassOpportunity(id, reason)} onOpenJob={(url) => window.controller.openExternalUrl(url)} onUpdatePreferences={(preferences) => window.controller.careerUpdatePreferences(preferences)} onRunScout={() => careerScout && window.controller.runWorkflow(careerScout.id)} onRunDaily={() => careerDaily && window.controller.runWorkflow(careerDaily.id)} onRunProfile={() => careerProfile && window.controller.runWorkflow(careerProfile.id)} onSaveProfile={(profile) => window.controller.careerUpdateProfile(profile)} onApproveProfile={() => window.controller.careerReviewProfile()} onOpenProfileAgent={() => careerProfileSessionId && onOpenThread?.(careerProfileSessionId)} scoutActive={activeCareerRun(careerScout)} dailyActive={activeCareerRun(careerDaily)} />}
        <form className="workflow-library__prompt" onSubmit={(event) => { event.preventDefault(); if (prompt.trim()) void createWorkflow(draftWorkflowFromPrompt(prompt)) }}>
          <span>✦</span><label><b>Build a new workflow with an agent</b><textarea rows="2" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Every weekday at 8:30, research competitor news, summarize it, let me approve, then email the brief…" /></label><button type="submit" disabled={!prompt.trim()}>Draft workflow ↑</button>
        </form>
        <section className="workflow-catalog">
          <header><div><span>Workflow catalog</span><small>Install complete outcomes; private context is added only during setup.</small></div><b>1 pack available</b></header>
          <CareerPackCard installed={installedCareer} workflows={careerWorkflows} runs={snapshot.runs} onInstall={() => setShowCareerSetup(true)} onViewWorkflows={() => document.getElementById('installed-workflows')?.scrollIntoView({ behavior: 'smooth' })} onOpenDashboard={() => document.getElementById('career-os-results')?.scrollIntoView({ behavior: 'smooth' })} onCopy={() => window.controller.copyText(JSON.stringify(portableWorkflowPack(CAREER_OS_PACK), null, 2))} />
        </section>
      </main>
      <RunTimeline runs={snapshot.runs} onOpenThread={onOpenThread} />
    </section>
  )
}
