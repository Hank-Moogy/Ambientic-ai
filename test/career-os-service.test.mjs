import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCareerDailyQueue, calculateOpportunityScore, createCareerOsService } from '../src/main/career-os-service.mjs'

function fixture () {
  const root = mkdtempSync(join(tmpdir(), 'ambientic-career-os-'))
  let sequence = 0
  let now = new Date('2026-08-21T07:30:00Z').getTime()
  const service = createCareerOsService({ file: join(root, 'career-os.json'), id: () => `id-${++sequence}`, now: () => now })
  return { service, root, setNow: (value) => { now = value } }
}

function setup () {
  return {
    careerProfile: 'Product leader with eight years in AI.', careerContext: 'Built infrastructure products.',
    careerObjective: 'Become a CPO', workAuthorization: 'EU citizen', locationPolicy: 'Remote EU',
    minimumCompensation: '€100k', targetCompensation: '€130k', targetRoles: ['Head of Product'], stretchRoles: ['VP Product'],
    country: 'France', priorities: ['Technical / AI depth'], tradeoffs: '', sources: ['Public ATS feeds'],
    routineMinutes: '45', routineTime: '08:30', maxDailyOpportunities: '5'
  }
}

function opportunity (overrides = {}) {
  return {
    company: 'Acme AI', roleTitle: 'Head of Product', canonicalUrl: 'https://jobs.ashbyhq.com/acme/role?utm_source=test',
    source: 'Ashby', ats: 'Ashby', remotePolicy: 'Remote EU', eligibility: 'eligible', salarySource: 'Inferred',
    salaryMin: 110000, salaryMax: 140000, currency: 'EUR', salaryConfidence: 'Medium',
    candidateFitScore: 78, careerFitScore: 94, urgencyScore: 80, estimatedEffortMinutes: 30,
    whyFits: ['AI-heavy product', 'Large ownership'], concerns: ['Management scope is a stretch'], candidateEdge: 'AI infrastructure plus growth experience.',
    ...overrides
  }
}

test('persists private career configuration without returning it to renderer snapshots', () => {
  const { service, root } = fixture()
  const snapshot = service.configure({ ...setup(), resumePath: '/private/career/cv.pdf', linkedinProfilePath: '/private/career/linkedin.pdf', linkedinProfileUrl: 'https://linkedin.com/in/example?trk=profile', ambienticContext: '- Wants to build category-defining products' })
  assert.equal(snapshot.configured, true)
  assert.equal(snapshot.preferences.routineMinutes, 45)
  assert.equal(JSON.stringify(snapshot).includes('Product leader with eight years'), false)
  assert.equal(JSON.stringify(snapshot).includes('/private/career'), false)
  assert.equal(JSON.stringify(snapshot).includes('category-defining'), false)
  assert.equal(service.privateSnapshot().profile.evidence.linkedinProfileUrl, 'https://linkedin.com/in/example')
  assert.match(readFileSync(join(root, 'career-os.json'), 'utf8'), /Product leader with eight years/)
  assert.equal(statSync(join(root, 'career-os.json')).mode & 0o777, 0o600)
})

test('builds a reviewable structured profile and preserves it when the user approves', () => {
  const { service } = fixture()
  service.configure(setup())
  service.updateProfile({
    headline: 'AI Product Leader', summary: 'Builds technical B2B products.', yearsExperience: 8,
    strongestAreas: ['AI products', 'Infrastructure'], achievements: ['Reduced inference cost by 30%'],
    skills: ['Product strategy'], careerNarrative: 'Private detailed narrative.', sourceCoverage: ['CV', 'LinkedIn PDF']
  })
  const before = service.list().profile
  assert.equal(before.status, 'needs_review')
  assert.equal(before.headline, 'AI Product Leader')
  assert.equal(JSON.stringify(before).includes('Private detailed narrative'), false)
  const reviewed = service.reviewProfile()
  assert.equal(reviewed.status, 'reviewed')
  assert.equal(reviewed.achievements[0], 'Reduced inference cost by 30%')
  assert.equal(service.list().profile.status, 'reviewed')
})

test('normalizes and deduplicates canonical opportunities while preserving separate fit scores', () => {
  const { service } = fixture()
  service.configure(setup())
  const first = service.upsertOpportunity(opportunity())
  const second = service.upsertOpportunity(opportunity({ canonicalUrl: 'https://jobs.ashbyhq.com/acme/role?utm_campaign=again', candidateFitScore: 82 }))
  const snapshot = service.list()
  assert.equal(snapshot.opportunities.length, 1)
  assert.equal(first.canonicalUrl, 'https://jobs.ashbyhq.com/acme/role')
  assert.equal(second.id, first.id)
  assert.equal(second.candidateFitScore, 82)
  assert.equal(second.careerFitScore, 94)
  assert.ok(second.opportunityScore > 0)
})

test('deduplicates attributed discovery records before canonical ATS resolution', () => {
  const { service } = fixture()
  service.configure(setup())
  const first = service.upsertOpportunity(opportunity({ canonicalUrl: 'https://himalayas.app/jobs/role-1', sourceUrl: 'https://himalayas.app/jobs/role-1', source: 'himalayas', sourceAttribution: 'Himalayas', externalId: 'role-1', canonicalResolved: false }))
  const second = service.upsertOpportunity(opportunity({ canonicalUrl: 'https://himalayas.app/jobs/role-1?ref=daily', sourceUrl: 'https://himalayas.app/jobs/role-1', source: 'himalayas', sourceAttribution: 'Himalayas', externalId: 'role-1', canonicalResolved: false }))
  assert.equal(service.list().opportunities.length, 1)
  assert.equal(second.id, first.id)
  assert.equal(second.sourceAttribution, 'Himalayas')
  assert.equal(second.canonicalResolved, false)
})

test('deterministic eligibility is a hard scoring constraint while missing salary is not', () => {
  assert.equal(calculateOpportunityScore({ candidateFitScore: 95, careerFitScore: 100, eligibility: 'ineligible' }), 0)
  assert.ok(calculateOpportunityScore({ candidateFitScore: 75, careerFitScore: 95, eligibility: 'unknown' }) > 50)
  const { service } = fixture()
  service.configure(setup())
  const unknownSalary = service.upsertOpportunity(opportunity({ canonicalUrl: 'https://boards.greenhouse.io/acme/jobs/1', salaryMin: null, salaryMax: null, salarySource: 'Unknown' }))
  assert.equal(unknownSalary.salaryMin, null)
  assert.ok(unknownSalary.opportunityScore > 0)
  const excluded = service.upsertOpportunity(opportunity({ canonicalUrl: 'https://jobs.lever.co/acme/2', remotePolicy: 'Remote specific countries', eligibleCountries: ['United States'], opportunityScore: 99 }))
  assert.equal(excluded.eligibility, 'ineligible')
  assert.equal(excluded.opportunityScore, 0)
})

test('Career Daily stays within its time and new-opportunity attention budgets', () => {
  const opportunities = Array.from({ length: 8 }, (_, index) => ({
    id: `role-${index}`, company: `Company ${index}`, roleTitle: 'Product Lead', status: 'New', eligibility: 'eligible', opportunityScore: 90 - index, updatedAt: index
  }))
  opportunities.push({ id: 'interview', company: 'Frontier', roleTitle: 'Head of Product', status: 'Interview', eligibility: 'eligible', opportunityScore: 70, updatedAt: 20 })
  const queue = buildCareerDailyQueue(opportunities, { minutes: 30, maxNew: 3 })
  assert.ok(queue.plannedMinutes <= 30)
  assert.equal(queue.items.filter((item) => item.type === 'review').length, 3)
  assert.equal(queue.items[0].type, 'interview')
})

test('passing is one-tap feedback that archives the opportunity and trains the summary', () => {
  const { service } = fixture()
  service.configure(setup())
  const created = service.upsertOpportunity(opportunity())
  service.passOpportunity(created.id, 'Not technical enough')
  const snapshot = service.list()
  assert.equal(snapshot.opportunities[0].status, 'Archived')
  assert.equal(snapshot.feedbackSummary['Not technical enough'], 1)
  assert.equal(snapshot.dailyQueue.items.length, 0)
})
