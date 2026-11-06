import React, { useEffect, useRef, useState } from 'react'
import { AgentIcon } from './AgentIcon.jsx'
import { providerColumnLayout, resizeProviderColumns } from '../shared/recent-thread-grid.mjs'
import './provider-pad-headers.css'

export function useProviderPadLayout (midi) {
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const signature = JSON.stringify(midi?.providerLayout || [])
  useEffect(() => setDraft(null), [signature])
  const save = async (widths) => {
    setSaving(true)
    setError('')
    try { await window.controller.midiSetProviderColumns(widths) }
    catch (error) { setError(error.message) }
    finally { setDraft(null); setSaving(false) }
  }
  return { layout: draft || midi?.providerLayout || [], preview: setDraft, save, error, saving }
}

export function ProviderPadHeaders ({ layout, padCount, automatic, preview, save, error, saving }) {
  const container = useRef(null)
  const drag = useRef(null)
  const signature = JSON.stringify(layout.map((group) => group.id))
  useEffect(() => { drag.current = null }, [signature])
  const begin = (event, boundary) => {
    if (saving || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { boundary, x: event.clientX, layout, widths: null, step: (container.current.getBoundingClientRect().width + 10) / 8 }
  }
  const move = (event) => {
    const current = drag.current
    if (!current) return
    const widths = resizeProviderColumns(current.layout, current.boundary, (event.clientX - current.x) / current.step)
    current.widths = widths
    preview(providerColumnLayout(current.layout.map((group) => group.id), widths))
  }
  const finish = (event) => {
    const current = drag.current
    if (!current) return
    move(event)
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    save(current.widths)
  }
  const cancel = () => { drag.current = null; preview(null) }
  return <div className="provider-pad-layout">
    <div className="provider-pad-layout__help"><span>{layout.length ? 'Drag a divider to resize provider columns' : 'Connect an AI provider in Settings to fill this grid.'}</span>{layout.length > 1 && <button type="button" disabled={saving || automatic} onClick={() => save(null)}>Equal split</button>}</div>
    <div className="provider-pad-headers" ref={container} aria-label="Provider column allocation">
      {layout.map((group, index) => <div className="provider-pad-header" key={group.id} data-provider={group.id} style={{ gridColumn: `${group.start + 1} / span ${group.columns}` }}>
        <AgentIcon agent={group.id} /><div><b>{group.label}</b><small>Columns {group.start + 1}{group.columns > 1 ? `–${group.start + group.columns}` : ''} · {group.columns * Math.floor(padCount / 8)} pads</small></div>
        {index < layout.length - 1 && <button type="button" className="provider-pad-divider" role="separator" aria-orientation="vertical" aria-label={`Resize ${group.label} and ${layout[index + 1].label} columns`} aria-valuemin={1} aria-valuemax={group.columns + layout[index + 1].columns - 1} aria-valuenow={group.columns} disabled={saving}
          onPointerDown={(event) => begin(event, index)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel() }}
          onKeyDown={(event) => { if (event.key === 'Escape') { cancel(); return }; if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); save(resizeProviderColumns(layout, index, event.key === 'ArrowLeft' ? -1 : 1)) }}><span>⋮</span></button>}
      </div>)}
    </div>
    {error && <p role="alert" className="provider-pad-layout__error">{error}</p>}
  </div>
}
