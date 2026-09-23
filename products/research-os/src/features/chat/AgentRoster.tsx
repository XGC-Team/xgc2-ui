import { useMemo } from 'react'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
import { cn } from '../../lib/cn'
import { agentRoster, agentRosterSummary, type AgentReadiness } from './agent-readiness'

/* 原生 Agent 名册：只陈述宿主报告的事实（已安装/已启用/登录），不显示「在线」。
   灰阶纪律：状态靠文字承载，圆点只是辅助（实心=已登录，空心=其余）。 */
export function ReadinessGlyph({ readiness }: { readiness: AgentReadiness }) {
  return <span aria-hidden className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', readiness === 'ready' ? 'bg-ink' : readiness === 'missing' ? 'border border-dashed border-ink-3' : 'border border-ink-3')}/>
}

export function useAgentRoster() {
  const { settings, settingsError } = useNativeAgentSession()
  const locale = useWorkbench(s => s.locale)
  return useMemo(() => {
    const roster = agentRoster(settings, locale)
    return { roster, summary: agentRosterSummary(roster), loading: !settings && !settingsError, error: settingsError }
  }, [settings, settingsError, locale])
}

/** Compact roster: one row per provider, each opens its connection settings. */
export function AgentRoster({ className, dense = false }: { className?: string; dense?: boolean }) {
  const { roster, loading, error } = useAgentRoster()
  const { locale, openSettings } = useWorkbench()
  const zh = locale === 'zh'
  if (error) return <p role="alert" className={cn('text-caption text-ink-2', className)}>{zh ? '无法读取供应者设置。' : 'Provider settings could not be read.'}</p>
  if (loading) return <p className={cn('text-caption text-ink-3', className)}>{zh ? '正在读取原生 Agent…' : 'Reading native agents…'}</p>
  if (!roster.length) return <p className={cn('text-caption text-ink-3', className)}>{zh ? '宿主未登记任何原生 Agent。' : 'The host has no native agents registered.'}</p>
  return <ul className={cn('flex flex-col', className)} aria-label={zh ? '原生 Agent' : 'Native agents'}>
    {roster.map(entry => <li key={entry.id}>
      <button type="button" data-xgc-role="agent-roster-entry" data-xgc-id={entry.id} data-readiness={entry.readiness} title={entry.hint}
        onClick={() => openSettings('connections')}
        className={cn('group flex w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 hover:bg-hover', dense ? 'h-7' : 'h-8')}>
        <ReadinessGlyph readiness={entry.readiness}/>
        <span className={cn('min-w-0 flex-1 truncate', dense ? 'text-secondary' : 'text-body', entry.readiness === 'missing' ? 'text-ink-3' : 'text-ink-2 group-hover:text-ink')}>{entry.name}</span>
        <span className="shrink-0 text-caption text-ink-3">{entry.label}</span>
      </button>
    </li>)}
  </ul>
}
