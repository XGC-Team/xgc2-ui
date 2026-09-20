import { request } from '../../lib/api'
import { assertEditorClean } from '../review/write-coordinator'
import { CANVAS_PATH, parseEditableCanvas } from './canvas-model'
import { buildWritingContext, type DesignSelection, type SavedDesignRecord } from './design-context'
import { sourceBindingKey, type DesignSourceSnapshot } from './design-source'
import type { DraftScope } from './draft-model'

export type DesignContextPort = {
  read: (workspace: string, path: string, signal?: AbortSignal) => Promise<SavedDesignRecord>
  assertClean: (workspace: string, path: string) => void
}
const port: DesignContextPort = {
  read: (workspace, path, signal) => request<SavedDesignRecord>(`/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { signal }),
  assertClean: assertEditorClean,
}
/** The mounted editor remains the sole writer. This reader does not create a file session or acquire
 * an application lease. It checks local edits and observed revisions both before and after I/O;
 * application still performs its own baseline/confirmation/CAS preflight. */
export async function readWritingContext(scope: DraftScope, selection: DesignSelection, options: {
  expectedCanvasDigest?: string; signal?: AbortSignal
} = {}, io: DesignContextPort = port) {
  const checkAbort = () => { if (options.signal?.aborted) throw new DOMException('Design context cancelled.', 'AbortError') }
  checkAbort(); io.assertClean(scope.workspace, CANVAS_PATH)
  const record = await io.read(scope.workspace, CANVAS_PATH, options.signal)
  checkAbort()
  if (options.expectedCanvasDigest && record.digest !== options.expectedCanvasDigest) throw new Error('The saved design changed. Review the current design before inserting context.')
  const canvas = parseEditableCanvas(record.content, scope.workspace)
  const selected = new Set(selection.nodeIds)
  const bindings = (canvas.sourceBindings ?? []).filter(binding => binding.nodeIds.some(id => selected.has(id)) && (!selection.bindingIds || selection.bindingIds.includes(binding.id)))
  const sourceRefs = new Map(bindings.map(binding => [sourceBindingKey(binding), binding]))
  const sources = await Promise.all([...sourceRefs.values()].map(async binding => {
    io.assertClean(binding.workspace, binding.path)
    const observed = await io.read(binding.workspace, binding.path, options.signal)
    return { content: observed.content, digest: observed.digest, workspace: binding.workspace, path: binding.path }
  }))
  checkAbort()
  const evidenceRefs = new Map(canvas.nodes.filter(node => selected.has(node.id)).flatMap(node => (node.evidence ?? []).flatMap(reference => reference.path ? [[sourceBindingKey({ workspace: reference.workspace || scope.workspace, path: reference.path }), { workspace: reference.workspace || scope.workspace, path: reference.path }] as const] : [])))
  const evidenceSnapshots = new Map<string, DesignSourceSnapshot | null>()
  await Promise.all([...evidenceRefs].map(async ([key, reference]) => {
    const known = sources.find(source => sourceBindingKey(source) === key)
    if (known) { evidenceSnapshots.set(key, known); return }
    try { evidenceSnapshots.set(key, { ...await io.read(reference.workspace, reference.path, options.signal), ...reference }) }
    catch (error) {
      checkAbort()
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) evidenceSnapshots.set(key, null)
      // Other unreadable evidence remains explicitly unverifiable, never replaced with current guesses.
    }
  }))
  checkAbort()
  const result = buildWritingContext({ scope, record, selection, sources, evidenceSnapshots })
  const observed = [{ workspace: scope.workspace, path: CANVAS_PATH, content: record.content, digest: record.digest }, ...sources]
  await Promise.all(observed.map(async source => {
    io.assertClean(source.workspace, source.path)
    const fresh = await io.read(source.workspace, source.path, options.signal)
    if (fresh.digest !== source.digest || fresh.content !== source.content) throw new Error('Design or source changed while preparing context. Review and try again.')
  }))
  checkAbort()
  observed.forEach(source => io.assertClean(source.workspace, source.path))
  return result
}
