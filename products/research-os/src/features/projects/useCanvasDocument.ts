import { observeSavedFile } from '../review/file-observations'
import { useSyncExternalStore } from 'react'
import { isReviewLocked, registerReviewEditor, subscribeWrites } from '../review/write-coordinator'
import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { CANVAS_PATH, emptyCanvasV2, parseEditableCanvas, serializeCanvas, type ThinkingCanvasV2 } from './canvas-model'
import { createFileSession, initialFileState, type FilePort, type FileState } from './file-session'
import { attachDraftReference } from './draft-model'
import { updateBindingsFromReceipts, type MappingSavedReceipt, type MappingUpdate, type ObservedSource, type LiveCanvasGate } from './design-context'

type CanvasSession = ReturnType<typeof createFileSession<ThinkingCanvasV2>>
type LiveSession = { session: CanvasSession; digest: () => string | undefined }
/** One live writer per project inside this page; a remount disposes the stale session, never runs in parallel. */
const sessionOwners = new Map<string, LiveSession>()

export function inspectLiveCanvas(project: string): LiveCanvasGate | null {
  const live = sessionOwners.get(project)
  if (!live) return null
  const snapshot = live.session.snapshot()
  return {
    project,
    digest: live.digest(),
    dirty: snapshot.dirty,
    status: snapshot.status,
    reviewLocked: isReviewLocked(project, CANVAS_PATH),
    value: snapshot.value,
  }
}

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
    const port: FilePort = {
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
    }
    const current = createFileSession<ThinkingCanvasV2>({
      port,
      decode: parseEditableCanvas,
      encode: serializeCanvas, empty: emptyCanvasV2,
      changed: state => setBound({ project, state }),
    })
    const unregisterEditor = registerReviewEditor(project, CANVAS_PATH, {
      blocked: () => current.snapshot().status !== 'saved' || current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(i => i.project === project),
      reload: () => current.load(),
    })
    session.current = current
    sessionOwners.get(project)?.session.dispose()
    sessionOwners.set(project, { session: current, digest: () => digest.current })
    void current.load()
    const warn = (event: BeforeUnloadEvent) => {
      if (current.snapshot().dirty || useWorkbench.getState().canvasReferences.some(item => item.project === project)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      unregisterEditor()
      current.dispose()
      if (sessionOwners.get(project)?.session === current) sessionOwners.delete(project)
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

export function editLiveCanvas(project: string, update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2): boolean {
  const live = sessionOwners.get(project)
  if (!live || isReviewLocked(project, CANVAS_PATH)) return false
  live.session.edit(update)
  return true
}

/** D calls this after a genuine applied/reverted source save. Failed mapping is retried without rewriting the manuscript. */
export function applyLiveMapping(
  project: string,
  saved: MappingSavedReceipt[],
  files: ReadonlyMap<string, ObservedSource>,
): MappingUpdate {
  const gate = inspectLiveCanvas(project)
  if (!gate?.value) return { status: 'failed', canvas: emptyCanvasV2(), unresolved: [], detail: 'No saved canvas is loaded.' }
  if (gate.reviewLocked) return { status: 'failed', canvas: gate.value, unresolved: [], detail: 'A review write currently holds the canvas.' }
  if (gate.dirty || gate.status !== 'saved') {
    return { status: 'failed', canvas: gate.value, unresolved: [], detail: 'Unsaved or conflicted canvas cannot receive mapping updates.' }
  }
  const update = updateBindingsFromReceipts(gate.value, saved, files)
  if (update.status === 'updated' && !editLiveCanvas(project, () => update.canvas)) {
    return { status: 'failed', canvas: gate.value, unresolved: update.unresolved, detail: 'Canvas session refused the mapping edit.' }
  }
  return update
}
