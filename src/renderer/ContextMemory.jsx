import React, { useEffect, useMemo, useState } from 'react'
import { asList, bindingInput, contextApi, contextLabel, formatRelativeTime, memoryOrigin, riskLabel } from './context-ui.mjs'
import './context-memory.css'

const EMPTY_BINDING = { projectId: '', goalId: '', taskId: '' }

function apiError (cause, fallback) {
  return cause?.message || fallback
}

export function LaunchContext ({ provider, cwd, prompt, projectId = '', goalsSnapshot, onProjectChange, onChange, onCreateGoal, onCreateTask }) {
  const [projects, setProjects] = useState([])
  const [binding, setBinding] = useState(EMPTY_BINDING)
  const [inference, setInference] = useState(null)
  const [state, setState] = useState('loading')
  const [editing, setEditing] = useState(false)
  const [creatingGoal, setCreatingGoal] = useState(false)
  const [goalTitle, setGoalTitle] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const goals = goalsSnapshot?.goals || []
  const selectedGoal = goals.find((goal) => goal.id === binding.goalId)
  const tasks = selectedGoal?.tasks || goalsSnapshot?.tasks?.filter((task) => task.goalId === binding.goalId) || []

  useEffect(() => {
    let active = true
    const api = contextApi().context
    if (typeof api.listProjects !== 'function') {
      setProjects([])
      setState('unavailable')
      return undefined
    }
    Promise.resolve(api.listProjects()).then((result) => {
      if (active) setProjects(asList(result, ['projects']))
    }).catch(() => { if (active) setProjects([]) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const api = contextApi().context
    if (typeof api.inferLaunch !== 'function') {
      setState('unavailable')
      return undefined
    }
    setState('loading')
    const timer = setTimeout(() => {
      Promise.resolve(api.inferLaunch({ provider, cwd, prompt, projectId })).then((result) => {
        if (!active) return
        const next = result?.binding || result || {}
        const ids = bindingInput(next)
        const inferredProject = result?.project || next?.project
        if (inferredProject?.id) setProjects((items) => items.some((item) => item.id === inferredProject.id) ? items : [inferredProject, ...items])
        setInference(result || next)
        setBinding(ids)
        onChange?.({ ...ids, inferenceSource: result?.inferenceSource || result?.source || 'inferred' })
        setState('ready')
      }).catch(() => { if (active) setState('error') })
    }, 240)
    return () => { active = false; clearTimeout(timer) }
  }, [provider, cwd, prompt, projectId])

  const update = (patch, projectRecord = null) => {
    const next = { ...binding, ...patch }
    if (Object.hasOwn(patch, 'projectId')) Object.assign(next, { goalId: '', taskId: '' })
    if (Object.hasOwn(patch, 'goalId')) next.taskId = ''
    setBinding(next)
    if (Object.hasOwn(patch, 'projectId')) onProjectChange?.(patch.projectId, projectRecord)
    onChange?.({ ...next, inferenceSource: 'explicit', correctedByUser: true })
  }
  const project = projects.find((item) => item.id === binding.projectId)
  const goal = goals.find((item) => item.id === binding.goalId)
  const task = tasks.find((item) => item.id === binding.taskId)
  const display = { ...binding, project, goal, task, projectName: inference?.projectName, goalName: inference?.goalName, taskName: inference?.taskName }
  const createGoal = async () => {
    if (!goalTitle.trim() || !onCreateGoal) return
    const value = await onCreateGoal({ title: goalTitle.trim(), outcome: goalTitle.trim(), projectId: binding.projectId || undefined })
    setCreatingGoal(false); setGoalTitle('')
    update({ goalId: value?.id || '' })
  }
  const createProject = async () => {
    if (!projectTitle.trim() || typeof contextApi().context.upsertProject !== 'function') return
    const value = await contextApi().context.upsertProject({ name: projectTitle.trim(), rootPath: '' })
    setProjects((items) => [value, ...items.filter((item) => item.id !== value.id)])
    setCreatingProject(false); setProjectTitle(''); update({ projectId: value.id }, value)
  }
  const createTask = async () => {
    if (!taskTitle.trim() || !binding.goalId || !onCreateTask) return
    const value = await onCreateTask(binding.goalId, { title: taskTitle.trim(), projectId: binding.projectId || undefined })
    setCreatingTask(false); setTaskTitle(''); update({ taskId: value?.id || '' })
  }

  return (
    <section className="launch-context" data-state={state}>
      <div className="launch-context__head"><div><span>Ambientic context</span><b>{state === 'loading' ? 'Finding the relevant direction…' : contextLabel(display)}</b><small>{state === 'unavailable' ? 'Context linking will become available when the local memory service is ready.' : state === 'error' ? 'The task can still start. Context can be linked later.' : inference?.explanation || inference?.reason || (binding.projectId ? 'Inferred from this project and your active work.' : 'This task will start without durable project memory.')}</small></div><button type="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Done' : 'Change'}</button></div>
      {editing && <div className="launch-context__fields">
        <label>Project<select value={binding.projectId} onChange={(event) => update({ projectId: event.target.value })}><option value="">No linked project</option>{projects.map((item) => <option value={item.id} key={item.id}>{item.name || item.brief || item.rootPath}</option>)}</select></label>
        <label>Goal<select value={binding.goalId} onChange={(event) => update({ goalId: event.target.value })}><option value="">No linked goal</option>{goals.filter((item) => !binding.projectId || !item.projectId || item.projectId === binding.projectId).map((item) => <option value={item.id} key={item.id}>{item.outcome || item.title}</option>)}</select></label>
        <label>Task<select value={binding.taskId} disabled={!binding.goalId} onChange={(event) => update({ taskId: event.target.value })}><option value="">No linked task</option>{tasks.map((item) => <option value={item.id} key={item.id}>{item.title || item.description}</option>)}</select></label>
        <div className="launch-context__create">
          {creatingProject ? <><input value={projectTitle} autoFocus onChange={(event) => setProjectTitle(event.target.value)} placeholder="Folderless project name" /><button type="button" disabled={!projectTitle.trim()} onClick={createProject}>Create &amp; link</button><button type="button" onClick={() => setCreatingProject(false)}>Cancel</button></> : <button type="button" onClick={() => setCreatingProject(true)}>＋ Project</button>}
          {onCreateGoal && (creatingGoal ? <><input value={goalTitle} autoFocus onChange={(event) => setGoalTitle(event.target.value)} placeholder="New goal name" /><button type="button" disabled={!goalTitle.trim()} onClick={createGoal}>Create &amp; link</button><button type="button" onClick={() => setCreatingGoal(false)}>Cancel</button></> : <button type="button" onClick={() => setCreatingGoal(true)}>＋ Goal</button>)}
          {onCreateTask && binding.goalId && (creatingTask ? <><input value={taskTitle} autoFocus onChange={(event) => setTaskTitle(event.target.value)} placeholder="New task name" /><button type="button" disabled={!taskTitle.trim()} onClick={createTask}>Create &amp; link</button><button type="button" onClick={() => setCreatingTask(false)}>Cancel</button></> : <button type="button" onClick={() => setCreatingTask(true)}>＋ Task</button>)}
        </div>
      </div>}
    </section>
  )
}

export function ThreadContextPanel ({ sessionId, thread, goalsSnapshot }) {
  const [binding, setBinding] = useState(null)
  const [draft, setDraft] = useState(EMPTY_BINDING)
  const [projects, setProjects] = useState([])
  const [state, setState] = useState('loading')
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [sessionActivity, setSessionActivity] = useState([])
  const load = async () => {
    const api = contextApi().context
    if (typeof api.getBinding !== 'function') { setState('unavailable'); return }
    setState('loading')
    try {
      const [value, projectResult] = await Promise.all([
        api.getBinding(sessionId),
        typeof api.listProjects === 'function' ? api.listProjects() : []
      ])
      setBinding(value || null)
      setDraft(bindingInput(value || {}))
      setProjects(asList(projectResult, ['projects']))
      if (value?.id && typeof contextApi().audit.list === 'function') {
        const audit = await contextApi().audit.list({ bindingId: value.id, limit: 8 })
        setSessionActivity(asList(audit, ['events', 'items']))
      } else setSessionActivity([])
      setState('ready')
    } catch (cause) {
      setNotice(apiError(cause, 'Context could not be loaded.'))
      setState('error')
    }
  }
  useEffect(() => { if (sessionId) void load() }, [sessionId])
  const save = async () => {
    const api = contextApi().context
    if (typeof api.rebind !== 'function') return
    setNotice('')
    try {
      const value = await api.rebind(sessionId, draft)
      setBinding(value || { ...binding, ...draft, correctedByUser: true })
      setEditing(false)
      setNotice('Context update recorded. The original capsule remains unchanged.')
    } catch (cause) { setNotice(apiError(cause, 'Context could not be updated.')) }
  }
  const tokenCount = binding?.capsuleTokens || binding?.tokenCount
  const project = projects.find((item) => item.id === (binding?.projectId || binding?.project?.id))
  const goals = goalsSnapshot?.goals || []
  const selectedGoal = goals.find((item) => item.id === draft.goalId)
  const tasks = selectedGoal?.tasks || []
  return (
    <>
      <section className="thread-context-card"><h3>Direction <span>{binding?.capsuleHash ? 'Frozen' : ''}</span></h3>
        {state === 'loading' ? <p className="context-muted">Finding this task’s context…</p> : state === 'unavailable' ? <p className="context-muted">This task predates the context kernel. It can keep working normally.</p> : <>
          <strong>{contextLabel({ ...binding, project, projectName: binding?.projectName || thread?.project })}</strong>
          <p>{binding?.inferenceExplanation || binding?.inferenceSource || 'Linked to this provider session.'}</p>
          <dl><div><dt>Project</dt><dd>{project?.name || binding?.projectName || thread?.project || '—'}</dd></div><div><dt>Goal</dt><dd>{binding?.goal?.outcome || binding?.goalName || '—'}</dd></div><div><dt>Task</dt><dd>{binding?.task?.title || binding?.taskName || '—'}</dd></div></dl>
          <button className="context-link" type="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel correction' : 'Correct binding'}</button>
          {editing && <div className="thread-context-edit"><label>Project<select value={draft.projectId} onChange={(event) => setDraft({ projectId: event.target.value, goalId: '', taskId: '' })}><option value="">No project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name || item.brief}</option>)}</select></label><label>Goal<select value={draft.goalId} onChange={(event) => setDraft({ ...draft, goalId: event.target.value, taskId: '' })}><option value="">No goal</option>{goals.filter((item) => !draft.projectId || !item.projectId || item.projectId === draft.projectId).map((item) => <option key={item.id} value={item.id}>{item.outcome || item.title}</option>)}</select></label><label>Task<select value={draft.taskId} disabled={!draft.goalId} onChange={(event) => setDraft({ ...draft, taskId: event.target.value })}><option value="">No task</option>{tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" onClick={save}>Record update</button></div>}
        </>}
        {notice && <small className="context-notice">{notice}</small>}
      </section>
      <section className="capsule-card"><h3>Session capsule <span>{tokenCount ? `${tokenCount} tokens` : ''}</span></h3>{binding?.capsuleText ? <details><summary>Preview frozen context</summary><pre>{binding.capsuleText}</pre></details> : <p className="context-muted">No saved capsule is available for this session yet.</p>}{binding?.capsuleHash && <code title={binding.capsuleHash}>{binding.capsuleHash.slice(0, 12)}…</code>}{binding?.createdAt && <small>Frozen {formatRelativeTime(binding.createdAt)} · hash identifies the exact provider bytes.</small>}<small>Recall scopes: user, project, goal, task, and this session. New memories remain pull-only; Ambientic never silently rewrites the opening context.</small></section>
      <section className="context-activity-card"><h3>Context activity <span>{sessionActivity.length}</span></h3>{sessionActivity.length ? sessionActivity.slice(0, 5).map((item) => <div key={item.id}><b>{item.title || item.eventType}</b><small>{item.resultSummary || item.tool || ''} · {formatRelativeTime(item.createdAt)}</small></div>) : <p className="context-muted">No recalls or memory writes in this session yet.</p>}</section>
    </>
  )
}

function MemoryCard ({ record, onAction }) {
  const [editMode, setEditMode] = useState('')
  const [draft, setDraft] = useState(record.content || record.text || '')
  const provenance = asList(record.provenance, ['items'])
  return <article className="memory-card" data-status={record.status || 'active'}><header><span data-kind={record.kind}>{record.kind || 'fact'}</span><i>{memoryOrigin(record)}</i><em>{Math.round((record.confidence ?? 1) * 100)}%</em></header>{editMode ? <div className="memory-card__edit"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus /><div><button type="button" onClick={() => setEditMode('')}>Cancel</button><button type="button" disabled={!draft.trim()} onClick={() => { onAction(editMode, record, draft.trim()); setEditMode('') }}>{editMode === 'supersede' ? 'Save replacement' : 'Save edit'}</button></div></div> : <p>{record.content || record.text}</p>}<footer><span>{record.scope || 'user'}{record.scopeName ? ` · ${record.scopeName}` : ''}</span><small>{provenance[0]?.provider || record.provider || ''}{provenance[0]?.createdAt || record.updatedAt ? ` · ${formatRelativeTime(provenance[0]?.createdAt || record.updatedAt)}` : ''}</small><div>{record.status === 'candidate' && <><button type="button" onClick={() => onAction('promote', record)}>Keep</button><button type="button" onClick={() => onAction('forget', record, '', 'reject')}>Reject</button></>}{record.status === 'conflicted' && <button type="button" onClick={() => onAction('resolve', record)}>Keep this version</button>}<button type="button" onClick={() => { setDraft(record.content || record.text || ''); setEditMode('edit') }}>Edit</button><button type="button" onClick={() => { setDraft(record.content || record.text || ''); setEditMode('supersede') }}>Supersede</button><button type="button" onClick={() => onAction('forget', record)}>Forget</button></div></footer></article>
}

export function MemoryWorkspace () {
  const [records, setRecords] = useState([])
  const [projects, setProjects] = useState([])
  const [activity, setActivity] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [newMemory, setNewMemory] = useState('')
  const [auditFilter, setAuditFilter] = useState('all')
  const load = async (search = '') => {
    const api = contextApi()
    if (typeof api.memory.list !== 'function') { setState('unavailable'); return }
    setState('loading'); setError('')
    try {
      const [memoryResult, projectResult, auditResult] = await Promise.all([
        search && typeof api.memory.search === 'function' ? api.memory.search({ query: search }) : api.memory.list({}),
        typeof api.context.listProjects === 'function' ? api.context.listProjects() : [],
        typeof api.audit.list === 'function' ? api.audit.list({ category: auditFilter === 'all' ? '' : auditFilter, limit: 12 }) : []
      ])
      setRecords(asList(memoryResult, ['records', 'memories', 'results']))
      setProjects(asList(projectResult, ['projects']))
      setActivity(asList(auditResult, ['events', 'items', 'audit']))
      setState('ready')
    } catch (cause) { setError(apiError(cause, 'Memory could not be loaded.')); setState('error') }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { const timer = setTimeout(() => { if (state !== 'unavailable') void load(query.trim()) }, 250); return () => clearTimeout(timer) }, [query, auditFilter])
  const action = async (kind, record, content, disposition) => {
    const api = contextApi().memory
    try {
      if (kind === 'forget') {
        if (disposition !== 'reject' && !window.confirm('Forget this memory? Its content and search entries will be removed from this Mac.')) return
        await api.forget?.(record.id)
      } else if (kind === 'resolve') {
        await api.resolveConflict?.(record.id, { action: 'keep' })
      } else if (kind === 'supersede') {
        await api.remember?.({ content, scope: record.scope, scopeId: record.scopeId, kind: record.kind, supersedesId: record.id, explicit: true })
      } else if (kind === 'edit') {
        await api.remember?.({ ...record, content, explicit: true })
      } else {
        await api.remember?.({ ...record, status: 'active', explicit: true })
      }
      await load(query)
    } catch (cause) { setError(apiError(cause, 'Memory could not be updated.')) }
  }
  const remember = async (event) => {
    event.preventDefault()
    if (!newMemory.trim()) return
    try {
      await contextApi().memory.remember?.({ content: newMemory.trim(), scope: 'user', kind: 'preference', explicit: true })
      setNewMemory(''); await load(query)
    } catch (cause) { setError(apiError(cause, 'Memory could not be saved.')) }
  }
  const toggleExclusion = async (project, provider) => {
    try {
      const key = `provider:${provider}`
      const exclusions = new Set(project.exclusions || [])
      if (exclusions.has(key)) exclusions.delete(key); else exclusions.add(key)
      const updated = await contextApi().context.upsertProject?.({ ...project, exclusions: [...exclusions] })
      setProjects((items) => items.map((item) => item.id === project.id ? updated : item))
    } catch (cause) { setError(apiError(cause, 'Project indexing preference could not be updated.')) }
  }
  const visible = records.filter((record) => filter === 'all' || record.status === filter || record.scope === filter)
  const conflicts = records.filter((record) => record.status === 'conflicted').length
  return <section className="memory-page"><header className="memory-topbar"><div><span>Memory</span><h1>What your agents can carry forward</h1><p>Local, scoped context shared across providers only when it is relevant.</p></div><form onSubmit={remember}><input value={newMemory} onChange={(event) => setNewMemory(event.target.value)} placeholder="Remember a preference or constraint…" aria-label="New memory" /><button type="submit" disabled={!newMemory.trim() || typeof contextApi().memory.remember !== 'function'}>Remember</button></form></header>
    <div className="memory-layout"><main><div className="memory-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory and consented sessions" /><div>{['all', 'active', 'candidate', 'conflicted', 'project'].map((value) => <button type="button" key={value} data-selected={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value}</button>)}</div></div>
      {error && <div className="memory-error" role="alert"><b>Memory needs attention</b><span>{error}</span><button type="button" onClick={() => load(query)}>Try again</button></div>}
      {state === 'loading' && <div className="memory-empty">Indexing the local field…</div>}
      {state === 'unavailable' && <div className="memory-empty"><b>Memory is not active in this build yet.</b><span>Existing agents and goals continue to work. This space will wake when the local context service is available.</span></div>}
      {state === 'ready' && !visible.length && <div className="memory-empty"><b>{query ? 'Nothing matched this search.' : 'No durable memories yet.'}</b><span>Tell Ambientic what to remember, or keep working and reviewed facts will appear here.</span></div>}
      <div className="memory-grid">{visible.map((record) => <MemoryCard key={record.id} record={record} onAction={action} />)}</div>
    </main><aside><section className="memory-profile"><span>User profile</span><b>{records.filter((item) => item.scope === 'user' && item.status === 'active').length}</b><p>Durable preferences and constraints available across providers.</p></section><section><header><b>Projects &amp; indexing</b><span>{projects.length}</span></header>{projects.slice(0, 8).map((project) => <div className="memory-project" key={project.id}><i /><div><b>{project.name || project.brief}</b><small>{project.brief || project.rootPath || 'No folder required'}</small><span className="memory-project__exclusions">{['claude', 'codex', 'hermes'].map((provider) => <button type="button" key={provider} data-excluded={(project.exclusions || []).includes(`provider:${provider}`)} onClick={() => toggleExclusion(project, provider)}>{provider}</button>)}</span></div></div>)}{!projects.length && <p className="context-muted">Projects appear as Ambientic learns your working spaces.</p>}<p className="context-muted">Dim a provider to exclude its transcripts from that project.</p></section><section data-attention={conflicts > 0}><header><b>Needs attention</b><span>{conflicts}</span></header><p>{conflicts ? 'Conflicting or sensitive candidates are waiting for your decision.' : 'No conflicts. Quiet updates stay in the activity feed.'}</p></section><section><header><b>Recent activity</b><span>{activity.length}</span></header><div className="memory-audit-filters">{['all', 'capsules', 'recalls', 'promotions', 'approvals', 'tools'].map((value) => <button type="button" key={value} data-selected={auditFilter === value} onClick={() => setAuditFilter(value)}>{value}</button>)}</div>{activity.slice(0, 6).map((item, index) => <div className="memory-activity" key={item.id || index}><i /><div><b>{item.title || item.type || 'Memory updated'}</b><small>{item.provider || item.session?.provider || ''} {formatRelativeTime(item.createdAt || item.timestamp)}</small></div></div>)}</section></aside></div>
  </section>
}

export function AppsToolsSettings () {
  const [connections, setConnections] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [capabilities, setCapabilities] = useState([])
  const [state, setState] = useState('loading')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', transport: 'stdio', command: '', url: '' })
  const selected = connections.find((item) => item.id === selectedId) || connections[0]
  const load = async () => {
    const api = contextApi().tools
    if (typeof api.listConnections !== 'function') { setState('unavailable'); return }
    try {
      const result = await api.listConnections()
      const items = asList(result, ['connections'])
      setConnections(items); setSelectedId((value) => value || items[0]?.id || ''); setState('ready')
    } catch (cause) { setNotice(apiError(cause, 'Connections could not be loaded.')); setState('error') }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!selected?.id || typeof contextApi().tools.listCapabilities !== 'function') { setCapabilities([]); return }
    contextApi().tools.listCapabilities(selected.id).then((result) => setCapabilities(asList(result, ['capabilities', 'tools']))).catch(() => setCapabilities([]))
  }, [selected?.id, selected?.updatedAt])
  const invoke = async (operation, connection = selected) => {
    if (!connection) return
    try {
      const api = contextApi().tools
      if (operation === 'test') await api.test?.(connection.id)
      if (operation === 'disable') await api.disable?.(connection.id, { disabled: !connection.disabled })
      if (operation === 'disconnect') {
        if (!window.confirm(`Disconnect ${connection.name}? Agents and dependent workflows will lose access.`)) return
        await api.disconnect?.(connection.id)
      }
      setNotice(operation === 'test' ? `${connection.name} responded successfully.` : 'Connection updated.')
      await load()
    } catch (cause) { setNotice(apiError(cause, 'The connection could not be updated.')) }
  }
  const setPermission = async (capability, permissionMode) => {
    try {
      const current = selected.capabilityPermissions || {}
      await contextApi().tools.upsert?.({ id: selected.id, capabilityPermissions: { ...current, [capability.id || capability.name]: permissionMode } })
      setConnections((items) => items.map((item) => item.id === selected.id ? { ...item, capabilityPermissions: { ...current, [capability.id || capability.name]: permissionMode } } : item))
      setNotice('Capability permission updated.')
    } catch (cause) { setNotice(apiError(cause, 'Permission could not be updated.')) }
  }
  const save = async (event) => {
    event.preventDefault()
    try {
      await contextApi().tools.upsert?.({ name: form.name.trim(), transport: form.transport, ...(form.transport === 'stdio' ? { command: form.command.trim() } : { url: form.url.trim() }) })
      setAdding(false); setForm({ name: '', transport: 'stdio', command: '', url: '' }); await load()
    } catch (cause) { setNotice(apiError(cause, 'The connection could not be saved.')) }
  }
  return <section className="tools-settings"><div className="tools-settings__intro"><div><span className="eyebrow"><i /> Ambientic gateway</span><h2>Apps and tools, available to every agent.</h2><p>Ambientic connects once and proxies only approved capabilities. Providers never receive credentials or raw server configuration.</p></div><button type="button" onClick={() => setAdding((value) => !value)} disabled={state === 'unavailable'}>{adding ? 'Cancel' : '＋ Add MCP server'}</button></div>
    {notice && <div className="settings-notice"><span>i</span>{notice}</div>}
    {adding && <form className="tool-connect-form" onSubmit={save}><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="My local tools" /></label><label>Transport<select value={form.transport} onChange={(event) => setForm({ ...form, transport: event.target.value })}><option value="stdio">Local stdio</option><option value="http">Streamable HTTP</option></select></label><label>{form.transport === 'stdio' ? 'Command' : 'Server URL'}<input required value={form.transport === 'stdio' ? form.command : form.url} onChange={(event) => setForm({ ...form, [form.transport === 'stdio' ? 'command' : 'url']: event.target.value })} placeholder={form.transport === 'stdio' ? 'npx -y @example/mcp-server' : 'https://tools.example.com/mcp'} /></label><small>Secrets stay in the server’s own store or macOS Keychain.</small><button type="submit">Connect and inspect</button></form>}
    {state === 'loading' && <div className="tools-empty">Reading local connections…</div>}{state === 'unavailable' && <div className="tools-empty"><b>The tool gateway is not active in this build yet.</b><span>Provider connections remain available. Apps &amp; Tools will wake when the gateway service is installed.</span></div>}
    {state === 'ready' && !connections.length && <div className="tools-empty"><b>No shared tools connected.</b><span>Add a local or Streamable HTTP MCP server to make its capabilities available through Ambientic.</span></div>}
    {connections.length > 0 && <div className="tools-grid"><nav>{connections.map((item) => <button type="button" key={item.id} data-selected={selected?.id === item.id} onClick={() => setSelectedId(item.id)}><i data-status={item.disabled ? 'disabled' : item.health || item.status || 'unknown'} /><span><b>{item.name}</b><small>{item.transport || 'MCP'} · {item.disabled ? 'Disabled' : item.health || item.status || 'Not tested'}</small></span><em>{item.capabilityCount ?? ''}</em></button>)}</nav><main><header><div><span>{selected.transport || 'MCP'} connection</span><h3>{selected.name}</h3><p>{selected.description || 'Credentials remain outside provider agents and capabilities are invoked through the Ambientic gateway.'}</p>{selected.dependents && <small className="tool-dependents">Used by {selected.dependents.sessions || 0} active agent session(s){selected.dependents.workflows?.length ? ` and ${selected.dependents.workflows.map((item) => item.name).join(', ')}` : ''}. Disconnecting revokes this route.</small>}</div><div><button type="button" onClick={() => invoke('test')}>Test</button><button type="button" onClick={() => invoke('disable')}>{selected.disabled ? 'Enable' : 'Disable'}</button><button type="button" className="danger" onClick={() => invoke('disconnect')}>Disconnect</button></div></header><section><div className="tool-section-title"><b>Capabilities</b><span>{capabilities.length}</span></div>{!capabilities.length ? <p className="context-muted">No capabilities reported yet. Test the connection to refresh its inventory.</p> : <div className="capability-list">{capabilities.map((capability) => { const capabilityId = capability.id || capability.name; const permissionMode = selected.capabilityPermissions?.[capabilityId] || capability.permissionMode || 'ask'; return <article key={capabilityId}><span data-risk={capability.permission || capability.risk || 'read'}>{riskLabel(capability.permission || capability.risk)}</span><div><b>{capability.title || capability.name}</b><p>{capability.description || 'No description provided by this server.'}</p></div><select aria-label={`${capability.title || capability.name} permission`} value={permissionMode} onChange={(event) => setPermission(capability, event.target.value)}><option value="auto">Allow reads</option><option value="ask">Ask each time</option><option value="deny">Never allow</option></select></article> })}</div>}</section><footer><span>◇</span><p><b>Credential boundary</b><br />Ambientic passes tool results—not access tokens—to Codex, Claude, and Hermes.</p></footer></main></div>}
  </section>
}
