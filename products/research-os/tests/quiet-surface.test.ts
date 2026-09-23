import { describe, expect, it } from 'vitest'
import type { AgentProviderConfiguration, AgentSettings } from '@xgc2/agent-runtime/react'
import { environmentStatus } from '../src/features/chat/environment-status'
import { revisionThreadSeed, withThreadBrief } from '../src/features/revision/revision-model'
import { useWorkbench } from '../src/store'

const provider = (id: string, patch: Partial<AgentProviderConfiguration> = {}): AgentProviderConfiguration => ({
  id, provider: id as AgentProviderConfiguration['provider'], enabled: false, binaryPath: '', available: false, version: '',
  login: { status: 'unknown', detail: '' }, defaults: {}, models: [], permissions: [], ...patch,
})
const settings = (...providers: AgentProviderConfiguration[]): AgentSettings => ({ revision: 'r1', providers })

describe('one calm environment status line', () => {
  it('reports gates only from what the host said, never as available', () => {
    const line = environmentStatus({ locale: 'en', settings: settings(provider('codex')), capabilities: { latex: { available: false, detail: 'builder unavailable' } } })
    expect(line.map(s => [s.id, s.tone])).toEqual([['agent', 'gate'], ['latex', 'gate']])
    expect(line.find(s => s.id === 'agent')?.action).toBe('connections')
    expect(line.find(s => s.id === 'latex')?.detail).toBe('builder unavailable')
  })
  it('distinguishes signed in from unchecked login', () => {
    const signed = environmentStatus({ locale: 'en', settings: settings(provider('claude', { available: true, enabled: true, login: { status: 'authenticated', detail: '' } })), capabilities: null })
    expect(signed).toEqual([expect.objectContaining({ id: 'agent', tone: 'ok' })])
    const unchecked = environmentStatus({ locale: 'en', settings: settings(provider('claude', { available: true, enabled: true })), capabilities: null })
    expect(unchecked[0]).toMatchObject({ id: 'agent', tone: 'gate' })
  })
  it('says nothing while settings load, and names an unreachable service or unreadable settings as unknown', () => {
    expect(environmentStatus({ locale: 'zh', settings: null, capabilities: null })).toEqual([])
    const down = environmentStatus({ locale: 'en', settings: null, settingsError: 'nope', capabilities: null, capabilitiesError: 'fetch failed' })
    expect(down.map(s => s.id)).toEqual(['backend', 'agent'])
    expect(down.every(s => s.tone === 'gate')).toBe(true)
  })
})

describe('thread brief', () => {
  it('rides verbatim on the first message instead of flooding the composer', () => {
    const brief = revisionThreadSeed({ project: 'p', locale: 'en', items: [{ id: 'r1', title: 'Bound alpha', status: 'open' }] })
    const sent = withThreadBrief(brief, 'Go through the comments.')
    expect(sent.startsWith(brief.trim())).toBe(true)
    expect(sent.endsWith('Go through the comments.')).toBe(true)
    expect(sent).toContain('research-canvas-patch')
    expect(withThreadBrief(undefined, 'hi')).toBe('hi')
    expect(withThreadBrief('  ', 'hi')).toBe('hi')
  })
  it('is scoped per project and detachable', () => {
    const { setThreadBrief } = useWorkbench.getState()
    setThreadBrief('a', { label: 'Revision brief', text: 'x' })
    setThreadBrief('b', { label: 'Other', text: 'y' })
    setThreadBrief('a', null)
    expect(useWorkbench.getState().threadBriefs).toEqual({ b: { label: 'Other', text: 'y' } })
  })
})

import { APIError } from '../src/lib/api'
import { classifyBuildRefusal, observeRenderer, rendererObservation, resetRendererObservation } from '../src/features/artifacts/renderer-gate'
import { renderStateLabel } from '../src/features/artifacts/ArtifactsPage'
import { resourceKey, resourceTitle, restoreResourceLayout } from '../src/features/workbench/resource-model'

describe('artifact renderer gate', () => {
  it('treats only a definitive refusal as "renderer unavailable"; everything else stays uncertain', () => {
    expect(classifyBuildRefusal(new APIError('artifact renderer unavailable: isolated artifact worker', 500)).kind).toBe('renderer-unavailable')
    expect(classifyBuildRefusal(new APIError('LaTeX runner is not ready', 503)).kind).toBe('renderer-unavailable')
    expect(classifyBuildRefusal(new APIError('Build returned no durable terminal receipt', 502)).kind).toBe('uncertain')
    expect(classifyBuildRefusal(new TypeError('Failed to fetch')).kind).toBe('uncertain')
  })
  it('is unknown until observed, and a status segment appears only after observation', () => {
    resetRendererObservation()
    expect(rendererObservation().state).toBe('unknown')
    expect(environmentStatus({ locale: 'en', settings: null, capabilities: null, renderer: rendererObservation() })).toEqual([])
    observeRenderer({ unavailable: 'artifact renderer unavailable' }, new Date('2026-09-24T10:00:00Z'))
    const line = environmentStatus({ locale: 'en', settings: null, capabilities: null, renderer: rendererObservation() })
    expect(line).toEqual([expect.objectContaining({ id: 'renderer', tone: 'gate' })])
    expect(line[0].detail).toContain('2026-09-24T10:00:00')
    resetRendererObservation()
  })
  it('never labels an artifact rendered without a successful receipt', () => {
    const empty = { phase: 'definition' as const, builds: [], rejected: [], laterFailure: false, scientific: 'not-claimed' as const }
    expect(renderStateLabel(empty, { state: 'unknown' }, false)).toMatchObject({ text: 'Not rendered', tone: 'quiet' })
    expect(renderStateLabel(empty, { state: 'unavailable', detail: 'x', at: 't' }, false).tone).toBe('gate')
    expect(renderStateLabel(empty, { state: 'rendered', at: 't' }, false).text).toBe('Not rendered')
    expect(renderStateLabel('error', { state: 'unknown' }, false).tone).toBe('gate')
  })
  it('is a first-class, restorable resource tab', () => {
    expect(resourceTitle({ kind: 'artifacts' }, 'zh')).toBe('制品')
    expect(resourceKey({ kind: 'artifacts' }, 'p')).toBe(JSON.stringify(['p', 'artifacts']))
    const layout = restoreResourceLayout(JSON.stringify({ version: 1, tabs: [{ kind: 'artifacts', id: 'a', title: '制品', projectId: 'p', area: 'secondary' }], active: { p: { secondary: 'a' } } }))
    expect(layout.tabs.map(t => t.kind)).toEqual(['artifacts'])
  })
})
