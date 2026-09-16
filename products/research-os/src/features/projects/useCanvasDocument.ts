import { observeSavedFile } from '../review/file-observations'
import { useSyncExternalStore } from 'react'
import { isReviewLocked, registerReviewEditor, subscribeWrites } from '../review/write-coordinator'
import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { CANVAS_PATH, emptyCanvasV2, migrateCanvasV1toV2, parseEditableCanvas, serializeCanvas, type ThinkingCanvasV2 } from './canvas-model'
import { backupCanvasV1, wrapMigratingPort } from './canvas-migration'
import { createFileSession, initialFileState, type FileState } from './file-session'
import { attachDraftReference } from './draft-model'

type CanvasSession = ReturnType<typeof createFileSession<ThinkingCanvasV2>>
/** One live writer per project inside this page; a remount disposes the stale session, never runs in parallel. */
const sessionOwners = new Map<string, CanvasSession>()

export function useCanvasDocument(project: string) {
  const reviewLocked = useSyncExternalStore(subscribeWrites, () => isReviewLocked(project, CANVAS_PATH))
  const [bound, setBound] = useState<{ project: string; state: FileState<ThinkingCanvasV2> }>(() => ({ project, state: initialFileState<ThinkingCanvasV2>() }))
  const state = bound.project === project ? bound.state : initialFileState<ThinkingCanvasV2>()
  const session = useRef<CanvasSession | null>(null)
  const digest = useRef<string | undefined>(undefined)
  const { canvasReferences, consumeCanvasReference } = useWorkbench()
  useEffect(() => {
    digest.current = undefined
    const path = `/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`
    let observed: { content: string; digest: string } | null = null
    const port = wrapMigratingPort({
      read: async signal => {
        const record = await request<{ content: string; digest: string }>(path, { signal })
        digest.current = record.digest
        if (!signal.aborted) observed = record
        return record
      },
      write: async input => {
        const record = await request<{ digest: string }>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
        observeSavedFile({ projectId: project, workspace: project }, CANVAS_PATH, observed, { content: input.content, digest: record.digest }, 'editor')
        observed = { content: input.content, digest: record.digest }
        digest.current = record.digest
        return record
      },
    }, content => backupCanvasV1(project, content))
    const current = createFileSession<ThinkingCanvasV2>({
      port,
      decode: text => {
        const parsed = parseEditableCanvas(text)
        return parsed.version === 1 ? migrateCanvasV1toV2(parsed) : parsed
      },
      encode: serializeCanvas, empty: emptyCanvasV2,
      changed: state => setBound({ project, state }),
    })
    const unregisterEditor = registerReviewEditor(project, CANVAS_PATH, {
      blocked: () => current.snapshot().status !== 'saved' || current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(i => i.project === project),
      reload: () => current.load(),
    })
    session.current = current
    sessionOwners.get(project)?.dispose()
    sessionOwners.set(project, current)
    void current.load()
    const warn = (event: BeforeUnloadEvent) => {
      if (current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(item => item.project === project)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      unregisterEditor()
      current.dispose()
      if (sessionOwners.get(project) === current) sessionOwners.delete(project)
      if (session.current === current) session.current = null
      window.removeEventListener('beforeunload', warn)
    }
  }, [project])
  useEffect(() => {
    // The existing canvas session is the sole writer. Never open a competing background PUT session.
    if (reviewLocked || isReviewLocked(project, CANVAS_PATH) || !state.value || !session.current?.snapshot().value) return
    for (const reference of canvasReferences) {
      if (reference.project !== project) continue
      session.current.edit(canvas => attachDraftReference(canvas, reference.draftId, reference.title))
      consumeCanvasReference(reference.id)
    }
  }, [canvasReferences, project, state.value, consumeCanvasReference, reviewLocked])
  const mutate = useCallback((update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2) => { if (!isReviewLocked(project, CANVAS_PATH)) session.current?.edit(update) }, [project])
  const retry = useCallback(() => { if (!isReviewLocked(project, CANVAS_PATH)) void session.current?.save() }, [project])
  const reload = useCallback((discardLocal = false) => { if (!isReviewLocked(project, CANVAS_PATH)) void session.current?.load(discardLocal) }, [project])
  return { ...state, reviewLocked, mutate, retry, reload, observedDigest: () => digest.current }
}
