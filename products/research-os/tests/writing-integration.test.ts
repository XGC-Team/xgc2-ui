import { describe, expect, it } from 'vitest'
import { emptyCanvasV2, parseEditableCanvas, serializeCanvas } from '../src/features/projects/canvas-model'
import { writingSelectionFromContext, type LiveCanvasGate } from '../src/features/projects/design-context'
import { captureWritingContext, designRequestFromContext, mapSavedWriting, prepareWritingFromDesign } from '../src/features/workbench/writing-integration'
import { decodeDesignProposal } from '../src/features/review/writing-model'
import { createReviewEngine } from '../src/features/review/review-engine'
import type { ReviewBatchReceipt } from '../src/features/review/writing-contract'

const scope = { projectId: 'paper', workspace: 'paper' }
function fixture() {
  const canvas = { ...emptyCanvasV2(), nodes: [{ id: 'claim', kind: 'idea' as const, title: 'Claim', body: 'Qualify the argument', x: 0, y: 0,
    bindings: [{ id: 'source', workspace: 'paper', path: 'main.tex', digest: 'source-1', start: 0, end: 3, quote: 'old' }] }] }
  const gate: LiveCanvasGate = { project: 'paper', digest: 'design-1', dirty: false, status: 'saved', reviewLocked: false, value: canvas }
  const files = new Map([['thinking.canvas.json', { content: serializeCanvas(canvas), digest: 'design-1' }], ['main.tex', { content: 'old remainder', digest: 'source-1' }]])
  const port = { inspect: () => gate, read: async (_workspace: string, path: string) => ({ ...files.get(path)! }), clean: () => {} }
  return { canvas, gate, files, port }
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }

describe('writing integration across the existing owners', () => {
  it('captures only selected saved cards and preserves their exact source range', async () => {
    const f = fixture(), selected = await captureWritingContext(scope, ['claim'], f.port)
    expect(writingSelectionFromContext(selected).sources[0].anchor).toMatchObject({ digest: 'source-1', quote: 'old', target: { start: 0, end: 3 } })
    const feedback = { id: 'annotation-1', author: 'researcher', at: '2026-09-21T00:00:00Z', body: 'Please qualify this claim', anchor: selected.sources[0].anchor }
    const request = designRequestFromContext('discussion-1', scope, feedback, selected)
    const proposal = decodeDesignProposal(request, { sessionId: 'session', turnId: 't_' + 'a'.repeat(32), status: 'completed', truncated: false,
      text: JSON.stringify({ schema: 'research-writing/design-v1', requestId: request.id, title: 'Qualify the claim', changes: [{ targetId: request.targets[0].id, after: 'State the boundary of the claim', reason: 'The annotation asks for its conditions.' }] }) })
    expect(proposal.feedback.id).toBe('annotation-1')
    expect(proposal.operations).toHaveLength(1)
    expect(proposal.operations[0].target).toMatchObject({ kind: 'canvas', objectId: 'claim', field: 'body' })
    expect(proposal.writing).toBeUndefined()
  })

  it('rejects a saved canvas changed remotely before capture', async () => {
    const f = fixture(); f.files.get('thinking.canvas.json')!.digest = 'design-2'
    await expect(captureWritingContext(scope, ['claim'], f.port)).rejects.toThrow('saved design changed')
  })

  it('rejects local edits made while source reads are pending', async () => {
    const f = fixture(), waiting = deferred(), read = f.port.read
    f.port.read = async (workspace, path) => { if (path === 'main.tex') await waiting.promise; return read(workspace, path) }
    const capture = captureWritingContext(scope, ['claim'], f.port)
    await Promise.resolve(); f.gate.dirty = true; f.gate.status = 'unsaved'; waiting.resolve()
    await expect(capture).rejects.toThrow('Unsaved canvas')
  })

  it('rejects shifted or stale source bindings rather than widening the manuscript selection', async () => {
    const f = fixture(); f.files.set('main.tex', { content: 'prefix old remainder', digest: 'source-2' })
    await expect(captureWritingContext(scope, ['claim'], f.port)).rejects.toThrow('not an exact match')
  })

  async function designFixture(refuseSave = false) {
    const f = fixture(), writes: string[] = []
    let revision = 0
    const engine = createReviewEngine(scope, {
      read: async (_workspace, path) => { const file = f.files.get(path); if (!file) throw Object.assign(new Error('missing'), { status: 404 }); return { ...file } },
      write: async (_workspace, path, content, guard) => {
        writes.push(path)
        if ((refuseSave && path === 'thinking.canvas.json') || (guard.createOnly ? f.files.has(path) : f.files.get(path)?.digest !== guard.expectedDigest)) throw Object.assign(new Error('CAS conflict'), { status: 409 })
        const record = { content, digest: `saved-${++revision}` }; f.files.set(path, record); return { digest: record.digest }
      },
      lease: () => async () => { const saved = f.files.get('thinking.canvas.json')!; f.gate.value = parseEditableCanvas(saved.content); f.gate.digest = saved.digest },
    }, () => {})
    await engine.load()
    const context = await captureWritingContext(scope, ['claim'], f.port)
    const request = designRequestFromContext('discussion', scope, { id: 'annotation', author: 'researcher', at: '2026-09-21T00:00:00Z', body: 'Qualify the claim', anchor: context.sources[0].anchor }, context)
    const proposal = decodeDesignProposal(request, { sessionId: 'session', turnId: 't_' + 'a'.repeat(32), status: 'completed', truncated: false,
      text: JSON.stringify({ schema: 'research-writing/design-v1', requestId: request.id, title: 'Conditions', changes: [{ targetId: 'design-0', after: 'Explain the observed boundary', reason: 'Follow the PDF annotation.' }] }) })
    await engine.add(proposal)
    return { ...f, engine, proposal, writes }
  }

  it('saves the reviewed design before offering its new revision for manuscript confirmation', async () => {
    const f = await designFixture()
    expect(f.files.get('main.tex')!.content).toBe('old remainder')
    const offer = await prepareWritingFromDesign(f.engine, scope, f.proposal.id, ['design-0'], 'author', () => true, f.port)
    expect(offer.writing?.status).toBe('proposed')
    expect(offer.writing?.selection.design.digest).toBe(f.files.get('thinking.canvas.json')!.digest)
    expect(offer.writing?.selection.context).toContain('Explain the observed boundary')
    expect(f.writes.filter(path => path !== 'research-reviews.json')).toEqual(['thinking.canvas.json'])
    await expect(f.engine.applyWriting(offer.id)).rejects.toThrow('not ready')
    expect(f.files.get('main.tex')!.content).toBe('old remainder')
  })

  it('a refused design CAS produces no manuscript authorization', async () => {
    const f = await designFixture(true)
    await expect(prepareWritingFromDesign(f.engine, scope, f.proposal.id, ['design-0'], 'author', () => true, f.port)).rejects.toThrow()
    expect(f.engine.snapshot().book!.proposals.some(p => p.writing)).toBe(false)
    expect(f.writes).not.toContain('main.tex')
  })

  it('changing projects after design save cannot queue a writing offer in the old journal', async () => {
    const f = await designFixture()
    await expect(prepareWritingFromDesign(f.engine, scope, f.proposal.id, ['design-0'], 'author', () => !f.writes.includes('thinking.canvas.json'), f.port)).rejects.toThrow('project changed')
    expect(f.engine.snapshot().book!.proposals.some(p => p.writing)).toBe(false)
    expect(f.writes).not.toContain('main.tex')
  })

  function savedReceipt(): ReviewBatchReceipt {
    return { version: 1, batchId: 'batch', scope, proposalId: 'writing-1', mode: 'apply', files: [], status: 'applied', auditConfirmed: true,
      saved: [{ attempt: { id: 'save', proposalId: 'writing-1', operationIds: ['source'], mode: 'apply', at: '2026-09-21T00:00:00Z', actor: 'researcher', workspace: 'paper', path: 'main.tex', beforeDigest: 'source-1', beforeHash: 'before', afterHash: 'after', afterDigest: 'source-2', outcome: 'applied' }, operations: [] }] }
  }

  it('does not finish mapping when only an in-memory canvas update exists', async () => {
    const f = fixture(), selection = writingSelectionFromContext(await captureWritingContext(scope, ['claim'], f.port)), waiting = deferred()
    let finished = false, savedProject = ''
    const mapping = mapSavedWriting(scope, savedReceipt(), selection, {
      read: async () => ({ content: 'new remainder', digest: 'source-2' }),
      apply: () => ({ status: 'updated', canvas: f.canvas, unresolved: [] }),
      save: async project => { savedProject = project; await waiting.promise; return 'design-2' },
    }).then(() => { finished = true })
    await Promise.resolve(); await Promise.resolve()
    expect(finished).toBe(false); expect(savedProject).toBe('paper')
    waiting.resolve(); await mapping; expect(finished).toBe(true)
  })

  it('retains a failed mapping save as failure without retrying manuscript writes', async () => {
    const f = fixture(), selection = writingSelectionFromContext(await captureWritingContext(scope, ['claim'], f.port))
    await expect(mapSavedWriting(scope, savedReceipt(), selection, {
      read: async () => ({ content: 'new remainder', digest: 'source-2' }),
      apply: () => ({ status: 'updated', canvas: f.canvas, unresolved: [] }),
      save: async () => { throw new Error('Canvas CAS conflict') },
    })).rejects.toThrow('Canvas CAS conflict')
    expect(f.files.get('main.tex')!.content).toBe('old remainder')
  })

  it('rejects another project or a newer manuscript before modifying the design', async () => {
    const f = fixture(), selection = writingSelectionFromContext(await captureWritingContext(scope, ['claim'], f.port))
    let edits = 0
    const port = { read: async () => ({ content: 'newer', digest: 'source-3' }), apply: () => { edits++; return { status: 'updated' as const, canvas: f.canvas, unresolved: [] } }, save: async () => 'design-2' }
    await expect(mapSavedWriting(scope, { ...savedReceipt(), scope: { projectId: 'other', workspace: 'other' } }, selection, port)).rejects.toThrow('another design')
    await expect(mapSavedWriting(scope, savedReceipt(), selection, port)).rejects.toThrow('changed after writing')
    expect(edits).toBe(0)
  })
})
