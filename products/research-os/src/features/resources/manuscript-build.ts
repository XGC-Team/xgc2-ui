import { useEffect, useState } from 'react'
import { observedFiles, subscribeObservations } from '../review/file-observations'
import { compilePDF, isManuscriptSource, type ManuscriptPDF } from './manuscript'

export type ManuscriptPreviewState = {
  generation: number
  pdf: ManuscriptPDF | null
  compiling: boolean
  error: string
  stale: boolean
}

export const emptyManuscriptPreview = (): ManuscriptPreviewState => ({
  generation: 0, pdf: null, compiling: false, error: '', stale: false,
})

export function beginManuscriptBuild(state: ManuscriptPreviewState, generation = state.generation + 1): ManuscriptPreviewState {
  return { ...state, generation, compiling: true, error: '' }
}

export function completeManuscriptBuild(
  state: ManuscriptPreviewState,
  startedGeneration: number,
  result: { pdf?: ManuscriptPDF; error?: string },
): ManuscriptPreviewState {
  if (startedGeneration !== state.generation) return state
  if (result.pdf) return { ...state, compiling: false, pdf: result.pdf, error: '', stale: false }
  return { ...state, compiling: false, error: result.error || '编译失败，请检查稿件。', stale: !!state.pdf }
}

export function previewTabPatch(
  tabs: { id: string; kind: string; pdf?: ManuscriptPDF }[],
  previous: ManuscriptPDF | null,
  next: ManuscriptPDF,
): { id: string; pdf: ManuscriptPDF } | { open: ManuscriptPDF } {
  if (previous) {
    const current = tabs.find(tab => tab.kind === 'pdf' && tab.pdf?.buildId === previous.buildId)
    if (current) return { id: current.id, pdf: next }
  }
  const same = tabs.find(tab => tab.kind === 'pdf' && tab.pdf?.workspace === next.workspace && tab.pdf?.path === next.path)
  if (same) return { id: same.id, pdf: next }
  return { open: next }
}

type BuildListener = (payload: { generation: number; pdf?: ManuscriptPDF; error?: string; compiling: boolean }) => void

type Slot = {
  generation: number
  inflight: boolean
  queued: boolean
  timer?: ReturnType<typeof setTimeout>
  listeners: Set<BuildListener>
}

const slots = new Map<string, Slot>()
const debounceMs = 400

function slotKey(workspace: string, entryPoint: string): string {
  return `${workspace}\0${entryPoint}`
}

function slotOf(workspace: string, entryPoint: string): Slot {
  const key = slotKey(workspace, entryPoint)
  const existing = slots.get(key)
  if (existing) return existing
  const created: Slot = { generation: 0, inflight: false, queued: false, listeners: new Set() }
  slots.set(key, created)
  return created
}

function emit(slot: Slot, payload: { generation: number; pdf?: ManuscriptPDF; error?: string; compiling: boolean }): void {
  slot.listeners.forEach(listener => listener(payload))
}

async function pump(workspace: string, entryPoint: string): Promise<void> {
  const slot = slotOf(workspace, entryPoint)
  if (slot.inflight) return
  slot.inflight = true
  try {
    while (slot.queued) {
      slot.queued = false
      const generation = slot.generation
      try {
        const pdf = await compilePDF(workspace, entryPoint)
        if (generation === slot.generation) emit(slot, { generation, pdf, compiling: false })
      } catch (reason) {
        if (generation === slot.generation) {
          emit(slot, {
            generation,
            error: reason instanceof Error ? reason.message : String(reason),
            compiling: false,
          })
        }
      }
    }
  } finally {
    slot.inflight = false
    if (slot.queued) void pump(workspace, entryPoint)
  }
}

export function scheduleWorkingDraftBuild(workspace: string, entryPoint: string): number {
  if (!workspace.trim() || !entryPoint.trim()) return 0
  const slot = slotOf(workspace, entryPoint)
  slot.generation += 1
  slot.queued = true
  if (slot.timer) clearTimeout(slot.timer)
  const generation = slot.generation
  emit(slot, { generation, compiling: true })
  slot.timer = setTimeout(() => {
    slot.timer = undefined
    void pump(workspace, entryPoint)
  }, debounceMs)
  return generation
}

export function notifyWorkingDraftSaved(workspace: string, path: string, entryPoint?: string): void {
  if (!isManuscriptSource(path)) return
  const target = entryPoint || (/\.tex$/i.test(path) ? path : '')
  if (!target) return
  scheduleWorkingDraftBuild(workspace, target)
}

let observationBound = false
function bindSavedFileObservations(): void {
  if (observationBound) return
  observationBound = true
  subscribeObservations(() => {
    const last = observedFiles().at(-1)
    if (!last || !isManuscriptSource(last.path)) return
    for (const [key, slot] of slots) {
      if (!slot.listeners.size) continue
      const [workspace, entryPoint] = key.split('\0')
      if (workspace === last.workspace) scheduleWorkingDraftBuild(workspace, entryPoint)
    }
  })
}

export function useManuscriptBuild(workspace: string, entryPoint: string): ManuscriptPreviewState & { compile: () => void } {
  const [state, setState] = useState<ManuscriptPreviewState>(emptyManuscriptPreview)
  useEffect(() => {
    if (!workspace.trim() || !entryPoint.trim()) {
      setState(emptyManuscriptPreview())
      return
    }
    bindSavedFileObservations()
    const slot = slotOf(workspace, entryPoint)
    const listener: BuildListener = payload => {
      setState(current => payload.compiling && !payload.pdf && !payload.error
        ? beginManuscriptBuild(current, payload.generation)
        : completeManuscriptBuild(current, payload.generation, { pdf: payload.pdf, error: payload.error }))
    }
    slot.listeners.add(listener)
    return () => { slot.listeners.delete(listener) }
  }, [workspace, entryPoint])
  return {
    ...state,
    compile: () => { scheduleWorkingDraftBuild(workspace, entryPoint) },
  }
}
