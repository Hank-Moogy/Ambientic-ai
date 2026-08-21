const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const DEFAULT_LIMIT = 20

export const CAREER_JOB_SOURCE_CATALOG = Object.freeze([
  { id: 'greenhouse', name: 'Greenhouse', tier: 'canonical', access: 'public-json', requiresBoard: true, attribution: 'Employer job board', canonicalFirst: true },
  { id: 'ashby', name: 'Ashby', tier: 'canonical', access: 'public-json', requiresBoard: true, attribution: 'Employer job board', canonicalFirst: true },
  { id: 'lever', name: 'Lever', tier: 'canonical', access: 'public-json', requiresBoard: true, attribution: 'Employer job board', canonicalFirst: true },
  { id: 'himalayas', name: 'Himalayas', tier: 'discovery', access: 'public-json', attribution: 'Himalayas', canonicalFirst: false, pollIntervalMinutes: 360 },
  { id: 'remotive', name: 'Remotive', tier: 'discovery', access: 'public-json', attribution: 'Remotive', canonicalFirst: false, pollIntervalMinutes: 360 },
  { id: 'jobicy', name: 'Jobicy', tier: 'discovery', access: 'public-json', attribution: 'Jobicy', canonicalFirst: false, pollIntervalMinutes: 60 },
  { id: 'remoteok', name: 'Remote OK', tier: 'discovery', access: 'public-json', attribution: 'Remote OK', canonicalFirst: false, pollIntervalMinutes: 360 },
  { id: 'weworkremotely', name: 'We Work Remotely · Product', tier: 'discovery', access: 'public-rss', attribution: 'We Work Remotely', canonicalFirst: false, pollIntervalMinutes: 360 },
  { id: 'welcome', name: 'Welcome to the Jungle (formerly Otta)', tier: 'discovery', access: 'browser-only', attribution: 'Welcome to the Jungle', canonicalFirst: false, note: 'No supported public candidate-search API. Use an authenticated browser session or alerts, then resolve each role to the employer ATS.' }
])

function cleanText (value, max = 24000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function decodeEntities (value) {
  return cleanText(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
}

function plainText (value) {
  return decodeEntities(value).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim()
}

function boundedLimit (value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(50, Math.floor(number))) : DEFAULT_LIMIT
}

function timestamp (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

function safeSlug (value, label = 'board') {
  const slug = cleanText(value, 120)
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error(`A valid ${label} slug is required.`)
  return slug
}

function absoluteUrl (value) {
  try {
    const url = new URL(cleanText(value, 3000))
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function inferredRemote (location, explicitRemote = false, workplaceType = '') {
  const text = `${location || ''} ${workplaceType || ''}`.toLocaleLowerCase()
  const isRemote = explicitRemote || /\bremote\b/.test(text)
  if (/worldwide|anywhere|global/.test(text)) return 'Remote worldwide'
  if (isRemote && /(\beu\b|european union)/.test(text)) return 'Remote EU'
  if (isRemote && /(\bemea\b|\beurope\b)/.test(text)) return 'Remote EMEA'
  if (isRemote && /\bfrance\b/.test(text)) return 'Remote France'
  if (/hybrid/.test(text) || /hybrid/i.test(workplaceType)) return 'Hybrid'
  if (/on[ -]?site/.test(text) || /onsite/i.test(workplaceType)) return 'On-site'
  if (isRemote) return 'Unknown'
  return 'Unknown'
}

function salary (minimum, maximum, currency) {
  const min = minimum === null || minimum === undefined || minimum === '' ? Number.NaN : Number(minimum)
  const max = maximum === null || maximum === undefined || maximum === '' ? Number.NaN : Number(maximum)
  const published = Number.isFinite(min) || Number.isFinite(max)
  return {
    salaryMin: Number.isFinite(min) ? min : null,
    salaryMax: Number.isFinite(max) ? max : null,
    currency: cleanText(currency, 12).toUpperCase(),
    salarySource: published ? 'Published' : 'Unknown',
    salaryConfidence: published ? 'High' : 'Low'
  }
}

function eligibleCountriesFor (value) {
  const text = cleanText(value, 500)
  if (!text || /worldwide|anywhere|global|\bemea\b|\beu\b|\beurope\b|european union|north america|latin america|\bapac\b/i.test(text)) return []
  return text.split(/[,;/|]/).map((item) => item.replace(/\b(remote|only|residents?|candidates?|based|within|time zones?)\b/gi, '').replace(/[()[\]]/g, '').replace(/^\s*-|\s*-\s*$/g, '').trim()).filter((item) => item.length > 1).slice(0, 30)
}

function baseOpportunity ({ source, attribution, externalId, company, roleTitle, canonicalUrl, sourceUrl, publishedAt, location, remotePolicy, eligibleCountries = [], description = '', functionName = '', seniority = '', salaryData = {}, canonicalResolved, ats = '' }) {
  const direct = canonicalResolved === true || /(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.ashbyhq\.com|jobs(?:\.eu)?\.lever\.co)/i.test(canonicalUrl)
  return {
    externalId: cleanText(externalId, 200),
    company: cleanText(company, 160),
    roleTitle: cleanText(roleTitle, 180),
    canonicalUrl: absoluteUrl(canonicalUrl),
    canonicalResolved: direct,
    source,
    sourceUrl: absoluteUrl(sourceUrl || canonicalUrl),
    sourceAttribution: attribution,
    ats: cleanText(ats, 40) || (direct ? (/greenhouse/i.test(canonicalUrl) ? 'Greenhouse' : /ashby/i.test(canonicalUrl) ? 'Ashby' : /lever/i.test(canonicalUrl) ? 'Lever' : '') : ''),
    publishedAt: timestamp(publishedAt),
    location: cleanText(location, 600),
    remotePolicy,
    eligibleCountries: Array.isArray(eligibleCountries) ? eligibleCountries.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 30) : [],
    salaryMin: salaryData.salaryMin ?? null,
    salaryMax: salaryData.salaryMax ?? null,
    currency: salaryData.currency || '',
    salarySource: salaryData.salarySource || 'Unknown',
    salaryConfidence: salaryData.salaryConfidence || 'Low',
    jobDescription: plainText(description),
    function: cleanText(functionName, 100),
    seniority: cleanText(seniority, 80),
    candidateFitScore: 0,
    careerFitScore: 0,
    scoreConfidence: 'Low',
    status: 'New'
  }
}

function normalizeGreenhouse (payload, source, input) {
  return (Array.isArray(payload?.jobs) ? payload.jobs : []).map((job) => baseOpportunity({
    source: source.id, attribution: source.attribution, externalId: job.id, company: input.company || payload.company || input.board, roleTitle: job.title,
    canonicalUrl: job.absolute_url, publishedAt: job.updated_at, location: job.location?.name,
    remotePolicy: inferredRemote(job.location?.name), eligibleCountries: eligibleCountriesFor(job.location?.name), description: job.content,
    functionName: job.departments?.map((item) => item.name).join(', '), canonicalResolved: true, ats: 'Greenhouse'
  }))
}

function normalizeAshby (payload, source, input) {
  return (Array.isArray(payload?.jobs) ? payload.jobs : []).filter((job) => job.isListed !== false).map((job) => {
    const salaryComponent = job.compensation?.summaryComponents?.find((item) => item.compensationType === 'Salary')
    const location = [job.location, ...(job.secondaryLocations || []).map((item) => item.location)].filter(Boolean).join(' · ')
    return baseOpportunity({
      source: source.id, attribution: source.attribution, externalId: job.jobUrl, company: input.company || payload.company || input.board, roleTitle: job.title,
      canonicalUrl: job.jobUrl, publishedAt: job.publishedAt, location,
      remotePolicy: inferredRemote(location, job.isRemote, job.workplaceType), eligibleCountries: job.isRemote ? eligibleCountriesFor(location) : [], description: job.descriptionPlain || job.descriptionHtml,
      functionName: job.department || job.team, salaryData: salary(salaryComponent?.minValue, salaryComponent?.maxValue, salaryComponent?.currencyCode), canonicalResolved: true, ats: 'Ashby'
    })
  })
}

function normalizeLever (payload, source, input) {
  return (Array.isArray(payload) ? payload : []).map((job) => baseOpportunity({
    source: source.id, attribution: source.attribution, externalId: job.id, company: input.company || job.company || input.board, roleTitle: job.text,
    canonicalUrl: job.hostedUrl, sourceUrl: job.hostedUrl, location: job.categories?.allLocations?.join(', ') || job.categories?.location,
    remotePolicy: inferredRemote(job.categories?.location, job.workplaceType === 'remote', job.workplaceType), eligibleCountries: job.workplaceType === 'remote' ? eligibleCountriesFor(job.categories?.allLocations?.join(', ') || job.categories?.location) : [],
    description: job.descriptionPlain || job.description, functionName: job.categories?.team || job.categories?.department,
    seniority: job.categories?.level, salaryData: salary(job.salaryRange?.min, job.salaryRange?.max, job.salaryRange?.currency), canonicalResolved: true, ats: 'Lever'
  }))
}

function normalizeHimalayas (payload, source) {
  const jobs = Array.isArray(payload) ? payload : (payload?.jobs || payload?.data || [])
  return jobs.map((job) => {
    const locations = job.locationRestrictions || []
    const location = locations.length ? locations.join(', ') : 'Remote'
    return baseOpportunity({
      source: source.id, attribution: source.attribution, externalId: job.guid, company: job.companyName, roleTitle: job.title,
      canonicalUrl: job.applicationLink, sourceUrl: job.url || job.applicationLink, publishedAt: job.pubDate, location,
      remotePolicy: locations.length ? inferredRemote(`Remote ${location}`, true) : 'Remote worldwide', eligibleCountries: locations,
      description: job.description, functionName: (job.category || []).join(', '), seniority: job.seniority,
      salaryData: salary(job.minSalary, job.maxSalary, job.currency)
    })
  })
}

function normalizeRemotive (payload, source) {
  return (payload?.jobs || []).map((job) => baseOpportunity({
    source: source.id, attribution: source.attribution, externalId: job.id, company: job.company_name, roleTitle: job.title,
    canonicalUrl: job.url, sourceUrl: job.url, publishedAt: job.publication_date, location: job.candidate_required_location,
    remotePolicy: inferredRemote(`Remote ${job.candidate_required_location || ''}`, true), eligibleCountries: eligibleCountriesFor(job.candidate_required_location), description: job.description, functionName: job.category
  }))
}

function normalizeJobicy (payload, source) {
  return (payload?.jobs || []).map((job) => baseOpportunity({
    source: source.id, attribution: source.attribution, externalId: job.id, company: job.companyName, roleTitle: job.jobTitle,
    canonicalUrl: job.url, sourceUrl: job.url, publishedAt: job.pubDate, location: job.jobGeo,
    remotePolicy: inferredRemote(`Remote ${job.jobGeo || ''}`, true), eligibleCountries: eligibleCountriesFor(job.jobGeo), description: job.jobDescription,
    functionName: Array.isArray(job.jobIndustry) ? job.jobIndustry.join(', ') : job.jobIndustry, seniority: job.jobLevel,
    salaryData: salary(job.salaryMin, job.salaryMax, job.salaryCurrency)
  }))
}

function normalizeRemoteOk (payload, source) {
  return (Array.isArray(payload) ? payload : []).filter((job) => job && (job.id || job.position)).map((job) => baseOpportunity({
    source: source.id, attribution: source.attribution, externalId: job.id, company: job.company, roleTitle: job.position,
    canonicalUrl: job.apply_url || job.url, sourceUrl: job.url, publishedAt: job.date || job.epoch, location: job.location,
    remotePolicy: inferredRemote(`Remote ${job.location || ''}`, true), eligibleCountries: eligibleCountriesFor(job.location), description: job.description,
    functionName: Array.isArray(job.tags) ? job.tags.join(', ') : '', salaryData: salary(job.salary_min, job.salary_max, job.salary_currency || 'USD')
  }))
}

function xmlValue (block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decodeEntities(match[1]).trim() : ''
}

function normalizeWwr (payload, source) {
  const items = payload.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []
  return items.map((item) => {
    const rawTitle = xmlValue(item, 'title')
    const separator = rawTitle.indexOf(':')
    return baseOpportunity({
      source: source.id, attribution: source.attribution, externalId: xmlValue(item, 'guid') || xmlValue(item, 'link'),
      company: separator > 0 ? rawTitle.slice(0, separator) : '', roleTitle: separator > 0 ? rawTitle.slice(separator + 1) : rawTitle,
      canonicalUrl: xmlValue(item, 'link'), sourceUrl: xmlValue(item, 'link'), publishedAt: xmlValue(item, 'pubDate'),
      location: 'Remote', remotePolicy: 'Unknown', description: xmlValue(item, 'description'), functionName: 'Product'
    })
  })
}

const NORMALIZERS = { greenhouse: normalizeGreenhouse, ashby: normalizeAshby, lever: normalizeLever, himalayas: normalizeHimalayas, remotive: normalizeRemotive, jobicy: normalizeJobicy, remoteok: normalizeRemoteOk, weworkremotely: normalizeWwr }

export function buildJobSourceRequest (sourceId, input = {}) {
  const limit = boundedLimit(input.limit)
  const query = cleanText(input.query || 'product', 120)
  if (sourceId === 'greenhouse') return { url: `https://boards-api.greenhouse.io/v1/boards/${safeSlug(input.board)}/jobs?content=true`, type: 'json' }
  if (sourceId === 'ashby') return { url: `https://api.ashbyhq.com/posting-api/job-board/${safeSlug(input.board)}?includeCompensation=true`, type: 'json' }
  if (sourceId === 'lever') {
    const host = input.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co'
    return { url: `https://${host}/v0/postings/${safeSlug(input.board)}?mode=json&limit=${limit}`, type: 'json' }
  }
  if (sourceId === 'himalayas') {
    const url = new URL('https://himalayas.app/jobs/api/search')
    url.searchParams.set('q', query); url.searchParams.set('sort', 'recent')
    if (input.country) url.searchParams.set('country', cleanText(input.country, 80))
    if (input.worldwide) url.searchParams.set('worldwide', 'true')
    return { url: url.toString(), type: 'json' }
  }
  if (sourceId === 'remotive') return { url: `https://remotive.com/api/remote-jobs?category=product&search=${encodeURIComponent(query)}&limit=${limit}`, type: 'json' }
  if (sourceId === 'jobicy') return { url: `https://jobicy.com/api/v2/remote-jobs?count=${limit}&tag=${encodeURIComponent(query)}`, type: 'json' }
  if (sourceId === 'remoteok') return { url: `https://remoteok.com/api?tag=${encodeURIComponent(query)}`, type: 'json' }
  if (sourceId === 'weworkremotely') return { url: 'https://weworkremotely.com/categories/remote-product-jobs.rss', type: 'xml' }
  throw new Error('This source does not expose a supported machine-readable feed.')
}

export async function discoverCareerJobs (input = {}, { fetchImpl = globalThis.fetch } = {}) {
  if (input.action === 'catalog') return { sources: CAREER_JOB_SOURCE_CATALOG }
  const source = CAREER_JOB_SOURCE_CATALOG.find((candidate) => candidate.id === input.source)
  if (!source) throw new Error('Unknown Career OS job source.')
  if (source.access === 'browser-only') return { source, jobs: [], guidance: source.note }
  if (typeof fetchImpl !== 'function') throw new Error('Job discovery is unavailable because no network client is configured.')
  const request = buildJobSourceRequest(source.id, input)
  const response = await fetchImpl(request.url, {
    headers: { accept: request.type === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml', 'user-agent': 'Ambientic Career OS/0.8 (+local user workflow)' },
    signal: AbortSignal.timeout(20_000)
  })
  if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}.`)
  const declaredSize = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) throw new Error(`${source.name} response was too large.`)
  const body = await response.text()
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw new Error(`${source.name} response was too large.`)
  let payload = body
  if (request.type === 'json') {
    try { payload = JSON.parse(body) } catch { throw new Error(`${source.name} returned invalid JSON.`) }
  }
  const query = cleanText(input.query, 120).toLocaleLowerCase()
  const normalized = NORMALIZERS[source.id](payload, source, input)
    .filter((job) => job.company && job.roleTitle && job.canonicalUrl)
    .filter((job) => !query || `${job.roleTitle} ${job.function}`.toLocaleLowerCase().includes(query))
    .slice(0, boundedLimit(input.limit))
  return { source, requestUrl: request.url, count: normalized.length, jobs: normalized }
}
