import test from 'node:test'
import assert from 'node:assert/strict'
import { CAREER_OS_PACK } from '../src/shared/career-os-pack.mjs'
import { portableWorkflowPack, privateSetupSummary, sanitizePackSetup, validateWorkflowPack } from '../src/shared/workflow-pack.mjs'

function completeSetup () {
  return {
    careerProfile: 'Product leader with eight years in AI and B2B software.',
    careerContext: 'Built an inference cost program.',
    targetRoles: ['Head of Product'],
    stretchRoles: ['VP Product'],
    careerObjective: 'Become a CPO at a technical company.',
    country: 'France',
    workAuthorization: 'EU citizen',
    locationPolicy: 'Remote EU or France-compatible',
    minimumCompensation: '€100k',
    targetCompensation: '€130k',
    priorities: ['Technical / AI depth', 'Scope and ownership'],
    tradeoffs: 'Lower title for an exceptional frontier AI company.',
    sources: ['Public ATS feeds'],
    companyWatchlist: 'Mistral AI | greenhouse | mistral',
    routineMinutes: '45',
    routineTime: '08:30',
    resultsLimit: 'all'
  }
}

test('Career OS is a valid portable workflow pack with private setup declared separately', () => {
  assert.equal(validateWorkflowPack(CAREER_OS_PACK), true)
  const portable = portableWorkflowPack(CAREER_OS_PACK)
  assert.equal(portable.schema, 'ambientic.workflow-pack')
  assert.equal(portable.privacy.containsPersonalState, false)
  assert.ok(portable.privacy.neverShared.includes('resume'))
  assert.ok(portable.setup.stages.some((stage) => stage.id === 'profile'))
  const profileStage = portable.setup.stages.find((stage) => stage.id === 'profile')
  assert.ok(profileStage.fields.some((field) => field.id === 'resumePath' && field.type === 'file'))
  assert.ok(profileStage.fields.some((field) => field.id === 'linkedinProfilePath' && field.type === 'file'))
  assert.ok(profileStage.fields.some((field) => field.id === 'linkedinProfileUrl' && field.type === 'url'))
  assert.ok(profileStage.fields.some((field) => field.id === 'ambienticContext' && field.type === 'memory-import'))
  assert.ok(portable.setup.stages.some((stage) => stage.id === 'routine'))
  assert.equal(JSON.stringify(portable).includes('Product leader with eight years'), false)
})

test('Career OS preserves quality, approval, and daily attention constraints', () => {
  const daily = CAREER_OS_PACK.workflows.find((workflow) => workflow.role === 'daily')
  const pursue = CAREER_OS_PACK.workflows.find((workflow) => workflow.role === 'pursue')
  const profile = CAREER_OS_PACK.workflows.find((workflow) => workflow.role === 'profile')
  assert.match(profile.nodes[0].detail, /ambientic_career_update/)
  assert.equal(profile.nodes.length, 1)
  assert.match(profile.nodes[0].detail, /Career OS Home/)
  assert.match(daily.nodes.find((node) => node.action === 'career.daily.plan').detail, /full market result set remains visible/i)
  assert.match(daily.nodes.find((node) => node.action === 'career.daily.plan').detail, /status is not reviewed/i)
  assert.ok(pursue.nodes.some((node) => node.kind === 'approval'))
  assert.match(pursue.nodes.at(-1).detail, /does not mass apply/i)
  assert.equal(CAREER_OS_PACK.metrics.primary, 'High-quality opportunities pursued per user hour')
  assert.match(CAREER_OS_PACK.workflows.find((workflow) => workflow.role === 'scout').nodes.find((node) => node.action === 'career.discover').detail, /ambientic_jobs_discover/)
  assert.match(CAREER_OS_PACK.workflows.find((workflow) => workflow.role === 'scout').nodes.find((node) => node.action === 'career.discover').detail, /formerly Otta/)
  assert.match(CAREER_OS_PACK.workflows.find((workflow) => workflow.role === 'scout').nodes.find((node) => node.action === 'career.queue.prepare').detail, /every normalized role/i)
})

test('pack setup is schema-bounded and required values are enforced', () => {
  assert.throws(() => sanitizePackSetup(CAREER_OS_PACK, {}), /Complete the required setup/)
  const setup = sanitizePackSetup(CAREER_OS_PACK, { ...completeSetup(), targetRoles: ['Head of Product', 'Invented role'] })
  assert.deepEqual(setup.targetRoles, ['Head of Product'])
  assert.equal(setup.resultsLimit, 'all')
  const summary = privateSetupSummary(CAREER_OS_PACK, setup)
  assert.match(summary, /Country of residence: France/)
  assert.match(summary, /Career Daily length: 45 minutes/)
})
