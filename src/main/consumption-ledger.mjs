import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const VERSION = 1
const MAX_EVENTS = 200

function emptyState () {
  return { version: VERSION, snapshots: {}, events: [], updatedAt: null }
}

function finiteNumber (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function mainWindow (provider) {
  return provider?.windows?.find((window) => window.period === 'week') ||
    provider?.windows?.find((window) => window.period === 'short') ||
    provider?.windows?.[0] ||
    null
}

function snapshotProvider (provider, observedAt) {
  if (!provider || !['ok', 'stale'].includes(provider.status)) return null
  const window = mainWindow(provider)
  const balance = finiteNumber(provider.credits?.balance)
  return {
    observedAt,
    status: provider.status,
    plan: provider.plan || null,
    usedPercent: finiteNumber(window?.usedPercent),
    resetAt: finiteNumber(window?.resetAt),
    windowId: window?.id || null,
    resetCreditsAvailable: finiteNumber(provider.resetCredits?.availableCount),
    creditBalance: balance,
    hasCredits: Boolean(provider.credits?.hasCredits),
    unlimited: Boolean(provider.credits?.unlimited)
  }
}

function eventId (provider, type, at, detail = '') {
  return `${provider}:${type}:${at}:${detail}`
}

function deriveSummary (state) {
  const events = state.events || []
  return {
    resetUses: events.filter((event) => event.type === 'reset-used').length,
    limitHits: events.filter((event) => event.type === 'limit-hit').length,
    creditsAdded: events.filter((event) => event.type === 'credits-added').reduce((sum, event) => sum + (event.amount || 0), 0),
    creditsUsed: events.filter((event) => event.type === 'credits-used').reduce((sum, event) => sum + (event.amount || 0), 0),
    currentBalances: Object.fromEntries(Object.entries(state.snapshots || {}).map(([provider, snapshot]) => [provider, snapshot.creditBalance])),
    coverage: {
      codex: { quota: true, resetCredits: true, purchasedCredits: true, currencySpend: false },
      claude: { quota: true, resetCredits: false, purchasedCredits: false, currencySpend: false },
      hermes: { quota: false, resetCredits: false, purchasedCredits: false, currencySpend: false }
    }
  }
}

export class ConsumptionLedger extends EventEmitter {
  constructor ({ file, now = () => Date.now() }) {
    super()
    this.file = file
    this.now = now
    this.state = this.load()
  }

  load () {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      return {
        ...emptyState(),
        ...parsed,
        snapshots: parsed.snapshots && typeof parsed.snapshots === 'object' ? parsed.snapshots : {},
        events: Array.isArray(parsed.events) ? parsed.events.slice(-MAX_EVENTS) : []
      }
    } catch {
      return emptyState()
    }
  }

  persist () {
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.file)
  }

  getState () {
    return { ...this.state, summary: deriveSummary(this.state) }
  }

  addEvent (event) {
    if (this.state.events.some((candidate) => candidate.id === event.id)) return
    this.state.events = [...this.state.events, event].slice(-MAX_EVENTS)
  }

  observe (usageState) {
    const observedAt = finiteNumber(usageState?.updatedAt) || this.now()
    let changed = false

    for (const [provider, providerState] of Object.entries(usageState?.providers || {})) {
      const current = snapshotProvider(providerState, observedAt)
      if (!current) continue
      const previous = this.state.snapshots[provider]

      if (previous) {
        if ((previous.usedPercent ?? 0) < 99 && (current.usedPercent ?? 0) >= 99) {
          this.addEvent({
            id: eventId(provider, 'limit-hit', observedAt, current.windowId),
            provider,
            type: 'limit-hit',
            at: observedAt,
            usedPercent: current.usedPercent,
            confidence: 'exact'
          })
        }

        const resetAllowanceConsumed = previous.resetCreditsAvailable !== null &&
          current.resetCreditsAvailable !== null &&
          previous.resetCreditsAvailable > current.resetCreditsAvailable
        const usageDropped = previous.usedPercent !== null &&
          current.usedPercent !== null &&
          current.usedPercent < previous.usedPercent
        const naturalResetWasDue = previous.resetAt && previous.resetAt * 1000 <= observedAt

        if (resetAllowanceConsumed && usageDropped) {
          this.addEvent({
            id: eventId(provider, 'reset-used', observedAt, `${previous.resetCreditsAvailable}-${current.resetCreditsAvailable}`),
            provider,
            type: 'reset-used',
            at: observedAt,
            beforePercent: previous.usedPercent,
            afterPercent: current.usedPercent,
            amount: previous.resetCreditsAvailable - current.resetCreditsAvailable,
            confidence: 'exact'
          })
        } else if (usageDropped && previous.usedPercent - current.usedPercent >= 50) {
          this.addEvent({
            id: eventId(provider, naturalResetWasDue ? 'window-reset' : 'reset-observed', observedAt, current.windowId),
            provider,
            type: naturalResetWasDue ? 'window-reset' : 'reset-observed',
            at: observedAt,
            beforePercent: previous.usedPercent,
            afterPercent: current.usedPercent,
            confidence: naturalResetWasDue ? 'exact' : 'inferred'
          })
        }

        if (previous.creditBalance !== null && current.creditBalance !== null && previous.creditBalance !== current.creditBalance) {
          const added = current.creditBalance > previous.creditBalance
          this.addEvent({
            id: eventId(provider, added ? 'credits-added' : 'credits-used', observedAt, `${previous.creditBalance}-${current.creditBalance}`),
            provider,
            type: added ? 'credits-added' : 'credits-used',
            at: observedAt,
            beforeBalance: previous.creditBalance,
            afterBalance: current.creditBalance,
            amount: Math.abs(current.creditBalance - previous.creditBalance),
            confidence: 'exact'
          })
        }
      }

      if (JSON.stringify(previous) !== JSON.stringify(current)) {
        this.state.snapshots[provider] = current
        changed = true
      }
    }

    if (!changed) return this.getState()
    this.state.updatedAt = observedAt
    this.persist()
    const result = this.getState()
    this.emit('change', result)
    return result
  }
}

export function createConsumptionLedger (options) {
  return new ConsumptionLedger(options)
}
