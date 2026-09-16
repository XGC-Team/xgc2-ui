import { useWorkbench } from '../../store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '../../lib/api'
import { createFileSession, initialFileState, type FileState } from './file-session'
import { DRAFTS_PATH, draftScopeKey, emptyDraftBook, parseDraftBook, serializeDraftBook, type DraftBook, type DraftScope } from './draft-model'
import { draftCopy } from './draft-copy'
import { confirmFileTabClose, registerTabCloseGuard } from './tab-close-guards'

type Session = ReturnType<typeof createFileSession<DraftBook>>
export function useDraftBook(scope: DraftScope, tabId: string, locale: 'zh' | 'en', formDirty = false) {
  const { projectId, workspace } = scope
  const key = draftScopeKey(scope)
  const [bound, setBound] = useState<{ key: string; state: FileState<DraftBook> }>(() => ({ key, state: initialFileState<DraftBook>() }))
  const session = useRef<Session | null>(null)
  const form = useRef(formDirty); form.current = formDirty
  const copy = useRef(draftCopy[locale]); copy.current = draftCopy[locale]
  useEffect(() => {
    if (!projectId.trim() || !workspace.trim()) {
      setBound({ key, state: { value: null, status: 'load-error', dirty: false, error: 'A project and workspace are required.' } })
      return
    }
    const target = { projectId, workspace }
    const path = `/workspaces/${encodeURIComponent(workspace)}/files/${DRAFTS_PATH}`
    const current = createFileSession<DraftBook>({
      port: {
        read: signal => request<{ content: string; digest: string }>(path, { signal }),
        write: input => request<{ digest: string }>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
      },
      decode: text => parseDraftBook(text, target), encode: serializeDraftBook,
      empty: () => emptyDraftBook(target), changed: state => setBound({ key, state }),
    })
    session.current = current
    void current.load()
    const pending = () => useWorkbench.getState().draftIntents.filter(intent => draftScopeKey(intent.scope) === key)
    const guarded = {
      snapshot: () => ({ ...current.snapshot(), dirty: current.snapshot().dirty || form.current || pending().length > 0 }),
      dispose: () => { pending().forEach(intent => useWorkbench.getState().consumeDraftIntent(intent.id)); current.dispose() },
    }
    const unregister = registerTabCloseGuard(tabId, () => confirmFileTabClose(guarded, {
      confirmDiscard: () => window.confirm(copy.current.closeDirty),
      notifySaving: () => window.alert(copy.current.closeSaving),
    }))
    const warn = (event: BeforeUnloadEvent) => {
      if (guarded.snapshot().dirty) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => { unregister(); current.dispose(); if (session.current === current) session.current = null; window.removeEventListener('beforeunload', warn) }
  }, [projectId, workspace, key, tabId])
  const mutate = useCallback((update: (book: DraftBook) => DraftBook) => { session.current?.edit(update) }, [])
  const save = useCallback(() => { void session.current?.save() }, [])
  const reload = useCallback((discardLocal = false) => { void session.current?.load(discardLocal) }, [])
  return { ...(bound.key === key ? bound.state : initialFileState<DraftBook>()), mutate, save, reload }
}
