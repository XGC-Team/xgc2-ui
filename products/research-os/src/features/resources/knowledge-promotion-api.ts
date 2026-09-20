import { APIError, request } from '../../lib/api'
import { KNOWLEDGE_PROMOTION_SCHEMA, type PromotionReceipt, type PromotionScope } from './knowledge-promotion'

export class KnowledgePromotionError extends Error {
  constructor(message: string, readonly outcome: 'not-written' | 'uncertain') { super(message); this.name = 'KnowledgePromotionError' }
}

/** No optimistic success or automatic retry: only the executor can issue a saved-file receipt. */
export async function applyKnowledgePromotion(scope: PromotionScope, proposalId: string, expectedReviewDigest: string, signal?: AbortSignal): Promise<PromotionReceipt> {
  if (!expectedReviewDigest.trim()) throw new Error('Read the current review journal before applying knowledge.')
  if (signal?.aborted) throw new KnowledgePromotionError('Knowledge request was cancelled before dispatch.', 'not-written')
  let receipt: PromotionReceipt
  try {
    receipt = await request<PromotionReceipt>(`/workspaces/${encodeURIComponent(scope.workspace)}/knowledge-promotions/${encodeURIComponent(proposalId)}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, signal,
      body: JSON.stringify({projectId: scope.projectId, expectedReviewDigest}),
    })
  } catch (error) {
    const refused = error instanceof APIError && error.status >= 400 && error.status < 500
    throw new KnowledgePromotionError(error instanceof Error ? error.message : 'Knowledge request failed.', refused ? 'not-written' : 'uncertain')
  }
  if (!receipt || receipt.schemaVersion !== KNOWLEDGE_PROMOTION_SCHEMA || !receipt.source || receipt.source.path !== 'research-reviews.json' || receipt.source.projectId !== scope.projectId || receipt.source.workspace !== scope.workspace || receipt.source.proposalId !== proposalId || receipt.source.digest !== expectedReviewDigest) {
    throw new KnowledgePromotionError('Knowledge outcome is uncertain: the executor returned a foreign or unverifiable receipt. Inspect the target before retrying.', 'uncertain')
  }
  if ((receipt.outcome === 'written' || receipt.outcome === 'already-written') && (!receipt.document?.digest || receipt.document.workspace !== 'academic' || !receipt.document.path.startsWith('memory/'))) {
    throw new KnowledgePromotionError('Knowledge outcome is uncertain: a saved-file receipt is missing. Inspect the target before retrying.', 'uncertain')
  }
  if (!['written', 'already-written', 'conflict', 'not-written', 'uncertain'].includes(receipt.outcome)) throw new KnowledgePromotionError('Unknown knowledge outcome; inspect the target before retrying.', 'uncertain')
  if (typeof window !== 'undefined' && (receipt.outcome === 'written' || receipt.outcome === 'already-written')) window.dispatchEvent(new Event('research:knowledge-changed'))
  return receipt
}
