import React, { useEffect, useMemo, useState } from 'react'
import './hardware.css'
import { AgentIcon } from './AgentIcon.jsx'

const CATEGORY_LABELS = {
  navigation: 'Views',
  providers: 'Providers',
  goals: 'Goals',
  threads: 'Threads',
  turns: 'Turn actions',
  skills: 'Skills',
  ambientic: 'Ambientic'
}

const ACTION_GLYPHS = {
  navigation: '↗', providers: '✦', goals: '◇', threads: '☷', turns: '→', skills: '✣', ambientic: '◎'
}

function bindingLabel (key = '') {
  const [type, ...parts] = key.split(':')
  if (type === 'note') return `Note ${parts[1]} · Ch ${Number(parts[0]) + 1}`
  if (type === 'cc') return `CC ${parts[1]} · Ch ${Number(parts[0]) + 1}`
  if (type === 'key') return parts.join(':').replaceAll('Meta', '⌘').replaceAll('Control', '⌃').replaceAll('Alt', '⌥').replaceAll('Shift', '⇧').replaceAll('+Key', '+')
  return key
}

function CreateTemplate ({ onClose, onCreate }) {
  const [name, setName] = useState('My control deck')
  const [rows, setRows] = useState(5)
  const [columns, setColumns] = useState(8)
  return <div className="hardware-modal" role="dialog" aria-modal="true" aria-label="Create mapping template"><form onSubmit={(event) => { event.preventDefault(); onCreate({ name, rows, columns, description: 'A personal multi-view Ambientic control surface.' }) }}><span>New instrument</span><h2>Create a control deck</h2><p>Choose the virtual grid. You will connect physical pads and keys in Map mode.</p><label>Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label><div className="hardware-modal__dimensions"><label>Rows<input type="number" min="1" max="12" value={rows} onChange={(event) => setRows(event.target.value)} /></label><b>×</b><label>Columns<input type="number" min="1" max="12" value={columns} onChange={(event) => setColumns(event.target.value)} /></label></div><footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Create deck</button></footer></form></div>
}

function CreateView ({ linked, onClose, onCreate }) {
  const [name, setName] = useState(linked ? 'Linked view' : 'New view')
  return <div className="hardware-modal" role="dialog" aria-modal="true" aria-label="Create hardware view"><form onSubmit={(event) => { event.preventDefault(); onCreate(name) }}><span>{linked ? 'Linked navigation' : 'New view'}</span><h2>{linked ? 'Open another part of the deck' : 'Add a view'}</h2><p>{linked ? 'The selected pad will open this view and Ambientic will place Back in its final slot.' : 'This view reuses the same learned physical positions with a new set of actions.'}</p><label>View name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label><footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Create view</button></footer></form></div>
}

function EditTemplate ({ template, onClose, onSave }) {
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  return <div className="hardware-modal" role="dialog" aria-modal="true" aria-label="Edit hardware template"><form onSubmit={(event) => { event.preventDefault(); onSave({ name, description }) }}><span>Deck details</span><h2>Edit this instrument</h2><p>Names and descriptions travel with an exported template. Physical bindings never do.</p><label>Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></label><footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save deck</button></footer></form></div>
}

function EditView ({ template, view, onClose, onSave, onDelete }) {
  const [name, setName] = useState(view.name)
  const canDelete = view.id !== template.rootViewId && template.views.length > 1
  return <div className="hardware-modal" role="dialog" aria-modal="true" aria-label="Edit hardware view"><form onSubmit={(event) => { event.preventDefault(); onSave(name) }}><span>View details</span><h2>Edit {view.name}</h2><p>Renaming keeps every link intact. Deleting a secondary view also clears pads that link to it.</p><label>View name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label><footer className="hardware-modal__split">{canDelete && <button type="button" className="danger" onClick={onDelete}>Delete view</button>}<span /><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save view</button></footer></form></div>
}

function AssignmentInspector ({ template, view, slot, actions, sessions, goals, connectors, binding, learning, onAssign, onLearn, onClearBinding, onCreateLinkedView }) {
  const existing = view?.assignments?.[slot] || null
  const [draft, setDraft] = useState(existing || { actionId: '', label: '', targetId: '', targetLabel: '', prompt: '', provider: 'codex', trigger: 'press' })
  useEffect(() => setDraft(existing || { actionId: '', label: '', targetId: '', targetLabel: '', prompt: '', provider: 'codex', trigger: 'press' }), [slot, existing?.actionId, existing?.targetId, existing?.prompt])
  if (!slot) return <aside className="hardware-inspector hardware-inspector--empty"><span>Pad inspector</span><div><i>◇</i><h3>Select a pad</h3><p>Give it an Ambientic action, link another view, or connect a physical control.</p></div></aside>

  const definition = actions.find((item) => item.id === draft.actionId)
  const category = definition?.category || ''
  const targetOptions = definition?.target === 'thread'
    ? sessions.map((item) => ({ id: item.id, label: item.task || item.label || item.summary || 'Untitled thread' }))
    : definition?.target === 'goal'
        ? goals.map((item) => ({ id: item.id, label: item.title }))
        : definition?.target === 'provider'
            ? connectors.filter((item) => ['codex', 'claude', 'hermes'].includes(item.id)).map((item) => ({ id: item.id, label: item.label }))
            : definition?.target === 'view'
                ? template.views.filter((item) => item.id !== view.id).map((item) => ({ id: item.id, label: item.name }))
                : []
  if (draft.targetId && !targetOptions.some((item) => item.id === draft.targetId) && definition?.target && !['none', 'skill'].includes(definition.target)) targetOptions.push({ id: draft.targetId, label: draft.targetLabel || 'Unavailable target' })
  const needsPrompt = definition?.inputs?.includes('prompt')
  const needsProvider = definition?.inputs?.includes('provider')
  const missingTarget = definition?.target && definition.target !== 'none' && !draft.targetId
  const missingRequiredPrompt = definition?.id === 'thread.send-prompt' && !String(draft.prompt || '').trim()
  const assignmentReady = Boolean(draft.actionId && !missingTarget && !missingRequiredPrompt)
  const setAction = (actionId) => {
    const next = actions.find((item) => item.id === actionId)
    setDraft({ actionId, label: next?.label || '', targetId: '', targetLabel: '', prompt: '', provider: 'codex', trigger: 'press' })
  }
  const selectTarget = (targetId) => {
    const option = targetOptions.find((item) => item.id === targetId)
    setDraft((current) => ({ ...current, targetId, targetLabel: option?.label || targetId }))
  }

  return <aside className="hardware-inspector"><header><span>Pad inspector</span><b>{slot.replace('pad-', '').replace('-', ' · ')}</b></header><div className="hardware-inspector__scroll"><section><label>Action<select value={draft.actionId} onChange={(event) => setAction(event.target.value)}><option value="">Empty pad</option>{Object.entries(CATEGORY_LABELS).map(([id, label]) => <optgroup key={id} label={label}>{actions.filter((item) => item.category === id).map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}</optgroup>)}</select></label>{definition?.target === 'skill' ? <label>Skill name<input value={draft.targetLabel} placeholder="e.g. pdf or gh-fix-ci" onChange={(event) => setDraft((current) => ({ ...current, targetId: event.target.value, targetLabel: event.target.value }))} /></label> : targetOptions.length > 0 ? <label>Target<select value={draft.targetId} onChange={(event) => selectTarget(event.target.value)}><option value="">Choose…</option>{targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}{needsProvider && <label>Run with<select value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))}><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="hermes">Hermes</option></select></label>}{needsPrompt && <label>Saved instruction<textarea value={draft.prompt} placeholder="What should this pad ask the agent to do?" onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))} /></label>}<label>Trigger<select value={draft.trigger || 'press'} onChange={(event) => setDraft((current) => ({ ...current, trigger: event.target.value }))}><option value="press">Press</option><option value="release">Release</option><option value="hold">Hold for 650 ms</option><option value="value">CC value change</option></select></label><label>Pad label<input value={draft.label} placeholder={definition?.label || 'Name this pad'} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} /></label>{definition?.permission === 'confirm' && <p className="hardware-inspector__permission"><i>!</i>This action asks for confirmation before it runs from hardware.</p>}{draft.actionId && !assignmentReady && <p className="hardware-inspector__setup">Choose the required {missingTarget ? 'target' : 'saved instruction'} before saving this pad.</p>}<button className="hardware-inspector__save" type="button" disabled={!assignmentReady} onClick={() => onAssign({ ...draft, needsSetup: false })}>Save assignment</button>{existing && <button className="hardware-inspector__clear" type="button" onClick={() => onAssign({})}>Clear assignment</button>}<button className="hardware-inspector__linked" type="button" onClick={onCreateLinkedView}>Create linked view from this pad <span>↗</span></button></section><section className="hardware-binding"><header><div><span>Physical control</span><b>{binding ? bindingLabel(binding) : 'Not mapped'}</b></div><i data-active={learning} /></header><p>{learning ? 'Listening… press a MIDI pad, MIDI key, or computer key.' : 'The same physical control activates this position on every view.'}</p><div><button type="button" data-learning={learning} onClick={onLearn}>{learning ? 'Cancel Learn' : binding ? 'Learn again' : 'Learn control'}</button>{binding && <button type="button" onClick={onClearBinding}>Clear</button>}</div></section></div></aside>
}

function TemplateLibrary ({ templates, activeId, onSelect, onCreate, onImport }) {
  return <aside className="hardware-library"><header><span>Local library</span><button type="button" onClick={onCreate}>＋</button></header><div>{templates.map((template) => <button type="button" key={template.id} data-selected={template.id === activeId} onClick={() => onSelect(template.id)}><i>{template.builtIn ? '◎' : '▦'}</i><span><b>{template.name}</b><small>{template.builtIn ? 'Built-in native mode' : `${template.rows}×${template.columns} · ${template.views.length} view${template.views.length === 1 ? '' : 's'}`}</small></span>{template.id === activeId && <em>Live</em>}</button>)}</div><footer><button type="button" onClick={onImport}>⇧ Import template</button><p>Templates stay private on this Mac until you export them.</p></footer></aside>
}

export function HardwareWorkspace ({ snapshot, midi, sessions, goalsSnapshot, connectors, onOpenThread }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState('')
  const [notice, setNotice] = useState('')
  const [viewCreation, setViewCreation] = useState(null)
  const [templateEditing, setTemplateEditing] = useState(false)
  const [viewEditing, setViewEditing] = useState(false)
  const template = snapshot.templates.find((item) => item.id === snapshot.activeTemplateId) || snapshot.templates[0]
  const view = template?.views.find((item) => item.id === snapshot.activeViewId) || template?.views[0]
  const displayRows = template?.builtIn && midi.activeProfile === 'apc40-mkii' ? 5 : template?.rows
  const displayColumns = template?.builtIn ? 8 : template?.columns
  const displaySlots = template?.builtIn ? snapshot.slots.slice(0, Math.max(1, Number(midi.padCount) || 64)) : snapshot.slots
  const bindingsBySlot = useMemo(() => Object.fromEntries(Object.entries(template?.bindings || {}).map(([key, slot]) => [slot, key])), [template?.bindings])
  const learning = snapshot.learning?.slot === selectedSlot

  useEffect(() => {
    if (!template || template.builtIn) setSelectedSlot('')
    else if (selectedSlot && !snapshot.slots.some((slot) => slot.id === selectedSlot)) setSelectedSlot('')
  }, [template?.id, snapshot.slots.length])

  useEffect(() => {
    if (!template || template.builtIn || !['play', 'map'].includes(snapshot.mode)) return
    const sendKey = (event, pressed) => {
      if (event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return
      if (['Escape', 'Tab'].includes(event.key)) return
      const modifiers = [event.metaKey && 'Meta', event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean)
      event.preventDefault()
      window.controller.hardwareKeyInput(event.code, modifiers, pressed)
    }
    const down = (event) => sendKey(event, true)
    const up = (event) => sendKey(event, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [template?.id, template?.builtIn, snapshot.mode])

  if (!template) return <section className="hardware-workspace"><div className="hardware-empty">Preparing the hardware field…</div></section>

  const selectTemplate = async (id) => { await window.controller.hardwareActivateTemplate(id); setSelectedSlot('') }
  const createTemplate = async (input) => { await window.controller.hardwareCreateTemplate(input); setCreateOpen(false); setSelectedSlot('pad-1-1') }
  const addView = async (name, linked = false) => {
    const created = await window.controller.hardwareAddView(template.id, linked ? { name, fromViewId: view.id, fromSlotId: selectedSlot } : { name })
    await window.controller.hardwareOpenView(created.id)
    setSelectedSlot('')
    setViewCreation(null)
  }
  const updateTemplate = async (patch) => { await window.controller.hardwareUpdateTemplate(template.id, patch); setTemplateEditing(false); setNotice('Deck details saved') }
  const updateView = async (name) => { await window.controller.hardwareRenameView(template.id, view.id, name); setViewEditing(false); setNotice('View renamed') }
  const deleteView = async () => { await window.controller.hardwareDeleteView(template.id, view.id); setViewEditing(false); setSelectedSlot(''); setNotice('View deleted') }
  const padPress = (slot) => {
    if (template.builtIn) {
      const index = snapshot.slots.findIndex((item) => item.id === slot)
      if (sessions[index]) onOpenThread(sessions[index].id)
      return
    }
    if (snapshot.mode === 'play' || snapshot.mode === 'test') window.controller.hardwareTriggerPad(slot)
    else {
      setSelectedSlot(slot)
      if (snapshot.mode === 'map') window.controller.hardwareLearnPad(template.id, slot)
    }
  }
  const importTemplate = async () => { try { const result = await window.controller.hardwareImportTemplate(); if (result) { const setupCount = result.views.flatMap((item) => Object.values(item.assignments || {})).filter((assignment) => assignment.needsSetup).length; setNotice(`Imported ${result.name}${setupCount ? ` · ${setupCount} pad${setupCount === 1 ? '' : 's'} need setup` : ''}`) } } catch (error) { setNotice(error.message) } }
  const exportTemplate = async () => { try { const result = await window.controller.hardwareExportTemplate(template.id); if (result?.exported) setNotice('Portable template exported') } catch (error) { setNotice(error.message) } }

  return <section className="hardware-workspace">
    <header className="hardware-topbar"><div><span>Hardware</span><h1>{template.name}</h1></div><div className="hardware-signal" key={snapshot.lastInput?.at || 0} data-connected={Boolean(midi.connected)} data-received={Boolean(snapshot.lastInput?.at)}><i /><span><b>{midi.connected ? 'MIDI online' : 'Waiting for MIDI'}</b><small>{snapshot.lastInput ? bindingLabel(snapshot.lastInput.key) : midi.connected ? midi.device : 'Connect a controller or use keyboard Learn'}</small></span></div><div className="hardware-modes" role="group" aria-label="Hardware workspace mode">{['play', 'edit', 'map', 'test'].map((mode) => <button type="button" key={mode} data-selected={snapshot.mode === mode} onClick={() => window.controller.hardwareSetMode(mode)}>{mode === 'map' ? 'Map MIDI' : mode[0].toUpperCase() + mode.slice(1)}</button>)}</div></header>
    <div className="hardware-layout">
      <TemplateLibrary templates={snapshot.templates} activeId={template.id} onSelect={selectTemplate} onCreate={() => setCreateOpen(true)} onImport={importTemplate} />
      <main className="hardware-stage">
        <div className="hardware-stage__atmosphere" />
        <header className="hardware-deck-header"><div><span>{template.builtIn ? 'System instrument' : `${template.rows} × ${template.columns} control deck`}</span><p>{template.description || 'A programmable Ambientic hardware surface.'}</p></div><div><button type="button" onClick={() => window.controller.hardwareDuplicateTemplate(template.id)}>Fork</button>{!template.builtIn && <><button type="button" onClick={() => setTemplateEditing(true)}>Edit deck</button><button type="button" onClick={exportTemplate}>Export</button><button type="button" className="danger" onClick={() => window.confirm(`Delete “${template.name}”?`) && window.controller.hardwareDeleteTemplate(template.id)}>Delete</button></>}</div></header>
        <div className="hardware-viewbar"><div>{template.views.map((item, index) => <button type="button" key={item.id} data-selected={item.id === view?.id} onClick={() => window.controller.hardwareOpenView(item.id)}><i>{String(index + 1).padStart(2, '0')}</i>{item.name}</button>)}</div>{!template.builtIn && <><button type="button" onClick={() => setViewEditing(true)}>Edit view</button><button type="button" onClick={() => setViewCreation({ linked: false })}>＋ New view</button></>}</div>
        <div className="hardware-grid-wrap"><div className="hardware-grid" data-mode={snapshot.mode} style={{ '--hardware-columns': displayColumns, '--hardware-rows': displayRows }}>{displaySlots.map((slot, index) => {
          const assignment = template.builtIn ? null : view?.assignments?.[slot.id]
          const session = template.builtIn ? sessions[index] : null
          const definition = snapshot.actions.find((item) => item.id === assignment?.actionId)
          const category = definition?.category || (session ? 'threads' : '')
          const tone = assignment?.feedback || (session?.state === 'running' ? 'green' : ['waiting', 'attention'].includes(session?.state) ? 'red' : session ? 'blue' : 'empty')
          const bound = Boolean(bindingsBySlot[slot.id])
          return <button type="button" key={slot.id} className="hardware-pad" data-selected={selectedSlot === slot.id} data-tone={tone} data-bound={bound} data-empty={!assignment && !session} onClick={() => padPress(slot.id)} style={{ '--pad-delay': `${(index % Math.max(template.columns, 1)) * -0.12}s` }}><span className="hardware-pad__index">{String(index + 1).padStart(2, '0')}</span><i className="hardware-pad__glyph">{session ? <AgentIcon agent={session.agent} /> : ACTION_GLYPHS[category] || '·'}</i><span className="hardware-pad__copy"><b>{assignment?.label || session?.task || session?.label || (template.builtIn ? 'Unassigned session' : 'Empty pad')}</b><small>{assignment?.targetLabel || (definition ? CATEGORY_LABELS[definition.category] : session ? session.state : bound ? bindingLabel(bindingsBySlot[slot.id]) : 'Select to assign')}</small></span>{bound && <em title={bindingLabel(bindingsBySlot[slot.id])}>●</em>}</button>
        })}</div></div>
        <footer className="hardware-stage__footer"><span><i data-connected={Boolean(midi.connected)} />{midi.connected ? `${midi.model} · ${midi.gridLabel}` : 'Input-only keyboard mapping is available without MIDI'}</span><p className={snapshot.lastResult ? 'hardware-action-result' : ''} data-state={snapshot.lastResult?.pending ? 'pending' : snapshot.lastResult?.ok === false ? 'error' : 'ok'}>{snapshot.lastResult?.message || (snapshot.mode === 'map' ? 'Choose a virtual pad, then touch the physical control.' : snapshot.mode === 'edit' ? 'Select a pad to assign an action or create a linked view.' : snapshot.mode === 'test' ? 'Actions run, but confirmation boundaries remain active.' : 'Your active view follows the same controls on screen and hardware.')}</p></footer>
      </main>
      {template.builtIn ? <aside className="hardware-inspector hardware-native"><span>Native profile</span><div><i>◎</i><h3>Protected by design</h3><p>The APC session grid, RGB task truth, voice controls, and Vibe restoration remain stable here.</p><button type="button" onClick={() => window.controller.hardwareDuplicateTemplate(template.id)}>Fork to customize</button></div></aside> : <AssignmentInspector template={template} view={view} slot={selectedSlot} actions={snapshot.actions} sessions={sessions} goals={goalsSnapshot.goals || []} connectors={connectors} binding={bindingsBySlot[selectedSlot]} learning={learning} onAssign={(assignment) => window.controller.hardwareAssignPad(template.id, view.id, selectedSlot, assignment)} onLearn={() => learning ? window.controller.hardwareCancelLearn() : window.controller.hardwareLearnPad(template.id, selectedSlot)} onClearBinding={() => window.controller.hardwareClearBinding(template.id, selectedSlot)} onCreateLinkedView={() => setViewCreation({ linked: true })} />}
    </div>
    {notice && <button className="hardware-notice" type="button" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
    {createOpen && <CreateTemplate onClose={() => setCreateOpen(false)} onCreate={createTemplate} />}
    {viewCreation && <CreateView linked={viewCreation.linked} onClose={() => setViewCreation(null)} onCreate={(name) => addView(name, viewCreation.linked)} />}
    {templateEditing && <EditTemplate template={template} onClose={() => setTemplateEditing(false)} onSave={updateTemplate} />}
    {viewEditing && <EditView template={template} view={view} onClose={() => setViewEditing(false)} onSave={updateView} onDelete={deleteView} />}
  </section>
}
