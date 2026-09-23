import { useCallback, useEffect, useMemo } from 'react'
import { useWorkbench } from '../../store'
import { isReviewLocked } from '../review/write-coordinator'
import { CONTENT_PATH, applyCanvasProjection, projectCanvas } from '../content/content-model'
import { findContentSession, useContentDocument } from '../content/useContentDocument'
import { emptyCanvasV2, type ThinkingCanvasV2 } from './canvas-model'
import { attachDraftReference } from './draft-model'
import { updateBindingsFromReceipts, type MappingSavedReceipt, type MappingUpdate, type ObservedSource, type LiveCanvasGate } from './design-context'

export function inspectLiveCanvas(workspace: string): LiveCanvasGate | null {
  const live = findContentSession(workspace)
  if (!live) return null
  const state = live.snapshot()
  return { project: state.value?.projectId ?? workspace, workspace, digest: state.digest, dirty: state.dirty, status: state.status, reviewLocked: isReviewLocked(workspace, CONTENT_PATH), value: state.value ? projectCanvas(state.value) : null }
}
export function useCanvasDocument(project: string, workspace = project) {
  const state = useContentDocument(project, workspace)
  const value = useMemo(() => state.value ? projectCanvas(state.value) : null, [state.value])
  const { canvasReferences, consumeCanvasReference } = useWorkbench()
  const mutate = useCallback((update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2) => state.mutate(document => {
    const before = projectCanvas(document), next = update(before)
    return next === before ? document : applyCanvasProjection(document, next)
  }), [state.mutate])
  useEffect(() => {
    if (state.reviewLocked || !state.digest || !value) return
    for (const reference of canvasReferences) if (reference.project === project) {
      if (mutate(canvas => attachDraftReference(canvas, reference.draftId, reference.title))) consumeCanvasReference(reference.id)
    }
  }, [canvasReferences, project, state.reviewLocked, state.digest, value, mutate, consumeCanvasReference])
  return { ...state, value, mutate }
}
export function editLiveCanvas(project: string, update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2): boolean {
  const session = findContentSession(project)
  if (!session || isReviewLocked(project, CONTENT_PATH)) return false
  return session.edit(document => applyCanvasProjection(document, update(projectCanvas(document))))
}
export function applyLiveMapping(workspace: string, saved: MappingSavedReceipt[], files: ReadonlyMap<string, ObservedSource>): MappingUpdate {
  const gate = inspectLiveCanvas(workspace)
  if (!gate?.value) return { status: 'failed', canvas: emptyCanvasV2(), unresolved: [], detail: 'No saved research content is loaded.' }
  if (gate.reviewLocked) return { status: 'failed', canvas: gate.value, unresolved: [], detail: 'A review write currently holds the content.' }
  if (gate.dirty || gate.status !== 'saved') return { status: 'failed', canvas: gate.value, unresolved: [], detail: 'Unsaved or conflicted content cannot receive mapping updates.' }
  const update = updateBindingsFromReceipts(gate.value, saved, files)
  if (update.status !== 'updated') return update
  const session = findContentSession(workspace)
  const bindings = new Map(update.canvas.nodes.map(node => [node.id, node.bindings]))
  // A writing receipt changes source bindings only. Reapplying the entire canvas
  // would normalize unrelated layout/content fields and change the save baseline.
  const edited = session?.edit(document => {
    let changed = false
    const objects = document.objects.map(object => {
      const next = bindings.get(object.id)
      if (next === object.bindings) return object
      changed = true
      return { ...object, bindings: next }
    })
    return changed ? { ...document, objects } : document
  })
  const document = session?.snapshot().value
  if (!edited || !document) return { status: 'failed', canvas: gate.value, unresolved: update.unresolved, detail: 'The shared content writer refused the mapping edit.' }
  return { ...update, canvas: projectCanvas(document) }
}
function canvasSnapshot(canvas: ThinkingCanvasV2): string {
  // JSON object key order may change in a server response; array order and all
  // actual fields still belong to the expected design snapshot.
  return JSON.stringify(canvas, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)
}
export async function awaitSaveLiveCanvas(workspace: string, expected: ThinkingCanvasV2): Promise<string> {
  const session = findContentSession(workspace)
  if (!session || isReviewLocked(workspace, CONTENT_PATH)) throw new Error('The design writer is unavailable or locked.')
  const expectedSnapshot = canvasSnapshot(expected)
  const matches = () => { const state = session.snapshot(); return state.value && canvasSnapshot(projectCanvas(state.value)) === expectedSnapshot }
  if (!matches()) throw new Error('The design changed before its mapping could be saved.')
  await session.flush()
  const state = session.snapshot()
  if (!state.digest || state.status !== 'saved' || state.dirty || !matches()) throw new Error(state.error || 'The design mapping has no acknowledged save.')
  return state.digest
}
