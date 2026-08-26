import React, { useMemo, useState } from 'react'
import './goals.css'

const columns = [
  { id: 'backlog', label: 'Backlog', hint: 'Captured for later' },
  { id: 'ready', label: 'Ready', hint: 'Clear next actions' },
  { id: 'in_progress', label: 'In progress', hint: 'Being worked on' },
  { id: 'blocked', label: 'Blocked', hint: 'Needs intervention' },
  { id: 'review', label: 'Review', hint: 'Waiting for proof' },
  { id: 'done', label: 'Done', hint: 'Accepted outcomes' }
]

const goalStatusLabel = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  achieved: 'Achieved',
  abandoned: 'Archived'
}

function dueLabel (date) {
  if (!date) return 'No target date'
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'No target date'
  return `Target ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)}`
}

function nextTask (goal) {
  return goal.tasks?.find((task) => task.status === 'in_progress') ||
    goal.tasks?.find((task) => task.status === 'ready') ||
    goal.tasks?.find((task) => task.status === 'blocked') ||
    goal.tasks?.find((task) => !['done'].includes(task.status))
}

function GoalCard ({ goal, index, onOpen }) {
  const next = nextTask(goal)
  return (
    <button
      className="goal-card"
      type="button"
      data-status={goal.status}
      style={{ '--goal-index': index }}
      onClick={() => onOpen(goal.id)}
    >
      <span className="goal-card__glow" />
      <header><span><i />{goalStatusLabel[goal.status] || goal.status}</span><em>{goal.priority === 'high' ? 'High priority' : dueLabel(goal.targetDate)}</em></header>
      <div className="goal-card__copy">
        <p>Goal {String(index + 1).padStart(2, '0')}</p>
        <h2>{goal.title}</h2>
        <span>{goal.outcome || 'Define the outcome that will make this goal real.'}</span>
      </div>
      <footer>
        <div className="goal-card__progress"><span><b>{goal.summary.progress}%</b><small>{goal.summary.done} of {goal.summary.total} tasks</small></span><progress value={goal.summary.progress} max="100" /></div>
        <div className="goal-card__next"><small>{goal.summary.blocked ? `${goal.summary.blocked} blocked` : 'Next action'}</small><b>{next?.title || 'Shape the first milestone'}</b><span>↗</span></div>
      </footer>
    </button>
  )
}

function useEditForm (initial) {
  const [form, setForm] = useState(initial)
  const field = (name) => ({ value: form[name], onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })) })
  return [form, field]
}

function failureMessage (error, fallback) {
  return error.message?.replace(/^Error invoking remote method '[^']+': Error:\s*/, '') || fallback
}

function formValues (record, fields) {
  return fields.reduce((values, name) => ({ ...values, [name]: record[name] || '' }), {})
}

const goalFields = ['title', 'outcome', 'why', 'successCriteria', 'targetDate', 'priority', 'status']

function GoalFields ({ field, autoFocus, withStatus }) {
  return (
    <>
      <label>Goal name<input {...field('title')} autoFocus={autoFocus} maxLength={100} placeholder="Build Ambientic, find a job, get better at…" /></label>
      <label>Desired outcome<textarea {...field('outcome')} maxLength={600} placeholder="What should be observably different when this succeeds?" /></label>
      <div className="goal-modal__split"><label>Why it matters<textarea {...field('why')} maxLength={1000} placeholder="The motivation and larger direction" /></label><label>Definition of success<textarea {...field('successCriteria')} maxLength={1200} placeholder="Evidence that proves the goal is achieved" /></label></div>
      <div className="goal-modal__split goal-modal__split--compact"><label>Target date<input {...field('targetDate')} type="date" /></label><label>Priority<select {...field('priority')}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label></div>
      {withStatus && <label>Status<select {...field('status')}>{Object.entries(goalStatusLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
    </>
  )
}

function GoalCreateModal ({ onClose, onCreate }) {
  const [form, field] = useEditForm({ title: '', outcome: '', why: '', successCriteria: '', targetDate: '', priority: 'normal' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      const goal = await onCreate(form)
      onClose(goal?.id)
    } catch (error) {
      setError(failureMessage(error, 'This goal could not be created.'))
      setSaving(false)
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="goal-modal" onSubmit={submit}>
        <header><div><span>Open a new path</span><h2>Create a goal</h2><p>Start with the outcome. Tasks come after the destination is clear.</p></div><button type="button" aria-label="Close" onClick={() => onClose()}>×</button></header>
        <GoalFields field={field} autoFocus />
        {error && <p className="goal-modal__error">{error}</p>}
        <footer><button type="button" onClick={() => onClose()}>Cancel</button><button className="primary" type="submit" disabled={!form.title.trim() || saving}>{saving ? 'Creating…' : 'Create goal'}</button></footer>
      </form>
    </div>
  )
}

function GoalEditModal ({ goal, onClose, onSave }) {
  const [form, field] = useEditForm(formValues(goal, goalFields))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(goal.id, form)
      onClose()
    } catch (error) {
      setError(failureMessage(error, 'This goal could not be saved.'))
      setSaving(false)
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="goal-modal" onSubmit={submit}>
        <header><div><span>Editing path</span><h2>Edit goal</h2><p>Restate the destination as your understanding of it changes.</p></div><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <GoalFields field={field} autoFocus withStatus />
        {error && <p className="goal-modal__error">{error}</p>}
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!form.title.trim() || saving}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
      </form>
    </div>
  )
}

const taskFields = ['title', 'description', 'milestone', 'acceptanceCriteria', 'ownerType', 'ownerName', 'status']

function TaskFields ({ form, field, autoFocus }) {
  return (
    <>
      <label>Task<input {...field('title')} autoFocus={autoFocus} maxLength={140} placeholder="A concrete next action" /></label>
      <div className="goal-modal__split"><label>Milestone<input {...field('milestone')} maxLength={120} placeholder="Optional checkpoint" /></label><label>Board state<select {...field('status')}>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label></div>
      <label>Context<textarea {...field('description')} maxLength={1600} placeholder="Only the context needed to perform this task" /></label>
      <label>Definition of done<textarea {...field('acceptanceCriteria')} maxLength={1200} placeholder="The evidence or observable result required" /></label>
      <div className="goal-modal__split goal-modal__split--compact"><label>Owner type<select {...field('ownerType')}><option value="human">Human</option><option value="agent">Agent</option><option value="mixed">Human + agent</option></select></label><label>Owner<input {...field('ownerName')} maxLength={80} placeholder={form.ownerType === 'agent' ? 'Builder, Codex, Claude…' : 'Samori'} /></label></div>
    </>
  )
}

function TaskCreateModal ({ goal, initialStatus, onClose, onCreate }) {
  const [form, field] = useEditForm({ title: '', description: '', milestone: '', acceptanceCriteria: '', ownerType: 'human', ownerName: '', status: initialStatus || 'backlog' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || saving) return
    setSaving(true)
    try {
      await onCreate(goal.id, form)
      onClose()
    } catch (error) {
      setError(failureMessage(error, 'This task could not be created.'))
      setSaving(false)
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="goal-modal goal-task-modal" onSubmit={submit}>
        <header><div><span>{goal.title}</span><h2>Add a task</h2><p>Give the human or agent a bounded action and a clear finish line.</p></div><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <TaskFields form={form} field={field} autoFocus />
        {error && <p className="goal-modal__error">{error}</p>}
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!form.title.trim() || saving}>{saving ? 'Adding…' : 'Add task'}</button></footer>
      </form>
    </div>
  )
}

function TaskEditModal ({ task, onCancel, onSave }) {
  const [form, field] = useEditForm(formValues(task, taskFields))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(task.id, form)
      onCancel()
    } catch (error) {
      setError(failureMessage(error, 'This task could not be saved.'))
      setSaving(false)
    }
  }
  return (
    <form className="goal-modal goal-task-modal" onSubmit={submit}>
      <header><div><span>Editing ticket</span><h2>Edit task</h2><p>Refine the action, the context, and the finish line as the work changes.</p></div><button type="button" aria-label="Close" onClick={onCancel}>×</button></header>
      <TaskFields form={form} field={field} autoFocus />
      {error && <p className="goal-modal__error">{error}</p>}
      <footer><button type="button" onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={!form.title.trim() || saving}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
    </form>
  )
}

function TaskCard ({ task, onOpen }) {
  return (
    <article
      className="goal-task"
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Open ${task.title}`}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(task.id)
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/ambientic-task', task.id)
      }}
    >
      <h3>{task.title}</h3>
    </article>
  )
}

function TaskDetailModal ({ task, onClose, onMove, onSave }) {
  const [editing, setEditing] = useState(false)
  const status = columns.find((column) => column.id === task.status)
  const owner = task.ownerName || (task.ownerType === 'agent' ? 'Unassigned agent' : task.ownerType === 'mixed' ? 'Shared' : 'You')
  if (editing) {
    return (
      <div className="modal-backdrop">
        <TaskEditModal task={task} onCancel={() => setEditing(false)} onSave={onSave} />
      </div>
    )
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="goal-ticket-modal" role="dialog" aria-modal="true" aria-labelledby={`ticket-title-${task.id}`}>
        <header>
          <div><span>{status?.label || task.status}</span><h2 id={`ticket-title-${task.id}`}>{task.title}</h2></div>
          <button className="goal-ticket-modal__edit" type="button" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" aria-label="Close ticket" onClick={onClose}>×</button>
        </header>
        <div className="goal-ticket-modal__meta">
          <label>Status<select value={task.status} onChange={(event) => onMove(task.id, event.target.value)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
          <div><span>Milestone</span><b>{task.milestone || 'Unscheduled'}</b></div>
          <div><span>Owner</span><b>{owner}</b><small>{task.ownerType === 'mixed' ? 'Human + agent' : task.ownerType}</small></div>
        </div>
        <div className="goal-ticket-modal__body">
          <section><span>Context</span><p>{task.description || 'No additional context yet.'}</p></section>
          <section><span>Definition of done</span><p>{task.acceptanceCriteria || 'No acceptance criteria yet.'}</p></section>
        </div>
        <footer><small>Drag this ticket between columns for a quick move, or edit it to change any detail.</small><button type="button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  )
}

function GoalDetail ({ goal, onBack, onUpdateGoal, onAddTask, onUpdateTask }) {
  const onMoveTask = (taskId, status) => onUpdateTask(taskId, { status })
  const [newTaskStatus, setNewTaskStatus] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [showGoalDetails, setShowGoalDetails] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const selectedTask = goal.tasks.find((task) => task.id === selectedTaskId)
  return (
    <section className="goal-detail">
      <header className="goal-detail__topbar"><button type="button" onClick={onBack}>← All goals</button><span>Goal field</span><button type="button" onClick={() => setNewTaskStatus('ready')}>＋ Add task</button></header>
      <div className="goal-detail__summary">
        <h1>{goal.title}</h1>
        <div className="goal-detail__summary-actions">
          <button type="button" onClick={() => setEditingGoal(true)}>Edit goal</button>
          <button type="button" aria-expanded={showGoalDetails} onClick={() => setShowGoalDetails((visible) => !visible)}>{showGoalDetails ? 'Hide goal details' : 'Goal details'}</button>
        </div>
      </div>
      {showGoalDetails && <div className="goal-detail__disclosure">
        <section><span>Desired outcome</span><p>{goal.outcome || 'Not defined yet.'}</p></section>
        <section><span>Why it matters</span><p>{goal.why || 'Not defined yet.'}</p></section>
        <section><span>Definition of success</span><p>{goal.successCriteria || 'Not defined yet.'}</p></section>
        <div className="goal-detail__disclosure-meta">
          <label>Status<select value={goal.status} onChange={(event) => onUpdateGoal(goal.id, { status: event.target.value })}>{Object.entries(goalStatusLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <span><small>Priority</small><b>{goal.priority}</b></span>
          <span><small>Target</small><b>{dueLabel(goal.targetDate).replace(/^Target /, '')}</b></span>
          <span><small>Progress</small><b>{goal.summary.progress}%</b></span>
        </div>
      </div>}
      <div className="goal-board-heading"><div><span>Execution field</span><h2>{goal.tasks.length} tickets</h2></div><p>Open a ticket for its context and definition of done. Drag it between states to move it.</p></div>
      <div className="goal-board">
        {columns.map((column) => {
          const tasks = goal.tasks.filter((task) => task.status === column.id)
          return (
            <section
              className="goal-column"
              key={column.id}
              data-column={column.id}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
              onDrop={(event) => {
                event.preventDefault()
                const taskId = event.dataTransfer.getData('text/ambientic-task')
                if (taskId) onMoveTask(taskId, column.id)
              }}
            >
              <header><div><i /><b>{column.label}</b><span>{tasks.length}</span></div><small>{column.hint}</small></header>
              <div className="goal-column__tasks">{tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={setSelectedTaskId} />)}</div>
              <button className="goal-column__add" type="button" onClick={() => setNewTaskStatus(column.id)}>＋ Add task</button>
            </section>
          )
        })}
      </div>
      {editingGoal && <GoalEditModal key={goal.id} goal={goal} onClose={() => setEditingGoal(false)} onSave={onUpdateGoal} />}
      {newTaskStatus && <TaskCreateModal goal={goal} initialStatus={newTaskStatus} onClose={() => setNewTaskStatus('')} onCreate={onAddTask} />}
      {selectedTask && <TaskDetailModal key={selectedTask.id} task={selectedTask} onClose={() => setSelectedTaskId('')} onMove={onMoveTask} onSave={onUpdateTask} />}
    </section>
  )
}

export function GoalsWorkspace ({ snapshot, selectedGoalId, onSelectGoal, onCreateGoal, onUpdateGoal, onCreateTask, onUpdateTask }) {
  const [creating, setCreating] = useState(false)
  const goals = snapshot?.goals || []
  const selected = useMemo(() => goals.find((goal) => goal.id === selectedGoalId), [goals, selectedGoalId])
  const active = goals.filter((goal) => ['active', 'draft'].includes(goal.status))
  const resting = goals.filter((goal) => !['active', 'draft'].includes(goal.status))
  if (selected) {
    return <GoalDetail goal={selected} onBack={() => onSelectGoal('')} onUpdateGoal={onUpdateGoal} onAddTask={onCreateTask} onUpdateTask={onUpdateTask} />
  }
  return (
    <section className="goals-page">
      <header className="goals-topbar"><span>Goals</span><div><small>{active.length} active paths</small><button type="button" onClick={() => setCreating(true)}>＋ New goal</button></div></header>
      <div className="goals-scroll">
        <div className="goals-hero"><span className="eyebrow"><i />Your living direction</span><h1>Turn intention into<br /><em>momentum.</em></h1><p>Goals are the shared layer above every agent. Define what matters, shape the path, and keep human and agent work moving toward the same outcome.</p><div className="goals-hero__signals"><span><b>{goals.reduce((sum, goal) => sum + goal.summary.active, 0)}</b> moving</span><span><b>{goals.reduce((sum, goal) => sum + goal.summary.blocked, 0)}</b> blocked</span><span><b>{goals.reduce((sum, goal) => sum + goal.summary.done, 0)}</b> completed tasks</span></div></div>
        {active.length ? <div className="goal-field">{active.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} onOpen={onSelectGoal} />)}<button className="goal-card goal-card--new" type="button" onClick={() => setCreating(true)}><span>＋</span><h2>Open a new path</h2><p>Capture an outcome worth moving toward.</p></button></div> : <div className="goals-empty"><span>✦</span><h2>Your first path starts here.</h2><p>Create a meaningful outcome. Ambientic will become the shared execution layer between you and your agents.</p><button type="button" onClick={() => setCreating(true)}>Create your first goal</button></div>}
        {resting.length > 0 && <section className="goals-library"><header><div><span>Quiet field</span><h2>Paused and completed</h2></div><small>{resting.length} goals</small></header><div>{resting.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index + active.length} onOpen={onSelectGoal} />)}</div></section>}
      </div>
      {creating && <GoalCreateModal onClose={(goalId) => { setCreating(false); if (goalId) onSelectGoal(goalId) }} onCreate={onCreateGoal} />}
    </section>
  )
}
