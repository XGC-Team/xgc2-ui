import { observeSavedFile } from '../review/file-observations'
import { useSyncExternalStore } from 'react'
import { isReviewLocked, registerReviewEditor, subscribeWrites } from '../review/write-coordinator'
import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { CANVAS_PATH, emptyCanvas, parseEditableCanvas, serializeCanvas, type ThinkingCanvas } from './canvas-model'
import { createFileSession, initialFileState, type FileState } from './file-session'
import { attachDraftReference } from './draft-model'

type CanvasSession = ReturnType<typeof createFileSession<ThinkingCanvas>>
export function useCanvasDocument(project: string) {
  const reviewLocked = useSyncExternalStore(subscribeWrites, () => isReviewLocked(project, CANVAS_PATH))
  const [bound, setBound] = useState<{ project: string; state: FileState<ThinkingCanvas> }>(() => ({ project, state: initialFileState<ThinkingCanvas>() }))
  const state = bound.project === project ? bound.state : initialFileState<ThinkingCanvas>()
  const session = useRef<CanvasSession | null>(null)
  const { canvasReferences, consumeCanvasReference } = useWorkbench()
  useEffect(() => {
    const path = `/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`
    let observed: {content:string;digest:string}|null = null
    const current = createFileSession<ThinkingCanvas>({
      port: {
        read: async signal => { const r=await request<{content:string;digest:string}>(path,{signal}); if(!signal.aborted)observed=r; return r },
        write: async input => {
          const r=await request<{digest:string}>(path,{ method: 'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input) })
          observeSavedFile({projectId:project,workspace:project},CANVAS_PATH,observed,{content:input.content,digest:r.digest},'editor');observed={content:input.content,digest:r.digest};return r
        },
      },
      decode: parseEditableCanvas, encode: serializeCanvas, empty: emptyCanvas,
      changed: state => setBound({ project, state }),
    })
    const unregisterEditor = registerReviewEditor(project, CANVAS_PATH, {
      blocked: () => current.snapshot().status !== 'saved' || current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(i=>i.project===project),
      reload: () => current.load(),
    })
    session.current = current
    void current.load()
    const warn = (event: BeforeUnloadEvent) => {
      if (current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(item => item.project === project)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      unregisterEditor(); current.dispose()
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
  const mutate = useCallback((update: (canvas: ThinkingCanvas) => ThinkingCanvas) => { if (!isReviewLocked(project, CANVAS_PATH)) session.current?.edit(update) }, [project])
  const retry = useCallback(() => { if (!isReviewLocked(project, CANVAS_PATH)) void session.current?.save() }, [project])
  const reload = useCallback((discardLocal = false) => { if (!isReviewLocked(project, CANVAS_PATH)) void session.current?.load(discardLocal) }, [project])
  return { ...state, reviewLocked, mutate, retry, reload }
}
