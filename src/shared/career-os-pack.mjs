const roles = [
  'Product Manager', 'Senior PM', 'Staff PM', 'Principal PM', 'Product Lead',
  'Head of Product', 'Director Product', 'VP Product'
]

const options = (values) => values.map((value) => ({ value, label: value }))

const node = (id, kind, label, detail, action, x, y, provider = '') => ({ id, kind, label, detail, action, x, y, provider })

export const CAREER_OS_PACK = {
  schema: 'ambientic.workflow-pack',
  schemaVersion: 1,
  id: 'ambientic.career-os',
  version: '0.3.0',
  name: 'Career OS',
  tagline: 'A persistent career agent that decides where your time has the highest expected value.',
  description: 'Discover, rank, prepare, track, and learn through one calm 30–60 minute daily routine.',
  category: 'Career',
  visibility: 'shared',
  setup: {
    estimatedMinutes: 12,
    summaryFields: ['routineMinutes', 'routineTime', 'maxDailyOpportunities'],
    stages: [
      {
        id: 'profile',
        title: 'Profile',
        prompt: 'Start with the evidence that represents you.',
        fields: [
          { id: 'resumePath', label: 'Upload your CV', type: 'file', required: false, accept: ['pdf', 'doc', 'docx', 'rtf', 'txt', 'md'], buttonLabel: 'Choose CV' },
          { id: 'linkedinProfilePath', label: 'LinkedIn profile PDF', type: 'file', required: false, accept: ['pdf'], buttonLabel: 'Choose LinkedIn PDF' },
          { id: 'linkedinProfileUrl', label: 'LinkedIn profile URL', type: 'url', required: false, placeholder: 'https://www.linkedin.com/in/your-profile' },
          { id: 'ambienticContext', label: 'Context Ambientic already knows', type: 'memory-import', required: false },
          { id: 'careerProfile', label: 'Or enter your career manually', type: 'textarea', required: false, placeholder: 'Roles, achievements, metrics, skills, projects, and domains.' },
          { id: 'careerContext', label: 'Anything important that is not on your CV?', type: 'textarea', required: false, placeholder: 'Ambitions, important projects, constraints, or context.' }
        ]
      },
      {
        id: 'target',
        title: 'Target',
        prompt: 'What job do you want now?',
        fields: [
          { id: 'targetRoles', label: 'Roles actively targeting', type: 'multi-select', required: true, options: options(roles) },
          { id: 'stretchRoles', label: 'Exciting stretch roles', type: 'multi-select', required: false, options: options(roles) },
          { id: 'careerObjective', label: 'Three-year career objective', type: 'textarea', required: true, placeholder: 'What are you optimizing your career for over the next three years?' }
        ]
      },
      {
        id: 'constraints',
        title: 'Constraints',
        prompt: 'Which opportunities are genuinely workable?',
        fields: [
          { id: 'country', label: 'Country of residence', type: 'text', required: true, placeholder: 'France' },
          { id: 'workAuthorization', label: 'Work authorization', type: 'text', required: true, placeholder: 'EU citizen, France permit, sponsorship needed…' },
          { id: 'locationPolicy', label: 'Location and remote constraints', type: 'textarea', required: true, placeholder: 'Remote EU or France-compatible; maximum office days; relocation tolerance.' },
          { id: 'minimumCompensation', label: 'Minimum seriously considered', type: 'text', required: false, placeholder: '€95k base' },
          { id: 'targetCompensation', label: 'Target compensation', type: 'text', required: false, placeholder: '€120k total compensation' }
        ]
      },
      {
        id: 'calibrate',
        title: 'Calibrate',
        prompt: 'Teach Career OS your taste.',
        fields: [
          { id: 'priorities', label: 'Highest priorities', type: 'multi-select', required: true, options: options(['Technical / AI depth', 'Scope and ownership', 'Remote flexibility', 'Compensation', 'Company trajectory', 'Learning', 'Equity / upside', 'Title progression']) },
          { id: 'tradeoffs', label: 'Trade-offs you would make', type: 'textarea', required: false, placeholder: 'For example: a lower title for an exceptional frontier AI company.' }
        ]
      },
      {
        id: 'connect',
        title: 'Connect',
        prompt: 'Start with public market data. Add private sources progressively.',
        fields: [
          { id: 'sources', label: 'Sources to use', type: 'multi-select', required: true, options: options(['Public ATS feeds', 'Remote product feeds', 'Welcome to the Jungle alerts', 'Curated company watchlist', 'Email signals', 'Calendar signals', 'LinkedIn connections export']) },
          { id: 'companyWatchlist', label: 'Company ATS watchlist', type: 'textarea', required: false, placeholder: 'One per line, for example: Mistral AI | greenhouse | mistral\nLinear | ashby | linear\nQonto | lever | qonto' }
        ]
      },
      {
        id: 'routine',
        title: 'Routine',
        prompt: 'Protect a small daily window for the work that matters.',
        fields: [
          { id: 'routineMinutes', label: 'Career Daily length', type: 'select', required: true, defaultValue: '45', options: [{ value: '30', label: '30 minutes' }, { value: '45', label: '45 minutes' }, { value: '60', label: '60 minutes' }] },
          { id: 'routineTime', label: 'Career Daily time', type: 'time', required: true, defaultValue: '08:30', placeholder: '08:30' },
          { id: 'maxDailyOpportunities', label: 'Maximum new opportunities per day', type: 'select', required: true, defaultValue: '5', options: [{ value: '3', label: '3 opportunities' }, { value: '5', label: '5 opportunities' }] }
        ]
      }
    ]
  },
  dataModel: {
    privateObjects: ['CareerProfile', 'CareerPreferences', 'Opportunity', 'Application', 'Interview', 'Relationship', 'Outcome'],
    opportunityScores: ['candidate_fit_score', 'career_fit_score', 'opportunity_score', 'score_confidence'],
    opportunityStatuses: ['New', 'Saved', 'Pursuing', 'Application Ready', 'Applied', 'Recruiter Screen', 'Interview', 'Final Round', 'Offer', 'Rejected', 'Withdrawn', 'Archived']
  },
  agents: ['Scout', 'Normalizer / Deduper', 'Judge', 'Company Research', 'Network', 'Application', 'Interview', 'Outcome Analyzer', 'Career Learning'],
  metrics: {
    activation: 'Career Daily completed on two separate days',
    primary: 'High-quality opportunities pursued per user hour',
    northStar: 'Interview hours generated per job-search hour'
  },
  workflows: [
    {
      id: 'profile-build',
      role: 'profile',
      name: 'Career OS · Build career profile',
      description: 'Mine user-provided career evidence and reviewed Ambientic memory into one truthful structured profile.',
      enabled: false,
      nodes: [
        node('profile-mine', 'agent', 'Build your Career Profile', 'Read only the CV, LinkedIn PDF/profile URL, manual context, and reviewed Ambientic memories the user explicitly selected during setup. Use ambientic_recall only when Ambientic memory was selected. Extract roles, achievements, metrics, skills, projects, leadership, technologies, domains, ambitions, and constraints. Reconcile overlaps, preserve source coverage, distinguish fact from inference, and never fabricate. Then use ambientic_career_update with action profile to persist the structured Career Profile with status needs_review.', 'career.profile.mine', 160, 140, 'auto'),
        node('profile-review', 'approval', 'Review what Career OS understood', 'Pause so the user can review the structured profile before Career OS treats it as trusted ranking context. The user can correct or add evidence; approval never submits or publishes anything.', 'human.approval', 560, 140)
      ]
    },
    {
      id: 'market-scan',
      role: 'scout',
      name: 'Career OS · Market scan',
      description: 'Discover overnight, normalize the market, and retain only the few opportunities worth human attention.',
      enabled: true,
      schedule: { recurrence: 'Every weekday', fromSetup: 'routineTime', offsetMinutes: -60 },
      nodes: [
        node('scan-schedule', 'schedule', 'Before Career Daily', 'Every weekday · 07:30', 'trigger.schedule', 70, 120),
        node('discover', 'web', 'Discover new roles', 'Use ambientic_jobs_discover. Monitor the watchlist through canonical Greenhouse, Ashby, and Lever APIs, then search Himalayas, Remotive, Jobicy, Remote OK, and the We Work Remotely Product RSS feed. Preserve attribution and resolve aggregator finds back to an employer ATS when possible. Welcome to the Jungle (formerly Otta) is an optional alert/browser source, not a scraping dependency.', 'career.discover', 350, 120),
        node('normalize', 'agent', 'Normalize and deduplicate', 'Create structured Opportunity records, resolve canonical postings, normalize remote eligibility, mark compensation as Published, Inferred, or Unknown, and remove duplicates.', 'career.normalize', 630, 158, 'auto'),
        node('judge', 'agent', 'Judge fit and value', 'Score Candidate Fit and Career Fit separately. Rank by expected career value, probability of success, urgency, and effort. Treat missing salary as uncertainty, not automatic rejection.', 'career.rank', 910, 120, 'auto'),
        node('shortlist', 'agent', 'Prepare the action queue', 'Return no more than the configured daily maximum. For each recommendation include why it fits, concerns, the candidate’s edge, compensation confidence, remote eligibility, urgency, and the next action. Persist structured opportunity state locally when the Ambientic context tools are available.', 'career.queue.prepare', 1190, 158, 'auto')
      ]
    },
    {
      id: 'career-daily',
      role: 'daily',
      name: 'Career Daily',
      description: 'A protected 30–60 minute queue for reviewing, pursuing, preparing, and updating only the best opportunities.',
      enabled: false,
      nodes: [
        node('daily-plan', 'agent', 'Build today’s queue', 'Use the latest Career OS opportunity state and pipeline to propose a time-boxed Career Daily. Prioritize no more than five new opportunities and unfinished high-value actions. State when no prior market scan is available.', 'career.daily.plan', 100, 140, 'auto'),
        node('daily-review', 'approval', 'Choose what to pursue', 'Pause for the user to review the shortlist. Passing is one tap and should capture a lightweight reason. Never submit an application from this workflow.', 'human.approval', 390, 178),
        node('daily-prepare', 'agent', 'Prepare approved work', 'For pursued roles, prepare the company brief, truthful resume tailoring suggestions, ATS terminology gaps, application answers, and interview preparation that fit inside the remaining routine time.', 'career.daily.prepare', 680, 140, 'auto'),
        node('daily-track', 'agent', 'Update momentum', 'Update the local pipeline and summarize meaningful progress. Keep rejections diagnostic; lead with active opportunities, processes advanced, and the next best action.', 'career.pipeline.update', 970, 178, 'auto')
      ]
    },
    {
      id: 'pursue-opportunity',
      role: 'pursue',
      name: 'Career OS · Pursue opportunity',
      description: 'Research the company, find a warm path, and prepare a truthful application for review.',
      enabled: false,
      nodes: [
        node('company-research', 'web', 'Research the company', 'Research founders, funding, product, business model, competitors, recent news, leadership views, adjacent roles, and technical architecture where discoverable. Cite current sources.', 'career.company.research', 80, 130),
        node('warm-path', 'agent', 'Find the best warm path', 'Use only the professional relationship data the user has explicitly connected. Rank direct routes by target relevance, relationship strength, and directness. If no graph is available, say so.', 'career.network.rank', 370, 168, 'auto'),
        node('application', 'agent', 'Prepare the application', 'Select and reorder truthful Career Profile evidence, identify ATS gaps, draft only useful or required answers, and never fabricate experience. Flag every answer that needs review.', 'career.application.prepare', 660, 130, 'auto'),
        node('application-review', 'approval', 'Review before submission', 'Require human review before any application, introduction request, email, or form submission. This MVP prepares; it does not mass apply.', 'human.approval', 950, 168)
      ]
    },
    {
      id: 'weekly-review',
      role: 'weekly',
      name: 'Career OS · Weekly review',
      description: 'Learn from activity and outcomes without turning rejection into the headline.',
      enabled: true,
      nodes: [
        node('weekly-schedule', 'schedule', 'Weekly reflection', 'Every week · 17:00', 'trigger.schedule', 90, 130),
        node('weekly-analyze', 'agent', 'Analyze the funnel', 'Summarize time invested, strong roles reviewed, applications, introductions, interviews, and processes advanced. Compare response patterns across role families and warm versus cold paths.', 'career.weekly.analyze', 390, 168, 'auto'),
        node('weekly-learn', 'agent', 'Recommend one adjustment', 'Propose one evidence-backed preference or strategy adjustment. Explain the evidence and confidence. Do not silently change career objectives or deterministic constraints.', 'career.learning.recommend', 690, 130, 'auto'),
        node('weekly-approve', 'approval', 'Accept or adjust', 'Let the user accept or adjust the recommendation before Career OS changes future ranking behavior.', 'human.approval', 990, 168)
      ]
    }
  ],
  privacy: {
    shared: ['workflow topology', 'prompts', 'agent roles', 'schedules', 'scoring framework', 'source strategy', 'setup schema', 'metrics logic'],
    neverShared: ['resume', 'career history', 'applications', 'contacts', 'email', 'calendar', 'network', 'preferences', 'career goals', 'opportunity state'],
    containsCredentials: false,
    containsPersonalState: false
  }
}
