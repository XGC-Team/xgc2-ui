import { fileKey, type Attempt, type Proposal, type ReviewBook, type Scope } from './review-model.ts'
import type { ReviewBatchListener, ReviewBatchReceipt, ReviewFileReceipt } from './writing-contract.ts'

const listeners = new Set<ReviewBatchListener>()
export function subscribeReviewBatches(listener: ReviewBatchListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
/** In-process facts, not an outbox or replay queue. Consumers deduplicate batchId
 * and verify their own current project/source revisions before acting.
 */
export function publishReviewBatch(receipt: ReviewBatchReceipt): string[] {
  const errors: string[] = []
  for (const listener of listeners) {
    try { listener(structuredClone(receipt)) } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
  }
  return errors
}

export function reviewBatchReceipt(scope: Scope, proposal: Proposal, ids: string[], mode: 'apply' | 'revert', batchId: string,
  attempts: Attempt[], notDispatched: NonNullable<ReviewBook['notDispatched']>, auditConfirmed: boolean, cancelled: boolean): ReviewBatchReceipt {
  const groups = new Map<string, typeof proposal.operations>()
  for (const operation of proposal.operations.filter(o => ids.includes(o.id))) {
    const key = fileKey(operation.target)
    groups.set(key, [...(groups.get(key) || []), operation])
  }
  const files: ReviewFileReceipt[] = [], saved: ReviewBatchReceipt['saved'] = []
  for (const operations of groups.values()) {
    const { workspace, path } = operations[0].target, operationIds = operations.map(o => o.id)
    const attempt = [...attempts].reverse().find(a => a.proposalId === proposal.id && a.mode === mode && fileKey(a) === fileKey(operations[0].target))
    const refused = [...notDispatched].reverse().find(n => n.proposalId === proposal.id && n.mode === mode && n.operationIds.some(id => operationIds.includes(id)))
    files.push({ workspace, path, operationIds, outcome: attempt?.outcome || 'not-dispatched',
      ...(attempt ? { attempt: structuredClone(attempt), detail: attempt.detail } : { detail: refused?.detail || 'No target write dispatched for this group.' }) })
    if (attempt && ['applied', 'reverted'].includes(attempt.outcome) && attempt.afterDigest) {
      saved.push({ attempt: structuredClone(attempt), operations: structuredClone(operations) })
    }
  }
  // Refused/unchanged selected ranges are explicit rows, even when another range
  // in the same file was saved. They must not disappear behind a successful CAS.
  if (mode === 'apply') for (const result of proposal.writing?.result?.sources || []) {
    if (result.status === 'replace') continue
    const source = proposal.writing!.selection.sources.find(s => s.id === result.sourceId)!
    files.push({ workspace: source.anchor.workspace, path: source.anchor.path, operationIds: [source.id], outcome: result.status, detail: result.reason })
  }
  const unknown = !auditConfirmed || files.some(f => ['pending', 'uncertain'].includes(f.outcome))
  const unsuccessful = files.some(f => !['applied', 'reverted', 'unchanged'].includes(f.outcome))
  return { version: 1, batchId, scope: { ...scope }, proposalId: proposal.id, mode, files, saved, auditConfirmed,
    status: unknown ? 'uncertain' : cancelled ? 'cancelled' : !saved.length ? 'not-written' : unsuccessful ? 'partial' : 'applied' }
}

/** B consumes this. Missing/observed receipts never become compile facts. */
export function writingBatchSaved(receipt: ReviewBatchReceipt) {
  const changes = receipt.saved
    .filter(item => item.attempt.outcome === 'applied' && item.attempt.afterDigest)
    .map(item => ({ path: item.attempt.path, digest: item.attempt.afterDigest! }))
  if (!changes.length) return
  return { workspace: receipt.scope.workspace, changes, batchId: receipt.batchId, proposalId: receipt.proposalId }
}

export const subscribeWritingBatches = subscribeReviewBatches

/** Recovery is a projection of the journal, never a replay of source writes or
 * compilation events. A missing/observed receipt is not promoted to a save.
 */
export function writingHistoryReceipt(book: ReviewBook, proposalId: string): ReviewBatchReceipt | null {
  const proposal = book.proposals.find(p => p.id === proposalId)
  if (!proposal?.writing?.confirmation) return null
  return reviewBatchReceipt(book, proposal, proposal.operations.map(o => o.id), 'apply', proposal.writing.confirmation.id,
    book.attempts.filter(a => a.proposalId === proposalId), (book.notDispatched || []).filter(a => a.proposalId === proposalId),
    proposal.writing.status !== 'uncertain' && !book.attempts.some(a => a.proposalId === proposalId && ['pending', 'uncertain'].includes(a.outcome)), proposal.writing.status === 'cancelled')
}
