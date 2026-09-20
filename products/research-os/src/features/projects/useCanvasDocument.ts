import { observeSavedFile } from '../review/file-observations'
import { useSyncExternalStore } from 'react'
import { isReviewLocked, registerReviewEditor, subscribeWrites } from '../review/write-coordinator'
import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { CANVAS_PATH, emptyCanvasV2, parseEditableCanvas, serializeCanvas, type ThinkingCanvasV2 } from './canvas-model'
import { createFileSession, initialFileState, type FilePort, type FileState } from './file-session'
import { attachDraftReference } from './draft-model'

type CanvasSession = ReturnType<typeof createFileSession<ThinkingCanvasV2>>
/** One live writer per project. Context/source viewers are readers, never competing editor sessions. */
const sessionOwners = new Map<string, CanvasSession>()

export function useCanvasDocument(project: string) {
  const reviewLocked = useSyncExternalStore(subscribeWrites, () => isReviewLocked(project, CANVAS_PATH))
  const [bound, setBound] = useState<{ project: string; state: FileState<ThinkingCanvasV2> }>(() => ({ project, state: initialFileState<ThinkingCanvasV2>() }))
  const state = bound.project === project ? bound.state : initialFileState<ThinkingCanvasV2>()
  const [uncertainProject, setUncertainProject] = useState<string | null>(null)
  const session = useRef<CanvasSession | null>(null)
  const digest = useRef<string | undefined>(undefined)
  const { canvasReferences, consumeCanvasReference } = useWorkbench()
  useEffect(() => {
    digest.current = undefined
    let active = true, uncertain = false
    const path = `/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`
    let observed: { content: string; digest: string } | null = null
    const port: FilePort = {
      read: async signal => {
        const record = await request<{ content: string; digest: string }>(path, { signal })
        if (active && !signal.aborted) {
          digest.current = record.digest; observed = record
          uncertain = false; setUncertainProject(null)
        }
        return record
      },
      write: async input => {
        if (uncertain) throw new Error('Previous save outcome is uncertain. Inspect/reload the source before another save.')
        try {
          const record = await request<{ digest: string }>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
          if (typeof record?.digest !== 'string' || !record.digest) throw new Error('Missing saved canvas revision; outcome is uncertain.')
          observeSavedFile({ projectId: project, workspace: project }, CANVAS_PATH, observed, { content: input.content, digest: record.digest }, 'editor')
          observed = { content: input.content, digest: record.digest }
          if (active) digest.current = record.digest
          return record
        } catch (error) {
          const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
          if (!(typeof status === 'number' && status >= 400 && status < 500)) {
            uncertain = true
            if (active) setUncertainProject(project)
          }
          throw error
        }
      },
    }
    const current = createFileSession<ThinkingCanvasV2>({
      port, decode: text => parseEditableCanvas(text, project), encode: serializeCanvas, empty: emptyCanvasV2,
      changed: state => setBound({ project, state }),
    })
    const unregisterEditor = registerReviewEditor(project, CANVAS_PATH, {
      blocked: () => uncertain || current.snapshot().status !== 'saved' || current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(i => i.project === project),
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
      active = false
      unregisterEditor(); current.dispose()
      if (sessionOwners.get(project) === current) sessionOwners.delete(project)
      if (session.current === current) session.current = null
      window.removeEventListener('beforeunload', warn)
    }
  }, [project])
  useEffect(() => {
    if (reviewLocked || isReviewLocked(project, CANVAS_PATH) || !state.value || !session.current?.snapshot().value) return
    for (const reference of canvasReferences) {
      if (reference.project !== project) continue
      session.current.edit(canvas => attachDraftReference(canvas, reference.draftId, reference.title))
      consumeCanvasReference(reference.id)
    }
  }, [canvasReferences, project, state.value, consumeCanvasReference, reviewLocked])
  const mutate = useCallback((update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2) => { if (!isReviewLocked(project, CANVAS_PATH)) session.current?.edit(update) }, [project])
  const retry = useCallback(() => { if (!isReviewLocked(project, CANVAS_PATH) && uncertainProject !== project) void session.current?.save() }, [project, uncertainProject])
  const reload = useCallback((discardLocal = false) => { if (!isReviewLocked(project, CANVAS_PATH)) void session.current?.load(discardLocal) }, [project])
  return { ...state, reviewLocked, uncertain: uncertainProject === project, mutate, retry, reload,
    observedDigest: () => state.status === 'saved' && !state.dirty ? digest.current : undefined }
}
