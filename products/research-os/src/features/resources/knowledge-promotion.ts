/** Knowledge is written by the domain executor; the existing review journal owns consent. */
export const KNOWLEDGE_PROMOTION_SCHEMA = 'research.knowledge-promotion/v1'
export const KNOWLEDGE_KINDS = ['note', 'concept', 'method', 'team', 'direction', 'problem-stage', 'idea', 'hypothesis', 'code', 'experiment-result', 'figure', 'manuscript', 'paper'] as const
export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number]
export type KnowledgeSource = {
  workspace: string
  path: string
  digest: string
  /** An owner-issued anchor or serialized source anchor, not an inferred semantic relationship. */
  anchor: string
}
export type KnowledgeCandidate = { kind: KnowledgeKind; body: string; evidence: KnowledgeSource[] }
export type KnowledgePromotion = {
  destination: 'global-knowledge'
  scope: string
  conditions: string
  verification: string
  candidate: KnowledgeCandidate
  decision: 'pending' | 'approved-scope' | 'rejected'
  decidedBy?: string
  decidedAt?: string
  /** Fingerprint of the exact candidate/scope/evidence reviewed by the user. */
  approvalDigest?: string
}
export type PromotionScope = { projectId: string; workspace: string }
export type PromotionReceipt = {
  schemaVersion: typeof KNOWLEDGE_PROMOTION_SCHEMA
  outcome: 'written' | 'already-written' | 'conflict' | 'not-written' | 'uncertain'
  intentDigest: string
  document?: { workspace: 'academic'; path: string; digest: string }
  source: PromotionScope & { path: 'research-reviews.json'; digest: string; proposalId: string }
  detail?: string
}

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const safePath = (value: unknown): value is string => nonempty(value) && !/[\\\u0000-\u001f\u007f]/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..')
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }

export function validateKnowledgePromotion(value: KnowledgePromotion): void {
  requireValue(value && value.destination === 'global-knowledge', 'Knowledge destination must be explicit.')
  requireValue(nonempty(value.scope) && nonempty(value.conditions) && nonempty(value.verification), 'Scope, applicability and verification state are required.')
  requireValue(['pending', 'approved-scope', 'rejected'].includes(value.decision), 'Unknown knowledge decision.')
  const candidate = value.candidate
  requireValue(candidate && KNOWLEDGE_KINDS.includes(candidate.kind) && nonempty(candidate.body), 'A knowledge candidate needs its own kind and text.')
  requireValue(Array.isArray(candidate.evidence) && candidate.evidence.length > 0, 'Knowledge needs versioned source evidence.')
  for (const source of candidate.evidence) {
    requireValue(source && nonempty(source.workspace) && safePath(source.path) && nonempty(source.digest) && nonempty(source.anchor), 'Every evidence reference needs workspace, path, observed revision and anchor.')
  }
}

/**
 * Cross-language canonical encoding: ordered, UTF-8 byte-length-prefixed strings.
 * Do not JSON-hash objects: key order, escaping and float rendering vary across runtimes.
 * The opaque source anchor is stored once with the candidate and covered byte-for-byte.
 */
export function knowledgePromotionIntent(scope: PromotionScope, proposalId: string, promotion: KnowledgePromotion): string {
  validateKnowledgePromotion(promotion)
  requireValue(identifier(scope.projectId) && identifier(scope.workspace) && identifier(proposalId), 'Invalid promotion scope or proposal identity.')
  const values = [KNOWLEDGE_PROMOTION_SCHEMA, scope.projectId, scope.workspace, proposalId,
    promotion.destination, promotion.scope, promotion.conditions, promotion.verification,
    promotion.candidate.kind, promotion.candidate.body, String(promotion.candidate.evidence.length)]
  for (const source of promotion.candidate.evidence) values.push(source.workspace, source.path, source.digest, source.anchor)
  const encoder = new TextEncoder()
  return values.map(value => `${encoder.encode(value).byteLength}:${value}`).join('')
}

export async function knowledgePromotionDigest(scope: PromotionScope, proposalId: string, promotion: KnowledgePromotion): Promise<string> {
  const bytes = new TextEncoder().encode(knowledgePromotionIntent(scope, proposalId, promotion))
  return 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
