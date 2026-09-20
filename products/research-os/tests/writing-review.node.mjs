import test from 'node:test'
import assert from 'node:assert/strict'
import { createReviewEngine } from '../src/features/review/review-engine.ts'
import { REVIEW_PATH, parseReviewBook } from '../src/features/review/review-model.ts'
import { validateWritingSelection, writingFingerprint } from '../src/features/review/writing-model.ts'
import { patchText } from '../src/features/review/review-text.ts'
import { publishReviewBatch, subscribeReviewBatches, writingHistoryReceipt } from '../src/features/review/review-batches.ts'

const scope = { projectId: 'project-a', workspace: 'paper-a' }
const turnId = 't_' + 'a'.repeat(32)
const http = (status, text = 'Refused') => Object.assign(new Error(text), { status })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

/** In-memory CAS fixtures exercise the actual review writer. They are not a
 * native provider run, HTTP integration or evidence of successful compilation. */
async function fixture(paths = ['main.tex'], options = {}) {
  let revision = 0, sends = 0
  const files = new Map([['thinking.canvas.json', { content: '{"version":2}', digest: 'design-1' }], ...paths.map((path, i) => [path, { content: 'KEEP old END', digest: `source-${i}` }])])
  const writes = [], batches = [], locked = new Set(), blocked = new Set()
  const port = {
    read: async (workspace, path) => {
      assert.equal(workspace, scope.workspace)
      if (!files.has(path)) throw http(404)
      return structuredClone(files.get(path))
    },
    write: async (workspace, path, content, guard) => {
      assert.equal(workspace, scope.workspace)
      writes.push({ path, content, guard })
      await options.beforeWrite?.(path, content, files)
      const old = files.get(path)
      if (guard.createOnly ? !!old : old?.digest !== guard.expectedDigest) throw http(409, 'CAS conflict')
      const next = { content, digest: `saved-${++revision}` }
      files.set(path, next)
      await options.afterWrite?.(path, content, files)
      return { digest: next.digest }
    },
    lease: (workspace, path) => {
      assert.equal(workspace, scope.workspace)
      if (locked.has(path) || blocked.has(path)) throw Error('Editor dirty or locked')
      locked.add(path)
      return async () => { locked.delete(path) }
    },
    batchComplete: receipt => { batches.push(receipt); options.onBatch?.(receipt) },
  }
  const engine = createReviewEngine(scope, port, options.onChange || (() => {}))
  await engine.load()
  const anchor = (path, index) => ({ kind: 'text', workspace: scope.workspace, path, digest: `source-${index}`, quote: 'old', target: { kind: 'text', workspace: scope.workspace, path, start: 5, end: 8 } })
  const offer = { id: 'writing-a', author: 'author-a', title: 'Revise selected argument',
    feedback: { id: 'feedback-a', author: 'author-a', at: '2026-09-20T00:00:00.000Z', body: 'Clarify the local argument', anchor: anchor(paths[0], 0) },
    selection: { design: { path: 'thinking.canvas.json', digest: 'design-1', cardIds: ['card-a'] }, sources: paths.map((path, i) => ({ id: `source-${i}`, anchor: anchor(path, i) })), evidence: [], context: 'Explain motivation here; keep full derivation in the following section.' } }
  const native = { sessionId: 'session-a', send: async (text, key) => {
    ++sends
    const stored = parseReviewBook(files.get(REVIEW_PATH).content, scope).proposals[0].writing
    assert.equal(stored.execution.requestKey, key, 'dispatch identity must be durable before native send')
    assert.equal(stored.status, 'running')
    assert.ok(text.includes('research-writing/result-v1'))
    return options.send ? options.send(text, key) : turnId
  } }
  const completed = (overrides = {}, sources) => {
    const w = engine.snapshot().book.proposals[0].writing
    return { sessionId: native.sessionId, turnId, status: 'completed', truncated: false,
      text: JSON.stringify({ schema: 'research-writing/result-v1', proposalId: offer.id, confirmationId: w.confirmation.id, fingerprint: w.confirmation.fingerprint,
        sources: sources || w.selection.sources.map(s => ({ sourceId: s.id, status: 'replace', after: 'new argument', reason: 'Follow the confirmed design' })) }), ...overrides }
  }
  const ready = async sources => { await engine.offerWriting(offer); await engine.confirmWriting(offer.id, 'author-a'); await engine.dispatchWriting(offer.id, native); await engine.acceptWritingResult(offer.id, completed({}, sources)) }
  return { engine, files, writes, batches, blocked, offer, native, completed, ready, port, sends: () => sends, sourceWrites: () => writes.filter(w => w.path !== REVIEW_PATH) }
}

test('an unconfirmed proposal persists but cannot dispatch or write manuscript', async () => {
  const f = await fixture(); await f.engine.offerWriting(f.offer)
  await assert.rejects(f.engine.dispatchWriting(f.offer.id, f.native), /already dispatched|no current/)
  await assert.rejects(f.engine.applyWriting(f.offer.id), /not ready/)
  await assert.rejects(f.engine.run(f.offer.id, [], 'a', 'apply'), /cannot bypass/)
  assert.equal(f.sends(), 0); assert.equal(f.sourceWrites().length, 0)
  const restored = createReviewEngine(scope, f.port, () => {}); await restored.load()
  assert.equal(restored.snapshot().book.proposals[0].writing.status, 'proposed')
})

test('confirmation binds project, complete design context, evidence and exact source range', async () => {
  const f = await fixture(); const s = f.offer.selection
  const original = await writingFingerprint(scope, f.offer.id, s)
  for (const changed of [{ ...s, context: s.context + ' changed' }, { ...s, design: { ...s.design, digest: 'design-2' } }, { ...s, sources: [{ ...s.sources[0], anchor: { ...s.sources[0].anchor, digest: 'other' } }] }]) {
    assert.notEqual(await writingFingerprint(scope, f.offer.id, changed), original)
  }
  assert.notEqual(await writingFingerprint({ ...scope, projectId: 'project-b' }, f.offer.id, s), original)
  const foreign = structuredClone(s); foreign.sources[0].anchor.workspace = 'other'
  assert.throws(() => validateWritingSelection(foreign, scope))
  const overlap = structuredClone(s); overlap.sources.push({ ...overlap.sources[0], id: 'duplicate-range' })
  assert.throws(() => validateWritingSelection(overlap, scope), /Overlapping/)
})

test('dirty editors and changed design/source prevent confirmation without source writes', async () => {
  for (const kind of ['dirty', 'design', 'source']) {
    const f = await fixture(); await f.engine.offerWriting(f.offer)
    if (kind === 'dirty') f.blocked.add('thinking.canvas.json')
    else f.files.get(kind === 'design' ? 'thinking.canvas.json' : 'main.tex').digest = 'changed'
    await assert.rejects(f.engine.confirmWriting(f.offer.id, 'author-a'), /changed|dirty/)
    assert.equal(f.sourceWrites().length, 0)
  }
})

test('native partial replacements use one confirmed scope and preserve everything outside it', async () => {
  const f = await fixture(); await f.ready()
  const receipt = await f.engine.applyWriting(f.offer.id)
  assert.equal(f.files.get('main.tex').content, 'KEEP new argument END')
  assert.equal(receipt.status, 'applied'); assert.equal(receipt.saved.length, 1)
  assert.equal(receipt.saved[0].attempt.afterDigest, f.files.get('main.tex').digest)
  assert.equal(f.batches.length, 1); assert.equal(f.sends(), 1)
  assert.equal(f.engine.snapshot().book.proposals[0].writing.mapping.status, 'pending')
  await f.engine.recordWritingMapping(f.offer.id, { status: 'failed', detail: 'Canvas CAS changed' })
  assert.equal(f.sourceWrites().length, 1, 'mapping retries cannot replay source writes')
})

test('duplicate terminal messages and explicit retry cannot reapply or redispatch', async () => {
  const f = await fixture(); await f.ready(); const done = f.completed()
  assert.equal(await f.engine.acceptWritingResult(f.offer.id, done), false)
  await f.engine.applyWriting(f.offer.id)
  assert.equal(await f.engine.acceptWritingResult(f.offer.id, done), false)
  await assert.rejects(f.engine.applyWriting(f.offer.id), /not ready|already attempted/)
  await assert.rejects(f.engine.dispatchWriting(f.offer.id, f.native), /already dispatched/)
  assert.equal(f.sourceWrites().length, 1); assert.equal(f.sends(), 1)
})

test('changed saved design during native work or after result cannot reuse confirmation', async () => {
  for (const afterResult of [false, true]) {
    const f = await fixture(); await f.engine.offerWriting(f.offer); await f.engine.confirmWriting(f.offer.id, 'a'); await f.engine.dispatchWriting(f.offer.id, f.native)
    if (afterResult) await f.engine.acceptWritingResult(f.offer.id, f.completed())
    f.files.get('thinking.canvas.json').digest = 'design-2'
    await assert.rejects(afterResult ? f.engine.applyWriting(f.offer.id) : f.engine.acceptWritingResult(f.offer.id, f.completed()), /design changed/)
    assert.equal(f.sourceWrites().length, 0)
  }
})

test('failed, refused, truncated, foreign and unstructured native messages never write', async () => {
  for (const override of [{ status: 'failed' }, { status: 'refused' }, { truncated: true }, { sessionId: 'session-b' }, { turnId: 't_' + 'b'.repeat(32) }, { text: 'I have completed the edit.' }]) {
    const f = await fixture(); await f.engine.offerWriting(f.offer); await f.engine.confirmWriting(f.offer.id, 'a'); await f.engine.dispatchWriting(f.offer.id, f.native)
    await assert.rejects(f.engine.acceptWritingResult(f.offer.id, f.completed(override)))
    assert.equal(f.sourceWrites().length, 0)
  }
})

test('model cannot choose another target or silently omit a selected result', async () => {
  for (const bad of [[{ sourceId: 'outside', status: 'replace', after: 'bad', reason: 'bad' }], [], [{ sourceId: 'source-0', status: 'replace', after: 'bad', reason: 'bad', path: 'other.tex' }]]) {
    const f = await fixture(); await f.engine.offerWriting(f.offer); await f.engine.confirmWriting(f.offer.id, 'a'); await f.engine.dispatchWriting(f.offer.id, f.native)
    await assert.rejects(f.engine.acceptWritingResult(f.offer.id, f.completed({}, bad)))
    assert.equal(f.sourceWrites().length, 0)
  }
})

test('refusal is a real per-range result, never a fabricated save', async () => {
  const f = await fixture(); await f.ready([{ sourceId: 'source-0', status: 'refused', reason: 'No supporting evidence' }])
  const batch = await f.engine.applyWriting(f.offer.id)
  assert.equal(batch.status, 'not-written'); assert.equal(batch.saved.length, 0)
  assert.equal(batch.files[0].outcome, 'refused'); assert.equal(f.sourceWrites().length, 0)
})

test('one refused file preserves successful independent file receipts and reports partial', async () => {
  const f = await fixture(['main.tex', 'part.tex'], { beforeWrite: path => { if (path === 'part.tex') throw http(403) } })
  await f.ready(); const b = await f.engine.applyWriting(f.offer.id)
  assert.equal(b.status, 'partial'); assert.deepEqual(b.files.map(f => f.outcome), ['applied', 'not-written'])
  assert.equal(b.saved.length, 1); assert.equal(f.files.get('part.tex').content, 'KEEP old END')
})

test('concurrent source edit refuses stale file but does not erase other successful files', async () => {
  const f = await fixture(['main.tex', 'part.tex']); await f.ready()
  f.files.set('part.tex', { content: 'other author', digest: 'concurrent' })
  const b = await f.engine.applyWriting(f.offer.id)
  assert.equal(b.status, 'partial'); assert.equal(b.files[1].outcome, 'not-dispatched')
  assert.equal(f.files.get('part.tex').content, 'other author'); assert.equal(b.saved.length, 1)
})

test('target CAS race yields a conflict receipt, not an applied assertion', async () => {
  const f = await fixture(['main.tex'], { beforeWrite: path => { if (path === 'main.tex') throw http(412) } }); await f.ready()
  const b = await f.engine.applyWriting(f.offer.id)
  assert.equal(b.files[0].outcome, 'conflict'); assert.equal(b.saved.length, 0)
})

test('lost target acknowledgement stops later files; reload and observation do not fabricate a save', async () => {
  const f = await fixture(['main.tex', 'part.tex'], { afterWrite: path => { if (path === 'main.tex') throw Error('Network response lost') } }); await f.ready()
  const b = await f.engine.applyWriting(f.offer.id)
  assert.equal(b.status, 'uncertain'); assert.equal(b.saved.length, 0)
  assert.equal(f.files.get('main.tex').content, 'KEEP new argument END'); assert.equal(f.files.get('part.tex').content, 'KEEP old END')
  const restored = createReviewEngine(scope, f.port, () => {}); await restored.load()
  await assert.rejects(restored.applyWriting(f.offer.id), /not ready|already attempted/)
  const attempt = restored.snapshot().book.attempts[0]
  const observed = await restored.inspect(attempt.id)
  await restored.confirmObservation(attempt.id, observed.digest, 'a')
  assert.equal(writingHistoryReceipt(restored.snapshot().book, f.offer.id).saved.length, 0)
  assert.equal(f.sourceWrites().length, 1)
})

test('source success survives a lost final journal acknowledgement as explicit transient evidence', async () => {
  let failJournal = false
  const f = await fixture(['main.tex'], { beforeWrite: (path, content) => {
    if (path === REVIEW_PATH && failJournal && JSON.parse(content).attempts.some(a => a.outcome === 'applied')) throw Error('Journal network lost')
  }, afterWrite: path => { if (path === 'main.tex') failJournal = true } })
  await f.ready(); await assert.rejects(f.engine.applyWriting(f.offer.id), /Journal not confirmed/)
  assert.equal(f.batches[0].status, 'uncertain'); assert.equal(f.batches[0].auditConfirmed, false)
  assert.equal(f.batches[0].saved.length, 1, 'a real target acknowledgement is retained even if audit persistence failed')
  assert.equal(f.engine.snapshot().transient.outcome, 'applied')
  await assert.rejects(f.engine.applyWriting(f.offer.id), /Reload/)
})

test('observer exceptions never turn acknowledged writes into uncertainty', async () => {
  const f = await fixture(['main.tex'], { onChange: () => { throw Error('UI observer') }, onBatch: () => { throw Error('Compile callback') } })
  await f.ready(); const b = await f.engine.applyWriting(f.offer.id)
  assert.equal(b.status, 'applied'); assert.equal(f.engine.snapshot().auditUncertain, false)
  const observed = []; const one = subscribeReviewBatches(() => { throw Error('bad subscriber') }), two = subscribeReviewBatches(x => observed.push(x))
  try { assert.equal(publishReviewBatch(b).length, 1); assert.equal(observed.length, 1) } finally { one(); two() }
})

test('cancellation during native dispatch records late identity but never applies its response', async () => {
  const sent = deferred(), finish = deferred()
  const f = await fixture(['main.tex'], { send: async () => { sent.resolve(); await finish.promise; return turnId } })
  await f.engine.offerWriting(f.offer); await f.engine.confirmWriting(f.offer.id, 'a')
  const sending = f.engine.dispatchWriting(f.offer.id, f.native); await sent.promise
  const cancelling = f.engine.cancelWriting(f.offer.id, 'a', 'Changed mind'); finish.resolve()
  await sending; await cancelling
  assert.equal(await f.engine.acceptWritingResult(f.offer.id, f.completed()), false)
  assert.equal(f.sourceWrites().length, 0)
  assert.equal(f.engine.snapshot().book.proposals[0].writing.status, 'cancelled')
})

test('cancel during an in-flight CAS preserves its actual receipt and suppresses later files', async () => {
  const started = deferred(), finish = deferred()
  const f = await fixture(['main.tex', 'part.tex'], { beforeWrite: async path => { if (path === 'main.tex') { started.resolve(); await finish.promise } } }); await f.ready()
  const applying = f.engine.applyWriting(f.offer.id); await started.promise
  const cancel = f.engine.cancelWriting(f.offer.id, 'a', 'Stop the remaining edits'); finish.resolve()
  const b = await applying; await cancel
  assert.equal(b.status, 'cancelled'); assert.equal(b.saved.length, 1)
  assert.equal(f.files.get('part.tex').content, 'KEEP old END'); assert.equal(f.batches.length, 1)
})

test('project disposal while native response is late cannot write this or any new project', async () => {
  const sent = deferred(), finish = deferred()
  const f = await fixture(['main.tex'], { send: async () => { sent.resolve(); await finish.promise; return turnId } })
  await f.engine.offerWriting(f.offer); await f.engine.confirmWriting(f.offer.id, 'a')
  const sending = f.engine.dispatchWriting(f.offer.id, f.native); await sent.promise
  f.engine.dispose(); finish.resolve(); await sending
  await assert.rejects(f.engine.acceptWritingResult(f.offer.id, f.completed()), /closed/)
  assert.equal(f.sourceWrites().length, 0)
})

test('state snapshots and caller objects cannot mutate durable confirmation or scope', async () => {
  const f = await fixture(); await f.engine.offerWriting(f.offer)
  f.offer.selection.design.digest = 'mutated outside'; const snapshot = f.engine.snapshot()
  snapshot.book.proposals[0].writing.selection.sources[0].anchor.target.path = 'outside.tex'
  await f.engine.confirmWriting(f.offer.id, 'a')
  assert.equal(f.engine.snapshot().book.proposals[0].writing.selection.design.digest, 'design-1')
  assert.equal(f.engine.snapshot().book.proposals[0].writing.selection.sources[0].anchor.target.path, 'main.tex')
  const imported = structuredClone(f.engine.snapshot().book.proposals[0]); imported.id = 'forged'
  await assert.rejects(f.engine.add(imported), /cannot supply a confirmation/)
})

test('exact source patch and conservative undo share one implementation, including Unicode and deletion', () => {
  const content = 'A🙂B one C two Z'
  const make = (start, before, after) => ({ id: String(start), target: { kind: 'text', workspace: scope.workspace, path: 'main.tex', start, end: start + before.length }, before, after })
  const ops = [make(content.indexOf('one'), 'one', ''), make(content.indexOf('two'), 'two', 'three longer')]
  const next = patchText(content, ops, scope)
  assert.equal(next, 'A🙂B  C three longer Z'); assert.equal(patchText(next, ops, scope, true), content)
  assert.throws(() => patchText('changed', ops, scope), /no longer matches/)
})

test('structured unconfirmed design results enter review as canvas-only proposals, never as writing permission', async () => {
  const f = await fixture()
  const request = { id: 'design-a', scope, feedback: f.offer.feedback, context: 'The selected design', targets: [{ id: 'title-a', anchor: { kind: 'canvas', workspace: scope.workspace, path: 'thinking.canvas.json', digest: 'design-1', quote: 'Old title', target: { kind: 'canvas', workspace: scope.workspace, path: 'thinking.canvas.json', objectId: 'card-a', field: 'title' } } }] }
  const expected = { sessionId: 'session-a', turnId }
  const result = { ...expected, status: 'completed', truncated: false, text: JSON.stringify({ schema: 'research-writing/design-v1', requestId: request.id, title: 'Clarify motivation', changes: [{ targetId: 'title-a', after: 'New title', reason: 'Respond to feedback' }] }) }
  assert.equal(await f.engine.addDesignProposal(request, result, expected), true)
  assert.equal(await f.engine.addDesignProposal(request, result, expected), false)
  assert.equal(f.engine.snapshot().book.proposals[0].writing, undefined); assert.equal(f.sourceWrites().length, 0)
  const bad = structuredClone(request); bad.id = 'bad'; bad.targets[0].anchor = f.offer.selection.sources[0].anchor
  await assert.rejects(f.engine.addDesignProposal(bad, result, expected), /cannot target manuscript/)
})

test('scope changes invalidate an in-flight writer before effect cleanup, without redirecting its journal', async () => {
  let current = true
  const changed = deferred(), released = deferred()
  const f = await fixture(['main.tex'], { beforeWrite: async (path, content) => {
    if (path === REVIEW_PATH && JSON.parse(content).attempts.some(a => a.outcome === 'pending')) { changed.resolve(); await released.promise }
  } })
  f.port.isCurrent = () => current
  await f.ready()
  const apply = f.engine.applyWriting(f.offer.id); await changed.promise
  current = false; released.resolve(); await apply
  assert.equal(f.sourceWrites().length, 0)
  assert.equal(f.engine.snapshot().book.attempts[0].outcome, 'not-written')
})

test('failed native dispatch persists uncertainty and cannot automatically issue another prompt', async () => {
  const f = await fixture(['main.tex'], { send: () => { throw Error('lost acknowledgement') } })
  await f.engine.offerWriting(f.offer); await f.engine.confirmWriting(f.offer.id, 'a')
  await assert.rejects(f.engine.dispatchWriting(f.offer.id, f.native), /lost acknowledgement/)
  const restored = createReviewEngine(scope, f.port, () => {}); await restored.load()
  assert.equal(restored.snapshot().book.proposals[0].writing.status, 'uncertain')
  await assert.rejects(restored.dispatchWriting(f.offer.id, f.native), /already dispatched/)
  assert.equal(f.sends(), 1); assert.equal(f.sourceWrites().length, 0)
})

test('knowledge confirmation consumes F canonical contract; removed scope-only candidates fail closed', async () => {
  const { knowledgePromotionDigest } = await import('../src/features/resources/knowledge-promotion.ts')
  const f = await fixture(), promotion = { destination: 'global-knowledge', scope: 'This project argument only', conditions: 'Given the selected evidence', verification: 'Not independently verified', decision: 'pending', candidate: { kind: 'note', body: 'A scoped note.', evidence: [{ workspace: scope.workspace, path: 'main.tex', digest: 'source-0', anchor: JSON.stringify(f.offer.selection.sources[0].anchor) }] } }
  const proposal = { id: 'knowledge-a', author: 'a', at: '2026-09-20T00:00:00Z', title: 'Knowledge candidate', feedback: f.offer.feedback, operations: [], promotion }
  const old = structuredClone(proposal); delete old.promotion.candidate
  await assert.rejects(f.engine.add(old), /candidate/)
  await f.engine.add(proposal); await f.engine.decidePromotion(proposal.id, 'approved-scope', 'a')
  const stored = f.engine.snapshot().book.proposals[0].promotion
  assert.equal(stored.approvalDigest, await knowledgePromotionDigest(scope, proposal.id, promotion))
  assert.equal(f.sourceWrites().length, 0, 'scope approval is not a knowledge file receipt')
  await f.engine.editPromotion(proposal.id, { ...stored, candidate: { ...stored.candidate, body: 'A changed note.' } })
  const changed = f.engine.snapshot().book.proposals[0].promotion
  assert.equal(changed.decision, 'pending'); assert.equal(changed.approvalDigest, undefined)
  const forged = { ...proposal, id: 'forged-knowledge', promotion: stored }
  await assert.rejects(f.engine.add(forged), /cannot supply a knowledge approval/)
})
