import { compareBuildRequests, sourceInsideBuildRoot, type BuildRecord } from '../review/build-provenance.ts'
import { buildSavedManuscript, listBuildRecords, manuscriptCapability, normalizeSavedInputs, pdfFromRecord, type BuildCapability, type ManuscriptPDF, type ManuscriptScope, type SavedInput } from './manuscript.ts'

export type ManuscriptSourcesSaved = { workspace: string; changes: readonly SavedInput[]; batchId?: string }
const savedListeners = new Set<(event: ManuscriptSourcesSaved) => void>()
const completedBatches = new Map<string, string>()
/** Call only after a CAS save or a complete Agent write batch has a real receipt.
 * Token events, proposals, confirmations and individual Agent tool writes are not saves.
 */
export function notifyManuscriptSourcesSaved(event: ManuscriptSourcesSaved): void {
  if (!event.workspace.trim()) throw new Error('A saved batch requires its original workspace.')
  const changes = normalizeSavedInputs(event.changes)
  if (!changes.length) return
  if (event.batchId) {
    const key = JSON.stringify([event.workspace, event.batchId]), identity = JSON.stringify(changes)
    if (completedBatches.has(key)) {
      if (completedBatches.get(key) !== identity) throw new Error('A completed batch identity was reused with different receipts.')
      return
    }
    completedBatches.set(key, identity)
    if (completedBatches.size > 512) completedBatches.delete(completedBatches.keys().next().value!)
  }
  const receipt = { workspace: event.workspace, changes, batchId: event.batchId }
  savedListeners.forEach(listener => listener(receipt))
}
export const subscribeManuscriptSaves = (listener: (event: ManuscriptSourcesSaved) => void): (() => void) => {
  savedListeners.add(listener)
  return () => { savedListeners.delete(listener) }
}
export type BuildPhase = 'idle' | 'loading' | 'queued' | 'building' | 'succeeded' | 'failed' | 'cancelled' | 'unavailable' | 'source-changed' | 'error'
export type ManuscriptBuildState = {
  phase: BuildPhase
  pdf: ManuscriptPDF | null
  record: BuildRecord | null
  capability: BuildCapability | null
  freshness: 'unknown' | 'saved-snapshot' | 'changed'
  error: string
}
export type BuildPorts = {
  build: (scope: ManuscriptScope, inputs: readonly SavedInput[], signal: AbortSignal) => Promise<BuildRecord>
  history: (workspace: string, signal: AbortSignal) => Promise<BuildRecord[]>
  capability: (signal: AbortSignal) => Promise<BuildCapability>
}
const ports: BuildPorts = { build: buildSavedManuscript, history: listBuildRecords, capability: manuscriptCapability }
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
const errorPhase = (error: unknown): BuildPhase => {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 0
  return status === 503 ? 'unavailable' : status === 409 ? 'source-changed' : 'error'
}

/** One coordinator per explicit workspace/entry point, shared by all mounted consumers.
 * It does not choose a viewer, mutate source, or change a historical PDF selection.
 */
export function createManuscriptBuild(scopeValue: ManuscriptScope, io: BuildPorts = ports, debounceMs = 350) {
  const scope = { ...scopeValue, sourceRoot: scopeValue.sourceRoot ?? '.' }
  let state: ManuscriptBuildState = { phase: 'idle', pdf: null, record: null, capability: null, freshness: 'unknown', error: '' }
  const listeners = new Set<() => void>(), pending = new Map<string, string>(), seen = new Map<string, string>()
  let sequence = 0, running: AbortController | undefined, hydration: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined, detach: (() => void) | undefined
  const publish = (change: Partial<ManuscriptBuildState>) => { state = { ...state, ...change }; listeners.forEach(listener => listener()) }
  const invalidate = () => {
    sequence++
    if (timer) clearTimeout(timer)
    timer = undefined
    running?.abort(); running = undefined
    hydration?.abort(); hydration = undefined
  }
  const execute = async (currentSaved: boolean): Promise<void> => {
    invalidate()
    const generation = sequence, controller = new AbortController()
    running = controller
    const inputs = currentSaved ? [] : [...pending].map(([path, digest]) => ({ path, digest }))
    // Keep the current batch until a successful terminal response. A new save can
    // supersede this request without losing the other files in the cancelled batch.
    publish({ phase: 'building', freshness: state.pdf ? 'changed' : 'unknown', error: '' })
    try {
      const record = await io.build(scope, inputs, controller.signal)
      if (generation !== sequence || controller.signal.aborted) return
      const pdf = pdfFromRecord(record)
      if (record.manifest.status === 'succeeded' && !pdf) throw new Error('The terminal build receipt has no verified PDF.')
      pending.clear()
      publish({ phase: record.manifest.status, record, pdf: pdf || state.pdf,
        freshness: pdf ? 'saved-snapshot' : state.pdf ? 'changed' : 'unknown',
        error: record.manifest.status === 'succeeded' ? '' : record.manifest.diagnostics?.map(item => item.message).join('\n') || `Build ${record.manifest.status}.` })
    } catch (error) {
      if (generation !== sequence || controller.signal.aborted) return
      publish({ phase: errorPhase(error), error: errorText(error), freshness: state.pdf ? 'changed' : 'unknown' })
    } finally {
      if (generation === sequence) running = undefined
    }
  }
  const saved = (event: ManuscriptSourcesSaved): void => {
    if (event.workspace !== scope.workspace) return
    let changed = false
    for (const input of normalizeSavedInputs(event.changes)) {
      if (!sourceInsideBuildRoot(input.path, scope.sourceRoot)) continue
      if (seen.get(input.path) === input.digest) continue
      seen.set(input.path, input.digest); pending.set(input.path, input.digest); changed = true
    }
    if (!changed) return
    // Invalidate immediately, not after debounce: an older PDF can finish in the gap.
    invalidate()
    publish({ phase: 'queued', freshness: state.pdf ? 'changed' : 'unknown', error: '' })
    timer = setTimeout(() => { timer = undefined; void execute(false) }, debounceMs)
  }
  const refresh = async (): Promise<void> => {
    if (running || timer) return
    hydration?.abort()
    const controller = new AbortController(), generation = sequence
    hydration = controller
    publish({ phase: 'loading', error: '' })
    const [history, capability] = await Promise.allSettled([io.history(scope.workspace, controller.signal), io.capability(controller.signal)])
    if (generation !== sequence || controller.signal.aborted) return
    const records = history.status === 'fulfilled' ? history.value.filter(record => record.task.workspaceRef === scope.workspace && record.task.entryPoint === scope.entryPoint && (record.task.sourceRoot ?? '.') === scope.sourceRoot).sort(compareBuildRequests) : []
    const record = records[0] || state.record
    const pdf = records.map(pdfFromRecord).find(Boolean) || state.pdf
    const available = capability.status === 'fulfilled' ? capability.value : null
    const error = [history.status === 'rejected' ? errorText(history.reason) : '', capability.status === 'rejected' ? errorText(capability.reason) : '', available?.available === false ? available.detail : ''].filter(Boolean).join('\n')
    publish({ record, pdf, capability: available, freshness: 'unknown', error,
      phase: available?.available === false ? 'unavailable' : error ? 'error' : record?.manifest.status || 'idle' })
    hydration = undefined
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      if (listeners.size === 1) { detach = subscribeManuscriptSaves(saved); void refresh() }
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          detach?.(); detach = undefined; invalidate(); pending.clear(); seen.clear()
          state = { ...state, phase: 'idle', freshness: 'unknown' }
        }
      }
    },
    // Exposed for deterministic tests and a domain producer with an actual receipt.
    saved,
    refresh,
    retry: () => execute(true),
    build: () => execute(false),
    cancel: () => { invalidate(); pending.clear(); publish({ phase: 'cancelled', freshness: state.pdf ? 'changed' : 'unknown', error: '' }) },
    isObserved: () => listeners.size > 0,
  }
}
export type ManuscriptBuildController = ReturnType<typeof createManuscriptBuild>
const coordinators = new Map<string, ManuscriptBuildController>()
export function manuscriptBuildController(scope: ManuscriptScope): ManuscriptBuildController {
  const key = JSON.stringify([scope.workspace, scope.entryPoint, scope.sourceRoot ?? '.'])
  let controller = coordinators.get(key)
  if (!controller) {
    controller = createManuscriptBuild(scope); coordinators.set(key, controller)
    if (coordinators.size > 64) {
      for (const [oldKey, old] of coordinators) {
        if (oldKey !== key && !old.isObserved()) { coordinators.delete(oldKey); break }
      }
    }
  }
  return controller
}
