import React, { useEffect, useState } from 'react'
import { contextApi } from './context-ui.mjs'
import './inference.css'

// Inference providers are hosted endpoints Ambientic uses for its own small
// workloads. They sit beside agent accounts rather than inside them: an
// inference provider never owns a thread, a project, or a tool grant.
export function InferenceProviderSettings () {
  const [snapshot, setSnapshot] = useState({ providers: [], workloads: [] })
  const [state, setState] = useState('loading')
  const [notice, setNotice] = useState('')
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState('')

  const api = () => contextApi().inference

  const load = async () => {
    if (typeof api().snapshot !== 'function') { setState('unavailable'); return }
    try {
      setSnapshot(await api().snapshot())
      setState('ready')
    } catch (cause) {
      setNotice(cause?.message || 'Inference providers could not be loaded.')
      setState('error')
    }
  }

  useEffect(() => { void load() }, [])

  const draftFor = (id) => drafts[id] ?? ''
  const setDraft = (id, value) => setDrafts((current) => ({ ...current, [id]: value }))

  const connect = async (provider) => {
    const key = draftFor(provider.id).trim()
    if (!key) { setNotice(`Paste a ${provider.label} API key first.`); return }
    setBusy(provider.id)
    try {
      const result = await api().saveKey(provider.id, key)
      setDraft(provider.id, '')
      setNotice(result?.lastError || `${provider.label} is connected. Ambientic stored the key in your macOS keychain.`)
      await load()
    } catch (cause) {
      setNotice(cause?.message || `${provider.label} could not be connected.`)
    } finally {
      setBusy('')
    }
  }

  const disconnect = async (provider) => {
    if (!window.confirm(`Disconnect ${provider.label}? Ambientic deletes the key from your keychain and returns its workloads to another provider or to local handling.`)) return
    setBusy(provider.id)
    try {
      const result = await api().removeKey(provider.id)
      setNotice(result?.lastError || `${provider.label} disconnected and its key was removed from the keychain.`)
      await load()
    } catch (cause) {
      setNotice(cause?.message || `${provider.label} could not be disconnected.`)
    } finally {
      setBusy('')
    }
  }

  const test = async (provider) => {
    setBusy(provider.id)
    try {
      const result = await api().test(provider.id)
      setNotice(result?.message || `${provider.label} was checked.`)
      await load()
    } catch (cause) {
      setNotice(cause?.message || `${provider.label} did not answer.`)
    } finally {
      setBusy('')
    }
  }

  const chooseModel = async (provider, model) => {
    try {
      await api().updateProvider(provider.id, { model })
      await load()
    } catch (cause) {
      setNotice(cause?.message || 'The model could not be saved.')
    }
  }

  const route = async (workload, providerId) => {
    try {
      setSnapshot(await api().setRoute(workload.id, providerId))
      setNotice(providerId === 'off'
        ? `${workload.label} will stay local on this Mac.`
        : `${workload.label} routed to ${providerId === 'auto' ? 'the first connected provider' : providerId}.`)
    } catch (cause) {
      setNotice(cause?.message || 'The route could not be saved.')
    }
  }

  if (state === 'unavailable') {
    return <section className="inference-settings"><div className="inference-empty"><b>Inference providers are unavailable in this window.</b><span>Open Ambientic’s workspace window to connect a hosted inference account.</span></div></section>
  }

  const connected = snapshot.providers.filter((provider) => provider.connected)

  return (
    <section className="inference-settings">
      <div className="provider-settings__intro">
        <span className="eyebrow"><i /> Hosted inference</span>
        <h2>Run Ambientic’s own workloads on your inference account.</h2>
        <p>Agent threads keep running on their own provider CLIs. These accounts serve the small jobs Ambientic does around them, on an OpenAI-compatible endpoint you control. Keys are written to your macOS keychain and never travel with a thread or a tool call.</p>
      </div>
      {notice && <div className="settings-notice"><span>i</span>{notice}</div>}

      <div className="inference-provider-list">
        {snapshot.providers.map((provider) => (
          <article className="inference-provider" key={provider.id} data-provider={provider.id} data-connected={provider.connected}>
            <header>
              <div><h3>{provider.label}</h3><i /><span>{provider.connected ? (provider.keySource === 'environment' ? 'Key from environment' : 'Connected') : 'Not connected'}</span></div>
              <p>{provider.summary}</p>
            </header>
            <dl>
              <div><dt>Endpoint</dt><dd>{provider.baseUrl}</dd></div>
              <div><dt>Key</dt><dd>{provider.connected ? `${provider.keySource === 'environment' ? 'Environment' : 'Keychain'} ${provider.keyHint}` : 'None on this Mac'}</dd></div>
              <div><dt>Models</dt><dd>{provider.models.length || '—'}</dd></div>
            </dl>
            {provider.lastError && <p className="inference-provider__error">{provider.lastError}</p>}
            {provider.connected
              ? <label className="inference-provider__model">
                  <span>Model for Ambientic workloads</span>
                  <select value={provider.model} onChange={(event) => chooseModel(provider, event.target.value)} disabled={!provider.models.length}>
                    {!provider.models.length && <option value="">Check the connection to list models</option>}
                    {provider.models.map((model) => <option value={model} key={model}>{model}</option>)}
                  </select>
                </label>
              : <label className="inference-provider__key">
                  <span>API key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={draftFor(provider.id)}
                    onChange={(event) => setDraft(provider.id, event.target.value)}
                    placeholder={`${provider.keyPrefix || ''}…`}
                    aria-label={`${provider.label} API key`}
                  />
                </label>}
            <footer>
              {provider.connected
                ? <>
                    <button type="button" className="primary" disabled={busy === provider.id} onClick={() => test(provider)}>{busy === provider.id ? 'Checking…' : 'Check connection'}</button>
                    <button type="button" disabled={busy === provider.id || provider.keySource === 'environment'} onClick={() => disconnect(provider)}>Disconnect</button>
                  </>
                : <>
                    <button type="button" className="primary" disabled={busy === provider.id} onClick={() => connect(provider)}>{busy === provider.id ? 'Connecting…' : 'Connect'}</button>
                    {provider.consoleUrl && <button type="button" className="inference-provider__external" onClick={() => window.controller.openExternalUrl(provider.consoleUrl)}>Get a key</button>}
                  </>}
            </footer>
          </article>
        ))}
      </div>

      <section className="inference-routing">
        <header><b>Workload routing</b><small>{connected.length ? `${connected.length} connected ${connected.length === 1 ? 'account' : 'accounts'}` : 'No account connected'}</small></header>
        {snapshot.workloads.map((workload) => (
          <div className="inference-workload" key={workload.id}>
            <div><b>{workload.label}</b><small>{workload.description}</small></div>
            <label>
              <span>Runs on</span>
              <select value={workload.route} onChange={(event) => route(workload, event.target.value)}>
                <option value="auto">First connected provider</option>
                {snapshot.providers.map((provider) => <option value={provider.id} key={provider.id} disabled={!provider.connected}>{provider.label}{provider.connected ? '' : ' — not connected'}</option>)}
                <option value="off">Stay local</option>
              </select>
            </label>
            <i data-resolved={Boolean(workload.resolved)}>{workload.resolved ? snapshot.providers.find((provider) => provider.id === workload.resolved)?.label : 'Local only'}</i>
          </div>
        ))}
      </section>

      <section className="provider-security">
        <div><span>◇</span><div><b>Keys stay in the keychain</b><p>Ambientic writes each API key to your macOS keychain and keeps only the provider, model, and routing choice in its own local settings. Agents never receive the key.</p></div></div>
        <div><span>⌁</span><div><b>Local fallback is always available</b><p>Any workload set to stay local, or routed to a provider that does not answer, falls back to Ambientic’s on-device handling rather than blocking your work.</p></div></div>
      </section>
    </section>
  )
}
