import { EventEmitter } from 'node:events'
import { createGoalsService } from './goals-service.mjs'
import { createWorkflowService } from './workflow-service.mjs'
import { createCareerOsService } from './career-os-service.mjs'

class ServiceRepository extends EventEmitter {
  constructor (service) {
    super()
    this.service = service
    service.on?.('change', (state) => this.emit('change', state))
  }
}

export class GoalsRepository extends ServiceRepository {
  list () { return this.service.list() }
  createGoal (input) { return this.service.createGoal(input) }
  updateGoal (id, patch) { return this.service.updateGoal(id, patch) }
  createTask (goalId, input) { return this.service.createTask(goalId, input) }
  updateTask (id, patch) { return this.service.updateTask(id, patch) }
}

export class WorkflowsRepository extends ServiceRepository {
  list () { return this.service.list() }
  create (input) { return this.service.create(input) }
  update (id, input) { return this.service.update(id, input) }
  duplicate (id) { return this.service.duplicate(id) }
  remove (id) { return this.service.remove(id) }
  setEnabled (id, enabled) { return this.service.setEnabled(id, enabled) }
  installPack (pack, setup) { return this.service.installPack(pack, setup) }
  packSetup (id) { return this.service.packSetup(id) }
  startRun (id, options) { return this.service.startRun(id, options) }
  approve (id, allow) { return this.service.approve(id, allow) }
  cancel (id) { return this.service.cancel(id) }
  handleThread (snapshot) { return this.service.handleThread(snapshot) }
  startScheduler () { return this.service.startScheduler() }
  stopScheduler () { return this.service.stopScheduler() }
}

export class CareerOsRepository extends ServiceRepository {
  list () { return this.service.list() }
  privateSnapshot () { return this.service.privateSnapshot() }
  configure (setup) { return this.service.configure(setup) }
  updateProfile (input, options) { return this.service.updateProfile(input, options) }
  reviewProfile (options) { return this.service.reviewProfile(options) }
  upsertOpportunity (input, options) { return this.service.upsertOpportunity(input, options) }
  updateOpportunity (id, patch, options) { return this.service.updateOpportunity(id, patch, options) }
  passOpportunity (id, reason, note, options) { return this.service.passOpportunity(id, reason, note, options) }
  addInterview (id, input, options) { return this.service.addInterview(id, input, options) }
  recordMarketScan (input, options) { return this.service.recordMarketScan(input, options) }
}

export function createGoalsRepository (options) { return new GoalsRepository(createGoalsService(options)) }
export function createWorkflowsRepository (options) { return new WorkflowsRepository(createWorkflowService(options)) }
export function createCareerOsRepository (options) { return new CareerOsRepository(createCareerOsService(options)) }
