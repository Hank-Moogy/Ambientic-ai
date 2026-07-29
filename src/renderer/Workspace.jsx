import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import './spend.css'
import './thread-filters.css'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AgentIcon } from './AgentIcon.jsx'
import './workspace.css'
import './auth.css'
import './improve.css'
import './onboarding.css'
import './composer-controls.css'
import { GoalsWorkspace } from './Goals.jsx'
import { organizeThreads } from './thread-order.mjs'
import { isNearThreadBottom } from './thread-scroll.mjs'
import { claudeAuthPresentation } from './provider-auth-ui.mjs'
import { taskCreationError } from './new-task-state.mjs'
import ambienticLogo from './assets/ambientic-logo.png'
import hermesAgentLogo from './assets/hermes-agent.png'

const stateLabel = { running: 'Running', waiting: 'Your move', attention: 'Needs input', idle: 'Idle', history: 'History' }
const providerCatalog = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'hermes', label: 'Hermes' }
]
const onboardingProviderCatalog = [
  ...providerCatalog,
  { id: 'kimi', label: 'Kimi Code' }
]
// Per-provider model and reasoning-intensity options, surfaced in the composer so
// a thread can be retuned without leaving the chat. Claude's entries are the
// aliases and effort levels its CLI accepts (`--model` / `--effort`); Codex's
// effort maps to the ACP collaboration mode's reasoning_effort. A provider absent
// from this map exposes no tuning, and the composer hides its controls entirely.
const providerTuning = {
  claude: {
    models: [
      { id: '', label: 'Default model' },
      { id: 'opus', label: 'Opus' },
      { id: 'sonnet', label: 'Sonnet' },
      { id: 'haiku', label: 'Haiku' }
    ],
    efforts: [
      { id: '', label: 'Default effort' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'X-high' },
      { id: 'max', label: 'Max' }
    ]
  },
  codex: {
    models: [],
    efforts: [
      { id: '', label: 'Default effort' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' }
    ]
  }
}

function ComposerTuning ({ provider, model, effort, disabled, onModel, onEffort }) {
  const tuning = providerTuning[provider]
  if (!tuning) return null
  return (
    <div className="composer-tuning">
      {tuning.models.length > 0 && (
        <label className="composer-tuning__field" title={`Model used for new ${provider} turns`}>
          <span>Model</span>
          <select value={model} disabled={disabled} onChange={(event) => onModel(event.target.value)}>
            {tuning.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      )}
      {tuning.efforts.length > 0 && (
        <label className="composer-tuning__field" title="Reasoning intensity for new turns">
          <span>Effort</span>
          <select value={effort} disabled={disabled} onChange={(event) => onEffort(event.target.value)}>
            {tuning.efforts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
const providerInstallUrls = {
  codex: 'https://developers.openai.com/codex/cli/',
  claude: 'https://docs.anthropic.com/en/docs/claude-code/setup',
  hermes: 'https://github.com/NousResearch/hermes-agent',
  kimi: 'https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html'
}

// A provider that can receive a handed-off task, near-limit threshold matching
// the main-process HandoverService.
const HANDOVER_PROVIDERS = ['codex', 'claude', 'hermes']
const HANDOVER_THRESHOLD = 85
const THREAD_INTERACTIONS_KEY = 'ambientic.thread-interactions.v1'
const LEGACY_THREAD_INTERACTIONS_KEY = 'agentbase.thread-interactions.v1'

function handoverLabel (provider, fallback) {
  return provider === 'claude' ? 'Claude' : (fallback || provider)
}

// Connected, manageable providers other than the current one — valid handoff targets.
function handoverTargets (connectors, currentProvider) {
  return (connectors || [])
    .filter((connector) => HANDOVER_PROVIDERS.includes(connector.id) && connector.id !== currentProvider && connector.installed && connector.manageable !== false)
    .map((connector) => ({ id: connector.id, label: handoverLabel(connector.id, connector.label) }))
}

// Highest used-percent across a provider's quota windows, or null when unknown.
function providerRiskPercent (usage, provider) {
  const values = (usage?.providers?.[provider]?.windows || [])
    .map((window) => Number(window.usedPercent))
    .filter((value) => Number.isFinite(value))
  return values.length ? Math.max(...values) : null
}

function sessionTitle (session) {
  return session.task || session.summary || session.project || `${session.agent || 'Agent'} session`
}

function EmptyThread ({ onCreate }) {
  return (
    <div className="workspace-empty">
      <div className="workspace-empty__mark"><img src={ambienticLogo} alt="" /></div>
      <h2>Your agents, one surface.</h2>
      <p>Select an existing task or start a managed Codex, Claude Code, or Hermes task using the provider login already on this Mac.</p>
      <button type="button" onClick={onCreate}>New agent task</button>
    </div>
  )
}

function MarkdownLink ({ href, children }) {
  const external = /^(?:https?:|mailto:)/i.test(href || '')
  if (!external) return <span className="markdown-link--unavailable" title={href}>{children}</span>
  return <a href={href} onClick={(event) => { event.preventDefault(); window.controller.openExternalUrl(href) }}>{children}<span aria-hidden="true">↗</span></a>
}

const markdownComponents = {
  a: MarkdownLink,
  input: ({ node: _node, ...props }) => <input {...props} disabled />,
  img: ({ src, alt }) => <a href={src} onClick={(event) => { event.preventDefault(); window.controller.openExternalUrl(src) }}>{alt || 'Open image'}<span aria-hidden="true">↗</span></a>
}

const MarkdownMessageBody = memo(function MarkdownMessageBody ({ text }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</Markdown>
})

function Message ({ item, providerLabel }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await window.controller.copyText(item.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  if (item.role === 'activity') {
    return (
      <details className="activity" open={item.status === 'inProgress'}>
        <summary><span>{item.kind === 'files' ? '↗' : item.kind === 'command' ? '›_' : '◇'}</span>{item.title || 'Agent activity'}<em>{item.status || ''}</em></summary>
        {item.text && <pre>{item.text}</pre>}
      </details>
    )
  }
  return (
    <article className="message" data-role={item.role}>
      <div className="message__role"><span>{item.role === 'user' ? 'You' : providerLabel || 'Agent'}</span><button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
      <div className="message__text"><MarkdownMessageBody text={item.text} /></div>
    </article>
  )
}

function ComposerDraft ({
  sessionId,
  canManage,
  canSteer,
  running,
  providerLabel,
  mode,
  hasAttachments,
  controls,
  onSend,
  onInterrupt
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setDraft('')
    setSending(false)
  }, [sessionId])

  const submit = async () => {
    const value = draft.trim()
    if (sending || (!value && !hasAttachments)) return
    setDraft('')
    setSending(true)
    const sent = await onSend(value)
    setSending(false)
    if (!sent && value) setDraft((current) => current || value)
  }

  return (
    <>
      <textarea
        value={draft}
        disabled={!canManage || sending}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        placeholder={!canManage ? `${providerLabel || 'This provider'} cannot receive managed prompts` : `Message ${providerLabel || 'agent'}…`}
      />
      <div className="composer-footer">
        {controls}
        <span>{sending ? 'Starting agent…' : canSteer ? 'Codex is working · send to steer this turn' : running ? 'Agent is working…' : `${mode === 'plan' ? 'Plan mode · planning requested' : mode === 'ask' ? 'Ask mode · answer only' : 'Build mode · implementation allowed'} · Enter to send`}</span>
        {canSteer && <button className="send" type="button" disabled={sending || (!draft.trim() && !hasAttachments)} title="Add guidance to the running Codex turn" onClick={() => void submit()}>↑</button>}
        {running ? <button className="stop" type="button" title="Stop this turn" onClick={onInterrupt}>■</button> : !canSteer && <button className="send" type="button" disabled={sending || (!draft.trim() && !hasAttachments)} onClick={() => void submit()}>↑</button>}
      </div>
    </>
  )
}

function CopyThreadButton ({ thread }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const transcript = (thread?.messages || [])
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => `${item.role === 'user' ? 'You' : thread.providerLabel || 'Agent'}:\n${item.text}`)
      .join('\n\n')
    await window.controller.copyText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return <button type="button" disabled={!thread?.messages?.some((item) => item.role === 'user' || item.role === 'assistant')} onClick={copy}>{copied ? 'Copied' : 'Copy chat'}</button>
}

function RenameThreadButton ({ thread, onRenamed }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => {
    setEditing(false)
    setValue(thread?.title || '')
  }, [thread?.id])
  const submit = async (event) => {
    event.preventDefault()
    const title = value.replace(/\s+/g, ' ').trim()
    if (!title) return
    const result = await window.controller.renameThread(thread.id, title)
    onRenamed(result.title)
    setEditing(false)
  }
  if (!editing) return <button type="button" onClick={() => { setValue(thread?.title || ''); setEditing(true) }}>Rename</button>
  return <form className="thread-rename" onSubmit={submit}><input value={value} onChange={(event) => setValue(event.target.value)} maxLength={80} autoFocus onFocus={(event) => event.target.select()} onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false) }} /><button type="button" onClick={() => setEditing(false)}>Cancel</button><button className="primary" type="submit" disabled={!value.trim()}>Save</button></form>
}

// Header action: move this task's context to another connected agent.
function HandoverControl ({ thread, connectors, onHandover }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  useEffect(() => { setOpen(false); setBusy('') }, [thread?.id])
  const targets = handoverTargets(connectors, thread?.provider)
  if (!thread?.managed || !targets.length) return null
  const run = async (provider) => {
    setBusy(provider)
    try { await onHandover(provider) } finally { setBusy(''); setOpen(false) }
  }
  if (!open) return <button type="button" title="Move this task's full context to another agent" onClick={() => setOpen(true)}>Hand off →</button>
  return <span className="handover-picker">{targets.map((target) => <button key={target.id} type="button" className="primary" disabled={Boolean(busy)} onClick={() => run(target.id)}>{busy === target.id ? 'Starting…' : target.label}</button>)}<button type="button" disabled={Boolean(busy)} onClick={() => setOpen(false)}>Cancel</button></span>
}

// In-thread banner shown when the current provider is near its rate limit,
// offering one-click handover to the least-loaded connected provider.
function HandoverBanner ({ thread, connectors, usage, onHandover }) {
  const [busy, setBusy] = useState(false)
  const percent = providerRiskPercent(usage, thread?.provider)
  const targets = handoverTargets(connectors, thread?.provider)
  if (!thread?.managed || percent === null || percent < HANDOVER_THRESHOLD || !targets.length) return null
  const suggestion = targets.slice().sort((a, b) => (providerRiskPercent(usage, a.id) ?? 0) - (providerRiskPercent(usage, b.id) ?? 0))[0]
  const run = async () => { setBusy(true); try { await onHandover(suggestion.id) } finally { setBusy(false) } }
  return (
    <div className="handover-banner" data-tone="critical">
      <div><b>{thread.providerLabel || thread.provider} is at {Math.round(percent)}% of its limit</b><small>Hand this task off with its full context so the work continues without interruption.</small></div>
      <button type="button" className="primary" disabled={busy} onClick={run}>{busy ? 'Handing off…' : `Hand off to ${suggestion.label}`}</button>
    </div>
  )
}

function ThreadPreview ({ state, onPresent }) {
  const previews = state?.active || []
  if (!previews.length) return <div className="no-artifacts">No linked preview found for this task yet.</div>
  return (
    <div className="thread-previews">
      {previews.map((preview) => <button key={preview.id} type="button" onClick={onPresent}><span>{preview.type === 'browser' ? '◉' : preview.type === 'ios' ? '◇' : '▣'}</span><div><b>{preview.label || 'Agent preview'}</b><small>{preview.detail || (preview.type === 'browser' ? 'Local web preview' : 'Running app preview')}</small></div><em>Show</em></button>)}
    </div>
  )
}

function Approval ({ approval, onResolve }) {
  return (
    <section className="approval">
      <div><b>Permission requested</b><span>{approval.title}</span>{approval.detail && <code>{typeof approval.detail === 'string' ? approval.detail : JSON.stringify(approval.detail)}</code>}</div>
      <div className="approval__actions">
        <button type="button" onClick={() => onResolve(approval.id, false)}>Deny</button>
        <button type="button" className="primary" onClick={() => onResolve(approval.id, true)}>Allow once</button>
        {approval.canRemember && <button type="button" onClick={() => onResolve(approval.id, true, true)}>Always allow</button>}
      </div>
    </section>
  )
}

function NewTask ({ connectors, initialProvider, onClose, onCreate }) {
  const taskConnectors = connectors.filter((item) => item.taskCapable !== false && providerCatalog.some((provider) => provider.id === item.id))
  const [provider, setProvider] = useState(initialProvider || taskConnectors.find((item) => item.manageable !== false)?.id || 'codex')
  const [cwd, setCwd] = useState('')
  const [prompt, setPrompt] = useState('')
  const [recentProjects, setRecentProjects] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedConnector = taskConnectors.find((item) => item.id === provider)
  const providerReady = Boolean(selectedConnector?.installed && selectedConnector.manageable !== false)
  const selectedProject = recentProjects.find((project) => project.cwd === cwd)
  const selectedProjectName = selectedProject?.name || cwd.split(/[\\/]/).filter(Boolean).at(-1) || 'Existing project'
  useEffect(() => {
    if (providerReady) return
    const fallback = taskConnectors.find((item) => item.installed && item.manageable !== false)
    if (fallback && fallback.id !== provider) setProvider(fallback.id)
  }, [provider, providerReady, taskConnectors])
  useEffect(() => {
    window.controller.getRecentProjects().then(setRecentProjects).catch(() => setRecentProjects([]))
  }, [])
  const chooseFolder = async () => {
    setError('')
    try {
      const selected = await window.controller.chooseProjectFolder()
      if (selected) setCwd(selected)
      return selected || ''
    } catch (cause) {
      setError(taskCreationError(cause))
      return ''
    }
  }
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!providerReady) {
      setError('Connect a supported provider before starting this task.')
      return
    }
    setBusy(true)
    try {
      await onCreate({ provider, cwd: cwd.trim(), prompt })
    } catch (cause) {
      setError(taskCreationError(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="new-task" onSubmit={submit}>
        <header><div><span>New managed task</span><h2>Put an agent to work</h2></div><button type="button" onClick={onClose}>×</button></header>
        <label>Provider<div className="provider-choices">
          {taskConnectors.map((connector) => <button key={connector.id} type="button" data-selected={provider === connector.id} disabled={!connector.installed || connector.manageable === false} title={connector.authMessage || ''} onClick={() => setProvider(connector.id)}><AgentIcon agent={connector.id} /><span>{connector.label}<small>{!connector.installed ? 'Not installed' : connector.manageable === false ? 'Run /login first' : 'Uses local login'}</small></span></button>)}
        </div></label>
        <label>First prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What should this agent do? (optional)" autoFocus /></label>
        <section className="new-task-work-area">
          <div><span>Work area · Optional</span><b>{cwd ? selectedProjectName : 'New private workspace'}</b><small>{cwd || 'Ambientic creates a clean local folder automatically. Choose a project only when the agent needs existing files.'}</small></div>
          <button type="button" onClick={chooseFolder}>{cwd ? 'Change' : 'Use existing project'}</button>
        </section>
        {!cwd && recentProjects.length > 0 && <div className="new-task-recents"><span>Recent</span>{recentProjects.map((project) => <button type="button" key={project.cwd} title={project.cwd} onClick={() => { setCwd(project.cwd); setError('') }}>{project.name}</button>)}</div>}
        {cwd && <button className="new-task-private" type="button" onClick={() => { setCwd(''); setError('') }}>Use a new private workspace instead</button>}
        {error && <div className="new-task__error" role="alert"><span>!</span><p>{error}</p></div>}
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !providerReady} type="submit">{busy ? 'Starting…' : providerReady ? 'Start task' : 'Connect a provider first'}</button></footer>
      </form>
    </div>
  )
}

function compactUsage (usage, providerId) {
  const provider = usage?.providers?.[providerId]
  const windows = provider?.windows || []
  const window = windows.find((item) => item.period === 'short') || windows[0]
  if (Number.isFinite(window?.usedPercent)) return `${Math.round(window.usedPercent)}% used`
  if (provider?.activity?.available) return `${provider.activity.weekly.messages} msgs this week`
  return 'Local account'
}

function resetLabel (window) {
  if (!window?.resetAt) return window?.resetText ? `Resets ${window.resetText}` : ''
  const minutes = Math.max(0, Math.ceil((window.resetAt * 1000 - Date.now()) / 60000))
  if (minutes < 60) return `Resets in ${minutes}m`
  if (minutes < 24 * 60) return `Resets in ${Math.floor(minutes / 60)}h`
  return `Resets in ${Math.floor(minutes / (24 * 60))}d`
}

// Live countdown to a window's reset, e.g. "resets in 3h 24m". `now` is passed
// in so a ticking parent re-renders it.
function formatCountdown (window, now) {
  if (!window) return ''
  if (!Number.isFinite(window.resetAt)) return window.resetText ? `resets ${window.resetText}` : ''
  const ms = window.resetAt * 1000 - now
  if (ms <= 0) return 'resetting…'
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const span = days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`
  return `resets in ${span}`
}

function quotaWindowLabel (window, fallback) {
  const minutes = Number(window?.durationMins)
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback
  if (minutes < 60) return `${minutes}m`
  if (minutes < 24 * 60 && minutes % 60 === 0) return `${minutes / 60}h`
  if (minutes === 24 * 60) return 'Day'
  if (minutes % (7 * 24 * 60) === 0) return minutes === 7 * 24 * 60 ? 'Week' : `${minutes / (7 * 24 * 60)}w`
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`
  return fallback
}

function ConsumptionMeter ({ label, window }) {
  const used = Number.isFinite(window?.usedPercent) ? Math.round(window.usedPercent) : null
  const tone = used >= 85 ? 'critical' : used >= 65 ? 'warning' : 'normal'
  return (
    <div className="consumption-meter" data-tone={tone} data-empty={used === null} title={window ? `${label}: ${used}% used. ${resetLabel(window)}` : `${label} unavailable`}>
      <div><span>{label}</span><b>{used === null ? '—' : `${used}%`}</b></div>
      <span className="consumption-meter__track"><i style={{ '--meter-value': `${used || 0}%` }} /></span>
    </div>
  )
}

function ConsumptionBoard ({ sessions, usage, onRefresh }) {
  const providers = ['codex', 'claude']
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const activityFor = (providerId) => {
    const providerSessions = sessions.filter((session) => session.agent === providerId)
    return {
      weekly: providerSessions.filter((session) => Number(session.updatedAt || session.lastSeen || 0) >= weekCutoff).length,
      total: providerSessions.length
    }
  }
  const hermesActivity = activityFor('hermes')
  return (
    <section className="consumption-board">
      <header><div><span>Consumption</span><b>Rate-limit capacity</b></div><button type="button" data-refreshing={Boolean(usage?.refreshing)} onClick={onRefresh} title="Refresh provider limits">↻</button></header>
      <div className="consumption-board__rows">
        {providers.map((providerId) => {
          const provider = usage?.providers?.[providerId]
          const short = provider?.windows?.find((window) => window.period === 'short')
          const week = provider?.windows?.find((window) => window.period === 'week' && /all models|weekly/i.test(window.label)) || provider?.windows?.find((window) => window.period === 'week')
          const noQuotaData = provider?.status === 'error' && !provider?.windows?.length
          const localActivity = activityFor(providerId)
          // Preserve real local activity whenever current quota windows have not
          // synced, while keeping sign-in and collector failures explicit.
          const usageActivity = provider?.activity
          if (usageActivity?.available && !short && !week) {
            const signedOut = provider?.quotaStatus === 'CLAUDE_LOGIN_REQUIRED'
            return <div className="consumption-row" key={providerId} data-provider={providerId} title={provider?.quotaError || 'Showing recorded local activity until provider limits sync.'}><span className="consumption-row__agent"><AgentIcon agent={providerId} /></span><div className="consumption-row__identity"><b>{providerId === 'codex' ? 'Codex' : 'Claude Code'}</b><small>{signedOut ? 'Sign in to sync plan limits' : 'Limits not synced · activity fallback'}</small></div><div className="consumption-activity"><b>{usageActivity.weekly.messages}</b><span>messages this week</span></div><div className="consumption-activity"><b>{usageActivity.weekly.sessions}</b><span>sessions this week</span></div></div>
          }
          if (noQuotaData) return <div className="consumption-row" key={providerId} data-provider={providerId} title={provider?.error || ''}><span className="consumption-row__agent"><AgentIcon agent={providerId} /></span><div className="consumption-row__identity"><b>{providerId === 'codex' ? 'Codex' : 'Claude Code'}</b><small>Limits unavailable · local activity</small></div><div className="consumption-activity"><b>{localActivity.weekly}</b><span>sessions this week</span></div><div className="consumption-activity"><b>{localActivity.total}</b><span>tracked locally</span></div></div>
          const providerDetail = provider?.status === 'error'
            ? 'Unavailable'
            : provider?.status === 'stale'
                ? 'Last known'
                : provider?.status === 'ok'
                    ? `${provider.plan || 'Subscription'}${!short && week ? ' · no short window provided' : ''}`
                    : 'Fetching limits…'
          const resetCount = providerId === 'codex' && Number.isFinite(provider?.resetCredits?.availableCount) ? ` · ${provider.resetCredits.availableCount} reset${provider.resetCredits.availableCount === 1 ? '' : 's'} available` : ''
          return <div className="consumption-row" key={providerId} data-provider={providerId}><span className="consumption-row__agent"><AgentIcon agent={providerId} /></span><div className="consumption-row__identity"><b>{providerId === 'codex' ? 'Codex' : 'Claude Code'}</b><small>{providerDetail}{resetCount}</small></div><ConsumptionMeter label={quotaWindowLabel(short, 'Short')} window={short} /><ConsumptionMeter label={quotaWindowLabel(week, 'Week')} window={week} /></div>
        })}
        <div className="consumption-row" data-provider="hermes"><span className="consumption-row__agent"><AgentIcon agent="hermes" /></span><div className="consumption-row__identity"><b>Hermes</b><small>No quota API · local activity</small></div><div className="consumption-activity"><b>{hermesActivity.weekly}</b><span>sessions this week</span></div><div className="consumption-activity"><b>{hermesActivity.total}</b><span>tracked locally</span></div></div>
      </div>
      <footer><span>{usage?.updatedAt ? `Updated ${new Date(usage.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Reading local provider accounts'}</span><span>Used · 100% is the provider limit</span></footer>
    </section>
  )
}

function activityLabel (event) {
  if (event.type === 'reset-used') return `Reset used · ${event.beforePercent}% → ${event.afterPercent}%`
  if (event.type === 'limit-hit') return `Rate limit reached · ${event.usedPercent}%`
  if (event.type === 'credits-added') return `${event.amount} provider credits added`
  if (event.type === 'credits-used') return `${event.amount} provider credits used`
  if (event.type === 'window-reset') return `Quota window renewed · ${event.beforePercent}% → ${event.afterPercent}%`
  return `Quota reset observed · ${event.beforePercent}% → ${event.afterPercent}%`
}

function SpendActivity ({ ledger }) {
  const summary = ledger?.summary
  const recent = [...(ledger?.events || [])].reverse().slice(0, 4)
  const codexBalance = summary?.currentBalances?.codex
  return (
    <section className="spend-activity">
      <header><div><span className="eyebrow">Capacity history</span><h2>AI usage & spend signals</h2></div><p>Ambientic records observed provider changes locally. Currency spend appears only when a provider billing connection supplies it.</p></header>
      <div className="spend-activity__metrics">
        <div><b>{summary?.limitHits || 0}</b><span>limit hits observed</span></div>
        <div data-tone="reset"><b>{summary?.resetUses || 0}</b><span>resets used</span></div>
        <div><b>{summary?.creditsUsed || 0}</b><span>provider credits used</span></div>
        <div><b>{Number.isFinite(codexBalance) ? codexBalance : '—'}</b><span>current Codex credits</span></div>
      </div>
      <div className="spend-activity__timeline">
        {recent.map((event) => <div key={event.id} data-type={event.type}><span className="spend-activity__provider"><AgentIcon agent={event.provider} /></span><div><b>{activityLabel(event)}</b><small>{event.provider} · {new Date(event.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{event.confidence === 'inferred' ? ' · inferred' : ''}</small></div></div>)}
        {!recent.length && <div className="spend-activity__empty">No capacity changes recorded yet. Ambientic will keep a local history from this point forward.</div>}
      </div>
      <footer><span><i data-state="exact" /> Codex: quota, resets, credit balance</span><span><i /> Claude: quota where exposed</span><span><i /> Hermes: upstream billing needed</span></footer>
    </section>
  )
}

function OverviewUsageBalance ({ sessions, connectors, usage, onRefresh }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [])
  const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const providerRows = ['codex', 'claude', 'hermes'].map((providerId) => {
    const provider = usage?.providers?.[providerId]
    const windows = provider?.windows || []
    // Both providers expose a short (5-hour) and a weekly window; show both the
    // same way. Fall back to recorded activity when there is no rate-limit API.
    const short = windows.find((window) => window.period === 'short')
    const week = windows.find((window) => window.period === 'week') || windows.find((window) => window.period && window.period !== 'short')
    const hasGauges = Boolean(short || week)
    const activity = provider?.activity
    const connector = connectors.find((item) => item.id === providerId)
    const recent = sessions.filter((session) => session.agent === providerId && Number(session.updatedAt || session.lastSeen || 0) >= weekCutoff).length
    const name = providerId === 'codex' ? 'Codex' : providerId === 'claude' ? 'Claude Code' : 'Hermes'
    const detail = hasGauges
      ? `${provider.plan || 'Subscription'} · live limits`
      : providerId === 'claude' && connector?.manageable === false
        ? 'Sign in to sync Pro or Max plan limits'
      : provider?.quotaError
        ? provider.quotaError
      : activity?.available
        ? `${activity.weekly.messages} messages · ${activity.weekly.sessions} sessions this week`
        : provider?.error || `${recent} active this week`
    return { providerId, name, short, week, hasGauges, detail }
  })
  return (
    <section className="overview-usage">
      <header><div><span>Provider balance</span><b>Capacity at a glance</b></div><button type="button" aria-label="Refresh provider usage" title="Refresh provider usage" data-refreshing={Boolean(usage?.refreshing)} disabled={Boolean(usage?.refreshing)} onClick={onRefresh}>↻</button></header>
      <div className="overview-usage__rows">
        {providerRows.map(({ providerId, name, short, week, hasGauges, detail }) => (
          <div className="overview-usage__row" key={providerId} data-provider={providerId}>
            <div className="overview-usage__head">
              <span className="overview-usage__icon"><AgentIcon agent={providerId} /></span>
              <div><b>{name}</b><small title={detail}>{detail}</small></div>
            </div>
            {hasGauges && (
              <div className="overview-usage__meters">
                <div className="overview-usage__gauge"><ConsumptionMeter label={quotaWindowLabel(short, '5h')} window={short} /><span className="overview-usage__reset">{formatCountdown(short, now)}</span></div>
                <div className="overview-usage__gauge"><ConsumptionMeter label={quotaWindowLabel(week, 'Week')} window={week} /><span className="overview-usage__reset">{formatCountdown(week, now)}</span></div>
              </div>
            )}
          </div>
        ))}
      </div>
      <footer>5-hour and weekly limits · detailed spend in Settings</footer>
    </section>
  )
}

function OverviewProviderMark ({ provider }) {
  if (provider === 'hermes') {
    return (
      <span
        className="provider-pad__hermes-art"
        style={{ '--hermes-art': `url(${hermesAgentLogo})` }}
        role="img"
        aria-label="Hermes"
      />
    )
  }
  return <AgentIcon agent={provider} />
}

function ProviderPad ({ connector, sessions, usage, index, onOpenProvider }) {
  const providerSessions = sessions.filter((session) => session.agent === connector.id)
  const active = providerSessions.filter((session) => session.state === 'running').length
  const needsInput = providerSessions.filter((session) => ['waiting', 'attention'].includes(session.state)).length
  const unavailable = !connector.checking && (!connector.installed || connector.manageable === false)
  const status = connector.checking ? 'Checking local connection' : !connector.installed ? 'Not installed' : connector.manageable === false ? 'Login required' : active ? `${active} active` : needsInput ? `${needsInput} need you` : 'Ready'
  return (
    <button className="provider-pad" data-provider={connector.id} data-unavailable={unavailable} style={{ '--float-delay': `${index * -2.3}s` }} type="button" aria-label={`Open latest ${connector.label} threads`} onClick={() => onOpenProvider(connector.id)}>
      <span className="provider-pad__glow" />
      <header>
        <span className="provider-pad__icon"><OverviewProviderMark provider={connector.id} /></span>
        <div className="provider-pad__name"><b>{connector.label}</b><small>{status}</small></div>
        <i data-state={active ? 'running' : needsInput ? 'attention' : unavailable ? 'history' : 'idle'} />
      </header>
      <footer><span>{providerSessions.length} task{providerSessions.length === 1 ? '' : 's'}</span><span>{compactUsage(usage, connector.id)}</span></footer>
    </button>
  )
}

function ThreadMosaicCard ({ session, index, onOpen }) {
  return (
    <button className="mosaic-card" data-session-state={session.state} data-size={index % 7 === 0 ? 'wide' : index % 5 === 0 ? 'tall' : 'standard'} type="button" onClick={() => onOpen(session.id)}>
      <header><span className="mosaic-card__agent"><AgentIcon agent={session.agent} /></span><span>{session.agent}</span><i data-state={session.state} /></header>
      <h3>{sessionTitle(session)}</h3>
      <p>{session.summary || (session.history ? 'A conversation from your local agent history.' : 'Live local agent task.')}</p>
      <footer><span>{session.project || 'Local task'}</span><span>{stateLabel[session.state] || session.state} →</span></footer>
    </button>
  )
}

function Dashboard ({ sessions, connectors, usage, midi, ambientMode, onCreate, onOpenThreads, onOpenProvider, onOpenThread, onVibe, onRefreshUsage, onToggleAmbientMode }) {
  const live = sessions.filter((session) => !session.history)
  const active = live.filter((session) => session.state === 'running').length
  const needsInput = live.filter((session) => ['waiting', 'attention'].includes(session.state)).length
  const historyCount = sessions.filter((session) => session.history).length
  const providerCards = providerCatalog.map((provider) => connectors.find((connector) => connector.id === provider.id) || { ...provider, checking: true })
  return (
    <section className="dashboard">
      <header className="dashboard-topbar"><span>Agent operating system</span><div><button type="button" onClick={onOpenThreads}>All threads</button><button className="dashboard-topbar__ambient" type="button" data-active={Boolean(ambientMode.enabled)} aria-pressed={Boolean(ambientMode.enabled)} title={ambientMode.enabled ? 'Ambient mode is keeping this Mac awake while the display may sleep.' : 'Keep this Mac awake so agents can continue working.'} onClick={() => onToggleAmbientMode(!ambientMode.enabled)}><i />Ambient mode · {ambientMode.enabled ? 'On' : 'Off'}</button><button className="dashboard-topbar__vibe" type="button" disabled={!midi.connected} data-active={Boolean(midi.vibeActive)} title="Play the next APC composition · ⌘⇧V" onClick={onVibe}><i />Vibe</button></div></header>
      <div className="dashboard-scroll">
        <section className="dashboard-hero">
          <div className="dashboard-hero__copy"><span className="eyebrow"><i /> Local intelligence, online</span><h1>Your agents,<br /><em>in one field.</em></h1><p>See who is working, who needs you, and where to send the next idea—without starting from a chat list.</p><div className="dashboard-statline"><span><b>{active}</b> active</span><span><b>{needsInput}</b> need input</span><span><b>{sessions.length}</b> threads</span><span><b>{midi.connected ? 'On' : 'Off'}</b> {midi.shortModel || 'APC'}</span></div></div>
          <OverviewUsageBalance sessions={sessions} connectors={connectors} usage={usage} onRefresh={onRefreshUsage} />
        </section>

        <section className="provider-field" aria-label="Agent providers">
          {providerCards.map((connector, index) => <ProviderPad key={connector.id} connector={connector} sessions={sessions} usage={usage} index={index} onOpenProvider={onOpenProvider} />)}
          <button className="provider-pad provider-pad--new" type="button" onClick={() => onCreate('')}><span className="provider-pad--new__plus">＋</span><b>Create an agent task</b><small>Choose a provider and start</small></button>
        </section>

        <section className="mosaic-section">
          <header><div><span className="eyebrow">Across every provider</span><h2>Your agent mosaic</h2></div><div className="mosaic-legend"><span><i data-state="running" />Active</span><span><i data-state="attention" />Needs you</span><span><i data-state="idle" />Idle</span><span><i data-state="history" />History</span></div></header>
          <div className="thread-mosaic">{sessions.map((session, index) => <ThreadMosaicCard key={session.id} session={session} index={index} onOpen={onOpenThread} />)}</div>
          {!sessions.length && <div className="mosaic-empty">Your first agent task will appear here.</div>}
          <footer className="mosaic-summary"><span>{live.length} live or recent</span><span>{historyCount} from local history</span></footer>
        </section>
      </div>
    </section>
  )
}

function ambientDurationLabel (minutes) {
  if (minutes < 60) return `${minutes} minutes`
  const hours = minutes / 60
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

function AmbientModeSettings ({ ambientMode, onToggle, onCheckInChange }) {
  return (
    <div className="ambient-settings">
      <div className="provider-settings__intro"><span className="eyebrow"><i /> Uninterrupted local work</span><h2>Let your agents keep moving.</h2><p>Ambient mode prevents automatic idle sleep while allowing the display to turn off. It never edits macOS Energy settings, and it ends immediately when Ambientic quits.</p></div>
      <section className="ambient-settings__card" data-active={Boolean(ambientMode.enabled)}>
        <span className="ambient-settings__orb"><i /></span>
        <div><span>{ambientMode.enabled ? 'Mac kept awake' : 'Normal sleep behavior'}</span><h3>Ambient mode is {ambientMode.enabled ? 'on' : 'off'}</h3><p>{ambientMode.enabled ? 'Your agents can continue working in the background. Closing the lid or choosing Sleep still puts the Mac to sleep.' : 'The Mac follows its normal automatic sleep schedule.'}</p></div>
        <button type="button" data-active={Boolean(ambientMode.enabled)} onClick={() => onToggle(!ambientMode.enabled)}>{ambientMode.enabled ? 'Turn off' : 'Turn on'}</button>
      </section>
      <section className="ambient-settings__safety">
        <div><span>Safety check-in</span><h3>Ask before leaving it on too long</h3><p>Ambientic will check whether you still want Ambient mode after this interval. It will not interrupt unattended agents if you do not respond.</p></div>
        <label>Remind me after<select value={ambientMode.checkInMinutes || 240} onChange={(event) => onCheckInChange(Number(event.target.value))}>{(ambientMode.availableCheckIns || [30, 60, 120, 240, 480, 720]).map((minutes) => <option key={minutes} value={minutes}>{ambientDurationLabel(minutes)}</option>)}</select></label>
      </section>
      <div className="ambient-settings__notes"><span>◇</span><p><b>No elevated permission.</b> Ambientic uses the operating system’s temporary power assertion through Electron. It does not simulate input, change system settings, or run a detached keep-awake script.</p></div>
    </div>
  )
}

function AmbientModeCheckIn ({ ambientMode, onContinue, onTurnOff }) {
  if (!ambientMode.checkInDue) return null
  const elapsed = ambientMode.startedAt ? Math.max(1, Math.round((Date.now() - ambientMode.startedAt) / 3_600_000)) : 0
  return (
    <div className="modal-backdrop ambient-checkin">
      <section>
        <span className="ambient-checkin__orb"><i /></span>
        <span className="eyebrow">Ambient mode check-in</span>
        <h2>Still flowing?</h2>
        <p>Ambient mode has kept this Mac awake for about {elapsed} hour{elapsed === 1 ? '' : 's'}. Keep it running for another {ambientDurationLabel(ambientMode.checkInMinutes || 240)}, or return to normal sleep behavior.</p>
        <small>If you do nothing, Ambient mode remains on so active agents are not interrupted.</small>
        <footer><button type="button" onClick={onTurnOff}>Turn off</button><button className="primary" type="button" onClick={onContinue}>Keep running</button></footer>
      </section>
    </div>
  )
}


function ClaudeAuthWizard ({ auth, onInput, onCancel, onRetry, onClose }) {
  const [answer, setAnswer] = useState('')
  const outputRef = useRef(null)
  const lastSubmittedRef = useRef('')
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [auth.output])
  useEffect(() => {
    if (auth.phase === 'code') lastSubmittedRef.current = ''
  }, [auth.phase])
  const send = (value = answer) => {
    const clean = value.replace(/[\r\n]/g, '').trim()
    if (!clean || clean === lastSubmittedRef.current) return
    lastSubmittedRef.current = clean
    onInput({ text: clean })
    setAnswer('')
  }
  const finished = ['connected', 'failed', 'cancelled'].includes(auth.status)
  const phase = auth.phase || 'starting'
  const progress = auth.status === 'connected'
    ? 'Authentication confirmed'
    : auth.status === 'failed'
        ? 'Authentication was not completed'
        : phase === 'code'
            ? 'One last step'
            : phase === 'verifying'
                ? 'Verifying your account…'
                : phase === 'browser'
                    ? 'Waiting for browser sign-in'
                    : auth.status === 'starting'
                        ? 'Starting Claude Code…'
                        : 'Preparing the official sign-in'
  return (
    <div className="claude-auth-backdrop">
      <section className="claude-auth-wizard" data-status={auth.status}>
        <header><span className="provider-account__icon"><AgentIcon agent="claude" /></span><div><small>Official Claude Code connection</small><h2>{auth.status === 'connected' ? 'Claude is connected' : auth.status === 'failed' ? 'Connection needs attention' : 'Connect your Claude account'}</h2></div>{finished && <button type="button" onClick={onClose}>×</button>}</header>
        <div className="claude-auth-progress"><i data-active={auth.status !== 'failed' && auth.status !== 'cancelled'} /><span>{progress}</span></div>
        {auth.error && <div className="claude-auth-error"><b>What happened</b><span>{auth.error}</span></div>}
        {auth.status === 'connected' && <div className="claude-auth-step"><span className="claude-auth-step__mark">✓</span><div><h3>Account verified by Claude Code</h3><p>{auth.usageReady ? 'Your plan limits are synced. Continue to the Overview to see current capacity.' : 'Your account is connected. Ambientic is syncing your plan limits for the Overview.'}</p></div></div>}
        {!finished && phase === 'browser' && <div className="claude-auth-step"><span className="claude-auth-step__mark">↗</span><div><h3>Finish signing in with Claude</h3><p>The secure Claude page is open in your browser. Approve the connection there, then return to Ambientic. If Claude gives you a one-time code, paste it here when the field appears.</p></div></div>}
        {!finished && phase === 'code' && <div className="claude-auth-code"><div><span>Authorization code</span><h3>Paste the code from Claude</h3><p>Pasting submits it immediately. Ambientic forwards it directly to Claude Code and never stores it.</p></div><div className="claude-auth-code__field"><input value={answer} autoFocus autoComplete="off" spellCheck="false" aria-label="Claude authorization code" onChange={(event) => setAnswer(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (pasted) { event.preventDefault(); send(pasted) } }} onKeyDown={(event) => { if (event.key === 'Enter') send() }} placeholder="Paste one-time code" /><button className="primary" type="button" disabled={!answer.trim()} onClick={() => send()}>Submit code</button></div></div>}
        {!finished && phase === 'verifying' && <div className="claude-auth-step claude-auth-step--verifying"><span className="claude-auth-spinner" /><div><h3>Verifying with Claude…</h3><p>Your one-time code was submitted. This usually takes only a few seconds.</p></div></div>}
        {!finished && !['browser', 'code', 'verifying'].includes(phase) && <><p>Ambientic is preparing Claude Code’s official subscription login. If Claude presents a choice, use the controls below.</p><div className="claude-auth-controls"><button type="button" title="Previous option" onClick={() => onInput({ action: 'up' })}>↑</button><button type="button" title="Next option" onClick={() => onInput({ action: 'down' })}>↓</button><button className="primary" type="button" onClick={() => onInput({ action: 'enter' })}>Continue</button></div></>}
        <details className="claude-auth-details"><summary>Claude Code details</summary><pre ref={outputRef}>{auth.output || 'Waiting for Claude Code…'}</pre></details>
        <footer><span>Credentials remain in Claude Code’s macOS Keychain storage.</span>{!finished ? <button type="button" onClick={onCancel}>Cancel</button> : auth.status === 'failed' ? <><button type="button" onClick={onClose}>Close</button><button className="primary" type="button" onClick={onRetry}>Retry connection</button></> : <button className="primary" type="button" onClick={onClose}>Continue to Overview</button>}</footer>
      </section>
    </div>
  )
}

function MidiHardwareSettings ({ midi, onSelect }) {
  const profiles = midi?.profiles || []
  return (
    <>
      <div className="provider-settings__intro"><span className="eyebrow"><i /> Physical control</span><h2>Choose your Ambientic controller.</h2><p>Select which Akai device Ambientic owns. Automatic mode prefers the APC40 MKII when both controllers are connected; choosing a model explicitly prevents Ambientic from opening the other device.</p></div>
      <div className="midi-device-status" data-connected={Boolean(midi?.connected)}><i /><div><b>{midi?.connected ? `${midi.model} connected` : 'Waiting for the selected controller'}</b><span>{midi?.connected ? `${midi.device} · ${midi.gridLabel} grid · ${midi.padCount} agent pads` : 'Connect the hardware by USB, then choose its profile below.'}</span></div></div>
      <div className="midi-profile-list">
        {profiles.map((profile) => {
          const selected = midi?.selectedProfile === profile.id
          const active = midi?.activeProfile === profile.id
          return <button key={profile.id} type="button" data-selected={selected} onClick={() => onSelect(profile.id)}><span>{profile.id === 'auto' ? '⌁' : profile.id === 'apc-mini-mk2' ? '64' : '40'}</span><div><b>{profile.label}</b><small>{profile.description}</small></div><i>{active ? 'Connected' : selected ? 'Selected' : ''}</i></button>
        })}
      </div>
      <section className="midi-profile-guide"><div><b>Native task grid</b><p>Green is running, red needs input, and blue is idle. APC mini mk2 uses all 64 pads; APC40 MKII retains its native 40-pad layout.</p></div><div><b>Voice and custom actions</b><p>The eight APC mini track buttons act as column push-to-talk controls. Scene buttons and all nine faders remain available through MIDI Learn.</p></div></section>
    </>
  )
}

function UsageSettings ({ sessions, usage, ledger, onRefresh }) {
  return (
    <div className="usage-settings">
      <div className="provider-settings__intro"><span className="eyebrow"><i /> Local consumption ledger</span><h2>Usage, capacity, and spend signals.</h2><p>Track provider quota, resets, purchased credits, and observed consumption. Currency spend appears only when a provider exposes verified billing data.</p></div>
      <ConsumptionBoard sessions={sessions} usage={usage} onRefresh={onRefresh} />
      <SpendActivity ledger={ledger} />
    </div>
  )
}

function Onboarding ({ state, connectors, providerAuth, midi, onSave, onConnect, onRefresh, onInstallHooks, onCreate, onFinish }) {
  const [name, setName] = useState(state.name || '')
  const [busyProvider, setBusyProvider] = useState('')
  const [notice, setNotice] = useState('')
  const step = Math.max(0, Math.min(3, Number(state.step) || 0))

  useEffect(() => { setName(state.name || '') }, [state.name])
  useEffect(() => {
    const refresh = () => onRefresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [onRefresh])

  const advance = async (next, patch = {}) => {
    const saved = await onSave({ ...patch, step: next })
    if (saved?.name !== undefined) setName(saved.name)
  }
  const connect = async (provider) => {
    const connector = connectors.find((item) => item.id === provider.id)
    if (!connector?.installed) {
      await window.controller.openExternalUrl(providerInstallUrls[provider.id])
      setNotice(`${provider.label} installation guide opened. Return here when the CLI is installed.`)
      return
    }
    if (connector.manageable !== false && provider.id !== 'kimi') return
    setBusyProvider(provider.id)
    setNotice('')
    try {
      const result = await onConnect(provider.id)
      setNotice(result?.mode === 'browser'
        ? 'Finish signing in with ChatGPT in your browser. Ambientic will confirm it here.'
        : result?.mode === 'embedded'
            ? 'Complete Claude’s secure connection in Ambientic.'
            : `${provider.label} setup opened in Terminal. Complete the provider’s own login, then return here.`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusyProvider('')
    }
  }

  const providerState = (provider) => {
    const connector = connectors.find((item) => item.id === provider.id)
    const auth = providerAuth?.[provider.id]
    if (!connector) return { tone: 'working', label: 'Checking this Mac…', cta: 'Checking…' }
    if (!connector?.installed) return { tone: 'missing', label: 'Install required', cta: `Install ${provider.label}` }
    if (auth?.status === 'waiting' || ['starting', 'interactive'].includes(auth?.status)) return { tone: 'working', label: 'Connecting…', cta: 'Connecting…' }
    if (auth?.status === 'connected' || (connector.manageable !== false && provider.id !== 'kimi')) return { tone: 'connected', label: 'Connected', cta: 'Connected' }
    if (provider.id === 'kimi') return { tone: 'ready', label: 'CLI detected', cta: 'Open Kimi login' }
    return { tone: 'ready', label: 'Ready to connect', cta: 'Connect account' }
  }

  return (
    <main className="onboarding-shell" data-step={step}>
      <div className="onboarding-ambient" aria-hidden="true"><i /><i /><i /></div>
      <header className="onboarding-topbar">
        <div className="onboarding-brand"><span><img src={ambienticLogo} alt="" /></span><b>Ambientic</b></div>
        <div className="onboarding-progress" aria-label={`Step ${step + 1} of 4`}>{[0, 1, 2, 3].map((value) => <i key={value} data-active={value <= step} />)}</div>
        <small>{String(step + 1).padStart(2, '0')} / 04</small>
      </header>

      {step === 0 && <section className="onboarding-stage onboarding-welcome">
        <div className="onboarding-orb" aria-hidden="true"><img src={ambienticLogo} alt="" /><i /><i /></div>
        <div className="onboarding-copy"><span className="eyebrow">Your agents are already out there</span><h1>Bring them into<br /><em>one field.</em></h1><p>Ambientic turns every coding agent and physical controller into one calm, playable workspace.</p></div>
        <button className="onboarding-primary" type="button" onClick={() => advance(1)}>Enter Ambientic <span>→</span></button>
      </section>}

      {step === 1 && <section className="onboarding-stage onboarding-name">
        <div className="onboarding-symbol" aria-hidden="true"><span>⌁</span></div>
        <div className="onboarding-copy"><span className="eyebrow">First, an introduction</span><h1>How should I<br /><em>call you?</em></h1><p>This stays on this Mac and is used only to make Ambientic feel like your space.</p></div>
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) advance(2, { name }) }}>
          <input value={name} autoFocus maxLength={48} autoComplete="name" onChange={(event) => setName(event.target.value)} placeholder="Your name" aria-label="Your name" />
          <button className="onboarding-primary" type="submit" disabled={!name.trim()}>Continue <span>→</span></button>
        </form>
      </section>}

      {step === 2 && <section className="onboarding-stage onboarding-providers">
        <div className="onboarding-copy"><span className="eyebrow">Your existing intelligence</span><h1>Connect your <em>agents.</em></h1><p>Ambientic uses each provider’s official local login. Your passwords and tokens never enter Ambientic.</p></div>
        <div className="onboarding-provider-grid">
          {onboardingProviderCatalog.map((provider) => {
            const status = providerState(provider)
            return <article key={provider.id} data-provider={provider.id} data-tone={status.tone}><span className="onboarding-provider-icon"><AgentIcon agent={provider.id} /></span><div><h2>{provider.label}</h2><p>{provider.id === 'codex' ? 'ChatGPT browser sign-in' : provider.id === 'claude' ? 'Claude subscription sign-in' : provider.id === 'hermes' ? 'Local Hermes provider' : 'Kimi Code account'}</p><small><i />{status.label}</small></div><button type="button" disabled={status.tone === 'connected' || status.tone === 'working' || busyProvider === provider.id} onClick={() => connect(provider)}>{busyProvider === provider.id ? 'Opening…' : status.cta}</button></article>
          })}
        </div>
        {notice && <div className="onboarding-notice"><span>i</span>{notice}</div>}
        <footer className="onboarding-actions"><button className="onboarding-secondary" type="button" disabled={!connectors.some((item) => item.taskCapable !== false && item.manageable !== false)} onClick={onCreate}>＋ Create first task</button><button className="onboarding-primary" type="button" onClick={() => { onInstallHooks(); advance(3) }}>Continue <span>→</span></button></footer>
      </section>}

      {step === 3 && <section className="onboarding-stage onboarding-controller" data-connected={Boolean(midi.connected)}>
        <div className="onboarding-copy"><span className="eyebrow">Optional physical layer</span><h1>Connect your <em>controller.</em></h1><p>Plug in an APC40 MKII or APC mini mk2. Ambientic detects it automatically and answers with light.</p></div>
        <div className="onboarding-hardware">
          <div className="onboarding-pad-field" data-model={midi.activeProfile || 'waiting'} aria-hidden="true">
            {Array.from({ length: midi.activeProfile === 'apc40-mkii' ? 40 : 64 }, (_, index) => <i key={index} style={{ '--pad-index': index }} />)}
          </div>
          <div className="onboarding-hardware-status"><span><i /></span><div><b>{midi.connected ? `${midi.shortModel} is alive` : 'Listening for MIDI…'}</b><small>{midi.connected ? `${midi.device} · ${midi.padCount} pads ready` : 'Connect by USB. You can also do this later in Settings.'}</small></div></div>
        </div>
        <footer className="onboarding-actions">{!midi.connected && <button className="onboarding-secondary" type="button" onClick={onFinish}>Skip for now</button>}<button className="onboarding-primary" type="button" onClick={onFinish}>{midi.connected ? 'Enter overview' : 'Continue without controller'} <span>→</span></button></footer>
      </section>}
    </main>
  )
}

function ProviderSettings ({ connectors, providerAuth, sessions, usage, ledger, midi, ambientMode, buildInfo, initialSection = 'providers', onRefresh, onRefreshUsage, onConnect, onInstallHooks, onMidiProfile, onAmbientToggle, onAmbientCheckIn, onReplayOnboarding }) {
  const [checking, setChecking] = useState(false)
  const [connecting, setConnecting] = useState('')
  const [notice, setNotice] = useState('')
  const [section, setSection] = useState(initialSection)

  const refresh = async (announce = true) => {
    setChecking(true)
    try {
      await onRefresh()
      if (announce) setNotice('Provider connections checked.')
    } finally {
      setChecking(false)
    }
  }

  const connect = async (connector) => {
    setConnecting(connector.id)
    let waitingForProvider = false
    try {
      const result = await onConnect(connector.id)
      waitingForProvider = ['browser', 'embedded'].includes(result?.mode)
      setNotice(result?.mode === 'browser'
        ? 'Waiting for ChatGPT to confirm your Codex account… Finish signing in in the browser. You can return to Ambientic at any time.'
        : result?.mode === 'embedded'
            ? 'Claude’s official connection wizard is open inside Ambientic.'
        : `${connector.label} login opened in Terminal. Complete the provider’s sign-in, then return to Ambientic.`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      if (!waitingForProvider) setConnecting('')
    }
  }

  useEffect(() => {
    const handleFocus = () => { void refresh(false) }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  useEffect(() => {
    const result = providerAuth?.codex
    if (!result) return
    if (result.status === 'waiting') {
      setConnecting('codex')
      setNotice('Waiting for ChatGPT to confirm your Codex account… Finish signing in in the browser.')
      return
    }
    setConnecting('')
    if (result.status === 'connected') {
      const identity = result.email ? ` as ${result.email}` : ''
      setNotice(`✓ Codex is connected${identity}. You can now create and continue Codex tasks in Ambientic.`)
    } else if (result.status === 'disconnected') {
      setNotice('Codex is signed out. Use Connect account to try again.')
    } else {
      setNotice(result.error || 'Ambientic could not confirm the Codex login. Use Check connections to retry the status check.')
    }
  }, [providerAuth?.codex?.updatedAt])

  useEffect(() => {
    const result = providerAuth?.claude
    if (!result) return
    setConnecting(['starting', 'waiting', 'interactive'].includes(result.status) ? 'claude' : '')
    if (result.status === 'connected') setNotice('✓ Claude Code is connected. Managed Claude tasks and project handovers are now available.')
    if (result.status === 'failed') setNotice(result.error || 'Claude Code login was not completed.')
  }, [providerAuth?.claude?.updatedAt])

  return (
    <section className="settings-page">
      <header className="settings-topbar"><div><span>Settings</span><h1>{section === 'providers' ? 'AI provider accounts' : section === 'usage' ? 'Usage & billing' : section === 'ambient' ? 'Ambient mode' : 'MIDI hardware'}</h1></div>{section === 'providers' && <button type="button" data-refreshing={checking} onClick={() => refresh(true)}>{checking ? 'Checking…' : 'Check connections'}</button>}{section === 'usage' && <button type="button" data-refreshing={Boolean(usage?.refreshing)} onClick={onRefreshUsage}>{usage?.refreshing ? 'Refreshing…' : 'Refresh usage'}</button>}</header>
      <div className="settings-scroll">
        <aside className="settings-sections"><span>Workspace</span><button type="button" data-selected={section === 'providers'} onClick={() => setSection('providers')}><b>AI Providers</b><small>Accounts and local CLIs</small></button><button type="button" data-selected={section === 'usage'} onClick={() => setSection('usage')}><b>Usage & Billing</b><small>Limits, resets, and spend</small></button><button type="button" data-selected={section === 'ambient'} onClick={() => setSection('ambient')}><b>Ambient Mode</b><small>Sleep prevention and safety</small></button><button type="button" data-selected={section === 'midi'} onClick={() => setSection('midi')}><b>MIDI Hardware</b><small>Controller and native mode</small></button><button className="settings-replay-onboarding" type="button" onClick={onReplayOnboarding}><b>Replay onboarding</b><small>Restart the first-run experience</small></button><div><b>{section === 'providers' ? 'Credentials stay private' : section === 'usage' ? 'Measured honestly' : section === 'ambient' ? 'Temporary and reversible' : 'One controller at a time'}</b><p>{section === 'providers' ? 'Ambientic delegates sign-in to each provider and never reads or stores your password, token, or API key.' : section === 'usage' ? 'Quota, provider credits, and currency spend remain distinct so estimates never look like verified charges.' : section === 'ambient' ? 'Ambient mode is always user-controlled, leaves display sleep intact, and releases its assertion when the app quits.' : 'Ambientic opens only the selected MIDI device. Your provider and agent configuration is unaffected.'}</p></div><footer className="settings-build"><span>Installed build</span><b>Ambientic {buildInfo?.version || 'development'}</b><code>{buildInfo?.commit === 'development' ? 'Development' : buildInfo?.commit?.slice(0, 8)}</code>{buildInfo?.builtAt && <small>{buildInfo.branch} · {new Date(buildInfo.builtAt).toLocaleString()}{buildInfo.dirty ? ' · modified' : ''}</small>}</footer></aside>
        <main className="provider-settings">
          {section === 'midi' ? <MidiHardwareSettings midi={midi} onSelect={onMidiProfile} /> : section === 'ambient' ? <AmbientModeSettings ambientMode={ambientMode} onToggle={onAmbientToggle} onCheckInChange={onAmbientCheckIn} /> : section === 'usage' ? <UsageSettings sessions={sessions} usage={usage} ledger={ledger} onRefresh={onRefreshUsage} /> : <>
          <div className="provider-settings__intro"><span className="eyebrow"><i /> Local account bridge</span><h2>Connect the agents you already use.</h2><p>Each provider keeps ownership of authentication. Ambientic checks the installed CLI, opens its official login flow, and uses that existing local session.</p></div>
          {notice && <div className="settings-notice"><span>i</span>{notice}</div>}
          <div className="provider-account-list">
            {providerCatalog.map((provider) => {
              const connector = connectors.find((item) => item.id === provider.id) || { ...provider, checking: true }
              const authenticated = connector.manageable !== false
              const connectionLabel = connector.checking
                ? 'Checking'
                : !connector.installed
                    ? 'CLI not installed'
                    : !authenticated
                        ? 'Account connection required'
                        : 'Account connected'
              return (
                <article className="provider-account" key={provider.id} data-provider={provider.id} data-connected={Boolean(connector.installed && authenticated)}>
                  <span className="provider-account__icon"><AgentIcon agent={provider.id} /></span>
                  <div className="provider-account__identity"><div><h3>{provider.label}</h3><i /><span>{connectionLabel}</span></div><p>{connector.authMessage || connector.accountLabel || (authenticated ? 'Authenticated through the provider’s local credential store.' : 'Sign in through the provider’s own terminal flow.')}</p><dl><div><dt>CLI</dt><dd>{connector.installed ? connector.version || 'Installed' : 'Missing'}</dd></div><div><dt>Ambientic integration</dt><dd>{connector.configured ? 'Hook connected' : connector.installed ? 'Hook not installed' : 'Unavailable'}</dd></div><div><dt>Credential storage</dt><dd>{provider.label}</dd></div></dl></div>
                  <div className="provider-account__actions">
                    <button className="primary" type="button" disabled={!connector.installed || connecting === provider.id} onClick={() => connect(connector)}>{connecting === provider.id ? 'Opening…' : authenticated ? 'Reconnect account' : 'Connect account'}</button>
                    {connector.installed && !connector.configured && <button type="button" onClick={onInstallHooks}>Install Ambientic hook</button>}
                    {!connector.installed && <small>Install {provider.label} first, then check connections again.</small>}
                  </div>
                </article>
              )
            })}
          </div>
          <section className="provider-security"><div><span>◇</span><div><b>How connection works</b><p>Codex uses its browser API. Claude’s official CLI login runs inside an Ambientic wizard. Ambientic receives status only and never stores provider credentials.</p></div></div><div><span>⌁</span><div><b>Subscription support</b><p>Claude Code and Codex use their existing local subscription login. Hermes uses the provider configured in Hermes itself.</p></div></div></section>
          </>}
        </main>
      </div>
    </section>
  )
}

export default function Workspace () {
  const [sessions, setSessions] = useState([])
  const [connectors, setConnectors] = useState([])
  const [providerAuth, setProviderAuth] = useState({})
  const [handovers, setHandovers] = useState([])
  const [midi, setMidi] = useState({ connected: false, model: 'Akai APC controller', shortModel: 'APC' })
  const [voice, setVoice] = useState({ recording: false, transcribing: false, error: '', transcript: '', sessionId: '', sessionLabel: '' })
  const [ambientMode, setAmbientMode] = useState({ enabled: false, checkInDue: false, checkInMinutes: 240, availableCheckIns: [30, 60, 120, 240, 480, 720] })
  const [usage, setUsage] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [companions, setCompanions] = useState({ bySession: {} })
  const [onboarding, setOnboarding] = useState(null)
  const [buildInfo, setBuildInfo] = useState(null)
  const [goalsSnapshot, setGoalsSnapshot] = useState({ version: 1, goals: [], events: [], updatedAt: null })
  const [view, setView] = useState('overview')
  const [settingsSection, setSettingsSection] = useState('providers')
  const [selectedId, setSelectedId] = useState('')
  const [selectedGoalId, setSelectedGoalId] = useState('')
  const [thread, setThread] = useState(null)
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [chatMode, setChatMode] = useState('build')
  // Model and effort are kept per provider, not per thread: the choice is about
  // how you want that provider to work, so it carries across its conversations.
  const [tuningByProvider, setTuningByProvider] = useState({})
  const [query, setQuery] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [threadInteractions, setThreadInteractions] = useState(() => {
    try {
      const stored = window.localStorage.getItem(THREAD_INTERACTIONS_KEY) || window.localStorage.getItem(LEGACY_THREAD_INTERACTIONS_KEY) || '{}'
      const value = JSON.parse(stored)
      window.localStorage.setItem(THREAD_INTERACTIONS_KEY, JSON.stringify(value))
      return value
    } catch { return {} }
  })
  const [newTask, setNewTask] = useState(false)
  const [newTaskProvider, setNewTaskProvider] = useState('')
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const transcriptRef = useRef(null)
  const transcriptAtBottomRef = useRef(true)
  const transcriptScrollFrameRef = useRef(null)
  const selectedIdRef = useRef('')

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    if (providerAuth?.claude?.status === 'connected') setView('overview')
  }, [providerAuth?.claude?.updatedAt])

  useEffect(() => {
    const triggerVibe = (event) => {
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        window.controller.midiVibe()
      } else if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        window.controller.resetOnboarding().then((state) => {
          setOnboarding(state)
          setView('overview')
        })
      }
    }
    window.addEventListener('keydown', triggerVibe)
    return () => window.removeEventListener('keydown', triggerVibe)
  }, [])

  useEffect(() => {
    window.controller.getOnboarding().then(setOnboarding)
    Promise.all([window.controller.getWorkspaceThreads(), window.controller.getConnectors(), window.controller.getProviderAuth(), window.controller.getHandovers(), window.controller.getMidi(), window.controller.getVoice(), window.controller.getAmbientMode(), window.controller.getUsage(), window.controller.getConsumptionLedger(), window.controller.getCompanions(), window.controller.getBuildInfo(), window.controller.getGoals()]).then(([state, agents, authState, handoverState, hardware, voiceState, ambientState, usageState, ledgerState, companionState, packagedBuild, goalState]) => {
      setSessions(state); setConnectors(agents); setProviderAuth(authState); setHandovers(handoverState); setMidi(hardware); setVoice(voiceState); setAmbientMode(ambientState); setUsage(usageState); setLedger(ledgerState); setCompanions(companionState); setBuildInfo(packagedBuild); setGoalsSnapshot(goalState)
      if (state[0]) setSelectedId(state[0].id)
    })
    const disposers = [
      window.controller.onWorkspaceThreads(setSessions),
      window.controller.onGoals(setGoalsSnapshot),
      window.controller.onConnectors(setConnectors),
      window.controller.onProviderAuth((result) => setProviderAuth((current) => ({ ...current, [result.provider]: result }))),
      window.controller.onHandovers(setHandovers),
      window.controller.onMidi(setMidi),
      window.controller.onVoice(setVoice),
      window.controller.onAmbientMode(setAmbientMode),
      window.controller.onUsage(setUsage),
      window.controller.onConsumptionLedger(setLedger),
      window.controller.onCompanions(setCompanions),
      window.controller.onThread((value) => value.id === selectedIdRef.current && setThread(value)),
      window.controller.onWorkspaceSelect((id) => { setSelectedId(id); setView('threads') })
    ]
    return () => disposers.forEach((dispose) => dispose?.())
  }, [])

  useEffect(() => {
    if (!selectedId || view !== 'threads') { if (!selectedId) setThread(null); return }
    setThreadInteractions((current) => {
      const next = { ...current, [selectedId]: Date.now() }
      const bounded = Object.fromEntries(Object.entries(next).sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, 200))
      try { window.localStorage.setItem(THREAD_INTERACTIONS_KEY, JSON.stringify(bounded)) } catch {}
      return bounded
    })
    window.controller.selectSession(selectedId)
    setThread(null)
    setShowJumpToLatest(false)
    transcriptAtBottomRef.current = true
    setLoading(true)
    const requestedId = selectedId
    window.controller.getThread(requestedId)
      .then((value) => { if (selectedIdRef.current === requestedId) setThread(value) })
      .catch((error) => { if (selectedIdRef.current === requestedId) setThread({ id: requestedId, messages: [], error: error.message }) })
      .finally(() => { if (selectedIdRef.current === requestedId) setLoading(false) })
  }, [selectedId, view])

  useEffect(() => {
    setAttachments([])
    setChatMode('build')
  }, [selectedId])

  useEffect(() => {
    if (!selectedId && sessions[0]) setSelectedId(sessions[0].id)
  }, [sessions, selectedId])

  const scrollToLatest = (behavior = 'smooth') => {
    const element = transcriptRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
    transcriptAtBottomRef.current = true
    setShowJumpToLatest(false)
  }

  const updateTranscriptPosition = () => {
    const nearBottom = isNearThreadBottom(transcriptRef.current)
    transcriptAtBottomRef.current = nearBottom
    setShowJumpToLatest(!nearBottom)
  }

  useEffect(() => {
    if (loading || !thread?.id || thread.id !== selectedId) return
    const first = requestAnimationFrame(() => {
      transcriptScrollFrameRef.current = requestAnimationFrame(() => scrollToLatest('auto'))
    })
    return () => {
      cancelAnimationFrame(first)
      if (transcriptScrollFrameRef.current) cancelAnimationFrame(transcriptScrollFrameRef.current)
    }
  }, [selectedId, thread?.id, loading])

  useEffect(() => {
    if (transcriptAtBottomRef.current) scrollToLatest('auto')
  }, [thread?.messages?.length, thread?.messages?.at(-1)?.text])

  const threadGroups = useMemo(() => organizeThreads(
    sessions.map((session) => ({ ...session, task: sessionTitle(session) })),
    { interactions: threadInteractions, provider: providerFilter, query }
  ), [sessions, query, providerFilter, threadInteractions])
  const selectedConnector = connectors.find((connector) => connector.id === thread?.provider)
  const canManage = Boolean(thread?.managed && selectedConnector?.manageable !== false)
  const canSteer = Boolean(canManage && thread?.provider === 'codex' && thread?.running)
  const activeProvider = thread?.provider || ''
  const activeTuning = tuningByProvider[activeProvider] || { model: '', effort: '' }
  const setThreadTuning = (provider, patch) => {
    if (!provider) return
    setTuningByProvider((current) => ({ ...current, [provider]: { ...(current[provider] || { model: '', effort: '' }), ...patch } }))
  }
  const selectedPreview = companions?.bySession?.[selectedId]
  const saveOnboarding = async (patch) => {
    const next = await window.controller.saveOnboarding(patch)
    setOnboarding(next)
    return next
  }

  const send = async (draft = '') => {
    const value = draft.trim() || (attachments.length ? 'Please inspect the attached context.' : '')
    if (!value || !selectedId || (thread?.running && !canSteer)) return false
    const selectedAttachments = attachments
    const selectedMode = chatMode
    const selectedTuning = activeTuning
    setAttachments([])
    try {
      setThread(await window.controller.sendThreadPrompt(selectedId, value, { attachments: selectedAttachments, mode: selectedMode, model: selectedTuning.model, effort: selectedTuning.effort }))
      return true
    } catch (error) {
      setAttachments((current) => current.length ? current : selectedAttachments)
      try {
        const latest = await window.controller.getThread(selectedId)
        setThread({ ...latest, error: error.message })
      } catch {
        setThread((current) => ({ ...current, error: error.message }))
      }
      return false
    }
  }
  const chooseContext = async () => {
    const selected = await window.controller.chooseThreadContext()
    setAttachments((current) => {
      const paths = new Map(current.map((item) => [item.path, item]))
      for (const item of selected || []) paths.set(item.path, item)
      return [...paths.values()].slice(0, 12)
    })
  }

  const create = async (options) => {
    const id = await window.controller.createManagedThread(options)
    setNewTask(false); setSelectedId(id)
    if (onboarding && !onboarding.completed) await saveOnboarding({ step: 3 })
    else setView('threads')
  }

  const openCreate = (provider = '') => { setNewTaskProvider(provider); setNewTask(true) }
  const openThread = (id) => { setSelectedId(id); setView('threads') }
  const openAllThreads = () => {
    setProviderFilter('all')
    setQuery('')
    setView('threads')
  }
  const openProviderThreads = async (providerId) => {
    setProviderFilter(providerId)
    setQuery('')
    setView('threads')
    let latest = sessions
    try {
      latest = await window.controller.getWorkspaceThreads()
      setSessions(latest)
    } catch {}
    const groups = organizeThreads(
      latest.map((session) => ({ ...session, task: sessionTitle(session) })),
      { interactions: threadInteractions, provider: providerId }
    )
    const first = groups.recent[0] || groups.earlier[0]
    setSelectedId(first?.id || '')
  }
  const dismissProviderAuth = (provider) => {
    void window.controller.dismissProviderAuth(provider)
    setProviderAuth((current) => ({ ...current, [provider]: null }))
  }
  const createGoal = async (input) => window.controller.createGoal(input)
  const updateGoal = async (goalId, patch) => window.controller.updateGoal(goalId, patch)
  const createGoalTask = async (goalId, input) => window.controller.createGoalTask(goalId, input)
  const updateGoalTask = async (taskId, patch) => window.controller.updateGoalTask(taskId, patch)
  const claudeAuthMode = claudeAuthPresentation(providerAuth.claude)
  // Generate a fresh handover brief for this thread and start the target
  // provider on it, then jump to the new thread.
  const handoff = async (targetProvider) => {
    const result = await window.controller.continueHandover(selectedId, targetProvider)
    if (result?.targetSessionId) setSelectedId(result.targetSessionId)
  }

  if (onboarding === null) {
    return <main className="onboarding-loading"><span><img src={ambienticLogo} alt="" /></span><p>Assembling your field…</p></main>
  }

  if (!onboarding.completed) {
    const finishOnboarding = async () => {
      await saveOnboarding({ completed: true, step: 3 })
      setView('overview')
    }
    return (
      <>
        <Onboarding state={onboarding} connectors={connectors} providerAuth={providerAuth} midi={midi} onSave={saveOnboarding} onConnect={(id) => window.controller.connectProvider(id)} onRefresh={() => window.controller.refreshConnectors()} onInstallHooks={() => window.controller.installHooks()} onCreate={() => setNewTask(true)} onFinish={finishOnboarding} />
        {claudeAuthMode === 'wizard' && <ClaudeAuthWizard auth={providerAuth.claude} onInput={(input) => window.controller.claudeAuthInput(input)} onCancel={() => window.controller.claudeAuthCancel()} onRetry={() => window.controller.connectProvider('claude')} onClose={() => dismissProviderAuth('claude')} />}
        {newTask && <NewTask connectors={connectors} initialProvider={newTaskProvider} onClose={() => setNewTask(false)} onCreate={create} />}
      </>
    )
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <header className="brand"><span className="brand__mark"><img src={ambienticLogo} alt="" /></span><div><b>Ambientic</b><small>Local agent workspace</small></div><button type="button" title="Open compact APC controller" onClick={() => window.controller.showController()}>⌘</button></header>
        <nav className="workspace-nav"><button type="button" data-selected={view === 'overview'} onClick={() => setView('overview')}><span>✦</span><b>Overview</b></button><button type="button" data-selected={view === 'goals'} onClick={() => setView('goals')}><span>◇</span><b>Goals</b><em>{goalsSnapshot.goals.filter((goal) => goal.status === 'active').length}</em></button><button type="button" data-selected={view === 'threads'} onClick={() => setView('threads')}><span>☷</span><b>Threads</b><em>{sessions.length}</em></button><button type="button" data-selected={view === 'settings'} onClick={() => { setSettingsSection('providers'); setView('settings') }}><span>⚙</span><b>Settings</b></button></nav>
        <button className="new-task-button" type="button" onClick={() => openCreate()}><span>＋</span> New agent task <kbd>⌘N</kbd></button>
        {view === 'threads' ? <><div className="thread-provider-filters" role="group" aria-label="Filter threads by provider"><button type="button" data-selected={providerFilter === 'all'} onClick={() => setProviderFilter('all')} title="All providers" aria-label="All providers"><span>✦</span></button>{providerCatalog.map((provider) => <button type="button" key={provider.id} data-provider={provider.id} data-selected={providerFilter === provider.id} onClick={() => setProviderFilter(provider.id)} title={provider.label} aria-label={`Show ${provider.label} threads`}><AgentIcon agent={provider.id} /></button>)}</div><div className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></div>
        <nav className="thread-list">
          {threadGroups.recent.length > 0 && <section className="thread-group thread-group--recent"><h3>Recent & active<span>{threadGroups.recent.length}</span></h3>{threadGroups.recent.map((session) => <button type="button" key={session.id} data-recent="true" data-latest={threadGroups.latestInteractedId === session.id} data-selected={selectedId === session.id} onClick={() => setSelectedId(session.id)}><span className="thread-list__icon"><AgentIcon agent={session.agent} /><i data-state={session.state} /></span><span className="thread-list__copy"><b>{sessionTitle(session)}</b><small>{stateLabel[session.state] || session.state} · {session.agent} · {session.project || 'Local task'}</small></span></button>)}</section>}
          {threadGroups.earlier.length > 0 && <section className="thread-group thread-group--earlier"><h3>Earlier threads<span>{threadGroups.earlier.length}</span></h3>{threadGroups.earlier.map((session) => <button type="button" key={session.id} data-selected={selectedId === session.id} onClick={() => setSelectedId(session.id)}><span className="thread-list__icon"><AgentIcon agent={session.agent} /><i data-state={session.state} /></span><span className="thread-list__copy"><b>{sessionTitle(session)}</b><small>{session.agent} · {session.project || 'Local task'}</small></span></button>)}</section>}
          {!threadGroups.recent.length && !threadGroups.earlier.length && <div className="sidebar-empty">{sessions.length ? 'No threads match this provider and search.' : 'No live tasks yet. Start one here or install hooks to observe terminal sessions.'}</div>}
        </nav></> : view === 'settings' ? <div className="overview-side"><span>Settings</span><p>Manage provider accounts while credentials remain in their native local stores.</p><dl><div><dt>Connected</dt><dd>{connectors.filter((item) => item.installed && item.manageable !== false).length}</dd></div><div><dt>Need login</dt><dd>{connectors.filter((item) => item.installed && item.manageable === false).length}</dd></div><div><dt>Providers</dt><dd>{providerCatalog.length}</dd></div></dl></div> : view === 'goals' ? <div className="overview-side"><span>Goal field</span><p>Your outcomes, milestones, and next actions shared across human and agent work.</p><dl><div><dt>Active</dt><dd>{goalsSnapshot.goals.filter((goal) => goal.status === 'active').length}</dd></div><div><dt>Moving</dt><dd>{goalsSnapshot.goals.reduce((sum, goal) => sum + goal.summary.active, 0)}</dd></div><div><dt>Blocked</dt><dd>{goalsSnapshot.goals.reduce((sum, goal) => sum + goal.summary.blocked, 0)}</dd></div></dl></div> : <div className="overview-side"><span>Command center</span><p>Your providers, live signals, and agent work arranged spatially.</p><dl><div><dt>Working</dt><dd>{sessions.filter((session) => session.state === 'running').length}</dd></div><div><dt>Need you</dt><dd>{sessions.filter((session) => ['waiting', 'attention'].includes(session.state)).length}</dd></div><div><dt>History</dt><dd>{sessions.filter((session) => session.history).length}</dd></div></dl></div>}
        <footer className="hardware"><i data-connected={midi.connected} /><div><b>{midi.shortModel || 'APC controller'}</b><span>{midi.connected ? `Connected · ${midi.device || 'ready'}` : 'Waiting for hardware'}</span></div><button type="button" onClick={() => { setSettingsSection('midi'); setView('settings') }}>Choose</button></footer>
      </aside>

      {providerAuth.codex && <div className="provider-auth-toast" data-status={providerAuth.codex.status}><span>{providerAuth.codex.status === 'connected' ? '✓' : providerAuth.codex.status === 'waiting' ? '…' : '!'}</span><div><b>{providerAuth.codex.status === 'connected' ? 'Codex connected' : providerAuth.codex.status === 'waiting' ? 'Waiting for ChatGPT' : 'Codex connection needs attention'}</b><small>{providerAuth.codex.status === 'connected' ? (providerAuth.codex.email || 'Your ChatGPT account is ready in Ambientic.') : providerAuth.codex.status === 'waiting' ? 'Complete sign-in in your browser. Ambientic is listening for confirmation.' : (providerAuth.codex.error || 'Open Settings → AI Providers for details.')}</small></div><button type="button" aria-label="Dismiss authentication message" onClick={() => dismissProviderAuth('codex')}>×</button></div>}
      {claudeAuthMode === 'success' && <div className="provider-auth-toast" data-status="connected" data-provider="claude"><span>✓</span><div><b>Claude Code connected</b><small>{providerAuth.claude.email || 'Your Claude account is ready. Plan limits are syncing in Overview.'}</small></div><button type="button" aria-label="Dismiss Claude connection message" onClick={() => dismissProviderAuth('claude')}>×</button></div>}
      {claudeAuthMode === 'wizard' && <ClaudeAuthWizard auth={providerAuth.claude} onInput={(input) => window.controller.claudeAuthInput(input)} onCancel={() => window.controller.claudeAuthCancel()} onRetry={() => window.controller.connectProvider('claude')} onClose={() => dismissProviderAuth('claude')} />}
      {view === 'overview' ? <Dashboard sessions={sessions} connectors={connectors} usage={usage} midi={midi} ambientMode={ambientMode} onCreate={openCreate} onOpenThreads={openAllThreads} onOpenProvider={openProviderThreads} onOpenThread={openThread} onVibe={() => window.controller.midiVibe()} onRefreshUsage={() => window.controller.refreshUsage()} onToggleAmbientMode={(enabled) => window.controller.setAmbientMode(enabled)} /> : view === 'goals' ? <GoalsWorkspace snapshot={goalsSnapshot} selectedGoalId={selectedGoalId} onSelectGoal={setSelectedGoalId} onCreateGoal={createGoal} onUpdateGoal={updateGoal} onCreateTask={createGoalTask} onUpdateTask={updateGoalTask} /> : view === 'settings' ? <ProviderSettings connectors={connectors} providerAuth={providerAuth} sessions={sessions} usage={usage} ledger={ledger} midi={midi} ambientMode={ambientMode} buildInfo={buildInfo} initialSection={settingsSection} onRefresh={() => window.controller.refreshConnectors()} onRefreshUsage={() => window.controller.refreshUsage()} onConnect={(id) => window.controller.connectProvider(id)} onInstallHooks={() => window.controller.installHooks()} onMidiProfile={(profileId) => window.controller.midiSetProfile(profileId)} onAmbientToggle={(enabled) => window.controller.setAmbientMode(enabled)} onAmbientCheckIn={(minutes) => window.controller.setAmbientModeCheckIn(minutes)} onReplayOnboarding={() => window.controller.resetOnboarding().then((state) => { setOnboarding(state); setView('overview') })} /> : <><section className="workspace-main">
        {!selectedId ? <EmptyThread onCreate={() => setNewTask(true)} /> : <>
          <header className="thread-header"><div className="thread-header__provider"><AgentIcon agent={thread?.provider || sessions.find((item) => item.id === selectedId)?.agent} /></div><div><h1>{thread?.title || sessionTitle(sessions.find((item) => item.id === selectedId) || {})}</h1><p><span data-state={thread?.state} />{thread?.providerLabel || thread?.provider} · {thread?.cwd || 'Local session'}</p></div><div className="thread-header__actions">{selectedPreview?.activeCount > 0 && <button type="button" onClick={() => window.controller.presentPreview(selectedId)}>Preview {selectedPreview.activeCount}</button>}<CopyThreadButton thread={thread} /><RenameThreadButton thread={thread} onRenamed={(title) => setThread((current) => ({ ...current, title }))} /><HandoverControl thread={thread} connectors={connectors} onHandover={handoff} />{thread?.nativeAvailable && <button type="button" onClick={() => window.controller.focus(selectedId)}>Open native</button>}<button type="button" title="Reload conversation" onClick={() => window.controller.getThread(selectedId).then(setThread)}>↻</button></div></header>
          <div className="thread-body" ref={transcriptRef} onScroll={updateTranscriptPosition}>
            <HandoverBanner thread={thread} connectors={connectors} usage={usage} onHandover={handoff} />
            {loading && <div className="loading">Loading local conversation…</div>}
            {!loading && thread?.messages?.length === 0 && <div className="thread-zero"><h2>This task is ready.</h2><p>Send a prompt below. Ambientic will use your existing {thread.providerLabel || 'provider'} login.</p></div>}
            {thread?.messages?.map((item, index) => <Message key={item.id || index} item={item} providerLabel={thread.providerLabel} />)}
            {showJumpToLatest && <button className="thread-jump-latest" type="button" onClick={() => scrollToLatest('smooth')} aria-label="Jump to the latest message">↓ Latest</button>}
          </div>
          <div className="composer-wrap">
            {(voice.recording || voice.transcribing || voice.error || voice.transcript) && <div className="voice-banner" data-tone={voice.error ? 'error' : voice.recording ? 'recording' : 'working'}>
              <span className="voice-banner__dot" />
              <div><b>{voice.error ? 'Voice prompt failed' : voice.recording ? `Recording for ${voice.sessionLabel || 'selected agent'}` : voice.transcribing ? 'Transcribing and sending…' : 'Voice prompt sent'}</b><small>{voice.error || (voice.recording ? 'Keep holding the matching Record Arm button; release it to send.' : voice.transcript || '')}</small></div>
            </div>}
            {thread?.error && <div className="thread-error"><span>!</span>{thread.error}</div>}
            {thread?.approvals?.map((approval) => <Approval key={approval.id} approval={approval} onResolve={(...args) => window.controller.resolveApproval(...args)} />)}
            <div className="composer" data-running={thread?.running}>
              <div className="composer-tools">
                <button type="button" className="composer-attach" disabled={!canManage} onClick={chooseContext} title="Attach files or folders"><span>＋</span> Attach</button>
                <div className="composer-modes" role="group" aria-label="Agent mode">
                  {[
                    { id: 'build', label: 'Build', title: 'Implement and edit' },
                    { id: 'plan', label: 'Plan', title: 'Inspect and make a plan without editing' },
                    { id: 'ask', label: 'Ask', title: 'Answer and explain without editing' }
                  ].map((mode) => <button type="button" key={mode.id} data-selected={chatMode === mode.id} onClick={() => setChatMode(mode.id)} title={thread?.running ? `${mode.title}. The current Codex turn keeps its existing mode while steering.` : mode.title}>{mode.label}</button>)}
                </div>
              </div>
              {attachments.length > 0 && <div className="composer-attachments">{attachments.map((item) => <span key={item.path} title={item.path}><i>⌁</i><b>{item.path.split('/').filter(Boolean).at(-1) || item.path}</b><button type="button" aria-label={`Remove ${item.path}`} onClick={() => setAttachments((current) => current.filter((candidate) => candidate.path !== item.path))}>×</button></span>)}</div>}
              <ComposerDraft
                sessionId={selectedId}
                canManage={canManage}
                canSteer={canSteer}
                running={Boolean(thread?.running)}
                providerLabel={thread?.managed && selectedConnector?.manageable === false ? `${thread.providerLabel} needs /login` : thread?.providerLabel}
                mode={chatMode}
                hasAttachments={attachments.length > 0}
                controls={
                  <ComposerTuning
                    provider={activeProvider}
                    model={activeTuning.model}
                    effort={activeTuning.effort}
                    disabled={!canManage}
                    onModel={(value) => setThreadTuning(activeProvider, { model: value })}
                    onEffort={(value) => setThreadTuning(activeProvider, { effort: value })}
                  />
                }
                onSend={send}
                onInterrupt={() => window.controller.interruptThread(selectedId)}
              />
            </div>
          </div>
        </>}
      </section>

      <aside className="artifact-panel">
        <header><span>Context</span><button type="button">···</button></header>
        <section><h3>Task</h3><dl><div><dt>Provider</dt><dd>{thread?.providerLabel || '—'}</dd></div><div><dt>Status</dt><dd><i data-state={thread?.state} />{stateLabel[thread?.state] || '—'}</dd></div><div><dt>Project</dt><dd>{thread?.project || '—'}</dd></div></dl></section>
        <section><h3>Preview <span>{companions?.bySession?.[selectedId]?.activeCount || 0}</span></h3><ThreadPreview state={companions?.bySession?.[selectedId]} onPresent={() => window.controller.presentPreview(selectedId)} /></section>
        <section><h3>Artifacts <span>{thread?.artifacts?.length || 0}</span></h3>{thread?.artifacts?.length ? <div className="artifacts">{thread.artifacts.map((artifact) => <button key={artifact.path} type="button" title={artifact.path} onClick={() => window.controller.openArtifact(artifact.path)}><span>⌘</span><div><b>{artifact.name}</b><small>{artifact.path}</small></div></button>)}</div> : <div className="no-artifacts">Files touched by the agent appear here.</div>}</section>
        <section className="capabilities"><h3>Connection</h3><p>Provider credentials stay in the provider’s own local store. Ambientic never asks for or copies your API keys.</p></section>
      </aside></>}
      {newTask && <NewTask key={newTaskProvider || 'any'} connectors={connectors} initialProvider={newTaskProvider} onClose={() => setNewTask(false)} onCreate={create} />}
      <AmbientModeCheckIn ambientMode={ambientMode} onContinue={() => window.controller.continueAmbientMode()} onTurnOff={() => window.controller.setAmbientMode(false)} />
    </main>
  )
}
