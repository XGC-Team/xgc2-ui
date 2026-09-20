import { describe, expect, it } from 'vitest'
import { knowledgePromotionDigest, knowledgePromotionIntent, validateKnowledgePromotion, type KnowledgePromotion } from '../src/features/resources/knowledge-promotion'

const scope = { projectId: 'project', workspace: 'paper-example' }
const promotion: KnowledgePromotion = {
  destination: 'global-knowledge', scope: '跨项目复用', conditions: '仅在 α > 0',
  verification: 'unverified: agent inference', decision: 'pending',
  candidate: { kind: 'method', body: 'A reusable result.\nSecond line.', evidence: [
    { workspace: 'paper-example', path: 'notes/source.md', digest: 'sha256:abc', anchor: '{"line":3,"quote":"α"}' },
  ] },
}

describe('knowledge promotion consent contract', () => {
  it('matches the backend UTF-8 length-prefixed fingerprint vector', async () => {
    expect(new TextEncoder().encode(knowledgePromotionIntent(scope, 'proposal-1', promotion))).toHaveLength(273)
    expect(await knowledgePromotionDigest(scope, 'proposal-1', promotion)).toBe('sha256:3636551e024eec91751046a3286cf1a6d3928532a777f272c89372b077aca4e2')
  })
  it.each(['scope', 'conditions', 'verification'] as const)('invalidates confirmation when %s changes', async field => {
    expect(await knowledgePromotionDigest(scope, 'proposal-1', {...promotion, [field]: promotion[field] + ' changed'}))
      .not.toBe(await knowledgePromotionDigest(scope, 'proposal-1', promotion))
  })
  it('binds candidate content, evidence revision, project and proposal identity', async () => {
    const base = await knowledgePromotionDigest(scope, 'proposal-1', promotion)
    expect(await knowledgePromotionDigest(scope, 'proposal-1', {...promotion, candidate: {...promotion.candidate, body: 'changed'}})).not.toBe(base)
    expect(await knowledgePromotionDigest(scope, 'proposal-1', {...promotion, candidate: {...promotion.candidate, evidence: [{...promotion.candidate.evidence[0], digest: 'sha256:new'}]}})).not.toBe(base)
    expect(await knowledgePromotionDigest({...scope, projectId: 'other'}, 'proposal-1', promotion)).not.toBe(base)
    expect(await knowledgePromotionDigest(scope, 'proposal-2', promotion)).not.toBe(base)
  })
  it('does not include decision metadata in the intent being approved', async () => {
    expect(await knowledgePromotionDigest(scope, 'proposal-1', {...promotion, decision: 'approved-scope', decidedBy: 'human:reviewer', decidedAt: '2026-09-20T00:00:00Z'}))
      .toBe(await knowledgePromotionDigest(scope, 'proposal-1', promotion))
  })
  it('refuses absent candidate content, evidence and path traversal', () => {
    expect(() => validateKnowledgePromotion({...promotion, candidate: undefined} as unknown as KnowledgePromotion)).toThrow()
    expect(() => validateKnowledgePromotion({...promotion, candidate: {...promotion.candidate, evidence: []}})).toThrow()
    expect(() => validateKnowledgePromotion({...promotion, candidate: {...promotion.candidate, evidence: [{...promotion.candidate.evidence[0], path: '../escape.md'}]}})).toThrow()
  })
})
