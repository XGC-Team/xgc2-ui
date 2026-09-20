import { describe, expect, it } from 'vitest'
import { decodeKnowledgeView, emptyKnowledgeView } from '../src/features/resources/knowledge-view-state'
import { trimKnowledgeQuery, knowledgeQueryIdentity } from '../src/features/resources/knowledge-snapshot'
import { inspectKnowledgeResource } from '../src/features/resources/academic-graph'

describe('knowledge view integration', () => {
  it('restores view preferences without retaining graph data or permission state', () => {
    const view = { ...emptyKnowledgeView(), query: 'control', camera: { x: 10, y: -8, k: 1.2 } }
    expect(decodeKnowledgeView(JSON.stringify({ ...view, nodes: ['secret'], authorized: true }))).toEqual(view)
    expect(decodeKnowledgeView(JSON.stringify({ ...view, camera: { x: 0, y: 0, k: 0 } }))).toEqual(emptyKnowledgeView())
  })
  it('matches the Go query whitespace contract, including NEL and a significant BOM', async () => {
    expect(trimKnowledgeQuery('\u0085 control \u3000')).toBe('control')
    expect(trimKnowledgeQuery('\ufeffcontrol')).toBe('\ufeffcontrol')
    expect(await knowledgeQueryIdentity({ query: '\u0085control\u0085' })).toBe(await knowledgeQueryIdentity({ query: 'control' }))
    expect(await knowledgeQueryIdentity({ query: '\ufeffcontrol' })).not.toBe(await knowledgeQueryIdentity({ query: 'control' }))
  })
  it('checks exact inspection identity and accepts the producer empty relation slices', async () => {
    const previous = globalThis.fetch
    const payload = { snapshot: 'current', node: { id: 'note' }, outgoing: null, incoming: null }
    globalThis.fetch = async () => new Response(JSON.stringify({ data: payload }), { headers: { 'Content-Type': 'application/json' } })
    try {
      expect(await inspectKnowledgeResource('note', 'current')).toMatchObject({ outgoing: [], incoming: [] })
      await expect(inspectKnowledgeResource('other', 'current')).rejects.toThrow('different resource')
      await expect(inspectKnowledgeResource('note', 'stale')).rejects.toThrow('snapshot')
    } finally { globalThis.fetch = previous }
  })
})
