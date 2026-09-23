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
