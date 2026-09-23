import type { AgentProviderConfiguration, AgentSettings } from '@xgc2/agent-runtime/react'
import { nativeProviderLabel } from './nativeSendGate'

/**
 * Readiness is derived only from the settings document the host reports.
 * A launcher that exists is not a signed-in client, and an enabled client whose
 * login was never checked is not "ready": nothing here claims a provider is online.
 */
export type AgentReadiness = 'ready' | 'unchecked' | 'signed-out' | 'disabled' | 'missing'

export function agentReadiness(provider: Pick<AgentProviderConfiguration, 'enabled' | 'available' | 'login'>): AgentReadiness {
  if (!provider.available) return 'missing'
  if (!provider.enabled) return 'disabled'
  if (provider.login.status === 'unauthenticated') return 'signed-out'
  if (provider.login.status === 'authenticated') return 'ready'
  return 'unchecked'
}

/** A thread may be started with ready or unchecked providers; the host still decides at connect time. */
export const agentUsable = (readiness: AgentReadiness) => readiness === 'ready' || readiness === 'unchecked'

const COPY: Record<'zh' | 'en', Record<AgentReadiness, { label: string; hint: string }>> = {
  zh: {
    ready: { label: '已登录', hint: '已启用，本机客户端已登录。' },
    unchecked: { label: '未核验登录', hint: '已启用，尚未核验登录；在设置中刷新状态。' },
    'signed-out': { label: '未登录', hint: '已启用，但本机客户端未登录；请用该客户端自身登录。' },
    disabled: { label: '已停用', hint: '已找到客户端，未启用。' },
    missing: { label: '未安装', hint: '本机未找到客户端；安装后用其自身登录。' },
  },
  en: {
    ready: { label: 'Signed in', hint: 'Enabled, and the local client is signed in.' },
    unchecked: { label: 'Login unchecked', hint: 'Enabled, but its login has not been checked. Refresh it in Settings.' },
    'signed-out': { label: 'Signed out', hint: 'Enabled, but the local client is not signed in. Sign in with that client.' },
    disabled: { label: 'Disabled', hint: 'Client found, not enabled.' },
    missing: { label: 'Not installed', hint: 'No local client found. Install it and sign in with its own client.' },
  },
}

export function agentReadinessCopy(readiness: AgentReadiness, locale: 'zh' | 'en') {
  return COPY[locale][readiness]
}

export type AgentRosterEntry = { id: string; name: string; readiness: AgentReadiness; label: string; hint: string; version: string }

/** Stable display order matches the product brief: Codex, Grok, Claude, OpenCode, Cursor, then anything else. */
const ORDER = ['codex', 'grok', 'claude', 'opencode', 'cursor']

export function agentRoster(settings: AgentSettings | null | undefined, locale: 'zh' | 'en'): AgentRosterEntry[] {
  const providers = [...(settings?.providers ?? [])]
  const rank = (p: AgentProviderConfiguration) => { const i = ORDER.indexOf(p.provider); return i < 0 ? ORDER.length : i }
  providers.sort((a, b) => rank(a) - rank(b))
  return providers.map(p => {
    const readiness = agentReadiness(p)
    return { id: p.id, name: nativeProviderLabel(p.provider), readiness, ...agentReadinessCopy(readiness, locale), version: p.version }
  })
}

export type AgentRosterSummary = { total: number; ready: number; usable: number }

export function agentRosterSummary(roster: readonly AgentRosterEntry[]): AgentRosterSummary {
  return {
    total: roster.length,
    ready: roster.filter(entry => entry.readiness === 'ready').length,
    usable: roster.filter(entry => agentUsable(entry.readiness)).length,
  }
}

/** Why the composer cannot start a thread, or '' when it can. Settings still loading is not a failure. */
export function agentStartBlockedReason(settings: AgentSettings | null | undefined, locale: 'zh' | 'en', settingsError = ''): string {
  if (settingsError) return locale === 'zh' ? '无法读取供应者设置，暂不能开始线程。' : 'Provider settings could not be read, so a thread cannot start.'
  if (!settings) return ''
  if (agentRosterSummary(agentRoster(settings, locale)).usable) return ''
  return locale === 'zh' ? '没有可用的原生 Agent：请在「设置 › 连接与模型」中启用一个已安装的客户端。' : 'No native agent is available. Enable an installed client in Settings › Connections & models.'
}
