import { EventEmitter } from 'node:events'
import { createGoalsService } from './goals-service.mjs'

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

export function createGoalsRepository (options) { return new GoalsRepository(createGoalsService(options)) }
