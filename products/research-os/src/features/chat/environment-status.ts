import type { AgentSettings } from '@xgc2/agent-runtime/react'
import { agentRoster, agentRosterSummary } from './agent-readiness'

/**
 * One calm status line for environment gates (VS Code status bar grammar).
 * Every segment is derived from what the host reported; nothing is shown as available
 * unless the host said so, and an unreadable source is shown as unknown, not as a failure of the user.
 */
export type Capability = { available: boolean; detail?: string }
export type Capabilities = { latex?: Capability; workspace?: Capability }
export type StatusSegment = {
  id: 'backend' | 'agent' | 'latex'
  label: string
  /** 'ok' renders quietly; 'gate' gets a hollow dot and the detail in its tooltip. */
  tone: 'ok' | 'gate'
  detail: string
  action?: 'connections'
}

export function environmentStatus(input: {
  locale: 'zh' | 'en'
  settings: AgentSettings | null | undefined
  settingsError?: string
  capabilities: Capabilities | null
  capabilitiesError?: string
}): StatusSegment[] {
  const zh = input.locale === 'zh'
  const out: StatusSegment[] = []
  if (input.capabilitiesError) out.push({ id: 'backend', tone: 'gate', label: zh ? '研究服务不可达' : 'Research service unreachable', detail: input.capabilitiesError })

  if (input.settingsError) out.push({ id: 'agent', tone: 'gate', action: 'connections', label: zh ? 'Agent 状态未知' : 'Agent status unknown', detail: input.settingsError })
  else if (input.settings) {
    const summary = agentRosterSummary(agentRoster(input.settings, input.locale))
    if (summary.ready) out.push({ id: 'agent', tone: 'ok', action: 'connections', label: zh ? `Agent · ${summary.ready} 个已登录` : `Agent · ${summary.ready} signed in`, detail: zh ? '登录状态来自各客户端自身。' : 'Login state comes from each client itself.' })
    else if (summary.usable) out.push({ id: 'agent', tone: 'gate', action: 'connections', label: zh ? 'Agent · 登录未核验' : 'Agent · login unchecked', detail: zh ? '已启用客户端，但尚未核验登录。' : 'A client is enabled, but its login has not been checked.' })
    else out.push({ id: 'agent', tone: 'gate', action: 'connections', label: zh ? 'Agent 未连接' : 'No agent connected', detail: zh ? '在「设置 › 连接与模型」启用一个已安装的客户端。' : 'Enable an installed client in Settings › Connections & models.' })
  }

  const latex = input.capabilities?.latex
  if (latex) out.push(latex.available
    ? { id: 'latex', tone: 'ok', label: zh ? 'LaTeX 可构建' : 'LaTeX builds on', detail: latex.detail || '' }
    : { id: 'latex', tone: 'gate', label: zh ? 'LaTeX 构建关闭' : 'LaTeX builds off', detail: latex.detail || '' })
  return out
}
