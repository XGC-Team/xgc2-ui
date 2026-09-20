import type { Anchor, Attempt, Feedback, Operation, Scope } from './review-model.ts'

/** Review-owned authorization snapshot, NOT a second canvas/source-map model.
 * C captures these references from its saved, selected design context. UTF-16
 * source offsets and opaque file digests retain the existing Anchor semantics.
 */
export type WritingSelection = {
  design: { path: 'thinking.canvas.json'; digest: string; cardIds: string[] }
  sources: { id: string; anchor: Anchor }[]
  evidence: Anchor[]
  context: string
}
export type WritingConfirmation = {
  id: string; actor: string; at: string; fingerprint: string
}
export type WritingExecution = {
  sessionId: string; requestKey: string; turnId?: string
}
export type WritingSourceResult = {
  sourceId: string; status: 'replace' | 'unchanged' | 'refused'; reason: string; after?: string
}
export type WritingResult = {
  schema: 'research-writing/result-v1'
  proposalId: string; confirmationId: string; fingerprint: string
  sources: WritingSourceResult[]
}
/** Stored on Proposal in research-reviews.json. No separate approval store. */
export type WritingRecord = {
  version: 1
  selection: WritingSelection
  status: 'proposed' | 'confirmed' | 'running' | 'ready' | 'applying' | 'settled' | 'cancelled' | 'failed' | 'uncertain'
  confirmation?: WritingConfirmation
  execution?: WritingExecution
  result?: WritingResult
  resultDigest?: string
  detail?: string
  cancelled?: { actor: string; at: string; reason: string }
  mapping?: { status: 'pending' | 'updated' | 'failed'; detail?: string; at: string }
}
export type WritingOffer = {
  id: string; author: string; title: string; feedback: Feedback; selection: WritingSelection
}
export type NativeWritingCompletion = {
  sessionId: string; turnId: string
  status: 'completed' | 'failed' | 'cancelled' | 'unknown' | 'incomplete' | 'refused' | 'blocked'
  text: string; truncated: boolean
}
/** Uses the existing connected native session, including its real permission
 * mechanism. requestKey is persisted BEFORE dispatch. No session/job scheduler.
 */
export type WritingNativePort = {
  sessionId: string
  send: (text: string, requestKey: string) => Promise<string>
}
export type ReviewFileReceipt = {
  workspace: string; path: string; operationIds: string[]
  outcome: Attempt['outcome'] | 'not-dispatched' | 'unchanged' | 'refused'
  attempt?: Attempt
  detail?: string
}
/** B consumes saved[] only. It never means the entire batch succeeded.
 * Unknown/missing acknowledgements and observed-applied are NEVER saved facts.
 * C uses the same attempts + operations to update mappings, not chat completion.
 */
export type ReviewBatchReceipt = {
  version: 1; batchId: string; scope: Scope; proposalId: string
  mode: 'apply' | 'revert'; files: ReviewFileReceipt[]
  saved: { attempt: Attempt; operations: Operation[] }[]
  status: 'applied' | 'partial' | 'not-written' | 'uncertain' | 'cancelled'
  auditConfirmed: boolean
}
export type ReviewBatchListener = (receipt: ReviewBatchReceipt) => void

/** Model-authored design differences are admitted to the existing review only;
 * this ingress does not accept text/body operations or an authorization flag.
 * Targets, baseline, feedback and identity come from the captured request.
 */
export type DesignProposalRequest = {
  id: string; scope: Scope; feedback: Feedback
  targets: { id: string; anchor: Anchor }[]
  context: string
}
export type DesignProposalResult = {
  schema: 'research-writing/design-v1'; requestId: string; title: string
  changes: { targetId: string; after: string; reason: string }[]
}
