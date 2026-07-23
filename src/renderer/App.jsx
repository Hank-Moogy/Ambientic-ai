import React, { useEffect, useRef, useState } from 'react'
import { AgentIcon } from './AgentIcon.jsx'
import { sessionLabels } from './session-labels.mjs'

function fmtElapsed (ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const STATE_HINT = {
  running: 'working',
  waiting: 'ready',
  attention: 'ready',
  idle: 'ready'
}

const STANDBY_STORAGE_KEY = 'standby-terminals-v1'
const PAD_LAYOUT_STORAGE_KEY = 'pad-layout-v1'

function loadStandbyKeys () {
  try {
    const value = JSON.parse(window.localStorage.getItem(STANDBY_STORAGE_KEY) || '[]')
    return new Set(Array.isArray(value) ? value : [])
  } catch {
    return new Set()
  }
}

function terminalKey (s) {
  return s.tty || s.id
}

function normalizeProject (project) {
  return String(project || '').trim().toLocaleLowerCase()
}

function loadPadLayout () {
  try {
    const value = JSON.parse(window.localStorage.getItem(PAD_LAYOUT_STORAGE_KEY) || '{}')
    const order = Array.isArray(value.order) ? [...new Set(value.order.filter((key) => typeof key === 'string'))] : []
    const projects = new Map(Array.isArray(value.projects) ? value.projects : [])
    return { order, projects }
  } catch {
    return { order: [], projects: new Map() }
  }
}

function stableGroupSessions (sessions, layout) {
  const byKey = new Map(sessions.map((session) => [terminalKey(session), session]))
  const known = new Set(layout.order)
  let changed = false

  // A terminal receives its grouped slot exactly once. Live task, state, and
  // cwd refreshes can update its content but never move the existing pad.
  for (const session of sessions) {
    const key = terminalKey(session)
    if (known.has(key)) continue

    const project = normalizeProject(session.project)
    let insertAt = -1
    for (let i = layout.order.length - 1; i >= 0; i--) {
      if (layout.projects.get(layout.order[i]) === project) {
        insertAt = i
        break
      }
    }

    const insertionIndex = insertAt >= 0 ? insertAt + 1 : layout.order.length
    layout.order.splice(insertionIndex, 0, key)
    layout.projects.set(key, project)
    known.add(key)
    changed = true
  }

  if (changed) {
    window.localStorage.setItem(PAD_LAYOUT_STORAGE_KEY, JSON.stringify({
      order: layout.order,
      projects: [...layout.projects]
    }))
  }

  return layout.order.map((key) => byKey.get(key)).filter(Boolean)
}

function stateHint (s) {
  return STATE_HINT[s.state] || s.state
}

const USAGE_PROVIDERS = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' }
]

function shortQuotaLabel (label) {
  if (/spark/i.test(label)) return 'Spark'
  return String(label || 'Model').replace(/^GPT-[\w.-]+-/i, '').slice(0, 10)
}

function resetDescription (window) {
  if (!window) return ''
  if (window.resetAt) return `Resets ${new Date(window.resetAt * 1000).toLocaleString()}`
  return window.resetText ? `Resets ${window.resetText}` : ''
}

function resetCountdown (window, now) {
  if (!window || !Number.isFinite(window.usedPercent) || window.usedPercent <= 50 || !window.resetAt) return ''

  const remainingMinutes = Math.max(0, Math.ceil((window.resetAt * 1000 - now) / 60000))
  if (remainingMinutes === 0) return 'resetting now'

  const days = Math.floor(remainingMinutes / (24 * 60))
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60)
  const minutes = remainingMinutes % 60

  if (days > 0) return `reset in ${days}d${hours > 0 ? ` ${hours}h` : ''}`
  if (hours > 0) return `reset in ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
  return `reset in ${remainingMinutes}m`
}

function UsageMeter ({ window, label, error }) {
  const value = Number.isFinite(window?.usedPercent) ? Math.round(window.usedPercent) : null
  const tone = value >= 90 ? 'critical' : value >= 70 ? 'warning' : 'normal'
  const title = value === null
    ? (error || `${label} usage unavailable`)
    : `${label}: ${value}% used. ${resetDescription(window)}`.trim()
  return (
    <div
      className="usage-meter"
      data-tone={tone}
      data-empty={value === null}
      title={title}
      aria-label={title}
      style={{ '--usage-scale': value === null ? 0 : value / 100 }}
    >
      <span className="usage-meter__value">{value === null ? '—' : `${value}%`}</span>
      <span className="usage-meter__track" aria-hidden="true"><span className="usage-meter__fill" /></span>
    </div>
  )
}

function UsageProviderRows ({ config, provider, now }) {
  const windows = provider?.windows || []
  const short = windows.find((window) => window.period === 'short')
  const weekly = windows.find((window) => window.period === 'week' && /all models|weekly/i.test(window.label)) ||
    windows.find((window) => window.period === 'week')
  const extras = windows.filter((window) => window !== short && window !== weekly)
  const unavailable = provider?.status === 'error' && provider.error
  const primaryReset = resetCountdown(
    [short, weekly].find((window) => Number.isFinite(window?.usedPercent) && window.usedPercent > 50 && window.resetAt),
    now
  )

  return (
    <>
      <div className="usage-provider" title={unavailable || config.label}>
        <AgentIcon agent={config.id} />
        <span className="usage-provider__identity">
          <span className="usage-provider__name">
            {config.label}
            {provider?.status === 'stale' && <span className="usage-provider__stale" aria-label="Last known value">•</span>}
          </span>
          {primaryReset && <span className="usage-provider__reset">{primaryReset}</span>}
        </span>
      </div>
      <UsageMeter window={short} label={`${config.label} short window`} error={unavailable} />
      <UsageMeter window={weekly} label={`${config.label} weekly`} error={unavailable} />

      {extras.map((window) => {
        const extraReset = resetCountdown(window, now)
        return (
          <React.Fragment key={window.id}>
            <div className="usage-provider usage-provider--secondary">
              <span className="usage-provider__identity">
                <span className="usage-provider__name">{shortQuotaLabel(window.label)}</span>
                {extraReset && <span className="usage-provider__reset">{extraReset}</span>}
              </span>
            </div>
            <span />
            <UsageMeter window={window} label={`${config.label} ${window.label}`} error={unavailable} />
          </React.Fragment>
        )
      })}
    </>
  )
}

function UsageStrip ({ usage, now, onRefresh }) {
  return (
    <section className="usage-strip" aria-label="Account usage limits">
      <div className="usage-grid usage-grid--header">
        <span className="usage-strip__title">
          limits
          <button
            className="usage-strip__refresh"
            type="button"
            aria-label="Refresh account usage"
            title="Refresh account usage"
            data-refreshing={Boolean(usage?.refreshing)}
            onClick={onRefresh}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 4.8A5.8 5.8 0 1 0 13.7 10h-1.5A4.35 4.35 0 1 1 11.9 6H9.5V4.6H14V9h-1.4V6.2a6 6 0 0 0-.6-.8Z" /></svg>
          </button>
        </span>
        <span>5h used</span>
        <span>week</span>
      </div>
      <div className="usage-grid usage-grid--body">
        {USAGE_PROVIDERS.map((config) => (
          <UsageProviderRows key={config.id} config={config} provider={usage?.providers?.[config.id]} now={now} />
        ))}
      </div>
    </section>
  )
}

function DisplayRoute ({ topology, onChoose }) {
  const displays = topology?.displays || []
  const terminal = displays.find((display) => display.controller)
  const preview = displays.find((display) => display.preview)
  const compactLabel = terminal
    ? (preview ? `T${terminal.index} → P${preview.index}` : `T${terminal.index} only`)
    : 'screens'
  const description = terminal
    ? (preview
        ? `Terminal on ${terminal.label} (Display ${terminal.index}); preview on ${preview.label} (Display ${preview.index})`
        : `Terminal on ${terminal.label} (Display ${terminal.index}). Connect another display for previews.`)
    : 'Detecting displays'

  return (
    <button className="display-route" type="button" title={description} aria-label={`${description}. Click to choose the preview display.`} onClick={onChoose}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 2.5h8.1c.7 0 1.2.5 1.2 1.2v5.1c0 .7-.5 1.2-1.2 1.2H7v1.3h1.8v1.2H3.7v-1.2h1.9V10H2.2C1.5 10 1 9.5 1 8.8V3.7c0-.7.5-1.2 1.2-1.2Zm.1 1.2v5.1h8V3.7h-8Zm10.1 2.1h1.4c.7 0 1.2.5 1.2 1.2v5.3c0 .7-.5 1.2-1.2 1.2h-3.2c-.7 0-1.2-.5-1.2-1.2v-.9h1.2v.9h3.2V7h-1.4V5.8Z" /></svg>
      <span>{compactLabel}</span>
    </button>
  )
}

function ConnectorStrip ({ connectors, onInstall, onOpen, onRefresh }) {
  return (
    <section className="connectors" aria-label="Local agent connections">
      <div className="connectors__header">
        <span>local agents</span>
        <button type="button" onClick={onRefresh}>refresh</button>
      </div>
      <div className="connectors__list">
        {connectors.length === 0 && <div className="connectors__loading">Checking Claude Code, Codex, and Hermes…</div>}
        {connectors.map((connector) => (
          <div className="connector" key={connector.id} data-ready={connector.ready}>
            <AgentIcon agent={connector.id} />
            <span className="connector__identity">
              <b>{connector.label}</b>
              <span>{connector.ready ? 'Connected' : connector.installed ? 'Needs AgentBase hook' : 'Not installed'}</span>
            </span>
            <button
              type="button"
              disabled={!connector.installed}
              onClick={() => connector.ready ? onOpen(connector.id) : onInstall()}
            >
              {connector.ready ? 'Open' : connector.installed ? 'Connect' : 'Missing'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function midiBindingLabel (key) {
  const [type, channel, number] = String(key || '').split(':')
  if (!type || number === undefined) return ''
  return `${type === 'note' ? 'Note' : 'CC'} ${number} · Ch ${Number(channel) + 1}`
}

function MidiMappingPanel ({ midi, onClose }) {
  const bindings = new Map()
  for (const [key, action] of Object.entries(midi?.mappings || {})) bindings.set(action, midiBindingLabel(key))
  return (
    <section className="midi-map" aria-label="APC40 MKII mappings">
      <div className="midi-map__header">
        <span className="midi-map__device">
          <span className="midi-map__device-dot" data-connected={Boolean(midi?.connected)} />
          <span><b>Akai APC40 MKII</b><small>{midi?.connected ? 'Connected · Alternate Ableton mode' : 'Connect the APC40 MKII to begin'}</small></span>
        </span>
        <button type="button" onClick={onClose}>Done</button>
      </div>
      <p className="midi-map__hint">
        The 5×8 clip grid selects sessions by default. Learn any other APC40 MKII button, knob, or fader to an AgentBase action.
      </p>
      <div className="midi-map__actions">
        {(midi?.actions || []).map((action) => {
          const learning = midi?.learningAction === action.id
          const binding = bindings.get(action.id)
          return (
            <div className="midi-action" key={action.id} data-learning={learning}>
              <span><b>{action.label}</b><small>{learning ? 'Touch a control on the APC40 MKII…' : binding || 'Unmapped'}</small></span>
              {binding && !learning && <button type="button" className="midi-action__clear" onClick={() => window.controller.midiClearAction(action.id)}>Clear</button>}
              <button type="button" className="midi-action__learn" disabled={!midi?.connected} onClick={() => learning ? window.controller.midiCancelLearn() : window.controller.midiLearn(action.id)}>
                {learning ? 'Cancel' : 'Learn'}
              </button>
            </div>
          )
        })}
      </div>
      {Object.keys(midi?.mappings || {}).length > 0 && (
        <button className="midi-map__reset" type="button" onClick={() => window.controller.midiResetMappings()}>Reset learned mappings</button>
      )}
    </section>
  )
}

function Pad ({ s, now, standby, selected, companion, capturing, onFocus, onCapture, onToggleStandby, onCompanionPress, onCompanions }) {
  const labels = sessionLabels(s)
  const elapsed = fmtElapsed(now - s.since)
  const displayState = standby ? 'standby' : stateHint(s)
  const cls = ['pad', `pad--${s.state}`, standby ? 'pad--standby' : '', selected ? 'pad--selected' : '', s.unseen && !standby && !selected ? 'pad--unseen' : ''].join(' ').trim()
  const activeCompanions = companion?.active || []
  const configuredCompanions = companion?.configured?.length ? companion.configured : activeCompanions
  const hasWebCompanion = configuredCompanions.some((item) => item.type === 'browser')
  const hasPhoneCompanion = configuredCompanions.some((item) => item.type === 'ios' || item.type === 'android')
  const candidateCount = companion?.availableCount ?? companion?.candidates?.length ?? 0
  const suggestionCount = companion?.suggestionCount || 0
  const companionLabel = companion?.disabled
    ? `Preview routing is off for this terminal. Click to turn it on; right-click to change the link.`
    : activeCompanions.length
    ? `${activeCompanions.length} linked preview${activeCompanions.length > 1 ? 's' : ''}: ${activeCompanions.map((item) => item.label).join(', ')}. Click to turn off for this terminal; right-click to change.`
    : suggestionCount
      ? `${suggestionCount} preview suggestion${suggestionCount > 1 ? 's' : ''}. Click to attach.`
      : candidateCount
        ? `${candidateCount} previews available. Click to attach.`
      : 'No preview detected. Click to scan or attach.'
  return (
    <div className="pad-shell">
      <button
        className={cls}
        onClick={() => onFocus(s.id)}
        title={`${labels.primary}\n${labels.secondary}\n${s.cwd || ''}\n${displayState} · ${elapsed}${s.summary ? `\n\n${s.summary}` : ''}`}
      >
        <span className="pad__light" />
        <AgentIcon agent={s.agent} />
        <span className="pad__content">
          <span className="pad__project">{labels.primary}</span>
          <span className={`pad__task${labels.placeholder ? ' pad__task--placeholder' : ''}`}>{labels.secondary}</span>
        </span>
        <span className="pad__meta">
          <span className="pad__state">{displayState}</span>
          <span className="pad__time">{elapsed}</span>
        </span>
      </button>
      {configuredCompanions.length > 0 && (
        <button
          className={`pad__capture${capturing ? ' pad__capture--busy' : ''}`}
          type="button"
          aria-label={`Capture ${configuredCompanions.length > 1 ? 'linked previews' : 'linked preview'} and attach ${configuredCompanions.length > 1 ? 'them' : 'it'} to ${labels.provider}`}
          title={`Capture ${configuredCompanions.length > 1 ? 'linked previews' : 'linked preview'} and attach without sending`}
          disabled={capturing}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onCapture(s.id) }}
        >
          <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4.5 2.2 5.3 1h3.4l.8 1.2H12c.7 0 1.2.5 1.2 1.2v7.4c0 .7-.5 1.2-1.2 1.2H2c-.7 0-1.2-.5-1.2-1.2V3.4c0-.7.5-1.2 1.2-1.2h2.5ZM2 3.4v7.4h10V3.4H8.9l-.8-1.2H5.9l-.8 1.2H2ZM7 4.5a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Zm0 1.1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>
        </button>
      )}
      <button
        className={`pad__companion${activeCompanions.length ? ' pad__companion--linked' : ''}${companion?.disabled ? ' pad__companion--disabled' : ''}${!activeCompanions.length && !companion?.disabled && suggestionCount ? ' pad__companion--suggested' : ''}`}
        type="button"
        aria-label={companionLabel}
        title={companionLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onCompanionPress(s.id, companion) }}
        onContextMenu={(event) => { event.preventDefault(); onCompanions(s.id) }}
      >
        <span className={`pad__companion-icons${hasWebCompanion && hasPhoneCompanion ? ' pad__companion-icons--mixed' : ''}`} aria-hidden="true">
          {hasWebCompanion && <svg viewBox="0 0 14 14"><path d="M7 1a6 6 0 1 1 0 12A6 6 0 0 1 7 1Zm3.5 3H9.2c.2.7.3 1.5.4 2.3h2.1A4.7 4.7 0 0 0 10.5 4ZM7 2.2c-.4 0-1.1 1.5-1.3 4.1h2.6C8.1 3.7 7.4 2.2 7 2.2ZM3.5 4a4.7 4.7 0 0 0-1.2 2.3h2.1c.1-.8.2-1.6.4-2.3H3.5Zm-1.2 3.5c.1.9.5 1.7 1.2 2.4h1.3a11 11 0 0 1-.4-2.4H2.3ZM7 11.8c.4 0 1.1-1.5 1.3-4.3H5.7c.2 2.8.9 4.3 1.3 4.3Zm3.5-1.9a4.8 4.8 0 0 0 1.2-2.4H9.6c-.1.9-.2 1.7-.4 2.4h1.3Z" /></svg>}
          {hasPhoneCompanion && <svg viewBox="0 0 14 14"><path d="M4.2 1h5.6c.8 0 1.4.6 1.4 1.4v9.2c0 .8-.6 1.4-1.4 1.4H4.2c-.8 0-1.4-.6-1.4-1.4V2.4C2.8 1.6 3.4 1 4.2 1Zm0 1.2c-.1 0-.2.1-.2.2v8.1h6V2.4c0-.1-.1-.2-.2-.2H4.2ZM7 12c.3 0 .5-.2.5-.5S7.3 11 7 11s-.5.2-.5.5.2.5.5.5Z" /></svg>}
          {!hasWebCompanion && !hasPhoneCompanion && <svg viewBox="0 0 14 14"><path d="M2 2h10c.6 0 1 .4 1 1v6.2c0 .6-.4 1-1 1H8v1.1h2v1H4v-1h2v-1.1H2c-.6 0-1-.4-1-1V3c0-.6.4-1 1-1Zm0 1v6.2h10V3H2Z" /></svg>}
        </span>
        {companion?.disabled && <svg className="pad__companion-slash" viewBox="0 0 14 14" aria-hidden="true"><path d="m2.1 1.3 10.6 10.6-.8.8L1.3 2.1l.8-.8Z" /></svg>}
        {!companion?.disabled && activeCompanions.length > 1 && <span className="pad__companion-count">{activeCompanions.length}</span>}
      </button>
      <button
        className={`pad__standby${standby ? ' pad__standby--active' : ''}`}
        type="button"
        aria-label={`${standby ? 'Resume live status for' : 'Put on standby:'} ${labels.primary}`}
        aria-pressed={standby}
        title={standby ? 'Resume live status' : 'Set to standby'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onToggleStandby(terminalKey(s)) }}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2" y="1" width="3" height="10" rx="1" />
          <rect x="7" y="1" width="3" height="10" rx="1" />
        </svg>
      </button>
    </div>
  )
}

export default function App () {
  const [sessions, setSessions] = useState([])
  const [usage, setUsage] = useState(null)
  const [displays, setDisplays] = useState(null)
  const [companions, setCompanions] = useState({ bySession: {} })
  const [connectors, setConnectors] = useState([])
  const [midi, setMidi] = useState({ connected: false, model: 'Akai APC40 MKII', actions: [], mappings: {} })
  const [voice, setVoice] = useState({ recording: false, transcribing: false, error: '', transcript: '' })
  const [showMidiMap, setShowMidiMap] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [installMsg, setInstallMsg] = useState(null)
  const [focusMsg, setFocusMsg] = useState(null)
  const [needsAccess, setNeedsAccess] = useState(false)
  const [standbyKeys, setStandbyKeys] = useState(loadStandbyKeys)
  const [focusedId, setFocusedId] = useState(null)
  const [capturingId, setCapturingId] = useState(null)
  const bodyRef = useRef(null)
  const resizePointerRef = useRef(null)
  const padLayoutRef = useRef(null)
  if (!padLayoutRef.current) padLayoutRef.current = loadPadLayout()

  useEffect(() => {
    let un = () => {}
    window.controller.getState().then(setSessions)
    window.controller.getUsage().then(setUsage)
    window.controller.getDisplays().then(setDisplays)
    window.controller.getCompanions().then(setCompanions)
    window.controller.getConnectors().then(setConnectors)
    window.controller.getMidi().then(setMidi)
    window.controller.getVoice().then(setVoice)
    un = window.controller.onState(setSessions)
    const unUsage = window.controller.onUsage(setUsage)
    const unDisplays = window.controller.onDisplays(setDisplays)
    const unCompanions = window.controller.onCompanions(setCompanions)
    const unConnectors = window.controller.onConnectors(setConnectors)
    const unMidi = window.controller.onMidi(setMidi)
    const unVoice = window.controller.onVoice(setVoice)
    const unInstall = window.controller.onInstaller((p) => {
      setInstallMsg(p.ok ? 'Hooks installed. Restart your agent sessions.' : 'Install failed — see terminal.')
      setTimeout(() => setInstallMsg(null), 6000)
    })
    const unSys = window.controller.onSys((p) => setNeedsAccess(!p.accessibility))
    return () => { un(); unUsage(); unDisplays(); unCompanions(); unConnectors(); unMidi(); unVoice(); unInstall(); unSys() }
  }, [])

  // Ticking clock so elapsed times stay live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STANDBY_STORAGE_KEY, JSON.stringify([...standbyKeys]))
  }, [standbyKeys])

  // Keep the native window hugging its content until the user explicitly
  // resizes it. ResizeObserver also catches grid reflow as the width changes.
  useEffect(() => {
    if (!bodyRef.current) return
    const content = bodyRef.current
    let frame = 0
    const reportSize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => window.controller.resize(content.scrollHeight))
    }
    const observer = new ResizeObserver(reportSize)
    observer.observe(content)
    reportSize()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const needy = sessions.filter((s) => s.state !== 'running').length
  const groupedSessions = stableGroupSessions(sessions, padLayoutRef.current)
  const agentsReady = connectors.length > 0 && connectors.every((connector) => connector.ready)

  const onFocus = async (id) => {
    // Optimistic: drop the unseen pulse immediately.
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, unseen: false } : s)))
    const previousFocusedId = focusedId
    setFocusedId(id)
    const result = await window.controller.focus(id)
    if (!result?.ok) {
      setFocusedId((current) => current === id ? previousFocusedId : current)
      if (result?.reason === 'session-ended') return
      const msg = result?.reason === 'ghostty-mapping-pending'
        ? 'Linking this pane — it will be ready on the agent’s next event.'
        : 'Could not focus this terminal.'
      setFocusMsg(msg)
      setTimeout(() => setFocusMsg(null), 5000)
    } else if (result?.companion?.results?.length && !result.companion.results.some((item) => item.ok)) {
      setFocusMsg('Terminal focused; its linked preview could not be opened.')
      setTimeout(() => setFocusMsg(null), 5000)
    }
  }

  const onToggleStandby = (key) => {
    setStandbyKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const onCapture = async (id) => {
    if (capturingId) return
    setCapturingId(id)
    const result = await window.controller.capturePreview(id)
    setCapturingId(null)
    if (result?.ok) {
      setFocusedId(id)
      setFocusMsg(`${result.count > 1 ? `${result.count} screenshots` : 'Screenshot'} attached. Type your prompt, then press Enter.`)
    } else {
      const msg = result?.screenPermission === 'denied' || result?.screenPermission === 'restricted'
        ? 'Grant Screen Recording access, then try the camera again.'
        : result?.reason === 'no-companion'
          ? 'No linked preview to capture.'
          : 'Could not capture this linked preview.'
      setFocusMsg(msg)
    }
    setTimeout(() => setFocusMsg(null), 6000)
  }

  const onResizePointerDown = (event, edge) => {
    event.preventDefault()
    resizePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    window.controller.startManualResize(edge)
  }

  const onResizePointerEnd = (event) => {
    if (resizePointerRef.current !== event.pointerId) return
    resizePointerRef.current = null
    window.controller.endManualResize()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="app">
      <div className="app__content" ref={bodyRef}>
        <div className="titlebar">
          <span className="titlebar__dot" data-needy={needy > 0} />
          <span className="titlebar__label">AgentBase</span>
          <DisplayRoute topology={displays} onChoose={() => window.controller.showDisplayMenu()} />
          <button className="titlebar__midi" type="button" data-connected={Boolean(midi?.connected)} onClick={() => setShowMidiMap((value) => !value)}>
            APC40 <span />
          </button>
          <span className="titlebar__count">{sessions.length}{needy ? ` · ${needy}!` : ''}</span>
        </div>

        {needsAccess && (
          <button className="banner" onClick={() => window.controller.requestAccessibility()}>
            <b>Grant Accessibility</b> so pads can focus your terminal windows →
          </button>
        )}

        {showMidiMap ? (
          <MidiMappingPanel midi={midi} onClose={() => { window.controller.midiCancelLearn(); setShowMidiMap(false) }} />
        ) : (
          <>
            <ConnectorStrip
              connectors={connectors}
              onInstall={() => window.controller.installHooks()}
              onOpen={(agentId) => window.controller.openAgentSetup(agentId)}
              onRefresh={() => window.controller.refreshConnectors()}
            />
            <UsageStrip usage={usage} now={now} onRefresh={() => window.controller.refreshUsage()} />
          </>
        )}

        {!showMidiMap && sessions.length === 0 ? (
          <div className="empty">
            <p className="empty__title">No sessions yet</p>
            <p className="empty__body">{agentsReady ? 'Your agents are connected. Open Claude Code, Codex, or Hermes above to create the first session.' : 'Connect your local agents, then open a Claude Code, Codex, or Hermes terminal.'}</p>
            {!agentsReady && <button className="empty__btn" onClick={() => window.controller.installHooks()}>Connect local agents</button>}
          </div>
        ) : !showMidiMap && (
          <div className="grid">
            {groupedSessions.map((s) => (
              <Pad
                key={terminalKey(s)}
                s={s}
                now={now}
                standby={standbyKeys.has(terminalKey(s))}
                selected={focusedId === s.id}
                companion={companions?.bySession?.[s.id]}
                capturing={capturingId === s.id}
                onFocus={onFocus}
                onCapture={onCapture}
                onToggleStandby={onToggleStandby}
                onCompanionPress={(id, state) => {
                  if (state?.disabled || state?.activeCount > 0) window.controller.toggleCompanion(id)
                  else window.controller.showCompanionMenu(id)
                }}
                onCompanions={(id) => window.controller.showCompanionMenu(id)}
              />
            ))}
          </div>
        )}

        {installMsg && <div className="toast">{installMsg}</div>}
        {focusMsg && <div className="toast">{focusMsg}</div>}
        {voice.recording && <div className="toast">● Recording for {voice.sessionLabel || 'selected agent'} — release Record Arm to send.</div>}
        {voice.transcribing && <div className="toast">Transcribing locally and sending the prompt…</div>}
        {!voice.recording && !voice.transcribing && voice.error && <div className="toast">Voice prompt failed: {voice.error}</div>}
        {!voice.recording && !voice.transcribing && voice.transcript && <div className="toast">Voice prompt sent to {voice.sessionLabel || 'the selected agent'}.</div>}
      </div>
      <span
        className="resize-grip resize-grip--left"
        aria-hidden="true"
        onPointerDown={(event) => onResizePointerDown(event, 'left')}
        onPointerUp={onResizePointerEnd}
      />
      <span
        className="resize-grip resize-grip--right"
        aria-hidden="true"
        onPointerDown={(event) => onResizePointerDown(event, 'right')}
        onPointerUp={onResizePointerEnd}
      />
    </div>
  )
}
