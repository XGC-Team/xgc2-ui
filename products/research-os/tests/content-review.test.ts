import { describe, expect, it } from 'vitest'
import { CONTENT_PATH, emptyContent, serializeContent } from '../src/features/content/content-model'
import { impactedDrafts, patchTarget, targetChoices, targetValue } from '../src/features/review/review-targets'
import { emptyReviewBook, parseReviewBook, requiresContentReview, semanticCanvas, validateProposal, type Operation, type Proposal, type Target } from '../src/features/review/review-model'
import { createReviewEngine } from '../src/features/review/review-engine'

const scope = { projectId: 'research', workspace: 'files' }
const feedback = { id: 'feedback', author: 'author', at: '2026-09-23T00:00:00Z', body: 'Clarify', anchor: { kind: 'text' as const, workspace: scope.workspace, path: 'main.tex', digest: 'source-1', quote: 'quote' } }
const objectTarget: Target = { kind: 'canvas', workspace: scope.workspace, path: CONTENT_PATH, objectId: 'paper:claim', field: 'body' }
const blockTarget: Target = { kind: 'block', workspace: scope.workspace, path: CONTENT_PATH, objectId: 'paper:claim', blockId: 'block', artifact: 'note', field: 'observation' }
const operation = (target: Target, before: string, after: string, id: string): Operation => ({ id, target, before, after, baseDigest: 'content-1', reason: 'Clarify from evidence', evidence: [feedback.anchor], dependsOn: [], impacts: [] })
function document() {
  const d = emptyContent(scope)
  d.objects.push({ id: 'paper:claim', kind: 'claim', title: 'Claim', body: 'before', sources: [], definition: { retained: true }, writing: { aside: 'Never copy into manuscript' } })
  d.artifacts.push({ id: 'paper:claim', kind: 'note', title: 'Note', status: 'draft', createdAt: feedback.at, updatedAt: feedback.at, blocks: [{ id: 'block', title: 'Block', fields: { question: 'Why?', observation: 'original observation' } }], sources: [] })
  d.views.canvas.placements.push({ objectId: 'paper:claim', x: 10, y: 20 })
  d.migration = { sources: [], migratedAt: feedback.at }
  d.extension = { kept: true }
  return d
}
describe('content review uses one authority and preserves migration history', () => {
  it('changes object and artifact fields together without losing layouts, methods or unknown content', () => {
    const before = serializeContent(document())
    const after = patchTarget(before, [operation(objectTarget, 'before', 'revised', 'object-edit'), operation(blockTarget, 'original observation', 'new observation', 'block-edit')], scope)
    expect(targetValue(after, objectTarget, scope)).toBe('revised')
    expect(targetValue(after, blockTarget, scope)).toBe('new observation')
    const saved = JSON.parse(after)
    expect(saved.views).toEqual(document().views)
    expect(saved.objects[0].definition).toEqual({ retained: true })
    expect(saved.objects[0].writing.aside).toContain('Never copy')
    expect(saved.extension).toEqual({ kept: true })
    expect(saved.migration).toEqual(document().migration)
  })
  it('offers every explicit object kind using canonical targets and rejects historical target writes', () => {
    const content = serializeContent(document())
    expect(targetChoices(content, 'canvas', scope).every(c => c.target.path === CONTENT_PATH)).toBe(true)
    expect(targetChoices(content, 'block', scope).every(c => c.target.path === CONTENT_PATH)).toBe(true)
    expect(() => targetValue(content, { ...objectTarget, path: 'thinking.canvas.json' }, scope)).toThrow('Historical')
    expect(() => targetValue(content, objectTarget, { ...scope, projectId: 'foreign' })).toThrow('another project')
  })
  it('keeps old proposals readable but cannot apply their previous authorization or import it as new', async () => {
    const old: Proposal = { id: 'old', author: 'author', at: feedback.at, title: 'Old design', feedback, operations: [operation({ ...objectTarget, path: 'thinking.canvas.json' }, 'before', 'revised', 'old-edit')] }
    const book = { ...emptyReviewBook(scope), proposals: [old] }
    const raw = JSON.stringify(book)
    const parsed = parseReviewBook(raw, scope)
    expect(parsed.proposals[0].operations[0].target.path).toBe('thinking.canvas.json')
    expect(requiresContentReview(parsed.proposals[0])).toBe(true)
    expect(() => validateProposal(old, scope)).toThrow('Historical')
    const writes: string[] = []
    const engine = createReviewEngine(scope, { read: async () => ({ content: raw, digest: 'old-journal' }), write: async (_w, path) => { writes.push(path); return { digest: 'new' } }, lease: () => async () => {} }, () => {})
    await engine.load()
    await expect(engine.run('old', ['old-edit'], 'author', 'apply')).rejects.toThrow()
    expect(writes).toEqual([])
  })
  it('treats layout movement as visual while design constraints and evidence remain semantic', () => {
    const original = document(), moved = structuredClone(original)
    moved.views.canvas.placements[0].x = 1000
    expect(semanticCanvas(serializeContent(original))).toBe(semanticCanvas(serializeContent(moved)))
    moved.objects[0].writing!.aside = 'Different research intent'
    expect(semanticCanvas(serializeContent(original))).not.toBe(semanticCanvas(serializeContent(moved)))
  })
  it('tracks impact through namespaced references without confusing objects and artifacts with the same ID', () => {
    const value = document(), draft = value.artifacts[0]
    value.artifacts.push({ ...draft, id: 'object-dependent', sources: [{ id: 's1', path: `${CONTENT_PATH}#object/${objectTarget.objectId}` }] })
    value.artifacts.push({ ...draft, id: 'artifact-dependent', sources: [{ id: 's2', path: `${CONTENT_PATH}#artifact/${blockTarget.objectId}` }] })
    const content = serializeContent(value)
    expect(impactedDrafts(content, scope, objectTarget)).toEqual(['note:object-dependent · Note'])
    expect(impactedDrafts(content, scope, blockTarget)).toEqual(['note:artifact-dependent · Note'])
  })
})
