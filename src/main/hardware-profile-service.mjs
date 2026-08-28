import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { normalizeActionAssignment, semanticAction, SEMANTIC_ACTIONS } from '../shared/semantic-actions.mjs'

const VERSION = 1
const MAX_TEMPLATES = 80
const MAX_VIEWS = 32
const MAX_GRID = 12
const LOCAL_TARGET_ACTIONS = new Set([
  'thread.open',
  'thread.send-prompt',
  'thread.interrupt',
  'thread.approve-pending',
  'thread.deny-pending',
  'goal.open'
])

function copy (value) { return JSON.parse(JSON.stringify(value)) }
function clean (value, max = 120) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) }
function dimension (value, fallback) { return Math.max(1, Math.min(MAX_GRID, Math.trunc(Number(value)) || fallback)) }
function slotId (row, column) { return `pad-${row + 1}-${column + 1}` }

function slotsFor (rows, columns) {
  return Array.from({ length: rows * columns }, (_, index) => ({
    id: slotId(Math.floor(index / columns), index % columns),
    row: Math.floor(index / columns),
    column: index % columns
  }))
}

function nativeTemplate (now) {
  return {
    id: 'ambientic-native-sessions',
    schema: 'ambientic.hardware-template',
    version: 1,
    builtIn: true,
    name: 'Ambientic Live Sessions',
    description: 'The protected native APC task grid with live agent state, previews, voice controls, and Vibe restoration.',
    rows: 8,
    columns: 8,
    rootViewId: 'live-sessions',
    views: [{ id: 'live-sessions', name: 'Live sessions', assignments: {} }],
    bindings: {},
    createdAt: now,
    updatedAt: now
  }
}

function normalizeView (view, index) {
  const assignments = {}
  for (const [slot, assignment] of Object.entries(view?.assignments || {})) {
    const normalized = normalizeActionAssignment(assignment)
    if (normalized && /^pad-\d+-\d+$/.test(slot)) assignments[slot] = normalized
  }
  return {
    id: clean(view?.id, 80) || `view-${index + 1}`,
    name: clean(view?.name, 80) || `View ${index + 1}`,
    assignments
  }
}

function normalizeTemplate (input, { id, createdAt, now, builtIn = false } = {}) {
  const rows = dimension(input?.rows, 5)
  const columns = dimension(input?.columns, 8)
  const views = (Array.isArray(input?.views) ? input.views : []).slice(0, MAX_VIEWS).map(normalizeView)
  if (!views.length) views.push(normalizeView({ id: 'home', name: 'Home' }, 0))
  const viewIds = new Set(views.map((view) => view.id))
  const validSlots = new Set(slotsFor(rows, columns).map((slot) => slot.id))
  for (const view of views) {
    for (const [slot, assignment] of Object.entries(view.assignments)) {
      if (!validSlots.has(slot) || (assignment.actionId === 'hardware.view.open' && !viewIds.has(assignment.targetId))) delete view.assignments[slot]
    }
  }
  const bindings = {}
  for (const [key, slot] of Object.entries(input?.bindings || {})) {
    if (/^(?:note|cc|key):/.test(key) && validSlots.has(slot)) bindings[clean(key, 180)] = slot
  }
  return {
    id,
    schema: 'ambientic.hardware-template',
    version: 1,
    builtIn: Boolean(builtIn),
    name: clean(input?.name, 100) || 'Untitled mapping',
    description: clean(input?.description, 500),
    rows,
    columns,
    rootViewId: viewIds.has(input?.rootViewId) ? input.rootViewId : views[0].id,
    views,
    bindings,
    createdAt,
    updatedAt: now
  }
}

function emptyState (now) {
  return { version: VERSION, activeTemplateId: 'ambientic-native-sessions', templates: [nativeTemplate(now)], updatedAt: now }
}

export function portableHardwareTemplate (template) {
  const result = copy(template)
  delete result.builtIn
  delete result.createdAt
  delete result.updatedAt
  result.id = ''
  result.bindings = {}
  result.views = result.views.map((view) => ({
    ...view,
    assignments: Object.fromEntries(Object.entries(view.assignments).map(([slot, assignment]) => {
      const next = { ...assignment }
      if (LOCAL_TARGET_ACTIONS.has(next.actionId)) {
        const targetType = semanticAction(next.actionId)?.target || 'target'
        next.targetId = ''
        next.targetLabel = `Choose ${targetType} during setup`
        next.needsSetup = true
      }
      if (next.prompt) {
        next.prompt = ''
        next.needsSetup = true
      }
      return [slot, next]
    }))
  }))
  const assignments = result.views.flatMap((view) => Object.values(view.assignments))
  result.requirements = {
    actionIds: [...new Set(assignments.map((assignment) => assignment.actionId))].sort(),
    providers: [...new Set(assignments.flatMap((assignment) => [assignment.provider, semanticAction(assignment.actionId)?.target === 'provider' ? assignment.targetId : '']).filter(Boolean))].sort(),
    skills: [...new Set(assignments.filter((assignment) => assignment.actionId === 'skill.start-thread').map((assignment) => assignment.targetLabel || assignment.targetId).filter(Boolean))].sort(),
    setupRequired: assignments.filter((assignment) => assignment.needsSetup).length
  }
  return result
}

function validatePortableManifest (manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('This is not an Ambientic hardware template.')
  if (manifest.schema !== 'ambientic.hardware-template') throw new Error('This is not an Ambientic hardware template.')
  if (Number(manifest.version) !== VERSION) throw new Error(`Hardware template version ${manifest.version || 'unknown'} is not supported.`)
  if (!Number.isInteger(Number(manifest.rows)) || Number(manifest.rows) < 1 || Number(manifest.rows) > MAX_GRID || !Number.isInteger(Number(manifest.columns)) || Number(manifest.columns) < 1 || Number(manifest.columns) > MAX_GRID) {
    throw new Error(`Hardware templates must use a 1–${MAX_GRID} by 1–${MAX_GRID} grid.`)
  }
  if (!Array.isArray(manifest.views) || !manifest.views.length || manifest.views.length > MAX_VIEWS) throw new Error(`Hardware templates must contain 1–${MAX_VIEWS} views.`)
  const viewIds = new Set()
  for (const view of manifest.views) {
    const viewId = clean(view?.id, 80)
    if (!viewId || viewIds.has(viewId)) throw new Error('Hardware template view IDs must be present and unique.')
    viewIds.add(viewId)
  }
  if (!viewIds.has(clean(manifest.rootViewId, 80))) throw new Error('The hardware template root view is missing.')
  const validSlots = new Set(slotsFor(Number(manifest.rows), Number(manifest.columns)).map((slot) => slot.id))
  for (const view of manifest.views) {
    if (!view.assignments || typeof view.assignments !== 'object' || Array.isArray(view.assignments)) continue
    for (const [slot, assignment] of Object.entries(view.assignments)) {
      if (!validSlots.has(slot)) throw new Error(`Hardware template contains an invalid pad: ${slot}.`)
      if (!semanticAction(assignment?.actionId)) throw new Error(`Hardware template contains an unsupported action: ${assignment?.actionId || 'unknown'}.`)
      if (assignment.actionId === 'hardware.view.open' && !viewIds.has(clean(assignment.targetId, 80))) throw new Error('Hardware template contains a link to a missing view.')
    }
  }
}

export class HardwareProfileService extends EventEmitter {
  constructor ({ file, now = () => Date.now(), id = () => randomUUID(), invoke } = {}) {
    super()
    this.file = file
    this.now = now
    this.id = id
    this.invoke = invoke
    this.state = this.load()
    this.currentView = new Map()
    this.navigation = new Map()
    this.learning = null
    this.mode = 'play'
    this.lastInput = null
    this.lastResult = null
    this.inputPressed = new Map()
    this.holdTimers = new Map()
  }

  load () {
    const now = this.now()
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      const custom = (Array.isArray(parsed.templates) ? parsed.templates : [])
        .filter((item) => item?.id !== 'ambientic-native-sessions')
        .slice(0, MAX_TEMPLATES - 1)
        .map((item) => normalizeTemplate(item, { id: clean(item.id, 80) || this.id(), createdAt: Number(item.createdAt) || now, now: Number(item.updatedAt) || now }))
      const templates = [nativeTemplate(now), ...custom]
      const activeTemplateId = templates.some((item) => item.id === parsed.activeTemplateId) ? parsed.activeTemplateId : templates[0].id
      return { version: VERSION, activeTemplateId, templates, updatedAt: Number(parsed.updatedAt) || now }
    } catch { return emptyState(now) }
  }

  persist () {
    this.state.updatedAt = this.now()
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.file)
    this.emit('change', this.snapshot())
  }

  template (id = this.state.activeTemplateId) { return this.state.templates.find((item) => item.id === id) || null }
  active () { return this.template() }
  activeViewId () { return this.currentView.get(this.state.activeTemplateId) || this.active()?.rootViewId || '' }
  activeView () { return this.active()?.views.find((view) => view.id === this.activeViewId()) || null }
  isCustomActive () { return Boolean(this.active() && !this.active().builtIn) }

  feedback () {
    if (!this.isCustomActive()) return null
    const view = this.activeView()
    const result = {}
    for (const [key, slot] of Object.entries(this.active().bindings)) {
      const assignment = view?.assignments?.[slot]
      result[key] = assignment ? (assignment.needsSetup ? 'red' : assignment.feedback || semanticAction(assignment.actionId)?.feedback || 'cyan') : 'off'
    }
    return result
  }

  snapshot () {
    return copy({
      ...this.state,
      actions: SEMANTIC_ACTIONS,
      activeViewId: this.activeViewId(),
      mode: this.mode,
      learning: this.learning,
      lastInput: this.lastInput,
      lastResult: this.lastResult,
      slots: this.active() ? slotsFor(this.active().rows, this.active().columns) : []
    })
  }

  notify () { this.emit('change', this.snapshot()) }

  create (input = {}) {
    if (this.state.templates.length >= MAX_TEMPLATES) throw new Error(`A library can contain up to ${MAX_TEMPLATES} hardware templates.`)
    const now = this.now()
    const template = normalizeTemplate(input, { id: this.id(), createdAt: now, now })
    this.state.templates.push(template)
    this.state.activeTemplateId = template.id
    this.currentView.set(template.id, template.rootViewId)
    this.persist()
    return copy(template)
  }

  duplicate (templateId) {
    const source = this.template(templateId)
    if (!source) throw new Error('Hardware template not found.')
    return this.create({ ...portableHardwareTemplate(source), name: `${source.name} copy`, bindings: source.bindings })
  }

  update (templateId, patch = {}) {
    const index = this.state.templates.findIndex((item) => item.id === templateId)
    if (index < 0) throw new Error('Hardware template not found.')
    if (this.state.templates[index].builtIn) throw new Error('Built-in templates must be forked before editing.')
    const current = this.state.templates[index]
    this.state.templates[index] = normalizeTemplate({ ...current, ...patch }, { id: current.id, createdAt: current.createdAt, now: this.now() })
    this.persist()
    return copy(this.state.templates[index])
  }

  remove (templateId) {
    const template = this.template(templateId)
    if (!template || template.builtIn) return false
    this.state.templates = this.state.templates.filter((item) => item.id !== templateId)
    if (this.state.activeTemplateId === templateId) this.state.activeTemplateId = 'ambientic-native-sessions'
    this.persist()
    return true
  }

  activate (templateId) {
    const template = this.template(templateId)
    if (!template) return false
    this.state.activeTemplateId = template.id
    this.currentView.set(template.id, template.rootViewId)
    this.navigation.set(template.id, [])
    this.persist()
    return true
  }

  setMode (mode) {
    this.mode = ['play', 'edit', 'map', 'test'].includes(mode) ? mode : 'play'
    if (this.mode !== 'map') this.learning = null
    this.notify()
    return this.snapshot()
  }

  addView (templateId, input = {}) {
    const template = this.template(templateId)
    if (!template || template.builtIn) throw new Error('Fork the built-in template before adding views.')
    if (template.views.length >= MAX_VIEWS) throw new Error(`A template can contain up to ${MAX_VIEWS} views.`)
    const linked = Boolean(input.fromViewId || input.fromSlotId)
    const parent = linked ? template.views.find((item) => item.id === input.fromViewId) : null
    const validParentSlot = linked && slotsFor(template.rows, template.columns).some((slot) => slot.id === input.fromSlotId)
    if (linked && (!parent || !validParentSlot)) throw new Error('Choose a valid source view and pad for the linked view.')
    const view = normalizeView({ id: this.id(), name: input.name || `View ${template.views.length + 1}` }, template.views.length)
    template.views.push(view)
    template.updatedAt = this.now()
    if (linked) {
      parent.assignments[input.fromSlotId] = normalizeActionAssignment({ actionId: 'hardware.view.open', targetId: view.id, targetLabel: view.name, label: view.name })
      const backSlot = slotsFor(template.rows, template.columns).at(-1)?.id
      if (backSlot) view.assignments[backSlot] = normalizeActionAssignment({ actionId: 'hardware.view.back', label: 'Back' })
    }
    this.persist()
    return copy(view)
  }

  renameView (templateId, viewId, name) {
    const template = this.template(templateId)
    if (!template || template.builtIn) throw new Error('This view cannot be edited.')
    const view = template.views.find((item) => item.id === viewId)
    if (!view) throw new Error('View not found.')
    view.name = clean(name, 80) || view.name
    template.updatedAt = this.now()
    this.persist()
    return copy(view)
  }

  removeView (templateId, viewId) {
    const template = this.template(templateId)
    if (!template || template.builtIn || template.views.length < 2 || template.rootViewId === viewId) return false
    template.views = template.views.filter((view) => view.id !== viewId)
    for (const view of template.views) {
      for (const [slot, assignment] of Object.entries(view.assignments)) {
        if (assignment.actionId === 'hardware.view.open' && assignment.targetId === viewId) delete view.assignments[slot]
      }
    }
    this.currentView.set(template.id, template.rootViewId)
    this.persist()
    return true
  }

  assign (templateId, viewId, slot, input) {
    const template = this.template(templateId)
    if (!template || template.builtIn) throw new Error('Fork the built-in template before assigning pads.')
    const view = template.views.find((item) => item.id === viewId)
    if (!view) throw new Error('View not found.')
    const validSlot = slotsFor(template.rows, template.columns).some((item) => item.id === slot)
    if (!validSlot) throw new Error('Pad not found.')
    if (!input?.actionId) delete view.assignments[slot]
    else {
      const assignment = normalizeActionAssignment(input)
      if (!assignment) throw new Error('Unsupported semantic action.')
      view.assignments[slot] = assignment
    }
    template.updatedAt = this.now()
    this.persist()
    return copy(view.assignments[slot] || null)
  }

  learn (templateId, slot) {
    const template = this.template(templateId)
    if (!template || template.builtIn) throw new Error('Fork the built-in template before learning controls.')
    if (!slotsFor(template.rows, template.columns).some((item) => item.id === slot)) throw new Error('Pad not found.')
    this.mode = 'map'
    this.learning = { templateId, slot }
    this.notify()
    return true
  }

  cancelLearn () { this.learning = null; this.notify(); return true }

  clearBinding (templateId, slot) {
    const template = this.template(templateId)
    if (!template || template.builtIn) return false
    let changed = false
    for (const [key, candidate] of Object.entries(template.bindings)) {
      if (candidate === slot) { delete template.bindings[key]; changed = true }
    }
    if (changed) this.persist()
    return changed
  }

  openView (viewId, { push = true } = {}) {
    const template = this.active()
    if (!template?.views.some((view) => view.id === viewId)) return false
    const current = this.activeViewId()
    if (push && current && current !== viewId) this.navigation.set(template.id, [...(this.navigation.get(template.id) || []), current].slice(-32))
    this.currentView.set(template.id, viewId)
    this.notify()
    return true
  }

  back () {
    const template = this.active()
    if (!template) return false
    const stack = [...(this.navigation.get(template.id) || [])]
    const viewId = stack.pop() || template.rootViewId
    this.navigation.set(template.id, stack)
    return this.openView(viewId, { push: false })
  }

  async triggerSlot (slot, source = 'screen') {
    const assignment = this.activeView()?.assignments?.[slot]
    if (!assignment) return false
    if (assignment.needsSetup) {
      this.lastResult = { ok: false, slot, message: 'Choose this pad’s local target before using it.', at: this.now() }
      this.notify()
      return false
    }
    if (assignment.actionId === 'hardware.view.open') return this.openView(assignment.targetId)
    if (assignment.actionId === 'hardware.view.back') return this.back()
    if (assignment.actionId === 'hardware.view.home') return this.openView(this.active().rootViewId)
    const definition = semanticAction(assignment.actionId)
    try {
      const result = await this.invoke?.({ assignment: copy(assignment), definition, source, slot })
      this.lastResult = result?.pending
        ? { ok: null, pending: true, slot, message: 'Waiting for confirmation', at: this.now() }
        : { ok: result !== false, slot, message: result === false ? 'Action unavailable' : `${assignment.label} complete`, at: this.now() }
      this.notify()
      return result
    } catch (error) {
      this.lastResult = { ok: false, slot, message: error.message, at: this.now() }
      this.notify()
      return false
    }
  }

  resolveConfirmation (slot, allowed, result = false, message = '') {
    const assignment = this.activeView()?.assignments?.[slot]
    this.lastResult = {
      ok: Boolean(allowed && result !== false),
      pending: false,
      slot,
      message: message || (allowed ? (result === false ? 'Action unavailable' : `${assignment?.label || 'Action'} confirmed`) : 'Action cancelled'),
      at: this.now()
    }
    this.notify()
    return copy(this.lastResult)
  }

  handleInput (control) {
    if (!control?.key) return false
    this.lastInput = { ...control, at: this.now() }
    if (this.learning && control.pressed !== false) {
      const template = this.template(this.learning.templateId)
      if (template && !template.builtIn) {
        const previousSlot = template.bindings[control.key]
        const previousControl = Object.entries(template.bindings).find(([key, slot]) => slot === this.learning.slot && key !== control.key)?.[0]
        for (const [key, slot] of Object.entries(template.bindings)) if (slot === this.learning.slot || key === control.key) delete template.bindings[key]
        template.bindings[control.key] = this.learning.slot
        template.updatedAt = this.now()
        this.lastResult = {
          ok: true,
          pending: false,
          slot: this.learning.slot,
          message: previousSlot && previousSlot !== this.learning.slot
            ? `${control.key} moved from ${previousSlot}`
            : previousControl
                ? `${this.learning.slot} remapped from ${previousControl}`
                : `${control.key} mapped`,
          at: this.now()
        }
        this.learning = null
        this.persist()
        return true
      }
    }
    this.notify()
    if (!this.isCustomActive() || this.mode === 'edit' || this.mode === 'map') return this.isCustomActive() && this.mode === 'map'
    const slot = this.active().bindings[control.key]
    if (!slot) return this.isCustomActive()
    const assignment = this.activeView()?.assignments?.[slot]
    if (!assignment) return true
    const pressed = control.pressed !== false
    const wasPressed = this.inputPressed.get(control.key) === true
    this.inputPressed.set(control.key, pressed)
    if (!pressed && this.holdTimers.has(control.key)) {
      clearTimeout(this.holdTimers.get(control.key))
      this.holdTimers.delete(control.key)
    }
    if (assignment.trigger === 'release') {
      if (!pressed && wasPressed) void this.triggerSlot(slot, 'midi')
      return true
    }
    if (assignment.trigger === 'hold') {
      if (pressed && !wasPressed) {
        const timer = setTimeout(() => {
          this.holdTimers.delete(control.key)
          if (this.inputPressed.get(control.key)) void this.triggerSlot(slot, 'midi')
        }, 650)
        if (timer.unref) timer.unref()
        this.holdTimers.set(control.key, timer)
      }
      return true
    }
    if (assignment.trigger === 'value') {
      if (control.type === 'cc') void this.triggerSlot(slot, 'midi')
      return true
    }
    if (pressed && !wasPressed) void this.triggerSlot(slot, 'midi')
    return true
  }

  importTemplate (manifest) {
    validatePortableManifest(manifest)
    return this.create({ ...manifest, bindings: {}, name: clean(manifest.name, 100) || 'Imported mapping' })
  }

  exportTemplate (templateId) {
    const template = this.template(templateId)
    if (!template) throw new Error('Hardware template not found.')
    return portableHardwareTemplate(template)
  }
}

export function createHardwareProfileService (options) { return new HardwareProfileService(options) }
