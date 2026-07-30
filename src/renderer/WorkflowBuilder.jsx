import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  WORKFLOW_STORAGE_KEY,
  NODE_KINDS,
  addWorkflowNode,
  createStarterWorkflow,
  draftWorkflowFromPrompt,
  panViewport,
  removeWorkflowNode,
  toPortableManifest,
  zoomViewportAtPoint
} from './workflow-model.mjs'
import './workflows.css'

const NODE_WIDTH = 222
const NODE_HEIGHT = 106

function loadWorkflow () {
  try {
    const stored = JSON.parse(window.localStorage.getItem(WORKFLOW_STORAGE_KEY) || 'null')
    if (stored?.nodes?.length && Array.isArray(stored.edges)) return stored
  } catch {}
  return createStarterWorkflow()
}

function WorkflowNode ({ node, selected, running, scale, onSelect, onMoveStart, onMove }) {
  const definition = NODE_KINDS[node.kind] || NODE_KINDS.tool
  const dragRef = useRef(null)

  const startDrag = (event) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect(node.id)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y, checkpointed: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event) => {
    if (!dragRef.current) return
    if (!dragRef.current.checkpointed) {
      onMoveStart()
      dragRef.current.checkpointed = true
    }
    onMove(node.id, {
      x: dragRef.current.x + (event.clientX - dragRef.current.pointerX) / scale,
      y: dragRef.current.y + (event.clientY - dragRef.current.pointerY) / scale
    })
  }

  return (
    <button
      className="workflow-node"
      data-tone={definition.tone}
      data-selected={selected}
      data-running={running}
      type="button"
      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
      onPointerDown={startDrag}
      onPointerMove={move}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
      onClick={(event) => { event.stopPropagation(); onSelect(node.id) }}
    >
      <i className="workflow-node__input" aria-hidden="true" />
      <span className="workflow-node__icon">{definition.icon}</span>
      <span className="workflow-node__copy">
        <small>{definition.eyebrow}</small>
        <b>{node.label}</b>
        <em>{node.detail}</em>
      </span>
      <span className="workflow-node__menu" aria-hidden="true">•••</span>
      <i className="workflow-node__output" aria-hidden="true" />
    </button>
  )
}

function WorkflowEdge ({ from, to }) {
  if (!from || !to) return null
  const fromCenterX = from.x + NODE_WIDTH / 2
  const toCenterX = to.x + NODE_WIDTH / 2

  if (Math.abs(toCenterX - fromCenterX) < NODE_WIDTH / 2) {
    const startX = fromCenterX
    const startY = from.y + NODE_HEIGHT
    const endX = toCenterX
    const endY = to.y
    const distance = Math.max(58, Math.abs(endY - startY) * 0.5)
    return <path d={`M ${startX} ${startY} C ${startX} ${startY + distance}, ${endX} ${endY - distance}, ${endX} ${endY}`} />
  }

  const forward = toCenterX > fromCenterX
  const startX = forward ? from.x + NODE_WIDTH : from.x
  const endX = forward ? to.x : to.x + NODE_WIDTH
  const startY = from.y + NODE_HEIGHT / 2
  const endY = to.y + NODE_HEIGHT / 2
  const direction = forward ? 1 : -1
  const distance = Math.max(72, Math.abs(endX - startX) * 0.45)
  return <path d={`M ${startX} ${startY} C ${startX + distance * direction} ${startY}, ${endX - distance * direction} ${endY}, ${endX} ${endY}`} />
}

function NodePalette ({ onAdd }) {
  const groups = [
    ['Start', ['schedule']],
    ['Think', ['web', 'agent']],
    ['Decide', ['approval']],
    ['Act', ['inbox', 'calendar', 'tool']]
  ]
  return (
    <aside className="workflow-palette">
      <header><span>Building blocks</span><p>Click a block to add it to the flow.</p></header>
      {groups.map(([label, kinds]) => (
        <section key={label}>
          <h3>{label}</h3>
          {kinds.map((kind) => {
            const item = NODE_KINDS[kind]
            return <button type="button" key={kind} data-tone={item.tone} onClick={() => onAdd(kind)}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.eyebrow}</small></span><em>＋</em></button>
          })}
        </section>
      ))}
      <footer><i>◇</i><p><b>Portable by design</b><span>Steps describe capabilities, not a specific provider.</span></p></footer>
    </aside>
  )
}

function Inspector ({ node, onChange, onDelete, onClose }) {
  if (!node) {
    return (
      <aside className="workflow-inspector workflow-inspector--empty">
        <span>Inspector</span>
        <div><i>⌁</i><b>Select a step</b><p>Choose any node to see what it needs, which agent can run it, and what it may access.</p></div>
      </aside>
    )
  }
  const definition = NODE_KINDS[node.kind] || NODE_KINDS.tool
  return (
    <aside className="workflow-inspector">
      <header><div><span>{definition.eyebrow} step</span><h2>{node.label}</h2></div><button type="button" aria-label="Close inspector" onClick={onClose}>×</button></header>
      <div className="workflow-inspector__body">
        <label><span>Name</span><input value={node.label} onChange={(event) => onChange({ label: event.target.value })} /></label>
        <label><span>{node.kind === 'schedule' ? 'Recurrence' : 'Instruction'}</span><textarea rows="3" value={node.detail} onChange={(event) => onChange({ detail: event.target.value })} /></label>
        {node.kind === 'agent' && <label><span>Agent policy</span><select value={node.provider || 'auto'} onChange={(event) => onChange({ provider: event.target.value })}><option value="auto">Best available agent</option><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="hermes">Hermes</option></select><small>“Best available” keeps this workflow portable across providers.</small></label>}
        <section className="workflow-capability">
          <span>Capability</span><code>{node.action}</code>
          <dl><div><dt>Permission</dt><dd>{definition.permission}</dd></div><div><dt>Provider</dt><dd>{node.kind === 'agent' ? (node.provider === 'auto' ? 'Resolved at runtime' : node.provider) : 'Provider neutral'}</dd></div><div><dt>Recovery</dt><dd>Resume safely</dd></div></dl>
        </section>
      </div>
      <footer><button type="button" onClick={onDelete}>Remove step</button><span>Changes save locally</span></footer>
    </aside>
  )
}

export function WorkflowBuilder ({ initialWorkflow, onChange, onBack, onRun, activeRun, onApproveRun, onCancelRun } = {}) {
  const [workflow, setWorkflow] = useState(() => initialWorkflow ? structuredClone(initialWorkflow) : loadWorkflow())
  const [selectedId, setSelectedId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [viewport, setViewport] = useState({ x: 30, y: 20, scale: 0.82 })
  const [notice, setNotice] = useState('Saved locally')
  const [runningId, setRunningId] = useState('')
  const [promptCollapsed, setPromptCollapsed] = useState(false)
  const panRef = useRef(null)
  const canvasRef = useRef(null)
  const runTimersRef = useRef([])
  const historyRef = useRef([])
  const onChangeRef = useRef(onChange)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflow))
    onChangeRef.current?.(workflow)
  }, [workflow])

  useEffect(() => () => runTimersRef.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!activeRun) return
    setRunningId(activeRun.currentStepId || '')
    const labels = {
      queued: 'Run queued',
      running: 'Workflow is running',
      awaiting_approval: 'Waiting for your approval',
      needs_attention: 'Agent needs attention in Threads',
      completed: 'Run completed',
      failed: `Run failed · ${activeRun.error || 'Open run details'}`,
      denied: 'Run stopped by you',
      cancelled: 'Run cancelled'
    }
    setNotice(labels[activeRun.status] || activeRun.status)
  }, [activeRun?.id, activeRun?.status, activeRun?.currentStepId, activeRun?.error])

  const nodesById = useMemo(() => new Map(workflow.nodes.map((node) => [node.id, node])), [workflow.nodes])
  const selectedNode = nodesById.get(selectedId)

  const checkpoint = () => {
    historyRef.current = [...historyRef.current.slice(-59), structuredClone(workflow)]
  }

  const commitWorkflow = (updater) => {
    setWorkflow((current) => {
      historyRef.current = [...historyRef.current.slice(-59), structuredClone(current)]
      return typeof updater === 'function' ? updater(current) : updater
    })
  }

  const undo = () => {
    const previous = historyRef.current.pop()
    if (!previous) {
      setNotice('Nothing to undo')
      return
    }
    setWorkflow(previous)
    setSelectedId((current) => previous.nodes.some((node) => node.id === current) ? current : '')
    setNotice('Last canvas change undone')
  }

  const fitWorkflow = (nodes = workflow.nodes) => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const minX = Math.min(...nodes.map((node) => node.x))
    const maxX = Math.max(...nodes.map((node) => node.x + NODE_WIDTH))
    const minY = Math.min(...nodes.map((node) => node.y))
    const maxY = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT))
    const scale = Math.max(0.5, Math.min(0.88,
      (canvas.clientWidth - 76) / Math.max(1, maxX - minX),
      (canvas.clientHeight - 190) / Math.max(1, maxY - minY)
    ))
    setViewport({
      x: 38 - minX * scale,
      y: Math.max(32, Math.min(150, (canvas.clientHeight - 150 - (maxY - minY) * scale) / 2 - minY * scale)),
      scale
    })
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => fitWorkflow())
    return () => cancelAnimationFrame(frame)
  }, [])

  const updateNode = (nodeId, patch, record = true) => {
    const update = (current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node),
      updatedAt: new Date().toISOString()
    })
    if (record) commitWorkflow(update)
    else setWorkflow(update)
  }

  const addNode = (kind) => {
    const center = {
      x: (420 - viewport.x) / viewport.scale,
      y: (280 - viewport.y) / viewport.scale
    }
    commitWorkflow((current) => {
      const next = addWorkflowNode(current, kind, center)
      setSelectedId(next.nodes.at(-1).id)
      return next
    })
  }

  const draft = () => {
    if (!prompt.trim()) return
    const drafted = draftWorkflowFromPrompt(prompt)
    const next = { ...drafted, id: workflow.id, enabled: workflow.enabled, createdAt: workflow.createdAt }
    commitWorkflow(next)
    setSelectedId('')
    requestAnimationFrame(() => fitWorkflow(next.nodes))
    setPrompt('')
    setNotice(`${next.nodes.length} steps drafted`)
  }

  const testWorkflow = () => {
    if (onRun) {
      void onRun(workflow.id)
      return
    }
    runTimersRef.current.forEach(clearTimeout)
    setNotice('Test run started')
    workflow.nodes.forEach((node, index) => {
      runTimersRef.current.push(setTimeout(() => {
        setRunningId(node.id)
        setNotice(`Testing ${index + 1} of ${workflow.nodes.length} · ${node.label}`)
      }, index * 650))
    })
    runTimersRef.current.push(setTimeout(() => {
      setRunningId('')
      setNotice('Dry run complete · no actions taken')
    }, workflow.nodes.length * 650 + 500))
  }

  const exportWorkflow = async () => {
    const manifest = JSON.stringify(toPortableManifest(workflow), null, 2)
    try {
      await navigator.clipboard.writeText(manifest)
      setNotice('Portable manifest copied')
    } catch {
      setNotice('Could not copy manifest')
    }
  }

  const startPan = (event) => {
    if (event.target.closest('.workflow-node, .workflow-agent-bar, .workflow-zoom') || event.button !== 0) return
    panRef.current = { x: event.clientX, y: event.clientY, viewportX: viewport.x, viewportY: viewport.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedId('')
  }

  const pan = (event) => {
    if (!panRef.current) return
    setViewport((current) => ({
      ...current,
      x: panRef.current.viewportX + event.clientX - panRef.current.x,
      y: panRef.current.viewportY + event.clientY - panRef.current.y
    }))
  }

  const zoom = (direction) => setViewport((current) => ({ ...current, scale: Math.max(0.45, Math.min(1.35, current.scale + direction * 0.1)) }))

  const navigateCanvas = (event) => {
    if (event.target.closest('.workflow-agent-bar')) return
    event.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    if (event.ctrlKey || event.metaKey) {
      const pointX = event.clientX - rect.left
      const pointY = event.clientY - rect.top
      setViewport((current) => zoomViewportAtPoint(current, { x: pointX, y: pointY }, event.deltaY))
      return
    }

    setViewport((current) => panViewport(current, event.deltaX, event.deltaY))
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', navigateCanvas, { passive: false })
    return () => canvas.removeEventListener('wheel', navigateCanvas)
  }, [])

  useEffect(() => {
    const handleKeyboard = (event) => {
      const target = event.target
      const editing = target instanceof HTMLElement && (
        target.matches('input, textarea, select') ||
        target.isContentEditable
      )

      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'z' && !editing) {
        event.preventDefault()
        undo()
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && !editing) {
        event.preventDefault()
        commitWorkflow((current) => removeWorkflowNode(current, selectedId))
        setSelectedId('')
        setNotice('Step removed · press ⌘Z to restore')
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [selectedId, workflow])

  return (
    <section className="workflow-builder">
      <header className="workflow-topbar">
        <div className="workflow-title">{onBack && <button className="workflow-back" type="button" onClick={onBack} aria-label="Back to all workflows">←</button>}<span>Workflow</span><input aria-label="Workflow name" value={workflow.name} onChange={(event) => commitWorkflow((current) => ({ ...current, name: event.target.value }))} /><small><i />{notice}</small></div>
        <div className="workflow-topbar__actions"><button type="button" onClick={exportWorkflow}>Share</button>{activeRun && ['queued', 'running', 'needs_attention', 'awaiting_approval'].includes(activeRun.status) ? <button type="button" onClick={() => onCancelRun?.(activeRun.id)}>Stop run</button> : <button className="workflow-run" type="button" onClick={testWorkflow}><i>▶</i> {onRun ? 'Run workflow' : 'Test workflow'}</button>}</div>
      </header>
      <div className="workflow-stage">
        <NodePalette onAdd={addNode} />
        <main
          className="workflow-canvas"
          ref={canvasRef}
          onPointerDown={startPan}
          onPointerMove={pan}
          onPointerUp={() => { panRef.current = null }}
          onPointerCancel={() => { panRef.current = null }}
        >
          <div className="workflow-canvas__mist" />
          <div className="workflow-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
            <svg className="workflow-edges" width="1900" height="900" viewBox="0 0 1900 900" aria-hidden="true">
              {workflow.edges.map((edge) => <WorkflowEdge key={edge.id} from={nodesById.get(edge.from)} to={nodesById.get(edge.to)} />)}
            </svg>
            {workflow.nodes.map((node) => <WorkflowNode key={node.id} node={node} selected={node.id === selectedId} running={node.id === runningId} scale={viewport.scale} onSelect={setSelectedId} onMoveStart={checkpoint} onMove={(nodeId, patch) => updateNode(nodeId, patch, false)} />)}
          </div>
          <div className="workflow-zoom" aria-label="Canvas controls"><button type="button" onClick={() => zoom(-1)} aria-label="Zoom out">−</button><span>{Math.round(viewport.scale * 100)}%</span><button type="button" onClick={() => zoom(1)} aria-label="Zoom in">＋</button><button type="button" onClick={() => fitWorkflow()} aria-label="Fit workflow">⌗</button><em>Pinch to zoom</em></div>
          <form className="workflow-agent-bar" data-collapsed={promptCollapsed} onSubmit={(event) => { event.preventDefault(); draft() }}>
            {promptCollapsed
              ? <button className="workflow-agent-bar__expand" type="button" onClick={() => setPromptCollapsed(false)}><span className="workflow-agent-bar__orb">✦</span><span><b>Build with an agent</b><small>{prompt || 'Describe a workflow in natural language'}</small></span><i>⌃</i></button>
              : <>
                <header><span className="workflow-agent-bar__orb">✦</span><div><b>Build with an agent</b><small>Describe the whole recurring outcome. Ambientic will draft editable steps.</small></div><button type="button" onClick={() => setPromptCollapsed(true)} aria-label="Collapse workflow prompt">⌄</button></header>
                <textarea
                  aria-label="Build with an agent"
                  rows="3"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      draft()
                    }
                  }}
                  placeholder="Every weekday, check the web, summarize with an agent, let me review, then email it…"
                />
                <footer><small>⌘↵ to draft · permissions stay under your control</small><button type="submit" disabled={!prompt.trim()}><span>Draft workflow</span> ↑</button></footer>
              </>}
          </form>
          {activeRun?.status === 'awaiting_approval' && <section className="workflow-run-approval">
            <div><span>Approval required</span><b>{activeRun.steps.find((step) => step.status === 'awaiting_approval')?.label || 'Continue workflow?'}</b><p>{activeRun.steps.find((step) => step.status === 'awaiting_approval')?.approvalForAction ? 'This step can change data in a connected service.' : 'The workflow is paused at your review checkpoint.'}</p></div>
            <button type="button" onClick={() => onApproveRun?.(activeRun.id, false)}>Deny</button>
            <button className="primary" type="button" onClick={() => onApproveRun?.(activeRun.id, true)}>Approve & continue</button>
          </section>}
        </main>
        <Inspector
          node={selectedNode}
          onClose={() => setSelectedId('')}
          onChange={(patch) => updateNode(selectedId, patch)}
          onDelete={() => {
            commitWorkflow((current) => removeWorkflowNode(current, selectedId))
            setSelectedId('')
            setNotice('Step removed · press ⌘Z to restore')
          }}
        />
      </div>
    </section>
  )
}
