import { check, emptyReviewBook, fingerprint, now, operationState, parseReviewBook, REVIEW_PATH, selectedGroups, serializeReviewBook, uid, validateProposal, type Attempt, type FileRecord, type Operation, type Proposal, type ReviewBook, type Scope } from './review-model.ts'
import { patchText } from './review-text.ts'
import { bindWritingReview } from './writing-engine.ts'
import { reviewBatchReceipt } from './review-batches.ts'
import type { ReviewBatchListener, ReviewBatchReceipt } from './writing-contract.ts'
export type ReviewPort = {
  read: (workspace: string, path: string) => Promise<FileRecord>
  write: (workspace: string, path: string, content: string, guard: { expectedDigest?: string; createOnly?: true }) => Promise<{ digest: string }>
  lease: (workspace: string, path: string) => () => Promise<void>
  isCurrent?: () => boolean
  batchComplete?: ReviewBatchListener
}
export type ReviewState = { book: ReviewBook | null; busy: boolean; error: string; auditUncertain: boolean; transient?: Attempt; lastBatch?: ReviewBatchReceipt }
const status = (e: unknown) => typeof e === 'object' && e && 'status' in e ? Number(e.status) : 0
const message = (e: unknown) => e instanceof Error ? e.message : String(e)
/** A write-ahead journal and target CAS are separate writes, never an advertised cross-file transaction. */
export function createReviewEngine(scope: Scope, port: ReviewPort, changed: (s: ReviewState) => void) {
  scope = structuredClone(scope)
  let book: ReviewBook | null = null, digest: string | undefined, busy = false, error = '', uncertain = false, disposed = false
  let transient: Attempt | undefined, lastBatch: ReviewBatchReceipt | undefined
  const isCurrent = () => !disposed && (port.isCurrent?.() ?? true)
  let idle: Promise<void> = Promise.resolve()
  const snapshot = (): ReviewState => structuredClone({ book, busy, error, auditUncertain: uncertain, transient, lastBatch })
  const emit = () => {
    if (isCurrent()) try { changed(snapshot()) } catch (e) { error = `Review state observer failed: ${message(e)}` }
  }
  const validRecord = (r: FileRecord) => { check(typeof r?.content === 'string' && typeof r.digest === 'string' && r.digest, 'Missing file revision.'); return r }
  async function persist(next: ReviewBook) {
    const content = serializeReviewBook(next)
    try {
      const r = await port.write(scope.workspace, REVIEW_PATH, content, digest ? { expectedDigest: digest } : { createOnly: true })
      check(typeof r?.digest === 'string' && r.digest, 'Journal acknowledgement lacks a revision.')
      book = next; digest = r.digest; emit()
    } catch (e) { uncertain = true; throw new Error(`Journal not confirmed. Stop and reload; never repeat a target write blindly. ${message(e)}`) }
  }
  async function command<T>(task: () => Promise<T>, loading = false) {
    check(isCurrent() && !busy, 'Review operation is already running or closed.')
    if (!loading) check(book && !uncertain, 'Reload the journal before making another decision.')
    let done!: () => void
    idle = new Promise<void>(resolve => { done = resolve })
    busy = true; error = ''; emit()
    try { return await task() } catch (e) { error = message(e); throw e } finally { busy = false; done(); emit() }
  }
  const proposal = (id: string) => { const p = book!.proposals.find(p => p.id === id); check(p, 'Proposal not found.'); return p }
  const unresolved = () => book!.attempts.some(a => ['pending', 'uncertain'].includes(a.outcome))
  function available(p: Proposal, ids: string[], mode: 'apply' | 'revert') {
    check(!unresolved(), 'An uncertain write must be inspected and confirmed before any further application.')
    for (const id of ids) {
      const s = operationState(book!, p.id, id)
      check(mode === 'apply' ? ['review', 'not-written', 'observed-not-written', 'conflict'].includes(s) : s === 'applied', 'Operation is already decided, applied, reverted or uncertain.')
    }
  }
  async function runGroup(p: Proposal, ops: Operation[], actor: string, mode: 'apply' | 'revert', guard: () => Promise<void>) {
    const { workspace, path } = ops[0].target
    const release = port.lease(workspace, path)
    try {
      await guard(); check(isCurrent(), 'Closed before target dispatch.')
      const baseline = validRecord(await port.read(workspace, path))
      if (mode === 'apply') check(ops.every(o => o.baseDigest === baseline.digest), 'Baseline conflict: compose a new proposal against the current version.')
      else if (ops[0].target.kind === 'text') {
        const receipts = ops.map(o => [...book!.attempts].reverse().find(a => a.proposalId === p.id && a.operationIds.includes(o.id) && ['applied', 'observed-applied'].includes(a.outcome)))
        check(receipts.every(r => r?.afterDigest === baseline.digest), 'Source changed after application. Whole-file snapshot restore is forbidden; create a new local proposal.')
        check(receipts.every(r => r!.operationIds.every(id => ops.some(o => o.id === id))), 'Recover all source ranges from the same saved write together.')
      }
      const next = ops[0].target.kind === 'text' ? patchText(baseline.content, ops, scope, mode === 'revert')
        : (await import('./review-targets.ts')).patchTarget(baseline.content, ops, scope, mode === 'revert')
      const attempt: Attempt = { id: uid(), proposalId: p.id, operationIds: ops.map(o => o.id), mode, at: now(), actor, workspace, path,
        beforeDigest: baseline.digest, beforeHash: await fingerprint(baseline.content), afterHash: await fingerprint(next), outcome: 'pending' }
      await persist({ ...book!, attempts: [...book!.attempts, attempt] })
      let result: Attempt = attempt
      // Re-check the design after the write-ahead acknowledgement, immediately
      // before dispatch. A cancelled/invalidated guard is known NOT to have written.
      try { await guard(); check(isCurrent(), 'Closed before target dispatch.') }
      catch (e) { result = { ...attempt, outcome: 'not-written', detail: message(e), finishedAt: now() } }
      if (result === attempt) {
        try {
          const r = await port.write(workspace, path, next, { expectedDigest: baseline.digest })
          check(typeof r?.digest === 'string' && r.digest, 'Target acknowledgement lacks a saved revision.')
          result = { ...attempt, outcome: mode === 'apply' ? 'applied' : 'reverted', afterDigest: r.digest, finishedAt: now() }
        } catch (e) {
          const code = status(e)
          result = { ...attempt, outcome: [409, 412].includes(code) ? 'conflict' : [400, 401, 403, 404, 405, 422].includes(code) ? 'not-written' : 'uncertain', detail: message(e), finishedAt: now() }
        }
      }
      transient = result
      await persist({ ...book!, attempts: book!.attempts.map(a => a.id === attempt.id ? result : a) })
      transient = undefined
      // Unknown outcome blocks later groups. An independently refused group does not undo an earlier success.
      return result.outcome !== 'uncertain'
    } finally {
      try { await release() } catch (e) { error = `Target outcome is recorded; editor refresh failed: ${message(e)}`; emit() }
    }
  }
  async function performRun(id: string, ids: string[], actor: string, mode: 'apply' | 'revert', batchId: string,
    guard: () => Promise<void> = async () => {}, cancelled: () => boolean = () => !isCurrent()) {
    check(actor.trim(), 'Actor is required.')
    const p = proposal(id); available(p, ids, mode)
    const groups = ids.length ? selectedGroups(p, ids) : []
    check(groups.length || p.writing?.result, 'Select distinct operations.')
    const attemptStart = book!.attempts.length, notStart = (book!.notDispatched || []).length
    const problems: string[] = []
    try {
      for (const ops of groups) {
        if (!isCurrent() || cancelled()) break
        try { if (!await runGroup(p, ops, actor, mode, guard)) break }
        catch (e) {
          if (uncertain || unresolved() || !isCurrent()) throw e
          const detail = `${ops[0].target.workspace}/${ops[0].target.path}: NOT DISPATCHED — ${message(e)}`
          await persist({ ...book!, notDispatched: [...(book!.notDispatched || []), { id: uid(), proposalId: p.id, operationIds: ops.map(o => o.id), actor, at: now(), mode, detail }] })
          problems.push(detail)
        }
      }
      return problems
    } finally {
      const attempts = book!.attempts.slice(attemptStart).map(a => transient?.id === a.id ? transient : a)
      lastBatch = reviewBatchReceipt(scope, p, ids, mode, batchId, attempts, (book!.notDispatched || []).slice(notStart), !uncertain, cancelled())
    }
  }
  const publishedBatches = new Set<string>()
  function finishBatch(batchId: string): ReviewBatchReceipt | undefined {
    if (lastBatch?.batchId !== batchId) return
    if (uncertain) lastBatch = { ...lastBatch, auditConfirmed: false, status: 'uncertain' }
    // Subscriber failures must never reclassify an acknowledged target write as
    // uncertain or stop other observers. They are follow-up errors, not CAS errors.
    try {
      if (!publishedBatches.has(batchId)) { publishedBatches.add(batchId); port.batchComplete?.(structuredClone(lastBatch)) }
    }
    catch (e) { error = `Source receipts are recorded; batch follow-up failed: ${message(e)}` }
    emit()
    return structuredClone(lastBatch)
  }
  const writing = bindWritingReview({ scope, port, command, persist, proposal, performRun, finishBatch,
    book: () => book!, idle: () => idle, closed: () => !isCurrent(), auditUncertain: () => uncertain,
    warn: detail => { error = detail; emit() },
  })
  return {
    ...writing,
    snapshot,
    load: () => command(async () => {
      uncertain = true
      try { const r = validRecord(await port.read(scope.workspace, REVIEW_PATH)); const next = parseReviewBook(r.content, scope); book = next; digest = r.digest }
      catch (e) { if (status(e) !== 404) throw e; book = emptyReviewBook(scope); digest = undefined }
      uncertain = false; transient = undefined
    }, true),
    add: (p: Proposal) => command(async () => {
      validateProposal(p, scope)
      check(!p.writing, 'Use offerWriting; imported data cannot supply a confirmation or receipt.')
      check(!p.promotion || (p.promotion.decision === 'pending' && !p.promotion.approvalDigest && !p.promotion.decidedBy && !p.promotion.decidedAt), 'Imported candidates cannot supply a knowledge approval.')
      check(!book!.proposals.some(existing => existing.id === p.id), 'Duplicate proposal.')
      await persist({ ...book!, proposals: [...book!.proposals, structuredClone(p)] })
    }),
    reject: (id: string, ids: string[], actor: string, reason: string) => command(async () => {
      check(actor.trim() && reason.trim(), 'Actor and decision reason are required.')
      const p = proposal(id)
      check(!p.writing, 'Cancel the writing proposal with a reason instead of splitting its authorization.')
      // Rejection can include preview-only cross-file groups, but must keep dependency selection intact.
      const { dependencyClosure } = await import('./review-model.ts')
      check(ids.length > 0 && new Set(ids).size === ids.length && dependencyClosure(p, ids).length === ids.length, 'Select complete dependency groups.')
      available(p, ids, 'apply')
      await persist({ ...book!, decisions: [...book!.decisions, { id: uid(), proposalId: id, operationIds: ids, actor, reason, at: now(), kind: 'reject' }] })
    }),
    run: (id: string, ids: string[], actor: string, mode: 'apply' | 'revert') => command(async () => {
      check(!proposal(id).writing, 'Use the confirmed writing action; generic review cannot bypass its design guard.')
      const batchId = uid()
      try {
        const problems = await performRun(id, ids, actor, mode, batchId)
        if (problems.length) throw new Error(problems.join('\n'))
      } finally { finishBatch(batchId) }
    }),
    inspect: async (attemptId: string) => {
      check(book && !busy, 'Wait for the current operation.')
      const a = book.attempts.find(a => a.id === attemptId); check(a, 'Attempt not found.')
      const r = validRecord(await port.read(a.workspace, a.path)), hash = await fingerprint(r.content)
      return { digest: r.digest, match: hash === a.afterHash ? 'after' : hash === a.beforeHash ? 'before' : 'different' } as const
    },
    confirmObservation: (attemptId: string, expectedDigest: string, actor: string) => command(async () => {
      check(actor.trim(), 'Actor is required.')
      const a = book!.attempts.find(a => a.id === attemptId)
      check(a && ['pending', 'uncertain'].includes(a.outcome), 'Only unresolved outcomes require confirmation.')
      const release = port.lease(a.workspace, a.path)
      try {
        const r = validRecord(await port.read(a.workspace, a.path)); check(r.digest === expectedDigest, 'File changed after inspection.')
        const hash = await fingerprint(r.content)
        check(hash === a.afterHash || hash === a.beforeHash, 'Mixed/changed content needs manual recovery; no force restore is offered.')
        const result: Attempt = { ...a, outcome: hash === a.afterHash ? 'observed-applied' : 'observed-not-written', afterDigest: r.digest, finishedAt: now(), detail: `Observed and confirmed by ${actor}. Content matches ${hash === a.afterHash ? 'after' : 'before'}; not proof of who wrote it.` }
        await persist({ ...book!, attempts: book!.attempts.map(x => x.id === a.id ? result : x) })
      } finally { await release() }
    }),
    decidePromotion: (id: string, decision: 'approved-scope' | 'rejected', actor: string) => command(async () => {
      check(actor.trim(), 'Actor is required.')
      const p = proposal(id); check(p.promotion && p.promotion.decision === 'pending', 'Knowledge scope already decided.')
      // Approval is a review of this exact scope, never a global knowledge write.
      await persist({ ...book!, proposals: book!.proposals.map(x => x.id === id ? { ...x, promotion: { ...x.promotion!, decision, decidedBy: actor, decidedAt: now() } } : x) })
    }),
    dispose: () => { disposed = true },
  }
}
