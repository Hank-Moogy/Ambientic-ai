import React, { useState } from 'react'
import { AppsToolsSettings, LaunchContext, MemoryWorkspace, ThreadContextPanel } from './ContextMemory.jsx'
import { OnboardingMemory } from './Workspace.jsx'

const now = Date.now()
const projects = [{ id: 'project-1', name: 'Ambientic', rootPath: '/Users/samori/AgentBase', brief: 'A provider-neutral context kernel and tool gateway.', exclusions: ['provider:hermes'] }]
const memories = [
  { id: 'm1', scope: 'user', kind: 'preference', content: 'Keep implementation updates concise and outcome-led.', confidence: 1, status: 'active', updatedAt: now - 40000, provenance: [{ provider: 'claude', createdAt: now - 40000 }] },
  { id: 'm2', scope: 'project', scopeId: 'project-1', kind: 'decision', content: 'Use one Ambientic MCP gateway instead of provider-specific tool surfaces.', confidence: 0.92, status: 'active', updatedAt: now - 180000, provenance: [{ provider: 'codex', createdAt: now - 180000 }] },
  { id: 'm3', scope: 'project', scopeId: 'project-1', kind: 'constraint', content: 'Native SQLite packaging must pass in the installed macOS app.', confidence: 0.7, status: 'candidate', updatedAt: now - 360000, provenance: [{ provider: 'hermes', createdAt: now - 360000 }] },
  { id: 'm4', scope: 'project', scopeId: 'project-1', kind: 'fact', content: 'Two sources disagree about the release transport.', confidence: 0.78, status: 'conflicted', updatedAt: now - 500000, provenance: [{ provider: 'claude', createdAt: now - 500000 }] }
]
const binding = { id: 'binding-1', provider: 'codex', providerSessionId: 'preview', projectId: 'project-1', goalId: 'goal-1', taskId: 'task-1', inferenceSource: 'recent_active_task', capsuleText: '<ambientic-memory>\nProject: Ambientic\nActive goal: Ship the context platform\nCurrent task: Validate the installed app\n</ambientic-memory>', capsuleHash: '4ccfe6bd865fd20d6f76077e9f27d20598a6225811aa6151388cc56874829c25', capsuleTokens: 238, createdAt: now - 600000, project: projects[0], goal: { id: 'goal-1', title: 'Ship the context platform', outcome: 'Every provider shares relevant context.' }, task: { id: 'task-1', title: 'Validate the installed app' } }
const connections = [{ id: 'tools-1', name: 'Local development tools', transport: 'stdio', health: 'healthy', enabled: true, capabilityCount: 2, updatedAt: now }]
const capabilities = [{ id: 'tools-1:read_repo', name: 'read_repo', description: 'Read repository metadata.', permission: 'read', permissionMode: 'auto' }, { id: 'tools-1:publish_release', name: 'publish_release', description: 'Publish a release artifact.', permission: 'destructive', permissionMode: 'ask' }]
const goalsSnapshot = { goals: [{ id: 'goal-1', projectId: 'project-1', title: 'Ship the context platform', outcome: 'Every provider shares relevant context.', tasks: [{ id: 'task-1', goalId: 'goal-1', projectId: 'project-1', title: 'Validate the installed app' }] }] }
const onboardingConnectors = [{ id: 'claude', label: 'Claude Code', installed: true, manageable: true }, { id: 'codex', label: 'Codex', installed: true, manageable: true }]
const onboardingItems = [
  { id: 'import-1', provider: 'claude', kind: 'preference', content: 'The user prefers concise, outcome-led implementation updates.', confidence: 1, basis: 'explicit_memory' },
  { id: 'import-2', provider: 'codex', kind: 'constraint', content: 'The user wants provider authentication to remain provider-owned.', confidence: .92, basis: 'standing_instruction' },
  { id: 'import-3', provider: 'claude', kind: 'fact', content: 'Ambientic is the user’s local agent workspace.', confidence: .88, basis: 'explicit_memory' }
]

function installPreviewApi () {
  window.ambientic = {
    context: { listProjects: async () => projects, inferLaunch: async () => binding, getBinding: async () => binding, rebind: async (_id, patch) => ({ ...binding, ...patch }), upsertProject: async (project) => ({ id: project.id || 'preview-project', ...project }) },
    memory: { list: async () => ({ memories }), search: async () => ({ memories }), remember: async (value) => value, forget: async () => true, resolveConflict: async () => true },
    tools: { listConnections: async () => ({ connections }), listCapabilities: async () => ({ capabilities }), upsert: async (value) => value, test: async () => true, disable: async () => true, disconnect: async () => true },
    audit: { list: async () => ({ events: [{ id: 'a1', eventType: 'memory.recalled', title: 'memory recalled', provider: 'codex', resultSummary: '2 results', bindingId: 'binding-1', createdAt: now - 90000 }] }) }
  }
}

export function ContextPreview () {
  installPreviewApi()
  const [surface, setSurface] = useState('memory')
  const [bootstrap, setBootstrap] = useState({ status: 'idle', runId: '', providers: [], items: [], summary: '', savedCount: 0 })
  const start = () => setBootstrap({ status: 'review', runId: 'preview-run', providers: onboardingConnectors.map((item) => ({ ...item, status: 'complete', count: item.id === 'claude' ? 2 : 1 })), items: onboardingItems, summary: 'I found three durable memories covering how you prefer to work, your standing constraints, and stable background.', savedCount: 0 })
  const commit = ({ itemIds }) => setBootstrap((current) => ({ ...current, status: 'completed', savedCount: itemIds.length, summary: `${itemIds.length} reviewed memories are now available to your agents through Ambientic.` }))
  const onboarding = <main className="onboarding-shell context-preview__onboarding"><div className="onboarding-ambient" aria-hidden="true"><i /><i /><i /></div><OnboardingMemory onboarding={{ memoryConsent: true }} bootstrap={bootstrap} connectors={onboardingConnectors} onSave={async () => {}} onStart={start} onCommit={commit} onContinue={() => setBootstrap({ status: 'idle', providers: [], items: [], summary: '', savedCount: 0 })} onBack={() => {}} /></main>
  return <main className="context-preview"><nav>{['memory', 'tools', 'launch', 'thread', 'onboarding'].map((item) => <button type="button" key={item} data-selected={surface === item} onClick={() => setSurface(item)}>{item}</button>)}</nav>{surface === 'memory' ? <MemoryWorkspace /> : surface === 'tools' ? <section className="context-preview__settings"><AppsToolsSettings /></section> : surface === 'launch' ? <section className="context-preview__modal"><LaunchContext provider="codex" cwd="/Users/samori/AgentBase" prompt="Validate the installed app" goalsSnapshot={goalsSnapshot} /></section> : surface === 'thread' ? <aside className="context-preview__thread"><ThreadContextPanel sessionId="preview" thread={{ project: 'Ambientic' }} goalsSnapshot={goalsSnapshot} /></aside> : onboarding}</main>
}
