import { describe, expect, it } from 'vitest'
import fixture from './fixtures/knowledge-projection-v2.json'
import { academicGraph } from '../src/features/resources/knowledge-graph-layout'
import { assembleKnowledgePages, KnowledgePageCollector, knowledgeQueryIdentity, normalizeKnowledgeInspection, readCompleteKnowledgeGraph, type KnowledgePage } from '../src/features/resources/knowledge-snapshot'
import { decodeKnowledgeView, emptyKnowledgeView } from '../src/features/resources/knowledge-view-state'

const pages = () => structuredClone(fixture) as KnowledgePage[]

describe('knowledge view on the integrated projection contract', () => {
  it('keeps assertion identities and provenance in the presentation', async () => {
    const page = await assembleKnowledgePages(pages())
    expect(academicGraph(page).edges.map(e => e.resourceId)).toEqual(page.edges.map(e => e.id))
    expect(academicGraph(page).edges.map(e => e.sourceRevision)).toEqual(page.edges.map(e => e.sourceRevision))
  })
  it('normalizes only Inspect null relations, not graph pages', () => {
    const page = pages()[0]
    expect(normalizeKnowledgeInspection({ snapshot: page.snapshot, node: page.nodes[0], outgoing: null, incoming: null }, page.nodes[0].id, page.snapshot).outgoing).toEqual([])
    expect(() => new KnowledgePageCollector().add({ ...page, edges: null })).toThrow()
  })
  it('matches Go trimming instead of treating BOM as whitespace', async () => {
    expect(await knowledgeQueryIdentity({ query: '\u0085title:A\u3000' })).toBe(await knowledgeQueryIdentity({ query: 'title:A' }))
    expect(await knowledgeQueryIdentity({ query: '\ufefftitle:A' })).not.toBe(await knowledgeQueryIdentity({ query: 'title:A' }))
  })
  it('rejects late responses from readers ignoring cancellation', async () => {
    const controller = new AbortController()
    await expect(readCompleteKnowledgeGraph(async () => { controller.abort(); return pages()[0] }, { limit: 2 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('does not revive cached content or permission decisions from view storage', () => {
    const state = { ...emptyKnowledgeView(), focus: 'memory/a.md', camera: { x: -10, y: 20, k: 1.5 } }
    expect(decodeKnowledgeView(JSON.stringify({ ...state, nodes: ['private'], authorized: true }))).toEqual(state)
    expect(decodeKnowledgeView('{broken')).toEqual(emptyKnowledgeView())
  })
})
