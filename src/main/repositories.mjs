import { EventEmitter } from 'node:events'
import { createGoalsService } from './goals-service.mjs'
import { createWorkflowService } from './workflow-service.mjs'

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
  startRun (id) { return this.service.startRun(id) }
  approve (id, allow) { return this.service.approve(id, allow) }
  cancel (id) { return this.service.cancel(id) }
  handleThread (snapshot) { return this.service.handleThread(snapshot) }
  startScheduler () { return this.service.startScheduler() }
  stopScheduler () { return this.service.stopScheduler() }
}

export function createGoalsRepository (options) { return new GoalsRepository(createGoalsService(options)) }
export function createWorkflowsRepository (options) { return new WorkflowsRepository(createWorkflowService(options)) }
