import { describe, expect, it } from 'vitest'
import { CONTENT_KINDS, applyCanvasProjection, cardType, emptyContent, parseContentDocument, projectCanvas, serializeContent, type ContentDocument } from '../src/features/content/content-model'

/** The backend (researchcontent.Validate) rejects any other kind; roles must ride on a valid kind. */
const backendValid = (d: ContentDocument) => d.objects.every(o => (CONTENT_KINDS as readonly string[]).includes(o.kind))
import {
  addRevisionItems, applyCanvasPatch, extractCanvasPatches, findingMarkdown, findingPath, revisionThreadSeed,
  sampleRevisionProposal, splitReviewComments, validateCanvasPatch,
} from '../src/features/revision/revision-model'

const ids = () => { let n = 0; return () => `id-${++n}` }
const scope = { projectId: 'paper-tro', workspace: 'paper-tro' }

describe('reviewer comments → revision items', () => {
  it('splits numbered comments under reviewer headings without rewriting text', () => {
    const items = splitReviewComments('Reviewer 1:\n1. The convergence proof assumes a bounded step.\nIt should be stated.\n2) Compare with MPC.\n\nReviewer #2\n(1) Figure 3 lacks units.')
    expect(items).toEqual([
      { reviewer: 'R1', label: 'R1.1', text: 'The convergence proof assumes a bounded step.\nIt should be stated.' },
      { reviewer: 'R1', label: 'R1.2', text: 'Compare with MPC.' },
      { reviewer: 'R2', label: 'R2.1', text: 'Figure 3 lacks units.' },
    ])
  })
  it('falls back to paragraphs when there are no markers', () => {
    expect(splitReviewComments('First concern.\n\nSecond concern\ncontinues.').map(i => i.text)).toEqual(['First concern.', 'Second concern\ncontinues.'])
  })
  it('adds open revision cards to the right of the existing layout, persisting as valid content', () => {
    const base = { ...emptyContent(scope), objects: [{ id: 'c1', kind: 'claim' as const, title: 'Claim', sources: [] }], views: { canvas: { placements: [{ objectId: 'c1', x: 48, y: 40 }] }, outlines: [] } }
    const { document, ids: added } = addRevisionItems(base, splitReviewComments('1. Units missing'), ids())
    expect(added).toEqual(['id-1'])
    expect(document.objects[1]).toMatchObject({ kind: 'question', role: 'revision', status: 'open', title: 'R.1 · Units missing', tags: ['review'] })
    expect(cardType(document.objects[1])).toBe('revision')
    expect(backendValid(document)).toBe(true)
    expect(document.views.canvas.placements[1]).toEqual({ objectId: 'id-1', x: 408, y: 40 })
    expect(parseContentDocument(serializeContent(document), scope).objects).toHaveLength(2)
  })
})

describe('agent canvas patches', () => {
  const reply = 'Plan below.\n```research-canvas-patch\n{"summary":"Answer R1.1","ops":[{"op":"add-card","ref":"d1","kind":"decision","title":"State the step bound"},{"op":"add-relation","from":"d1","to":"rev","relation":"depends"},{"op":"update-card","id":"rev","status":"planned"}]}\n```\nand a broken one\n```research-canvas-patch\n{"ops":[{"op":"explode"}]}\n```'
  const doc = (): ContentDocument => ({ ...emptyContent(scope), objects: [{ id: 'rev', kind: 'question', role: 'revision', title: 'R1.1', sources: [], status: 'open' }], views: { canvas: { placements: [{ objectId: 'rev', x: 48, y: 40 }] }, outlines: [] } })

  it('extracts fenced patches and reports broken ones instead of guessing', () => {
    const found = extractCanvasPatches(reply)
    expect(found).toHaveLength(2)
    expect(found[0].patch?.summary).toBe('Answer R1.1')
    expect(found[0].patch?.ops.map(op => op.op)).toEqual(['add-card', 'add-relation', 'update-card'])
    expect(found[1].error).toMatch(/Unknown operation/)
  })
  it('rejects patches that point at cards which do not exist', () => {
    expect(validateCanvasPatch(doc(), { ops: [{ op: 'update-card', id: 'ghost', status: 'x' }, { op: 'add-relation', from: 'rev', to: 'nope', relation: 'cites' }] }))
      .toEqual(['Card not found: ghost', 'Relation endpoint not found: nope'])
    expect(() => applyCanvasPatch(doc(), { ops: [{ op: 'update-card', id: 'ghost' }] })).toThrow(/Card not found/)
  })
  it('applies an accepted patch as typed cards and relations that the canvas projects', () => {
    const next = applyCanvasPatch(doc(), extractCanvasPatches(reply)[0].patch!, ids())
    expect(next.objects.map(o => [o.id, cardType(o), o.kind, o.status])).toEqual([['rev', 'revision', 'question', 'planned'], ['id-1', 'decision', 'claim', undefined]])
    expect(backendValid(next)).toBe(true)
    // The decision answering an existing item is placed beside it, not stacked below.
    expect(next.views.canvas.placements.find(p => p.objectId === 'id-1')).toEqual({ objectId: 'id-1', x: 408, y: 40 })
    expect(next.relations[0]).toMatchObject({ relation: 'depends', from: { id: 'id-1' }, to: { id: 'rev' } })
    const canvas = projectCanvas(next)
    expect(canvas.edges).toEqual([{ from: 'id-1', to: 'rev', relation: 'depends', contentRelationId: 'id-2' }])
    expect(canvas.nodes.find(n => n.id === 'id-1')?.cardType).toBe('decision')
    // Round-trip through the canvas editor keeps the document unchanged and never persists contentKind.
    const edited = applyCanvasProjection(next, canvas)
    expect(edited.objects.map(o => [o.id, cardType(o), 'cardType' in o])).toEqual([['rev', 'revision', false], ['id-1', 'decision', false]])
    expect(edited.relations).toEqual(next.relations)
  })
  it('lets the canvas change a card kind through the projection', () => {
    const canvas = projectCanvas(doc())
    const edited = applyCanvasProjection(doc(), { ...canvas, nodes: canvas.nodes.map(n => ({ ...n, cardType: 'constraint' })) })
    expect(edited.objects[0]).toMatchObject({ kind: 'assumption', role: 'constraint' })
    expect('cardType' in edited.objects[0]).toBe(false)
    const plain = applyCanvasProjection(edited, { ...canvas, nodes: canvas.nodes.map(n => ({ ...n, cardType: 'evidence' })) })
    expect(plain.objects[0].kind).toBe('evidence')
    expect('role' in plain.objects[0]).toBe(false)
  })
  it('labels the rule-based sample and stops once every open item has a decision', () => {
    const sample = sampleRevisionProposal(doc(), 'en')!
    expect(sample.summary).toMatch(/rule-based sample, not an agent/)
    const applied = applyCanvasPatch(doc(), sample, ids())
    expect(sampleRevisionProposal(applied, 'en')).toBeNull()
  })
  it('seeds a revision thread with the items and the patch contract, without sending anything', () => {
    const seed = revisionThreadSeed({ project: 'paper-tro', locale: 'en', items: [{ id: 'rev', title: 'R1.1', status: 'open' }] })
    expect(seed).toContain('- rev · R1.1 [open]')
    expect(seed).toContain('```research-canvas-patch')
  })
})

describe('findings → knowledge', () => {
  it('writes a dated path under memory/findings with a back-link to the card', () => {
    const at = new Date('2026-09-24T08:00:00Z')
    expect(findingPath('paper-tro', 'Step bound holds for α < 1', at)).toBe('memory/findings/paper-tro/2026-09-24-step-bound-holds-for-α-1.md')
    const md = findingMarkdown({ title: 'Step bound', body: 'Holds.', project: 'paper-tro', cardId: 'd1', cardTitle: 'Decision', contentDigest: 'sha256:abc', at })
    expect(md).toContain('source: "paper-tro/research-content.json#object/d1"')
    expect(md).toContain('source_revision: "sha256:abc"')
    expect(md).toContain('not yet promoted to global knowledge')
  })
})

describe('PDF annotation → canvas card', () => {
  it('anchors the card to the PDF version, page and quote', async () => {
    const { annotationCard } = await import('../src/features/revision/revision-model')
    const card = annotationCard({ annotationId: 'k1', id: 'c9', pdf: { workspace: 'paper-tro', path: 'paper.pdf', digest: 'sha256:pdf', buildId: 'b1' }, page: 3, quote: 'bounded step', comment: 'State the bound.\nAlso cite Lemma 2.' })
    expect(card).toMatchObject({ id: 'c9', kind: 'question', role: 'revision', status: 'open', title: 'PDF p.3 · State the bound.', annotationId: 'k1' })
    expect(card.body).toBe('State the bound.\nAlso cite Lemma 2.\n\n> bounded step')
    expect(card.sources).toEqual([{ kind: 'file', workspace: 'paper-tro', path: 'paper.pdf', digest: 'sha256:pdf', selector: { page: 3, quote: 'bounded step', buildId: 'b1' } }])
  })
})
