import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkbench } from '../../store'
import { registerTabCloseGuard } from '../projects/tab-close-guards'
import { connectReview } from './review-api'
import { scopeKey, type Scope } from './review-model'
import type { ReviewState } from './review-engine'
export function useReview(scope: Scope, tabId: string, formDirty: boolean) {
  const [state, setState] = useState<ReviewState>({book: null, busy: false, error: '', auditUncertain: false})
  const current = useRef<ReturnType<typeof connectReview> | null>(null)
  const dirty = useRef(formDirty); dirty.current = formDirty
  useEffect(() => {
    const engine = connectReview(scope, setState); current.current = engine
    void engine.load().catch(() => {})
    const pending = () => useWorkbench.getState().reviewIntents.some(i => scopeKey(i.scope) === scopeKey(scope))
    const unresolved = () => engine.snapshot().auditUncertain || !!engine.snapshot().book?.attempts.some(a => a.outcome === 'pending' || a.outcome === 'uncertain')
    const blocked = () => engine.snapshot().busy || unresolved() || dirty.current || pending()
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
    return () => { unregister(); engine.dispose(); if (current.current === engine) current.current = null; window.removeEventListener('beforeunload', warn) }
  }, [scope.projectId, scope.workspace, tabId])
  const action = useCallback(async (fn: (engine: NonNullable<typeof current.current>) => Promise<unknown>) => {
    const engine = current.current; if (!engine) return
    return fn(engine)
  }, [])
  return { ...state, action }
}
