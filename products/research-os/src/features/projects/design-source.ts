import { validSourcePath, type DraftSource } from './draft-model'
import type { ThinkingCanvasV2 } from './canvas-model'

/** Reuse the project's file-reference identity. Digests are opaque; never normalize or invent them. */
export type PinnedDesignSource = Required<Pick<DraftSource, 'workspace' | 'path' | 'digest'>>
export type DesignSourceSnapshot = PinnedDesignSource & { content: string }
/** Half-open UTF-16 offsets, matching the existing text-review contract. */
export type DesignSourceRange = { start: number; end: number; quote: string }
/** One stable body-block identity can belong to many cards; a card can belong to many blocks. */
export type CanvasSourceBinding = PinnedDesignSource & DesignSourceRange & { id: string; nodeIds: string[] }
export type SourceBindingResolution = {
  state: 'exact' | 'needs-confirmation' | 'missing' | 'unavailable'
  reason?: 'version-changed' | 'content-mismatch' | 'foreign-source' | 'source-unavailable' | 'source-missing'
  candidates: DesignSourceRange[]
  truncated: boolean
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function requireSource(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const offset = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
export function validateSourceBinding(value: unknown, nodeIds: ReadonlySet<string>, workspace?: string): asserts value is CanvasSourceBinding {
  requireSource(record(value) && text(value.id) && text(value.workspace) && text(value.path) && validSourcePath(value.path) && text(value.digest), 'Invalid source binding identity.')
  requireSource(workspace === undefined || value.workspace === workspace, 'Source binding belongs to another workspace.')
  requireSource(offset(value.start) && offset(value.end) && value.end > value.start && text(value.quote) && value.quote.length === value.end - value.start, 'Invalid source binding range.')
  requireSource(Array.isArray(value.nodeIds) && value.nodeIds.length && value.nodeIds.every(id => typeof id === 'string' && nodeIds.has(id)) && new Set(value.nodeIds).size === value.nodeIds.length, 'Source binding references missing or repeated design cards.')
}
export function validateSourceSnapshot(source: DesignSourceSnapshot): void {
  requireSource(text(source.workspace) && text(source.path) && validSourcePath(source.path) && text(source.digest) && typeof source.content === 'string', 'Missing source content or observed file revision.')
}
function boundary(content: string, at: number): boolean {
  return !(at > 0 && at < content.length && /[\uD800-\uDBFF]/.test(content[at - 1]) && /[\uDC00-\uDFFF]/.test(content[at]))
}
export function sourceRange(source: DesignSourceSnapshot, start: number, end: number): DesignSourceRange {
  validateSourceSnapshot(source)
  requireSource(offset(start) && offset(end) && end > start && end <= source.content.length && boundary(source.content, start) && boundary(source.content, end), 'Select a non-empty current source range.')
  const quote = source.content.slice(start, end)
  requireSource(quote.trim(), 'Select source content, not only whitespace.')
  return { start, end, quote }
}
export function sourceLines(source: DesignSourceSnapshot, first: number, last: number): DesignSourceRange {
  const lines = source.content.split('\n')
  requireSource(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first >= 1 && last >= first && last <= lines.length, 'Select valid current source lines.')
  const start = lines.slice(0, first - 1).reduce((sum, line) => sum + line.length + 1, 0)
  return sourceRange(source, start, start + lines.slice(first - 1, last).join('\n').length)
}
export function captureSourceBinding(source: DesignSourceSnapshot, nodeIds: readonly string[], start: number, end: number, id: string = crypto.randomUUID()): CanvasSourceBinding {
  const binding = { id, nodeIds: [...nodeIds], workspace: source.workspace, path: source.path, digest: source.digest, ...sourceRange(source, start, end) }
  validateSourceBinding(binding, new Set(nodeIds), source.workspace)
  return binding
}
/** Only an explicit editor action uses this function. A unique quote match is still only a candidate. */
export function correctSourceBinding(binding: CanvasSourceBinding, source: DesignSourceSnapshot, start: number, end: number): CanvasSourceBinding {
  requireSource(binding.workspace === source.workspace && binding.path === source.path, 'Choose a range in the same source file; add a new binding for a different file.')
  return { ...binding, ...captureSourceBinding(source, binding.nodeIds, start, end, binding.id) }
}
export function putSourceBinding(canvas: ThinkingCanvasV2, binding: CanvasSourceBinding, workspace: string): ThinkingCanvasV2 {
  validateSourceBinding(binding, new Set(canvas.nodes.map(node => node.id)), workspace)
  const bindings = canvas.sourceBindings ?? []
  const sameId = bindings.find(item => item.id === binding.id)
  if (sameId) return { ...canvas, sourceBindings: bindings.map(item => item.id === binding.id ? binding : item) }
  const sameRange = bindings.find(item => item.workspace === binding.workspace && item.path === binding.path && item.digest === binding.digest && item.start === binding.start && item.end === binding.end && item.quote === binding.quote)
  if (sameRange) return { ...canvas, sourceBindings: bindings.map(item => item === sameRange ? { ...item, nodeIds: [...new Set([...item.nodeIds, ...binding.nodeIds])] } : item) }
  return { ...canvas, sourceBindings: [...bindings, binding] }
}
/** Remove this association only, preserving other cards that share the same body block. */
export function unlinkSourceBinding(canvas: ThinkingCanvasV2, bindingId: string, nodeId: string): ThinkingCanvasV2 {
  return { ...canvas, sourceBindings: (canvas.sourceBindings ?? []).map(binding => binding.id === bindingId ? { ...binding, nodeIds: binding.nodeIds.filter(id => id !== nodeId) } : binding).filter(binding => binding.nodeIds.length) }
}
/** Never use a saved line number to rebind changed text. All matches after a revision change need review. */
export function resolveSourceBinding(binding: CanvasSourceBinding, current: DesignSourceSnapshot | null | undefined): SourceBindingResolution {
  if (current === null) return { state: 'missing', reason: 'source-missing', candidates: [], truncated: false }
  if (!current) return { state: 'unavailable', reason: 'source-unavailable', candidates: [], truncated: false }
  validateSourceSnapshot(current)
  if (current.workspace !== binding.workspace || current.path !== binding.path) return { state: 'unavailable', reason: 'foreign-source', candidates: [], truncated: false }
  if (current.digest === binding.digest && current.content.slice(binding.start, binding.end) === binding.quote) {
    return { state: 'exact', candidates: [{ start: binding.start, end: binding.end, quote: binding.quote }], truncated: false }
  }
  const candidates: DesignSourceRange[] = []
  const limit = 20
  let at = current.content.indexOf(binding.quote)
  while (at >= 0 && candidates.length < limit) {
    candidates.push({ start: at, end: at + binding.quote.length, quote: binding.quote })
    at = current.content.indexOf(binding.quote, at + 1)
  }
  return { state: 'needs-confirmation', reason: current.digest === binding.digest ? 'content-mismatch' : 'version-changed', candidates, truncated: at >= 0 }
}
export function sourceBindingKey(source: Pick<PinnedDesignSource, 'workspace' | 'path'>): string {
  return JSON.stringify([source.workspace, source.path])
}
/** Read-only projection for the source viewer. File candidates remain visible even when no quote survives. */
export function sourceDesignMatches(canvas: ThinkingCanvasV2, source: DesignSourceSnapshot, selection?: Pick<DesignSourceRange, 'start' | 'end'>) {
  return (canvas.sourceBindings ?? []).filter(binding => binding.workspace === source.workspace && binding.path === source.path).map(binding => {
    const resolution = resolveSourceBinding(binding, source)
    const intersects = !selection || resolution.candidates.some(range => range.start < selection.end && selection.start < range.end)
    return { binding, resolution, intersects }
  }).filter(item => item.resolution.state !== 'exact' || item.intersects)
}

/** An exact edit map from the real application owner, not a proposed diff or a chat completion. */
export type AppliedSourceEdit = { start: number; end: number; before: string; after: string }
/** Pure post-write projection. The caller must have an actual CAS receipt and persist the returned
 * canvas through the existing coordinator/CAS. No writes, approvals, retries or receipt fabrication here.
 * Unaffected offsets can move only because the complete before→after edit map is proven. A replacement
 * crossing a block boundary or removing a block leaves the old binding visibly unresolved. */
export function updateBindingsAfterWrite(canvas: ThinkingCanvasV2, before: DesignSourceSnapshot, after: DesignSourceSnapshot, edits: readonly AppliedSourceEdit[]) {
  validateSourceSnapshot(before); validateSourceSnapshot(after)
  requireSource(before.workspace === after.workspace && before.path === after.path, 'Application changed the source identity.')
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end)
  let cursor = 0, reconstructed = '', previousStart = -1
  for (const edit of ordered) {
    requireSource(offset(edit.start) && offset(edit.end) && edit.end >= edit.start && edit.end <= before.content.length && edit.start >= cursor && edit.start !== previousStart && typeof edit.before === 'string' && typeof edit.after === 'string' && before.content.slice(edit.start, edit.end) === edit.before, 'Application edit map does not match the saved baseline.')
    requireSource(boundary(before.content, edit.start) && boundary(before.content, edit.end), 'Application splits a source character.')
    reconstructed += before.content.slice(cursor, edit.start) + edit.after
    cursor = edit.end; previousStart = edit.start
  }
  reconstructed += before.content.slice(cursor)
  requireSource(reconstructed === after.content, 'Application output does not match the exact edit map.')
  const updatedIds: string[] = [], needsConfirmationIds: string[] = []
  const sourceBindings = (canvas.sourceBindings ?? []).map(binding => {
    if (binding.workspace !== before.workspace || binding.path !== before.path) return binding
    if (resolveSourceBinding(binding, before).state !== 'exact') { needsConfirmationIds.push(binding.id); return binding }
    const crosses = ordered.some(edit => edit.start < binding.end && edit.end > binding.start && (edit.start < binding.start || edit.end > binding.end))
    if (crosses) { needsConfirmationIds.push(binding.id); return binding }
    const delta = (edit: AppliedSourceEdit) => edit.after.length - (edit.end - edit.start)
    const beforeDelta = ordered.filter(edit => edit.end <= binding.start).reduce((sum, edit) => sum + delta(edit), 0)
    const insideDelta = ordered.filter(edit => edit.start >= binding.start && edit.end <= binding.end && (edit.start !== edit.end || (edit.start > binding.start && edit.start < binding.end))).reduce((sum, edit) => sum + delta(edit), 0)
    const start = binding.start + beforeDelta, end = binding.end + beforeDelta + insideDelta
    if (end <= start || !after.content.slice(start, end).trim()) { needsConfirmationIds.push(binding.id); return binding }
    updatedIds.push(binding.id)
    return { ...binding, digest: after.digest, ...sourceRange(after, start, end) }
  })
  return { canvas: { ...canvas, sourceBindings }, updatedIds, needsConfirmationIds }
}
