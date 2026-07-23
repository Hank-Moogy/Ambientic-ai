import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AgentIcon } from './AgentIcon.jsx'
import './workspace.css'

const stateLabel = { running: 'Running', waiting: 'Needs input', attention: 'Needs input', idle: 'Idle', history: 'History' }
const providerCatalog = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'hermes', label: 'Hermes' }
]

function sessionTitle (session) {
  return session.task || session.summary || session.project || `${session.agent || 'Agent'} session`
}

function EmptyThread ({ onCreate }) {
  return (
    <div className="workspace-empty">
      <div className="workspace-empty__mark">AB</div>
      <h2>Your agents, one surface.</h2>
      <p>Select an existing task or start a managed Codex, Claude Code, or Hermes task using the provider login already on this Mac.</p>
      <button type="button" onClick={onCreate}>New agent task</button>
    </div>
  )
}

function Message ({ item }) {
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
      <div className="message__role"><span>{item.role === 'user' ? 'You' : 'AgentBase'}</span><button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
      <div className="message__text">{item.text}</div>
    </article>
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

function Approval ({ approval, onResolve }) {
  return (
    <section className="approval">
      <div><b>Permission requested</b><span>{approval.title}</span>{approval.detail && <code>{typeof approval.detail === 'string' ? approval.detail : JSON.stringify(approval.detail)}</code>}</div>
      <div className="approval__actions">
        <button type="button" onClick={() => onResolve(approval.id, false)}>Deny</button>
        <button type="button" className="primary" onClick={() => onResolve(approval.id, true)}>Allow once</button>
        {approval.provider === 'codex' && <button type="button" onClick={() => onResolve(approval.id, true, true)}>Allow for task</button>}
      </div>
    </section>
  )
}

function NewTask ({ connectors, initialProvider, onClose, onCreate }) {
  const [provider, setProvider] = useState(initialProvider || connectors.find((item) => item.manageable !== false)?.id || 'codex')
  const [cwd, setCwd] = useState('/Users/samori')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault(); setBusy(true)
    try { await onCreate({ provider, cwd, prompt }) } finally { setBusy(false) }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="new-task" onSubmit={submit}>
        <header><div><span>New managed task</span><h2>Put an agent to work</h2></div><button type="button" onClick={onClose}>×</button></header>
        <label>Provider<div className="provider-choices">
          {connectors.map((connector) => <button key={connector.id} type="button" data-selected={provider === connector.id} disabled={!connector.installed || connector.manageable === false} title={connector.authMessage || ''} onClick={() => setProvider(connector.id)}><AgentIcon agent={connector.id} /><span>{connector.label}<small>{!connector.installed ? 'Not installed' : connector.manageable === false ? 'Run /login first' : 'Uses local login'}</small></span></button>)}
        </div></label>
        <label>Working folder<input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="/path/to/project" /></label>
        <label>First prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What should this agent do? (optional)" autoFocus /></label>
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !cwd} type="submit">{busy ? 'Starting…' : 'Start task'}</button></footer>
      </form>
    </div>
  )
}

function compactUsage (usage, providerId) {
  const windows = usage?.providers?.[providerId]?.windows || []
  const window = windows.find((item) => item.period === 'short') || windows[0]
  return Number.isFinite(window?.usedPercent) ? `${Math.round(window.usedPercent)}% used` : 'Local account'
}

function resetLabel (window) {
  if (!window?.resetAt) return window?.resetText ? `Resets ${window.resetText}` : ''
  const minutes = Math.max(0, Math.ceil((window.resetAt * 1000 - Date.now()) / 60000))
  if (minutes < 60) return `Resets in ${minutes}m`
  if (minutes < 24 * 60) return `Resets in ${Math.floor(minutes / 60)}h`
  return `Resets in ${Math.floor(minutes / (24 * 60))}d`
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
          if (noQuotaData) return <div className="consumption-row" key={providerId} data-provider={providerId}><span className="consumption-row__agent"><AgentIcon agent={providerId} /></span><div className="consumption-row__identity"><b>{providerId === 'codex' ? 'Codex' : 'Claude'}</b><small>Quota unavailable · local activity</small></div><div className="consumption-activity"><b>{localActivity.weekly}</b><span>sessions this week</span></div><div className="consumption-activity"><b>{localActivity.total}</b><span>tracked locally</span></div></div>
          return <div className="consumption-row" key={providerId} data-provider={providerId}><span className="consumption-row__agent"><AgentIcon agent={providerId} /></span><div className="consumption-row__identity"><b>{providerId === 'codex' ? 'Codex' : 'Claude'}</b><small>{provider?.status === 'error' ? 'Unavailable' : provider?.status === 'stale' ? 'Last known' : provider?.status === 'ok' ? (provider.plan || 'Subscription') : 'Fetching limits…'}</small></div><ConsumptionMeter label="5h" window={short} /><ConsumptionMeter label="Week" window={week} /></div>
        })}
        <div className="consumption-row" data-provider="hermes"><span className="consumption-row__agent"><AgentIcon agent="hermes" /></span><div className="consumption-row__identity"><b>Hermes</b><small>No quota API · local activity</small></div><div className="consumption-activity"><b>{hermesActivity.weekly}</b><span>sessions this week</span></div><div className="consumption-activity"><b>{hermesActivity.total}</b><span>tracked locally</span></div></div>
      </div>
      <footer><span>{usage?.updatedAt ? `Updated ${new Date(usage.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Reading local provider accounts'}</span><span>Used · 100% is the provider limit</span></footer>
    </section>
  )
}

function ProviderPad ({ connector, sessions, usage, index, onCreate }) {
  const providerSessions = sessions.filter((session) => session.agent === connector.id)
  const active = providerSessions.filter((session) => session.state === 'running').length
  const needsInput = providerSessions.filter((session) => ['waiting', 'attention'].includes(session.state)).length
  const unavailable = !connector.checking && (!connector.installed || connector.manageable === false)
  const status = connector.checking ? 'Checking local connection' : !connector.installed ? 'Not installed' : connector.manageable === false ? 'Login required' : active ? `${active} active` : needsInput ? `${needsInput} need you` : 'Ready'
  return (
    <button className="provider-pad" data-provider={connector.id} data-unavailable={unavailable} style={{ '--float-delay': `${index * -2.3}s` }} type="button" onClick={() => onCreate(connector.id)}>
      <span className="provider-pad__glow" />
      <header><span className="provider-pad__icon"><AgentIcon agent={connector.id} /></span><i data-state={active ? 'running' : needsInput ? 'attention' : unavailable ? 'history' : 'idle'} /></header>
      <div className="provider-pad__name"><b>{connector.label}</b><small>{status}</small></div>
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

function Dashboard ({ sessions, connectors, usage, midi, onCreate, onOpenThreads, onOpenThread, onRefreshUsage }) {
  const live = sessions.filter((session) => !session.history)
  const active = live.filter((session) => session.state === 'running').length
  const needsInput = live.filter((session) => ['waiting', 'attention'].includes(session.state)).length
  const historyCount = sessions.filter((session) => session.history).length
  const providerCards = providerCatalog.map((provider) => connectors.find((connector) => connector.id === provider.id) || { ...provider, checking: true })
  return (
    <section className="dashboard">
      <header className="dashboard-topbar"><span>Agent operating system</span><div><button type="button" onClick={onOpenThreads}>All threads</button><button className="dashboard-topbar__new" type="button" onClick={() => onCreate('')}>＋ New task</button></div></header>
      <div className="dashboard-scroll">
        <section className="dashboard-hero">
          <div className="dashboard-hero__copy"><span className="eyebrow"><i /> Local intelligence, online</span><h1>Your agents,<br /><em>in one field.</em></h1><p>See who is working, who needs you, and where to send the next idea—without starting from a chat list.</p><div className="dashboard-statline"><span><b>{active}</b> active</span><span><b>{needsInput}</b> need input</span><span><b>{sessions.length}</b> threads</span><span><b>{midi.connected ? 'On' : 'Off'}</b> APC40</span></div></div>
          <ConsumptionBoard sessions={sessions} usage={usage} onRefresh={onRefreshUsage} />
        </section>

        <section className="provider-field" aria-label="Agent providers">
          {providerCards.map((connector, index) => <ProviderPad key={connector.id} connector={connector} sessions={sessions} usage={usage} index={index} onCreate={onCreate} />)}
          <button className="provider-pad provider-pad--new" type="button" onClick={() => onCreate('')}><span className="provider-pad--new__plus">＋</span><b>Create an agent task</b><small>Choose a provider and working folder</small></button>
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

export default function Workspace () {
  const [sessions, setSessions] = useState([])
  const [connectors, setConnectors] = useState([])
  const [midi, setMidi] = useState({ connected: false, model: 'APC40 MKII' })
  const [voice, setVoice] = useState({ recording: false, transcribing: false, error: '', transcript: '', sessionId: '', sessionLabel: '' })
  const [usage, setUsage] = useState(null)
  const [view, setView] = useState('overview')
  const [selectedId, setSelectedId] = useState('')
  const [thread, setThread] = useState(null)
  const [loading, setLoading] = useState(false)
  const [composer, setComposer] = useState('')
  const [query, setQuery] = useState('')
  const [newTask, setNewTask] = useState(false)
  const [newTaskProvider, setNewTaskProvider] = useState('')
  const transcriptRef = useRef(null)
  const selectedIdRef = useRef('')

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    Promise.all([window.controller.getWorkspaceThreads(), window.controller.getConnectors(), window.controller.getMidi(), window.controller.getVoice(), window.controller.getUsage()]).then(([state, agents, hardware, voiceState, usageState]) => {
      setSessions(state); setConnectors(agents); setMidi(hardware); setVoice(voiceState); setUsage(usageState)
      if (state[0]) setSelectedId(state[0].id)
    })
    const disposers = [
      window.controller.onWorkspaceThreads(setSessions),
      window.controller.onConnectors(setConnectors),
      window.controller.onMidi(setMidi),
      window.controller.onVoice(setVoice),
      window.controller.onUsage(setUsage),
      window.controller.onThread((value) => value.id === selectedIdRef.current && setThread(value)),
      window.controller.onWorkspaceSelect(setSelectedId)
    ]
    return () => disposers.forEach((dispose) => dispose?.())
  }, [])

  useEffect(() => {
    if (!selectedId || view !== 'threads') { if (!selectedId) setThread(null); return }
    window.controller.selectSession(selectedId)
    setLoading(true)
    window.controller.getThread(selectedId).then(setThread).catch((error) => setThread({ id: selectedId, messages: [], error: error.message })).finally(() => setLoading(false))
  }, [selectedId, view])

  useEffect(() => {
    if (!selectedId && sessions[0]) setSelectedId(sessions[0].id)
  }, [sessions, selectedId])

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [thread?.messages?.length, thread?.messages?.at(-1)?.text])

  const grouped = useMemo(() => {
    const needle = query.toLowerCase()
    const result = new Map()
    for (const session of sessions) {
      if (needle && !`${sessionTitle(session)} ${session.project} ${session.agent}`.toLowerCase().includes(needle)) continue
      const key = session.project || 'Local agents'
      if (!result.has(key)) result.set(key, [])
      result.get(key).push(session)
    }
    return [...result]
  }, [sessions, query])
  const selectedConnector = connectors.find((connector) => connector.id === thread?.provider)
  const canManage = Boolean(thread?.managed && selectedConnector?.manageable !== false)

  const send = async () => {
    const value = composer.trim()
    if (!value || !selectedId || thread?.running) return
    setComposer('')
    try { setThread(await window.controller.sendThreadPrompt(selectedId, value)) } catch (error) { setThread((current) => ({ ...current, error: error.message, running: false })) }
  }

  const create = async (options) => {
    const id = await window.controller.createManagedThread(options)
    setNewTask(false); setSelectedId(id); setView('threads')
  }

  const openCreate = (provider = '') => { setNewTaskProvider(provider); setNewTask(true) }
  const openThread = (id) => { setSelectedId(id); setView('threads') }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <header className="brand"><span className="brand__mark">A</span><div><b>AgentBase</b><small>Local agent workspace</small></div><button type="button" title="Open compact APC controller" onClick={() => window.controller.showController()}>⌘</button></header>
        <nav className="workspace-nav"><button type="button" data-selected={view === 'overview'} onClick={() => setView('overview')}><span>✦</span><b>Overview</b></button><button type="button" data-selected={view === 'threads'} onClick={() => setView('threads')}><span>☷</span><b>Threads</b><em>{sessions.length}</em></button></nav>
        <button className="new-task-button" type="button" onClick={() => openCreate()}><span>＋</span> New agent task <kbd>⌘N</kbd></button>
        {view === 'threads' ? <><div className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></div>
        <nav className="thread-list">
          {grouped.map(([project, projectSessions]) => <section key={project}><h3>{project}<span>{projectSessions.length}</span></h3>{projectSessions.map((session) => <button type="button" key={session.id} data-selected={selectedId === session.id} onClick={() => setSelectedId(session.id)}><span className="thread-list__icon"><AgentIcon agent={session.agent} /><i data-state={session.state} /></span><span className="thread-list__copy"><b>{sessionTitle(session)}</b><small>{stateLabel[session.state] || session.state} · {session.agent}</small></span></button>)}</section>)}
          {!sessions.length && <div className="sidebar-empty">No live tasks yet.<br />Start one here or install hooks to observe terminal sessions.</div>}
        </nav></> : <div className="overview-side"><span>Command center</span><p>Your providers, live signals, and agent work arranged spatially.</p><dl><div><dt>Working</dt><dd>{sessions.filter((session) => session.state === 'running').length}</dd></div><div><dt>Need you</dt><dd>{sessions.filter((session) => ['waiting', 'attention'].includes(session.state)).length}</dd></div><div><dt>History</dt><dd>{sessions.filter((session) => session.history).length}</dd></div></dl></div>}
        <footer className="hardware"><i data-connected={midi.connected} /><div><b>APC40 MKII</b><span>{midi.connected ? `Connected · ${midi.device || 'ready'}` : 'Waiting for hardware'}</span></div><button type="button" onClick={() => window.controller.showController()}>Map</button></footer>
      </aside>

      {view === 'overview' ? <Dashboard sessions={sessions} connectors={connectors} usage={usage} midi={midi} onCreate={openCreate} onOpenThreads={() => setView('threads')} onOpenThread={openThread} onRefreshUsage={() => window.controller.refreshUsage()} /> : <><section className="workspace-main">
        {!selectedId ? <EmptyThread onCreate={() => setNewTask(true)} /> : <>
          <header className="thread-header"><div className="thread-header__provider"><AgentIcon agent={thread?.provider || sessions.find((item) => item.id === selectedId)?.agent} /></div><div><h1>{thread?.title || sessionTitle(sessions.find((item) => item.id === selectedId) || {})}</h1><p><span data-state={thread?.state} />{thread?.providerLabel || thread?.provider} · {thread?.cwd || 'Local session'}</p></div><div className="thread-header__actions"><CopyThreadButton thread={thread} />{thread?.nativeAvailable && <button type="button" onClick={() => window.controller.focus(selectedId)}>Open native</button>}<button type="button" title="Reload conversation" onClick={() => window.controller.getThread(selectedId).then(setThread)}>↻</button></div></header>
          <div className="thread-body" ref={transcriptRef}>
            {loading && <div className="loading">Loading local conversation…</div>}
            {!loading && thread?.messages?.length === 0 && <div className="thread-zero"><h2>This task is ready.</h2><p>Send a prompt below. AgentBase will use your existing {thread.providerLabel || 'provider'} login.</p></div>}
            {thread?.messages?.map((item, index) => <Message key={item.id || index} item={item} />)}
          </div>
          <div className="composer-wrap">
            {(voice.recording || voice.transcribing || voice.error || voice.transcript) && <div className="voice-banner" data-tone={voice.error ? 'error' : voice.recording ? 'recording' : 'working'}>
              <span className="voice-banner__dot" />
              <div><b>{voice.error ? 'Voice prompt failed' : voice.recording ? `Recording for ${voice.sessionLabel || 'selected agent'}` : voice.transcribing ? 'Transcribing and sending…' : 'Voice prompt sent'}</b><small>{voice.error || (voice.recording ? 'Keep holding the matching Record Arm button; release it to send.' : voice.transcript || '')}</small></div>
            </div>}
            {thread?.error && <div className="thread-error"><span>!</span>{thread.error}</div>}
            {thread?.approvals?.map((approval) => <Approval key={approval.id} approval={approval} onResolve={(...args) => window.controller.resolveApproval(...args)} />)}
            <div className="composer" data-running={thread?.running}>
              <textarea value={composer} disabled={!canManage} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder={!thread?.managed ? 'This provider session is read-only' : selectedConnector?.manageable === false ? `${thread.providerLabel} needs /login before it can resume` : `Message ${thread.providerLabel || 'agent'}…`} />
              <div><span>{thread?.running ? 'Agent is working…' : 'Enter to send · Shift+Enter for newline'}</span>{thread?.running ? <button className="stop" type="button" onClick={() => window.controller.interruptThread(selectedId)}>■</button> : <button className="send" type="button" disabled={!composer.trim()} onClick={send}>↑</button>}</div>
            </div>
          </div>
        </>}
      </section>

      <aside className="artifact-panel">
        <header><span>Context</span><button type="button">···</button></header>
        <section><h3>Task</h3><dl><div><dt>Provider</dt><dd>{thread?.providerLabel || '—'}</dd></div><div><dt>Status</dt><dd><i data-state={thread?.state} />{stateLabel[thread?.state] || '—'}</dd></div><div><dt>Project</dt><dd>{thread?.project || '—'}</dd></div></dl></section>
        <section><h3>Artifacts <span>{thread?.artifacts?.length || 0}</span></h3>{thread?.artifacts?.length ? <div className="artifacts">{thread.artifacts.map((artifact) => <button key={artifact.path} type="button" title={artifact.path} onClick={() => window.controller.openArtifact(artifact.path)}><span>⌘</span><div><b>{artifact.name}</b><small>{artifact.path}</small></div></button>)}</div> : <div className="no-artifacts">Files touched by the agent appear here.</div>}</section>
        <section className="capabilities"><h3>Connection</h3><p>Provider credentials stay in the provider’s own local store. AgentBase never asks for or copies your API keys.</p></section>
      </aside></>}
      {newTask && <NewTask key={newTaskProvider || 'any'} connectors={connectors} initialProvider={newTaskProvider} onClose={() => setNewTask(false)} onCreate={create} />}
    </main>
  )
}
