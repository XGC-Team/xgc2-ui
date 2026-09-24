import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkbench } from '../../store'
import { registerTabCloseGuard } from '../projects/tab-close-guards'
import { connectReview } from './review-api'
import { check, scopeKey, type Scope } from './review-model'
import type { ReviewState } from './review-engine'
export function useReview(scope: Scope, tabId: string, formDirty: boolean) {
  const [state, setState] = useState<ReviewState>({book: null, busy: false, error: '', auditUncertain: false})
  const current = useRef<ReturnType<typeof connectReview> | null>(null)
  const key = scopeKey(scope), activeScope = useRef(key); activeScope.current = key
  const mountedScope = useRef('')
  const dirty = useRef(formDirty); dirty.current = formDirty
  useEffect(() => {
    const engine = connectReview(scope, setState, () => activeScope.current === key); current.current = engine; mountedScope.current = key
    void engine.load().catch(() => {})
    const pending = () => useWorkbench.getState().reviewIntents.some(i => scopeKey(i.scope) === scopeKey(scope))
    const activeWriting = () => engine.snapshot().book?.proposals.some(p => p.writing && ['running', 'ready', 'applying', 'uncertain'].includes(p.writing.status))
    const unresolved = () => engine.snapshot().auditUncertain || !!engine.snapshot().book?.attempts.some(a => a.outcome === 'pending' || a.outcome === 'uncertain')
    const blocked = () => engine.snapshot().busy || unresolved() || activeWriting() || dirty.current || pending()
    const unregister = registerTabCloseGuard(tabId, () => {
      const zh = useWorkbench.getState().locale === 'zh'
      if (engine.snapshot().busy || unresolved()) {
        window.alert(zh ? '写入或回执尚未确认；请先核对结果并导出记录。' : 'A write or journal acknowledgement is unresolved; inspect and export the record first.'); return false
      }
      if (blocked() && !window.confirm(zh ? '放弃尚未保存的提案输入？已保存的记录不受影响。' : 'Discard unsaved proposal input? Saved records are unaffected.')) return false
      useWorkbench.getState().reviewIntents.filter(i => scopeKey(i.scope) === scopeKey(scope)).forEach(i => useWorkbench.getState().consumeReviewFeedback(i.id))
      return true
    })
    const warn = (e: BeforeUnloadEvent) => { if (blocked()) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    // Another surface (e.g. "promote finding") appended to this journal: re-read it rather than hit a stale-digest conflict.
    const reread = (e: Event) => { const detail = (e as CustomEvent<Scope>).detail; if (detail && scopeKey(detail) === key && !engine.snapshot().busy) void engine.load().catch(() => {}) }
    window.addEventListener('research:review-journal-changed', reread)
    return () => { unregister(); engine.dispose(); if (current.current === engine) current.current = null; window.removeEventListener('beforeunload', warn); window.removeEventListener('research:review-journal-changed', reread) }
  }, [scope.projectId, scope.workspace, tabId, key])
  const action = useCallback(async <T,>(fn: (engine: NonNullable<typeof current.current>) => Promise<T>): Promise<T> => {
    const engine = current.current
    check(engine && activeScope.current === key && mountedScope.current === key, 'The review project changed or has not loaded. Reopen its saved review before acting.')
    return fn(engine)
  }, [key])
  return { ...(state.book && scopeKey(state.book) !== key ? { book: null, busy: false, error: '', auditUncertain: false } : state), action }
}
