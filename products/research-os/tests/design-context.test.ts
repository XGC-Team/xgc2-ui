import {describe,expect,it} from 'vitest'
import { CONTENT_PATH } from '../src/features/content/content-model'
import { addNodeBinding, emptyCanvasV2, type SourceBinding, type ThinkingCanvasV2 } from '../src/features/projects/canvas-model'
import {
  assertCurrentContext, bindSourceSelection, captureSelectedContext, confirmCandidate, locateRelatedCards,
  matchBinding, updateBindingsFromReceipts, writingSelectionFromContext, type LiveCanvasGate, type ObservedSource,
} from '../src/features/projects/design-context'

const quote = 'local claim'
const binding: SourceBinding = { id: 'bind-1', workspace: 'paper', path: 'main.tex', digest: 'rev-1', quote, start: 0, end: quote.length }
const source = (over: Partial<ObservedSource> = {}): ObservedSource => ({
  workspace: 'paper', path: 'main.tex', digest: 'rev-1', content: `${quote}\nnext line`, ...over,
})
const canvas = (): ThinkingCanvasV2 => {
  const base = emptyCanvasV2()
  return addNodeBinding({
    ...base,
    nodes: [{ id: 'card', kind: 'idea', title: 'Claim', body: 'scoped', x: 0, y: 0, writing: { omission: 'skip derivation', purpose: 'limit the claim' } }],
    outlines: [{ artifact: 'canvas', items: [{ node: 'card' }] }],
  }, 'card', binding)
}
const savedGate = (over: Partial<LiveCanvasGate> = {}): LiveCanvasGate => ({
  project: 'paper', digest: 'canvas-1', dirty: false, status: 'saved', reviewLocked: false, value: canvas(), ...over,
})

describe('design-context', () => {
  it('exact match requires the same digest and the captured range', () => {
    const exact = matchBinding(binding, source())
    expect(exact.status).toBe('exact')
    if (exact.status !== 'exact') return
    expect(exact.range).toEqual({ start: 0, end: quote.length })
  })
  it('does not silently rebind a displaced or duplicated quote', () => {
    const moved = matchBinding(binding, source({ content: `lead ${quote}` }))
    expect(moved.status).toBe('candidates')
    if (moved.status === 'candidates') expect(moved.candidates[0]?.reason).toBe('moved')
    const changed = matchBinding(binding, source({ digest: 'rev-2', content: 'rewritten paragraph' }))
    expect(changed.status).toBe('candidates')
    if (changed.status === 'candidates') expect(changed.candidates[0]?.reason).toBe('changed')
    const dup = matchBinding(binding, source({ digest: 'rev-2', content: `${quote} and ${quote}` }))
    expect(dup.status).toBe('candidates')
    if (dup.status === 'candidates') expect(dup.candidates.every(item => item.reason === 'duplicate-quote')).toBe(true)
  })
  it('keeps many-to-many exact cards related instead of forcing a single pick', () => {
    let next = canvas()
    next = {
      ...next,
      nodes: [...next.nodes, { id: 'other', kind: 'idea', title: 'Other', x: 10, y: 10, bindings: [{ ...binding, id: 'bind-2' }] }],
    }
    const related = locateRelatedCards(next, source())
    expect(related.exact.map(item => item.cardId).sort()).toEqual(['card', 'other'])
    expect(related.candidates).toEqual([])
  })
  it('refuses dirty, conflicted or locked canvas as an apply baseline', () => {
    expect(captureSelectedContext(savedGate({ dirty: true, status: 'unsaved' }), ['card']).ok).toBe(false)
    expect(assertCurrentContext(savedGate({ status: 'conflict' }), { project: 'paper', digest: 'canvas-1', cardIds: ['card'] }).ok).toBe(false)
    expect(captureSelectedContext(savedGate({ reviewLocked: true }), ['card']).ok).toBe(false)
  })
  it('captured context keeps omission out of a manuscript dump and projects D selection shape', () => {
    const captured = captureSelectedContext(savedGate(), ['card'])
    expect(captured.ok).toBe(true)
    if (!captured.ok) return
    expect(captured.context.context).toContain('详略（不得写入正文）')
    expect(captured.context.context).toContain('limit the claim')
    const projected = writingSelectionFromContext(captured.context)
    expect(projected.design).toEqual({ path: CONTENT_PATH, digest: 'canvas-1', cardIds: ['card'] })
    expect(projected.sources[0]?.anchor.quote).toBe(quote)
  })
  it('deduplicates the same manuscript selection shared by several design cards without dropping their bindings', () => {
    const value = canvas()
    value.nodes.push({ ...value.nodes[0], id: 'other-card', bindings: [{ ...binding, id: 'second-binding' }] })
    const captured = captureSelectedContext(savedGate({ value }), ['card', 'other-card'])
    expect(captured.ok).toBe(true)
    if (!captured.ok) return
    expect(captured.context.cards).toHaveLength(2)
    expect(captured.context.cards[1].bindings[0].id).toBe('second-binding')
    expect(captured.context.sources).toHaveLength(1)
  })
  it('maps exact patch ranges without moving another identical quote and rejects a stale binding', () => {
    const value = canvas(), repeated = `${quote} / ${quote}`, nextQuote = 'qualified claim'
    value.nodes.push({ ...value.nodes[0], id: 'second', bindings: [{ ...binding, id: 'bind-2', start: quote.length + 3, end: repeated.length }] })
    const receipt = {
      attempt: { id: 'save', proposalId: 'p', operationIds: ['op'], mode: 'apply' as const, at: '2026-09-23T00:00:00Z', actor: 'author', workspace: 'paper', path: 'main.tex', beforeDigest: 'rev-1', beforeHash: 'before', afterHash: 'after', outcome: 'applied' as const, afterDigest: 'rev-2' },
      operations: [{ id: 'op', target: { kind: 'text' as const, workspace: 'paper', path: 'main.tex', start: 0, end: quote.length }, baseDigest: 'rev-1', before: quote, after: nextQuote, reason: 'qualify', evidence: [], dependsOn: [], impacts: [] }],
    }
    const files = new Map([[JSON.stringify(['paper', 'main.tex']), source({ digest: 'rev-2', content: `${nextQuote} / ${quote}` })]])
    const updated = updateBindingsFromReceipts(value, [receipt], files)
    expect(updated.status).toBe('updated')
    expect(updated.canvas.nodes[0].bindings![0]).toMatchObject({ start: 0, quote: nextQuote, digest: 'rev-2' })
    expect(updated.canvas.nodes[1].bindings![0]).toMatchObject({ start: nextQuote.length + 3, quote, digest: 'rev-2' })
    const reverted = updateBindingsFromReceipts(updated.canvas, [{ ...receipt, attempt: { ...receipt.attempt, id: 'undo', mode: 'revert', outcome: 'reverted', beforeDigest: 'rev-2', afterDigest: 'rev-3' } }], new Map([[JSON.stringify(['paper', 'main.tex']), source({ digest: 'rev-3', content: repeated })]]))
    expect(reverted.status).toBe('updated')
    expect(reverted.canvas.nodes[0].bindings![0]).toMatchObject({ start: 0, end: quote.length, quote, digest: 'rev-3' })
    expect(reverted.canvas.nodes[1].bindings![0]).toMatchObject({ start: quote.length + 3, end: repeated.length, quote, digest: 'rev-3' })
    value.nodes[1].bindings![0].digest = 'stale-original'
    const stale = updateBindingsFromReceipts(value, [receipt], files)
    expect(stale.status).toBe('failed')
    expect(stale.unresolved[0].bindingId).toBe('bind-2')
  })
  it('mapping updates only after a genuine applied save; duplicates stay unresolved', () => {
    const updated = updateBindingsFromReceipts(canvas(), [{
      attempt: {
        id: 'a1', proposalId: 'p', operationIds: ['op'], mode: 'apply', at: '2026-09-20T00:00:00.000Z', actor: 'd',
        workspace: 'paper', path: 'main.tex', beforeDigest: 'rev-1', beforeHash: 'h1', afterHash: 'h2',
        outcome: 'applied', afterDigest: 'rev-2',
      },
      operations: [{
        id: 'op', target: { kind: 'text', workspace: 'paper', path: 'main.tex', start: 0, end: quote.length },
        baseDigest: 'rev-1', before: quote, after: 'qualified claim', reason: 'scope', evidence: [], dependsOn: [], impacts: [],
      }],
    }], new Map([[JSON.stringify(['paper', 'main.tex']), source({ digest: 'rev-2', content: 'qualified claim\nnext line' })]]))
    expect(updated.status).toBe('updated')
    expect(updated.canvas.nodes[0]?.bindings?.[0]?.quote).toBe('qualified claim')
    expect(updated.canvas.nodes[0]?.bindings?.[0]?.digest).toBe('rev-2')
    const observed = updateBindingsFromReceipts(canvas(), [{
      attempt: {
        id: 'a1', proposalId: 'p', operationIds: ['op'], mode: 'apply', at: '2026-09-20T00:00:00.000Z', actor: 'd',
        workspace: 'paper', path: 'main.tex', beforeDigest: 'rev-1', beforeHash: 'h1', afterHash: 'h2',
        outcome: 'observed-applied', afterDigest: 'rev-2',
      },
      operations: [],
    }], new Map([[JSON.stringify(['paper', 'main.tex']), source({ digest: 'rev-2' })]]))
    expect(observed.status).toBe('failed')
  })
  it('explicit candidate confirmation rewrites the captured range', () => {
    const observed = source({ digest: 'rev-2', content: `lead ${quote}` })
    const next = confirmCandidate(canvas(), {
      bindingId: 'bind-1', cardId: 'card', identity: { workspace: 'paper', path: 'main.tex', digest: 'rev-1' },
      quote, reason: 'moved', observedDigest: 'rev-2', observedRange: { start: 5, end: 5 + quote.length },
    }, observed)
    expect(next.nodes[0]?.bindings?.[0]).toMatchObject({ digest: 'rev-2', start: 5, end: 5 + quote.length })
  })
  it('bindSourceSelection captures the live UTF-16 range', () => {
    const next = bindSourceSelection(emptyCanvasV2(), 'missing', source(), 0, quote.length)
    expect(next.nodes).toEqual(emptyCanvasV2().nodes)
    const withCard = bindSourceSelection(canvas(), 'card', source(), 0, quote.length)
    expect(withCard.nodes[0]?.bindings).toHaveLength(2)
  })
})
