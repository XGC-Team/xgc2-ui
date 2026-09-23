import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useWorkbench } from '../../store'
import { CONTENT_PATH, applyDraftProjection, projectDraftBook } from '../content/content-model'
import { useContentDocument } from '../content/useContentDocument'
import { isReviewLocked, registerReviewEditor } from '../review/write-coordinator'
import { draftScopeKey, type DraftBook, type DraftScope } from './draft-model'
import { draftCopy } from './draft-copy'
import { confirmFileTabClose, registerTabCloseGuard } from './tab-close-guards'

export function useDraftBook(scope: DraftScope, tabId: string, locale: 'zh' | 'en', formDirty = false) {
  const state = useContentDocument(scope.projectId, scope.workspace)
  const value = useMemo(() => state.value ? projectDraftBook(state.value) : null, [state.value])
  const key = draftScopeKey(scope)
  const form = useRef(formDirty); form.current = formDirty
  const copy = useRef(draftCopy[locale]); copy.current = draftCopy[locale]
  const { session } = state
  useEffect(() => {
    const pending = () => useWorkbench.getState().draftIntents.filter(i => draftScopeKey(i.scope) === key)
    const unregisterEditor = registerReviewEditor(scope.workspace, CONTENT_PATH, { blocked: () => form.current || pending().length > 0, reload: () => session.load() })
    const guarded = {
      snapshot: () => ({ ...session.snapshot(), ...(isReviewLocked(scope.workspace, CONTENT_PATH) ? { status: 'saving' as const } : {}), dirty: session.snapshot().dirty || form.current || pending().length > 0 }),
      // Closing one view must never dispose the workspace's shared writer.
      dispose: () => { pending().forEach(i => useWorkbench.getState().consumeDraftIntent(i.id)) },
    }
    const unregister = registerTabCloseGuard(tabId, () => confirmFileTabClose(guarded, { confirmDiscard: () => window.confirm(copy.current.closeDirty), notifySaving: () => window.alert(copy.current.closeSaving) }))
    const warn = (event: BeforeUnloadEvent) => { if (guarded.snapshot().dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => { unregister(); unregisterEditor(); window.removeEventListener('beforeunload', warn) }
  }, [scope.workspace, key, tabId, session])
  const mutate = useCallback((update: (book: DraftBook) => DraftBook) => state.mutate(document => {
    const before = projectDraftBook(document), next = update(before)
    return next === before ? document : applyDraftProjection(document, next)
  }), [state.mutate])
  return { ...state, value, mutate }
}
