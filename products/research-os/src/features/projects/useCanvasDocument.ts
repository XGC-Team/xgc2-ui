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
  const [bound, setBound] = useState<{ project: string; state: FileState<ThinkingCanvasV2> }>(() => ({ project, state: initialFileState<ThinkingCanvasV2>() }))
  const state = bound.project === project ? bound.state : initialFileState<ThinkingCanvasV2>()
  const session = useRef<CanvasSession | null>(null)
  const { canvasReferences, consumeCanvasReference } = useWorkbench()
  useEffect(() => {
    const path = `/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`
    const port = wrapMigratingPort({
      read: signal => request<{ content: string; digest: string }>(path, { signal }),
      write: input => request<{ digest: string }>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
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
    session.current = current
    sessionOwners.get(project)?.dispose()
    sessionOwners.set(project, current)
    void current.load()
    const warn = (event: BeforeUnloadEvent) => {
      if (current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(item => item.project === project)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      current.dispose()
      if (sessionOwners.get(project) === current) sessionOwners.delete(project)
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
  const mutate = useCallback((update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2) => { session.current?.edit(update) }, [])
  const retry = useCallback(() => { void session.current?.save() }, [])
  const reload = useCallback((discardLocal = false) => { void session.current?.load(discardLocal) }, [])
  return { ...state, mutate, retry, reload }
}
