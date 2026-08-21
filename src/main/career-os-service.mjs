import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const VERSION = 1
const MAX_EVENTS = 1000
const MAX_FEEDBACK = 500
const STATUSES = new Set(['New', 'Saved', 'Pursuing', 'Application Ready', 'Applied', 'Recruiter Screen', 'Interview', 'Final Round', 'Offer', 'Rejected', 'Withdrawn', 'Archived'])
const REMOTE_POLICIES = new Set(['Remote worldwide', 'Remote EMEA', 'Remote EU', 'Remote France', 'Remote specific countries', 'Hybrid', 'On-site', 'Unknown'])
const CONFIDENCE = new Set(['Low', 'Medium', 'High'])
const SALARY_SOURCES = new Set(['Published', 'Inferred', 'Unknown'])
const ELIGIBILITY = new Set(['eligible', 'ineligible', 'unknown'])
const PASS_REASONS = new Set(['Salary', 'Location', 'Company', 'Industry', 'Too junior', 'Too senior', 'Not technical enough', 'Not interesting', 'Other'])
const EU_COUNTRIES = new Set(['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czechia', 'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden'])

function cleanText (value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function copy (value) {
  return JSON.parse(JSON.stringify(value))
}

function boundedNumber (value, minimum, maximum, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback
}

function cleanStringList (input, { maxItems = 30, maxLength = 200 } = {}) {
  return [...new Set((Array.isArray(input) ? input : []).map((value) => cleanText(value, maxLength)).filter(Boolean))].slice(0, maxItems)
}

function canonicalUrl (input) {
  try {
    const url = new URL(cleanText(input, 3000))
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(ref|source|trk)$/i.test(key)) url.searchParams.delete(key)
    return url.toString()
  } catch {
    return ''
  }
}

function deterministicEligibility (input, preferences, privateProfile) {
  const country = cleanText(preferences?.country, 120).toLocaleLowerCase()
  const authorization = cleanText(privateProfile?.workAuthorization, 1000).toLocaleLowerCase()
  const policy = input.remotePolicy
  const eligibleCountries = cleanStringList(input.eligibleCountries).map((value) => value.toLocaleLowerCase())
  if (policy === 'Remote worldwide') return { eligibility: 'eligible', reason: 'The posting is remote worldwide.' }
  if (eligibleCountries.length) {
    const eligible = eligibleCountries.includes(country)
    return { eligibility: eligible ? 'eligible' : 'ineligible', reason: eligible ? `${preferences.country} is explicitly eligible.` : `${preferences.country || 'The residence country'} is not in the posting’s eligible-country list.` }
  }
  if (policy === 'Remote EU') {
    const eligible = EU_COUNTRIES.has(country) || /\beu citizen\b|european union|\beu work/.test(authorization)
    return { eligibility: eligible ? 'eligible' : 'unknown', reason: eligible ? 'Residence or work authorization satisfies Remote EU.' : 'EU eligibility needs confirmation.' }
  }
  if (policy === 'Remote France') {
    const eligible = country === 'france' || /france|french citizen|\beu citizen\b/.test(authorization)
    return { eligibility: eligible ? 'eligible' : 'unknown', reason: eligible ? 'Residence or work authorization satisfies Remote France.' : 'France eligibility needs confirmation.' }
  }
  if (policy === 'Remote EMEA' && (EU_COUNTRIES.has(country) || /\beu citizen\b|european union/.test(authorization))) return { eligibility: 'eligible', reason: 'Residence or work authorization satisfies Remote EMEA.' }
  return null
}

function emptyState () {
  return {
    version: VERSION,
    configured: false,
    privateProfile: {},
    preferences: {},
    opportunities: [],
    feedback: [],
    interviews: [],
    market: { processed: 0, matched: 0, lastScanAt: null },
    events: [],
    updatedAt: null
  }
}

function emptyCareerProfile () {
  return {
    status: 'pending',
    headline: '',
    summary: '',
    yearsExperience: null,
    strongestAreas: [],
    achievements: [],
    skills: [],
    projects: [],
    leadership: [],
    technologies: [],
    domains: [],
    careerNarrative: '',
    uncertainties: [],
    sourceCoverage: [],
    updatedAt: null
  }
}

export function calculateOpportunityScore ({ candidateFitScore, careerFitScore, urgencyScore = 50, estimatedEffortMinutes = 30, eligibility = 'unknown' }) {
  if (eligibility === 'ineligible') return 0
  const candidate = boundedNumber(candidateFitScore, 0, 100, 0)
  const career = boundedNumber(careerFitScore, 0, 100, 0)
  const urgency = boundedNumber(urgencyScore, 0, 100, 50)
  const effort = boundedNumber(estimatedEffortMinutes, 5, 180, 30)
  const value = career * (candidate / 100)
  const urgencyMultiplier = 0.75 + urgency / 200
  const effortDivisor = 0.8 + effort / 300
  return Math.round(Math.max(0, Math.min(100, value * urgencyMultiplier / effortDivisor)))
}

function sanitizeOpportunity (input, existing, { id, now }) {
  const candidateFitScore = boundedNumber(input.candidateFitScore ?? existing?.candidateFitScore, 0, 100, 0)
  const careerFitScore = boundedNumber(input.careerFitScore ?? existing?.careerFitScore, 0, 100, 0)
  const urgencyScore = boundedNumber(input.urgencyScore ?? existing?.urgencyScore, 0, 100, 50)
  const estimatedEffortMinutes = boundedNumber(input.estimatedEffortMinutes ?? existing?.estimatedEffortMinutes, 5, 180, 30)
  const eligibility = ELIGIBILITY.has(input.eligibility) ? input.eligibility : (existing?.eligibility || 'unknown')
  const opportunityScore = calculateOpportunityScore({ candidateFitScore, careerFitScore, urgencyScore, estimatedEffortMinutes, eligibility })
  const url = canonicalUrl(input.canonicalUrl) || existing?.canonicalUrl || ''

  return {
    id: existing?.id || id,
    externalId: cleanText(input.externalId ?? existing?.externalId, 200),
    company: cleanText(input.company ?? existing?.company, 160),
    roleTitle: cleanText(input.roleTitle ?? existing?.roleTitle, 180),
    canonicalUrl: url,
    canonicalResolved: input.canonicalResolved === true || (input.canonicalResolved === undefined && existing?.canonicalResolved === true),
    source: cleanText(input.source ?? existing?.source, 80),
    sourceUrl: canonicalUrl(input.sourceUrl) || existing?.sourceUrl || url,
    sourceAttribution: cleanText(input.sourceAttribution ?? existing?.sourceAttribution, 120),
    ats: cleanText(input.ats ?? existing?.ats, 40),
    publishedAt: boundedNumber(input.publishedAt ?? existing?.publishedAt, 1, Number.MAX_SAFE_INTEGER, null),
    firstSeenAt: existing?.firstSeenAt || boundedNumber(input.firstSeenAt, 1, Number.MAX_SAFE_INTEGER, now),
    location: cleanText(input.location ?? existing?.location, 600),
    remotePolicy: REMOTE_POLICIES.has(input.remotePolicy) ? input.remotePolicy : (existing?.remotePolicy || 'Unknown'),
    eligibleCountries: cleanStringList(input.eligibleCountries ?? existing?.eligibleCountries),
    eligibility,
    eligibilityReason: cleanText(input.eligibilityReason ?? existing?.eligibilityReason, 500),
    salaryMin: boundedNumber(input.salaryMin ?? existing?.salaryMin, 0, 10_000_000, null),
    salaryMax: boundedNumber(input.salaryMax ?? existing?.salaryMax, 0, 10_000_000, null),
    currency: cleanText(input.currency ?? existing?.currency, 12).toUpperCase(),
    salarySource: SALARY_SOURCES.has(input.salarySource) ? input.salarySource : (existing?.salarySource || 'Unknown'),
    salaryConfidence: CONFIDENCE.has(input.salaryConfidence) ? input.salaryConfidence : (existing?.salaryConfidence || 'Low'),
    jobDescription: cleanText(input.jobDescription ?? existing?.jobDescription, 24000),
    requirements: cleanStringList(input.requirements ?? existing?.requirements, { maxItems: 60, maxLength: 400 }),
    seniority: cleanText(input.seniority ?? existing?.seniority, 80),
    function: cleanText(input.function ?? existing?.function, 100),
    industry: cleanText(input.industry ?? existing?.industry, 120),
    candidateFitScore,
    careerFitScore,
    opportunityScore,
    scoreConfidence: CONFIDENCE.has(input.scoreConfidence) ? input.scoreConfidence : (existing?.scoreConfidence || 'Low'),
    urgencyScore,
    estimatedEffortMinutes,
    whyFits: cleanStringList(input.whyFits ?? existing?.whyFits, { maxItems: 8, maxLength: 300 }),
    concerns: cleanStringList(input.concerns ?? existing?.concerns, { maxItems: 8, maxLength: 300 }),
    candidateEdge: cleanText(input.candidateEdge ?? existing?.candidateEdge, 800),
    connections: Array.isArray(input.connections) ? input.connections.slice(0, 30).map((connection) => ({
      name: cleanText(connection?.name, 120),
      relationship: cleanText(connection?.relationship, 160),
      strength: CONFIDENCE.has(connection?.strength) ? connection.strength : 'Low'
    })).filter((connection) => connection.name) : (existing?.connections || []),
    recommendedIntroPath: cleanText(input.recommendedIntroPath ?? existing?.recommendedIntroPath, 800),
    status: STATUSES.has(input.status) ? input.status : (existing?.status || 'New'),
    nextAction: cleanText(input.nextAction ?? existing?.nextAction, 500),
    deadline: boundedNumber(input.deadline ?? existing?.deadline, 1, Number.MAX_SAFE_INTEGER, null),
    resumeVariant: cleanText(input.resumeVariant ?? existing?.resumeVariant, 120),
    applicationAnswers: Array.isArray(input.applicationAnswers) ? input.applicationAnswers.slice(0, 40).map((answer) => ({ question: cleanText(answer?.question, 500), answer: cleanText(answer?.answer, 4000), needsReview: answer?.needsReview !== false })) : (existing?.applicationAnswers || []),
    notes: cleanStringList(input.notes ?? existing?.notes, { maxItems: 60, maxLength: 2000 }),
    outcome: cleanText(input.outcome ?? existing?.outcome, 1000),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }
}

function queueAction (opportunity) {
  if (['Interview', 'Final Round'].includes(opportunity.status)) return { type: 'interview', label: `Prepare ${opportunity.company} interview`, minutes: 15, priorityBoost: 35 }
  if (opportunity.status === 'Application Ready') return { type: 'application_review', label: `Review ${opportunity.company} application`, minutes: 8, priorityBoost: 24 }
  if (opportunity.status === 'Pursuing') return { type: 'prepare', label: `Prepare ${opportunity.company} application`, minutes: 12, priorityBoost: 16 }
  if (['New', 'Saved'].includes(opportunity.status)) return { type: 'review', label: `Review ${opportunity.roleTitle} at ${opportunity.company}`, minutes: 3, priorityBoost: 0 }
  return null
}

export function buildCareerDailyQueue (opportunities, { minutes = 45, maxNew = 5 } = {}) {
  const budget = boundedNumber(minutes, 15, 120, 45)
  let remaining = budget
  let newCount = 0
  const items = opportunities
    .filter((opportunity) => opportunity.eligibility !== 'ineligible')
    .map((opportunity) => ({ opportunity, action: queueAction(opportunity) }))
    .filter((item) => item.action)
    .sort((left, right) => (right.opportunity.opportunityScore + right.action.priorityBoost) - (left.opportunity.opportunityScore + left.action.priorityBoost) || right.opportunity.updatedAt - left.opportunity.updatedAt)
  const queue = []
  for (const item of items) {
    if (item.action.type === 'review' && newCount >= boundedNumber(maxNew, 1, 10, 5)) continue
    if (item.action.minutes > remaining && queue.length) continue
    queue.push({
      id: `${item.opportunity.id}:${item.action.type}`,
      opportunityId: item.opportunity.id,
      type: item.action.type,
      label: item.action.label,
      minutes: Math.min(item.action.minutes, remaining),
      score: item.opportunity.opportunityScore
    })
    remaining -= item.action.minutes
    if (item.action.type === 'review') newCount++
    if (remaining <= 0) break
  }
  return { minutes: budget, plannedMinutes: budget - remaining, remainingMinutes: remaining, items: queue }
}

export class CareerOsService extends EventEmitter {
  constructor ({ file, now = () => Date.now(), id = () => randomUUID() }) {
    super()
    this.file = file
    this.now = now
    this.id = id
    this.state = this.load()
  }

  load () {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      return {
        ...emptyState(),
        ...parsed,
        version: VERSION,
        opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
        feedback: Array.isArray(parsed.feedback) ? parsed.feedback.slice(-MAX_FEEDBACK) : [],
        interviews: Array.isArray(parsed.interviews) ? parsed.interviews : [],
        events: Array.isArray(parsed.events) ? parsed.events.slice(-MAX_EVENTS) : []
      }
    } catch {
      return emptyState()
    }
  }

  persist () {
    this.state.updatedAt = this.now()
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.file)
    const snapshot = this.list()
    this.emit('change', snapshot)
    return snapshot
  }

  record (action, entityId, details = {}, actor = 'agent') {
    this.state.events = [...this.state.events, { id: this.id(), at: this.now(), action, entityId, actor, details }].slice(-MAX_EVENTS)
  }

  configure (setup = {}) {
    this.state.configured = true
    this.state.privateProfile = {
      careerProfile: cleanText(setup.careerProfile, 12000),
      careerContext: cleanText(setup.careerContext, 8000),
      careerObjective: cleanText(setup.careerObjective, 4000),
      workAuthorization: cleanText(setup.workAuthorization, 1000),
      locationPolicy: cleanText(setup.locationPolicy, 3000),
      compensation: { minimum: cleanText(setup.minimumCompensation, 500), target: cleanText(setup.targetCompensation, 500) },
      evidence: {
        resumePath: cleanText(setup.resumePath, 4000),
        linkedinProfilePath: cleanText(setup.linkedinProfilePath, 4000),
        linkedinProfileUrl: canonicalUrl(setup.linkedinProfileUrl),
        ambienticContext: cleanText(setup.ambienticContext, 12000)
      },
      structured: emptyCareerProfile()
    }
    this.state.preferences = {
      targetRoles: cleanStringList(setup.targetRoles),
      stretchRoles: cleanStringList(setup.stretchRoles),
      country: cleanText(setup.country, 120),
      priorities: cleanStringList(setup.priorities),
      tradeoffs: cleanText(setup.tradeoffs, 3000),
      sources: cleanStringList(setup.sources),
      companyWatchlist: cleanText(setup.companyWatchlist, 6000),
      routineMinutes: boundedNumber(setup.routineMinutes, 30, 60, 45),
      routineTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(setup.routineTime)) ? String(setup.routineTime) : '08:30',
      maxDailyOpportunities: boundedNumber(setup.maxDailyOpportunities, 1, 5, 5)
    }
    this.record('career.configured', 'career-os', { targetRoles: this.state.preferences.targetRoles, routineMinutes: this.state.preferences.routineMinutes }, 'human')
    return this.persist()
  }

  pipeline () {
    return Object.fromEntries([...STATUSES].map((status) => [status, this.state.opportunities.filter((opportunity) => opportunity.status === status).length]))
  }

  list () {
    const opportunities = [...this.state.opportunities].sort((left, right) => right.opportunityScore - left.opportunityScore || right.updatedAt - left.updatedAt)
    const routine = this.state.preferences.routineMinutes || 45
    const maxNew = this.state.preferences.maxDailyOpportunities || 5
    return {
      version: VERSION,
      configured: this.state.configured,
      preferences: {
        targetRoles: copy(this.state.preferences.targetRoles || []),
        routineMinutes: routine,
        routineTime: this.state.preferences.routineTime || '08:30',
        maxDailyOpportunities: maxNew
      },
      profile: copy({
        status: this.state.privateProfile?.structured?.status || 'pending',
        headline: this.state.privateProfile?.structured?.headline || '',
        summary: this.state.privateProfile?.structured?.summary || '',
        yearsExperience: this.state.privateProfile?.structured?.yearsExperience ?? null,
        strongestAreas: this.state.privateProfile?.structured?.strongestAreas || [],
        achievements: this.state.privateProfile?.structured?.achievements || [],
        sourceCoverage: this.state.privateProfile?.structured?.sourceCoverage || [],
        uncertainties: this.state.privateProfile?.structured?.uncertainties || [],
        updatedAt: this.state.privateProfile?.structured?.updatedAt || null
      }),
      opportunities: copy(opportunities),
      pipeline: this.pipeline(),
      dailyQueue: buildCareerDailyQueue(opportunities, { minutes: routine, maxNew }),
      market: copy(this.state.market),
      feedbackSummary: Object.fromEntries([...PASS_REASONS].map((reason) => [reason, this.state.feedback.filter((item) => item.reason === reason).length])),
      updatedAt: this.state.updatedAt
    }
  }

  privateSnapshot () {
    return copy({ profile: this.state.privateProfile, preferences: this.state.preferences, opportunities: this.state.opportunities, interviews: this.state.interviews, market: this.state.market })
  }

  updateProfile (input = {}, { actor = 'agent' } = {}) {
    const profile = {
      status: input.status === 'reviewed' ? 'reviewed' : 'needs_review',
      headline: cleanText(input.headline, 240),
      summary: cleanText(input.summary, 3000),
      yearsExperience: boundedNumber(input.yearsExperience, 0, 80, null),
      strongestAreas: cleanStringList(input.strongestAreas, { maxItems: 12, maxLength: 160 }),
      achievements: cleanStringList(input.achievements, { maxItems: 30, maxLength: 500 }),
      skills: cleanStringList(input.skills, { maxItems: 80, maxLength: 120 }),
      projects: cleanStringList(input.projects, { maxItems: 30, maxLength: 500 }),
      leadership: cleanStringList(input.leadership, { maxItems: 30, maxLength: 500 }),
      technologies: cleanStringList(input.technologies, { maxItems: 80, maxLength: 120 }),
      domains: cleanStringList(input.domains, { maxItems: 40, maxLength: 160 }),
      careerNarrative: cleanText(input.careerNarrative, 4000),
      uncertainties: cleanStringList(input.uncertainties, { maxItems: 20, maxLength: 500 }),
      sourceCoverage: cleanStringList(input.sourceCoverage, { maxItems: 12, maxLength: 160 }),
      updatedAt: this.now()
    }
    this.state.privateProfile.structured = profile
    this.record('career.profile.updated', 'career-profile', { status: profile.status, sourceCoverage: profile.sourceCoverage, strongestAreas: profile.strongestAreas }, actor)
    this.persist()
    return copy(profile)
  }

  reviewProfile ({ actor = 'human' } = {}) {
    const existing = this.state.privateProfile?.structured
    if (!existing?.headline && !existing?.summary) throw new Error('Build the Career Profile before approving it.')
    this.state.privateProfile.structured = { ...existing, status: 'reviewed', updatedAt: this.now() }
    this.record('career.profile.reviewed', 'career-profile', { sourceCoverage: existing.sourceCoverage || [] }, actor)
    this.persist()
    return copy(this.state.privateProfile.structured)
  }

  opportunity (opportunityId) {
    return this.state.opportunities.find((candidate) => candidate.id === opportunityId)
  }

  upsertOpportunity (input = {}, { actor = 'agent' } = {}) {
    if (!cleanText(input.company, 160) || !cleanText(input.roleTitle, 180)) throw new Error('An opportunity needs a company and role title.')
    const url = canonicalUrl(input.canonicalUrl)
    const externalId = cleanText(input.externalId, 200)
    const source = cleanText(input.source, 80)
    const existing = this.state.opportunities.find((candidate) =>
      (url && candidate.canonicalUrl === url) ||
      (externalId && source && candidate.externalId === externalId && candidate.source === source) ||
      (input.id && candidate.id === input.id)
    )
    const geographic = deterministicEligibility(input, this.state.preferences, this.state.privateProfile)
    const opportunity = sanitizeOpportunity({ ...input, canonicalUrl: url, ...(geographic ? { eligibility: geographic.eligibility, eligibilityReason: geographic.reason } : {}) }, existing, { id: this.id(), now: this.now() })
    if (existing) Object.assign(existing, opportunity)
    else this.state.opportunities.push(opportunity)
    this.record(existing ? 'opportunity.updated' : 'opportunity.created', opportunity.id, { status: opportunity.status, score: opportunity.opportunityScore }, actor)
    this.persist()
    return copy(opportunity)
  }

  updateOpportunity (opportunityId, patch = {}, { actor = 'human' } = {}) {
    const existing = this.opportunity(opportunityId)
    if (!existing) throw new Error('Opportunity not found.')
    const opportunity = sanitizeOpportunity({ ...existing, ...patch, id: existing.id }, existing, { id: existing.id, now: this.now() })
    Object.assign(existing, opportunity)
    this.record('opportunity.updated', existing.id, { status: existing.status, nextAction: existing.nextAction }, actor)
    this.persist()
    return copy(existing)
  }

  passOpportunity (opportunityId, reason = 'Other', note = '', { actor = 'human' } = {}) {
    const opportunity = this.opportunity(opportunityId)
    if (!opportunity) throw new Error('Opportunity not found.')
    const selectedReason = PASS_REASONS.has(reason) ? reason : 'Other'
    opportunity.status = 'Archived'
    opportunity.updatedAt = this.now()
    this.state.feedback = [...this.state.feedback, { id: this.id(), opportunityId, reason: selectedReason, note: cleanText(note, 1000), at: this.now() }].slice(-MAX_FEEDBACK)
    this.record('opportunity.passed', opportunityId, { reason: selectedReason }, actor)
    this.persist()
    return copy(opportunity)
  }

  addInterview (opportunityId, input = {}, { actor = 'agent' } = {}) {
    const opportunity = this.opportunity(opportunityId)
    if (!opportunity) throw new Error('Opportunity not found.')
    const interview = { id: this.id(), opportunityId, at: boundedNumber(input.at, 1, Number.MAX_SAFE_INTEGER, this.now()), interviewer: cleanText(input.interviewer, 160), stage: cleanText(input.stage, 120), notes: cleanText(input.notes, 8000), createdAt: this.now() }
    this.state.interviews.push(interview)
    opportunity.status = STATUSES.has(input.status) ? input.status : 'Interview'
    opportunity.updatedAt = this.now()
    this.record('interview.created', opportunityId, { stage: interview.stage }, actor)
    this.persist()
    return copy(interview)
  }

  recordMarketScan (input = {}, { actor = 'agent' } = {}) {
    this.state.market = { processed: boundedNumber(input.processed, 0, 1_000_000, 0), matched: boundedNumber(input.matched, 0, 1_000_000, 0), lastScanAt: this.now() }
    this.record('market.scanned', 'career-os', this.state.market, actor)
    return this.persist().market
  }
}

export function createCareerOsService (options) {
  return new CareerOsService(options)
}
