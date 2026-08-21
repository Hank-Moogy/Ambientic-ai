import test from 'node:test'
import assert from 'node:assert/strict'
import { buildJobSourceRequest, CAREER_JOB_SOURCE_CATALOG, discoverCareerJobs } from '../src/main/career-job-sources.mjs'

function response (body, { status = 200, contentLength = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === 'content-length' ? contentLength : null },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body)
  }
}

async function discover (input, body) {
  let request
  const result = await discoverCareerJobs(input, { fetchImpl: async (url, options) => { request = { url, options }; return response(body) } })
  return { result, request }
}

test('source catalog separates supported feeds from browser-only Welcome to the Jungle', async () => {
  const catalog = await discoverCareerJobs({ action: 'catalog' })
  assert.ok(catalog.sources.some((source) => source.id === 'greenhouse' && source.canonicalFirst))
  assert.ok(catalog.sources.some((source) => source.id === 'weworkremotely' && source.access === 'public-rss'))
  const welcome = CAREER_JOB_SOURCE_CATALOG.find((source) => source.id === 'welcome')
  assert.equal(welcome.access, 'browser-only')
  const result = await discoverCareerJobs({ action: 'discover', source: 'welcome' })
  assert.equal(result.jobs.length, 0)
  assert.match(result.guidance, /No supported public candidate-search API/)
})

test('canonical ATS requests are allowlisted and normalize direct application data', async () => {
  assert.throws(() => buildJobSourceRequest('greenhouse', { board: '../evil.example' }), /valid board slug/)

  const greenhouse = await discover({ action: 'discover', source: 'greenhouse', board: 'acme', company: 'Acme AI', query: 'product', limit: 5 }, {
    jobs: [{ id: 7, title: 'Head of Product', location: { name: 'Remote EU' }, updated_at: '2026-08-20T08:00:00Z', absolute_url: 'https://boards.greenhouse.io/acme/jobs/7', content: '<p>Own the AI platform.</p>', departments: [{ name: 'Product' }] }]
  })
  assert.match(greenhouse.request.url, /^https:\/\/boards-api\.greenhouse\.io\//)
  assert.equal(greenhouse.result.jobs[0].company, 'Acme AI')
  assert.equal(greenhouse.result.jobs[0].canonicalResolved, true)
  assert.equal(greenhouse.result.jobs[0].remotePolicy, 'Remote EU')
  assert.deepEqual(greenhouse.result.jobs[0].eligibleCountries, [])
  assert.equal(greenhouse.result.jobs[0].jobDescription, 'Own the AI platform.')

  const ashby = await discover({ action: 'discover', source: 'ashby', board: 'frontier', company: 'Frontier', query: 'product' }, {
    jobs: [{ title: 'Principal Product Manager', location: 'Paris, France', isListed: true, isRemote: true, workplaceType: 'Remote', descriptionPlain: 'Build infrastructure.', publishedAt: '2026-08-20T10:00:00Z', jobUrl: 'https://jobs.ashbyhq.com/frontier/role', compensation: { summaryComponents: [{ compensationType: 'Salary', minValue: 120000, maxValue: 150000, currencyCode: 'EUR' }] } }]
  })
  assert.equal(ashby.result.jobs[0].salarySource, 'Published')
  assert.equal(ashby.result.jobs[0].salaryMin, 120000)
  assert.equal(ashby.result.jobs[0].ats, 'Ashby')

  const lever = await discover({ action: 'discover', source: 'lever', board: 'scaleup', company: 'Scaleup', region: 'eu', query: 'product' }, [{
    id: 'role-1', text: 'Product Lead', hostedUrl: 'https://jobs.eu.lever.co/scaleup/role-1', descriptionPlain: 'Lead product.', workplaceType: 'remote', categories: { location: 'Europe', team: 'Product' }, salaryRange: { min: 100000, max: 130000, currency: 'EUR' }
  }])
  assert.match(lever.request.url, /^https:\/\/api\.eu\.lever\.co\//)
  assert.equal(lever.result.jobs[0].canonicalResolved, true)
  assert.equal(lever.result.jobs[0].remotePolicy, 'Remote EMEA')
})

test('remote JSON sources preserve attribution and geographical restrictions', async () => {
  const himalayas = await discover({ action: 'discover', source: 'himalayas', query: 'product', country: 'FR', limit: 10 }, {
    jobs: [{ guid: 'h-1', title: 'Senior Product Manager', companyName: 'Distributed', locationRestrictions: ['France', 'Germany'], category: ['Product'], minSalary: 90000, maxSalary: 120000, currency: 'EUR', description: '<p>Remote product role.</p>', pubDate: '2026-08-21T07:00:00Z', applicationLink: 'https://jobs.ashbyhq.com/distributed/h-1', url: 'https://himalayas.app/jobs/h-1' }]
  })
  assert.match(himalayas.request.url, /country=FR/)
  assert.deepEqual(himalayas.result.jobs[0].eligibleCountries, ['France', 'Germany'])
  assert.equal(himalayas.result.jobs[0].sourceAttribution, 'Himalayas')
  assert.equal(himalayas.result.jobs[0].sourceUrl, 'https://himalayas.app/jobs/h-1')
  assert.equal(himalayas.result.jobs[0].canonicalResolved, true)

  const jobicy = await discover({ action: 'discover', source: 'jobicy', query: 'product' }, {
    jobs: [{ id: 'j-1', jobTitle: 'Product Lead', companyName: 'Paris Co', jobGeo: 'France', jobIndustry: ['Product'], jobDescription: 'Lead product.', url: 'https://jobicy.com/jobs/j-1', salaryMin: null, salaryMax: null }]
  })
  assert.deepEqual(jobicy.result.jobs[0].eligibleCountries, ['France'])
  assert.equal(jobicy.result.jobs[0].salarySource, 'Unknown')
  assert.equal(jobicy.result.jobs[0].salaryMin, null)

  const remoteOk = await discover({ action: 'discover', source: 'remoteok', query: 'product' }, [
    { legal: 'credit Remote OK' },
    { id: 'r-1', company: 'Anywhere Co', position: 'Product Manager', location: 'Worldwide', tags: ['product'], description: 'Own discovery.', url: 'https://remoteok.com/remote-jobs/r-1', apply_url: 'https://remoteok.com/remote-jobs/r-1' }
  ])
  assert.equal(remoteOk.result.jobs.length, 1)
  assert.equal(remoteOk.result.jobs[0].remotePolicy, 'Remote worldwide')
  assert.equal(remoteOk.result.jobs[0].sourceAttribution, 'Remote OK')
})

test('We Work Remotely product RSS is parsed without a scraping dependency', async () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Calm Co: Director of Product]]></title><link>https://weworkremotely.com/remote-jobs/calm-co-director</link><guid>wwr-1</guid><pubDate>Thu, 20 Aug 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>Lead a remote product team.</p>]]></description></item></channel></rss>`
  const { result, request } = await discover({ action: 'discover', source: 'weworkremotely', query: 'product' }, xml)
  assert.equal(request.url, 'https://weworkremotely.com/categories/remote-product-jobs.rss')
  assert.equal(result.jobs[0].company, 'Calm Co')
  assert.equal(result.jobs[0].roleTitle, 'Director of Product')
  assert.equal(result.jobs[0].sourceAttribution, 'We Work Remotely')
})

test('discovery rejects oversized and invalid upstream responses', async () => {
  await assert.rejects(discoverCareerJobs({ action: 'discover', source: 'remoteok' }, { fetchImpl: async () => response('[]', { contentLength: String(6 * 1024 * 1024) }) }), /too large/)
  await assert.rejects(discoverCareerJobs({ action: 'discover', source: 'jobicy' }, { fetchImpl: async () => response('{broken') }), /invalid JSON/)
})
