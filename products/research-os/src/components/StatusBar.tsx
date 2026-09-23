import { useEffect, useState } from 'react'
import { request } from '../lib/api'
import { useWorkbench } from '../store'
import { useNativeAgentSession } from '../features/chat/Session'
import { environmentStatus, type Capabilities } from '../features/chat/environment-status'
import { cn } from '../lib/cn'

/* 窗口底部唯一一行环境状态（VS Code 状态栏语法）：Agent、LaTeX、研究服务。
   各页面不再各自铺开环境警告；详情在悬停提示里，可操作的项点开对应设置。 */
export function StatusBar() {
  const { locale, openSettings } = useWorkbench()
  const native = useNativeAgentSession()
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null), [error, setError] = useState('')
  useEffect(() => {
    let controller = new AbortController()
    const read = () => {
      controller.abort(); controller = new AbortController()
      const signal = controller.signal
      request<Capabilities>('/capabilities', { signal })
        .then(value => { if (!signal.aborted) { setCapabilities(value); setError('') } })
        .catch(cause => { if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) })
    }
    read()
    window.addEventListener('focus', read)
    return () => { controller.abort(); window.removeEventListener('focus', read) }
  }, [])
  const segments = environmentStatus({ locale, settings: native.settings, settingsError: native.settingsError, capabilities, capabilitiesError: error })
  return <footer role="status" aria-label={locale === 'zh' ? '环境状态' : 'Environment status'} data-xgc-role="status-bar"
    className="flex h-6 shrink-0 items-center gap-0.5 border-t border-line bg-panel px-2 text-[11px] text-ink-3">
    {segments.map(segment => {
      const body = <><span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', segment.tone === 'ok' ? 'bg-ink-3' : 'border border-ink-3')}/>{segment.label}</>
      const className = 'flex h-5 items-center gap-1.5 rounded px-1.5 whitespace-nowrap'
      return segment.action
        ? <button key={segment.id} type="button" data-status={segment.id} data-tone={segment.tone} title={segment.detail} onClick={() => openSettings(segment.action)} className={cn(className, 'transition-colors hover:bg-hover hover:text-ink-2')}>{body}</button>
        : <span key={segment.id} data-status={segment.id} data-tone={segment.tone} title={segment.detail} className={className}>{body}</span>
    })}
  </footer>
}
