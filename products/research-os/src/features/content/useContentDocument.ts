import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { DraftScope } from '../projects/draft-model'
import { useWorkbench } from '../../store'
import { observeSavedFile } from '../review/file-observations'
import { isReviewLocked, registerReviewEditor, subscribeWrites } from '../review/write-coordinator'
import { contentPort } from './content-client'
import { CONTENT_PATH, serializeContent, type ContentDocument } from './content-model'
import { createContentSession, type ContentSession } from './content-session'

// A workspace has exactly one canonical content writer for this page, shared by all views.
// Keep it through tab changes so a pending save or failed CAS never loses local edits.
const writers = new Map<string, { projectId: string; session: ContentSession }>()
export function findContentSession(workspace: string): ContentSession | undefined { return writers.get(workspace)?.session }
export function sharedContentSession(scope: DraftScope): ContentSession {
  const existing = writers.get(scope.workspace)
  if (existing) {
    if (existing.projectId !== scope.projectId) throw new Error('This workspace is already open for another project.')
    return existing.session
  }
  const recoveryKey = `research-content-draft:v1:${encodeURIComponent(scope.workspace)}:${encodeURIComponent(scope.projectId)}`
  const recovery = typeof window === 'undefined' ? undefined : {
    read: () => { const raw = localStorage.getItem(recoveryKey); return raw ? JSON.parse(raw) : null },
    write: (draft: import('./content-session').ContentRecovery) => localStorage.setItem(recoveryKey, JSON.stringify(draft)),
    clear: () => localStorage.removeItem(recoveryKey),
  }
  const session = createContentSession({ scope, port: contentPort(scope), recovery, saved: (before, after) => {
    observeSavedFile(scope, CONTENT_PATH, before?.digest ? { content: before.content ?? serializeContent(before.document), digest: before.digest } : null,
      { content: after.content ?? serializeContent(after.document), digest: after.digest }, 'editor')
  } })
  writers.set(scope.workspace, { projectId: scope.projectId, session })
  registerReviewEditor(scope.workspace, CONTENT_PATH, {
    blocked: () => { const s = session.snapshot(); return s.status !== 'saved' || s.dirty || useWorkbench.getState().canvasReferences.some(r => r.project === scope.projectId) || useWorkbench.getState().draftIntents.some(r => r.scope.projectId === scope.projectId && r.scope.workspace === scope.workspace) },
    reload: () => session.load(),
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', event => { if (session.snapshot().dirty) { event.preventDefault(); event.returnValue = '' } })
    window.addEventListener('focus', () => { if (!session.snapshot().dirty && !isReviewLocked(scope.workspace, CONTENT_PATH)) void session.load() })
  }
  return session
}
export function useContentDocument(projectId: string, workspace = projectId) {
  const session = useMemo(() => sharedContentSession({ projectId, workspace }), [projectId, workspace])
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot)
  const reviewLocked = useSyncExternalStore(subscribeWrites, () => isReviewLocked(workspace, CONTENT_PATH), () => false)
  useEffect(() => { if (session.snapshot().status === 'loading') void session.load() }, [session])
  const mutate = useCallback((update: (document: ContentDocument) => ContentDocument) => !isReviewLocked(workspace, CONTENT_PATH) && session.edit(update), [session, workspace])
  const save = useCallback(() => { if (!isReviewLocked(workspace, CONTENT_PATH)) void session.save() }, [session, workspace])
  const reload = useCallback((discardLocal = false) => { if (!isReviewLocked(workspace, CONTENT_PATH)) void session.load(discardLocal) }, [session, workspace])
  const migrate = useCallback(() => { if (!isReviewLocked(workspace, CONTENT_PATH)) void session.migrate() }, [session, workspace])
  return { ...state, reviewLocked, mutate, save, retry: save, reload, migrate, observedDigest: () => session.snapshot().digest, session }
}
