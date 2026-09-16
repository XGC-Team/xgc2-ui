import { parseEditableCanvas, serializeCanvas } from '../projects/canvas-model.ts'
import { DRAFT_FIELDS, parseDraftBook, serializeDraftBook, type DraftKind } from '../projects/draft-model.ts'
import { check, record, validateTarget, type Operation, type Scope, type Target } from './review-model.ts'

/** Different artifact fields retain their own semantics; this is not a generic JSON-patch endpoint. */
export function targetValue(content: string, target: Target, scope: Scope): string {
  validateTarget(target)
  if (target.kind === 'text') { check(target.end <= content.length, 'Source range no longer exists.'); return content.slice(target.start, target.end) }
  if (target.kind === 'block') {
    const book = parseDraftBook(content, scope)
    const draft = book.drafts.find(d => d.id === target.objectId)
    check(draft && !draft.archivedAt && draft.kind === target.artifact, 'Artifact changed, disappeared or was archived.')
    const block = draft.blocks.find(b => b.id === target.blockId); check(block, 'Content block no longer exists.')
    check(target.field === 'title' || (DRAFT_FIELDS[draft.kind] as readonly string[]).includes(target.field), 'Field does not belong to this artifact type.')
    return target.field === 'title' ? block.title : block.fields[target.field] || ''
  }
  const canvas = parseEditableCanvas(content)
  const nodes = canvas.nodes.filter(n => record(n) && n.id === target.objectId)
  check(nodes.length === 1 && (nodes[0].kind === 'chapter' || nodes[0].kind === 'idea'), 'Canvas node no longer exists or is ambiguous.')
  const value = nodes[0][target.field]
  check(typeof value === 'string' || (value === undefined && target.field === 'body'), 'Invalid canvas content.')
  return value || ''
}
const fieldKey = (t: Target) => t.kind === 'text' ? `${t.start}:${t.end}` : t.kind === 'canvas' ? `${t.objectId}:${t.field}` : `${t.objectId}:${t.blockId}:${t.field}`
export function patchTarget(content: string, operations: Operation[], scope: Scope, undo = false): string {
  check(operations.length > 0, 'No operations selected.')
  const keys = new Set<string>()
  for (const o of operations) {
    check(o.target.workspace === scope.workspace, 'Foreign workspace.')
    check(o.target.path === operations[0].target.path && o.target.kind === operations[0].target.kind, 'One write must target one representation of one file.')
    const key = fieldKey(o.target); check(!keys.has(key), 'Overlapping field operations must be recomposed.'); keys.add(key)
  }
  if (operations[0].target.kind === 'text') {
    // Apply exact original ranges; reverse is deliberately conservative and requires the exact post-write digest in the engine.
    const sorted = [...operations].sort((a, b) => (a.target as Extract<Target, {kind: 'text'}>).start - (b.target as Extract<Target, {kind: 'text'}>).start)
    let offset = 0, previous = -1
    const patches = sorted.map(o => {
      const t = o.target as Extract<Target, {kind: 'text'}>
      check(t.start >= previous, 'Overlapping source ranges.'); previous = t.end
      const start = t.start + (undo ? offset : 0)
      const before = undo ? o.after : o.before, after = undo ? o.before : o.after
      check(undo || before.length > 0, 'Select a nonempty source range.')
      check(content.slice(start, start + before.length) === before && (undo || before.length === t.end - t.start), 'Source selection no longer matches.')
      offset += o.after.length - o.before.length
      return { start, end: start + before.length, after }
    })
    let result = content
    for (const p of patches.reverse()) result = result.slice(0, p.start) + p.after + result.slice(p.end)
    return result
  }
  let result = content
  for (const o of operations) {
    check(targetValue(result, o.target, scope) === (undo ? o.after : o.before), 'The reviewed field changed; recovery must not erase later edits.')
    const value = undo ? o.before : o.after
    if (o.target.kind === 'block') {
      const t = o.target, book = parseDraftBook(result, scope)
      const draft = book.drafts.find(d => d.id === t.objectId)!, block = draft.blocks.find(b => b.id === t.blockId)!
      if (t.field === 'duration') check(!value.trim() || (Number.isFinite(Number(value)) && Number(value) >= 0), 'Storyboard duration must be a nonnegative number of seconds.')
      if (t.field === 'title') block.title = value; else block.fields[t.field] = value
      draft.updatedAt = new Date().toISOString()
      result = serializeDraftBook(book)
    } else {
      const t = o.target as Extract<Target, {kind: 'canvas'}>, canvas = parseEditableCanvas(result)
      canvas.nodes.find((n: {id: string}) => n.id === t.objectId)![t.field] = value
      result = serializeCanvas(canvas)
    }
  }
  return result
}
export function targetChoices(content: string, kind: 'canvas' | 'block', scope: Scope): { title: string; target: Target }[] {
  if (kind === 'canvas') {
    const canvas = parseEditableCanvas(content)
    return canvas.nodes.flatMap((n: {id: string; title: string}) => ['title', 'body'].map(field => ({ title: `${n.title || n.id} / ${field}`, target: { kind: 'canvas', workspace: scope.workspace, path: 'thinking.canvas.json', objectId: n.id, field } as Target })))
  }
  const book = parseDraftBook(content, scope)
  return book.drafts.filter(d => !d.archivedAt).flatMap(d => d.blocks.flatMap(b => ['title', ...DRAFT_FIELDS[d.kind as DraftKind]].map(field => ({
    title: `${d.title} / ${b.title || b.id} / ${field}`,
    target: { kind: 'block', workspace: scope.workspace, path: 'research-drafts.json', artifact: d.kind, objectId: d.id, blockId: b.id, field } as Target,
  }))))
}
/** Only explicit source references imply possible impact; proximity and layout are not evidence. */
export function impactedDrafts(content: string, scope: Scope, target: Target): string[] {
  const book = parseDraftBook(content, scope)
  const paths = [target.path, ...(target.kind === 'block' ? [`${target.path}#${target.objectId}`] : [])]
  return book.drafts.filter(d => !d.archivedAt && !(target.kind === 'block' && d.id === target.objectId) && d.sources.some(s => (s.workspace || scope.workspace) === target.workspace && paths.includes(s.path))).map(d => `${d.kind}:${d.id} · ${d.title}`)
}
