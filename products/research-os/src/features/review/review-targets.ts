import { patchText } from './review-text.ts'
import { CONTENT_PATH, parseContentDocument, serializeContent } from '../content/content-model.ts'
import { DRAFT_FIELDS, type DraftKind } from '../projects/draft-model.ts'
import { check, validateTarget, type Operation, type Scope, type Target } from './review-model.ts'

/** Different artifact fields retain their own semantics; this is not a generic JSON-patch endpoint. */
export function targetValue(content: string, target: Target, scope: Scope): string {
  validateTarget(target)
  if (target.kind === 'text') { check(target.end <= content.length, 'Source range no longer exists.'); return content.slice(target.start, target.end) }
  if (target.kind === 'block') {
    const document = parseContentDocument(content, scope)
    const draft = document.artifacts.find(d => d.id === target.objectId)
    check(draft && !draft.archivedAt && draft.kind === target.artifact, 'Artifact changed, disappeared or was archived.')
    const block = draft.blocks.find(b => b.id === target.blockId); check(block, 'Content block no longer exists.')
    check(target.field === 'title' || (DRAFT_FIELDS[draft.kind] as readonly string[]).includes(target.field), 'Field does not belong to this artifact type.')
    return target.field === 'title' ? block.title : block.fields[target.field] || ''
  }
  const document = parseContentDocument(content, scope)
  const nodes = document.objects.filter(n => n.id === target.objectId)
  check(nodes.length === 1, 'Research object no longer exists or is ambiguous.')
  const value = nodes[0][target.field]
  check(typeof value === 'string' || (value === undefined && target.field === 'body'), 'Invalid canvas content.')
  return value || ''
}
const fieldKey = (t: Target) => JSON.stringify(t.kind === 'text' ? [t.kind, t.start, t.end] : t.kind === 'canvas' ? [t.kind, t.objectId, t.field] : [t.kind, t.objectId, t.blockId, t.field])
export function patchTarget(content: string, operations: Operation[], scope: Scope, undo = false): string {
  check(operations.length > 0, 'No operations selected.')
  const keys = new Set<string>()
  for (const o of operations) {
    check(o.target.workspace === scope.workspace, 'Foreign workspace.')
    check(o.target.path === operations[0].target.path && (o.target.kind === 'text') === (operations[0].target.kind === 'text'), 'One write must target one content document or one text file.')
    const key = fieldKey(o.target); check(!keys.has(key), 'Overlapping field operations must be recomposed.'); keys.add(key)
  }
  if (operations[0].target.kind === 'text') return patchText(content, operations, scope, undo)
  let result = content
  for (const o of operations) {
    check(targetValue(result, o.target, scope) === (undo ? o.after : o.before), 'The reviewed field changed; recovery must not erase later edits.')
    const value = undo ? o.before : o.after
    if (o.target.kind === 'block') {
      const t = o.target, document = parseContentDocument(result, scope)
      const draft = document.artifacts.find(d => d.id === t.objectId)!, block = draft.blocks.find(b => b.id === t.blockId)!
      if (t.field === 'duration') check(!value.trim() || (Number.isFinite(Number(value)) && Number(value) >= 0), 'Storyboard duration must be a nonnegative number of seconds.')
      if (t.field === 'title') block.title = value; else block.fields[t.field] = value
      draft.updatedAt = new Date().toISOString()
      result = serializeContent(document)
    } else {
      const t = o.target as Extract<Target, {kind: 'canvas'}>, document = parseContentDocument(result, scope)
      document.objects.find(n => n.id === t.objectId)![t.field] = value
      result = serializeContent(document)
    }
  }
  return result
}
export function targetChoices(content: string, kind: 'canvas' | 'block', scope: Scope): { title: string; target: Target }[] {
  if (kind === 'canvas') {
    const document = parseContentDocument(content, scope)
    return document.objects.flatMap(n => ['title', 'body'].map(field => ({ title: `${n.title || n.id} / ${field}`, target: { kind: 'canvas', workspace: scope.workspace, path: CONTENT_PATH, objectId: n.id, field } as Target })))
  }
  const document = parseContentDocument(content, scope)
  return document.artifacts.filter(d => !d.archivedAt).flatMap(d => d.blocks.flatMap(b => ['title', ...DRAFT_FIELDS[d.kind as DraftKind]].map(field => ({
    title: `${d.title} / ${b.title || b.id} / ${field}`,
    target: { kind: 'block', workspace: scope.workspace, path: CONTENT_PATH, artifact: d.kind, objectId: d.id, blockId: b.id, field } as Target,
  }))))
}
/** Only explicit source references imply possible impact; proximity and layout are not evidence. */
export function impactedDrafts(content: string, scope: Scope, target: Target): string[] {
  const document = parseContentDocument(content, scope)
  const paths = [target.path, ...(target.kind === 'text' ? [] : [`${target.path}#${target.kind === 'block' ? 'artifact' : 'object'}/${target.objectId}`])]
  return document.artifacts.filter(d => !d.archivedAt && !(target.kind === 'block' && d.id === target.objectId) && d.sources.some(s => (s.workspace || scope.workspace) === target.workspace && paths.includes(s.path))).map(d => `${d.kind}:${d.id} · ${d.title}`)
}
