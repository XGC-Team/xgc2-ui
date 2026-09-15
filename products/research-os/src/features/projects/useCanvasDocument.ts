import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { CANVAS_PATH, emptyCanvas, parseEditableCanvas, serializeCanvas, type ThinkingCanvas } from './canvas-model'
import { createFileSession, initialFileState, type FileState } from './file-session'
import { attachDraftReference } from './draft-model'

type CanvasSession = ReturnType<typeof createFileSession<ThinkingCanvas>>
export function useCanvasDocument(project: string) {
  const [bound, setBound] = useState<{ project: string; state: FileState<ThinkingCanvas> }>(() => ({ project, state: initialFileState<ThinkingCanvas>() }))
  const state = bound.project === project ? bound.state : initialFileState<ThinkingCanvas>()
  const session = useRef<CanvasSession | null>(null)
  const { canvasReferences, consumeCanvasReference } = useWorkbench()
  useEffect(() => {
    const path = `/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`
    const current = createFileSession<ThinkingCanvas>({
      port: {
        read: signal => request<{ content: string; digest: string }>(path, { signal }),
        write: input => request<{ digest: string }>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
      },
      decode: parseEditableCanvas, encode: serializeCanvas, empty: emptyCanvas,
      changed: state => setBound({ project, state }),
    })
    session.current = current
    void current.load()
    const warn = (event: BeforeUnloadEvent) => {
      if (current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(item => item.project === project)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      current.dispose()
      if (session.current === current) session.current = null
      window.removeEventListener('beforeunload', warn)
    }
  }, [project])
  useEffect(() => {
    // The existing canvas session is the sole writer. Never open a competing background PUT session.
    if (!state.value || !session.current?.snapshot().value) return
    for (const reference of canvasReferences) {
      if (reference.project !== project) continue
      session.current.edit(canvas => attachDraftReference(canvas, reference.draftId, reference.title))
      consumeCanvasReference(reference.id)
    }
  }, [canvasReferences, project, state.value, consumeCanvasReference])
  const mutate = useCallback((update: (canvas: ThinkingCanvas) => ThinkingCanvas) => { session.current?.edit(update) }, [])
  const retry = useCallback(() => { void session.current?.save() }, [])
  const reload = useCallback((discardLocal = false) => { void session.current?.load(discardLocal) }, [])
  return { ...state, mutate, retry, reload }
}
