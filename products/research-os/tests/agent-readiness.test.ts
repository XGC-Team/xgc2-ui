import { describe, expect, it } from 'vitest'
import type { AgentProviderConfiguration, AgentSettings } from '@xgc2/agent-runtime/react'
import { agentReadiness, agentRoster, agentRosterSummary, agentStartBlockedReason } from '../src/features/chat/agent-readiness'

const provider = (id: string, patch: Partial<AgentProviderConfiguration> = {}): AgentProviderConfiguration => ({
  id, provider: id as AgentProviderConfiguration['provider'], enabled: false, binaryPath: '', available: false, version: '',
  login: { status: 'unknown', detail: '' }, defaults: {}, models: [], permissions: [], ...patch,
})
const settings = (...providers: AgentProviderConfiguration[]): AgentSettings => ({ revision: 'r1', providers })

describe('native agent readiness', () => {
  it('never reports a provider ready without an enabled, installed, signed-in client', () => {
    expect(agentReadiness(provider('codex'))).toBe('missing')
    expect(agentReadiness(provider('codex', { enabled: true }))).toBe('missing')
    expect(agentReadiness(provider('claude', { available: true }))).toBe('disabled')
    expect(agentReadiness(provider('claude', { available: true, enabled: true }))).toBe('unchecked')
    expect(agentReadiness(provider('grok', { available: true, enabled: true, login: { status: 'unauthenticated', detail: '' } }))).toBe('signed-out')
    expect(agentReadiness(provider('grok', { available: true, enabled: true, login: { status: 'authenticated', detail: '' } }))).toBe('ready')
  })

  it('orders the roster as Codex, Grok, Claude, OpenCode, Cursor', () => {
    const roster = agentRoster(settings(provider('cursor'), provider('claude'), provider('opencode'), provider('codex'), provider('grok')), 'en')
    expect(roster.map(entry => entry.name)).toEqual(['Codex', 'Grok', 'Claude', 'OpenCode', 'Cursor'])
    expect(roster[0].label).toBe('Not installed')
  })

  it('counts unchecked logins as usable but not ready', () => {
    const roster = agentRoster(settings(provider('claude', { available: true, enabled: true }), provider('codex')), 'zh')
    expect(agentRosterSummary(roster)).toEqual({ total: 2, ready: 0, usable: 1 })
  })

  it('explains why a thread cannot start, and stays quiet while loading', () => {
    expect(agentStartBlockedReason(null, 'en')).toBe('')
    expect(agentStartBlockedReason(null, 'en', 'boom')).toMatch(/could not be read/)
    expect(agentStartBlockedReason(settings(provider('claude', { available: true })), 'en')).toMatch(/No native agent is available/)
    expect(agentStartBlockedReason(settings(provider('claude', { available: true, enabled: true })), 'en')).toBe('')
    expect(agentStartBlockedReason(settings(provider('grok', { available: true, enabled: true, login: { status: 'unauthenticated', detail: '' } })), 'zh')).toMatch(/没有可用的原生 Agent/)
  })
})
