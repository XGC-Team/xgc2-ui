import { describe, expect, it } from 'vitest'
import { academicGraph, assembleKnowledgePages, notesFromPage, type KnowledgePage } from '../src/features/resources/academic-graph'

const page = (partial: Partial<KnowledgePage> & Pick<KnowledgePage, 'nodes' | 'edges' | 'complete' | 'snapshot'>): KnowledgePage => ({
  schemaVersion: 'research.knowledge-graph/v1',
  scope: 'knowledge',
  counts: { nodes: partial.nodes.length, edges: partial.edges.length, unresolved: partial.nodes.filter(n => n.unresolved).length, orphans: 0, matched: partial.nodes.length },
  ...partial,
})

describe('academic knowledge snapshot consumption', () => {
  it('keeps directed, unresolved and self links instead of folding them', () => {
    const snapshot = page({
      snapshot: 'sha256:a', complete: true,
      nodes: [
        { id: 'memory/now/a.md', path: 'memory/now/a.md', title: 'A', digest: 'sha256:1', kind: 'note', exists: true, unresolved: false, orphan: false },
        { id: 'memory/now/b.md', path: 'memory/now/b.md', title: 'B', digest: 'sha256:2', kind: 'note', exists: true, unresolved: false, orphan: false },
        { id: 'unresolved:memory/now/missing.md', title: 'missing', kind: 'unresolved', exists: false, unresolved: true, orphan: false },
      ],
      edges: [
        { id: 'a>b:wiki:0', source: 'memory/now/a.md', target: 'memory/now/b.md', kind: 'wiki', resolved: true, self: false },
        { id: 'b>a:markdown:0', source: 'memory/now/b.md', target: 'memory/now/a.md', kind: 'markdown', resolved: true, self: false },
        { id: 'a>a:wiki:1', source: 'memory/now/a.md', target: 'memory/now/a.md', kind: 'wiki', resolved: true, self: true },
        { id: 'a>missing:wiki:2', source: 'memory/now/a.md', target: 'unresolved:memory/now/missing.md', kind: 'wiki', resolved: false, self: false },
      ],
    })
    const graph = academicGraph(snapshot)
    expect(graph.complete).toBe(true)
    expect(graph.edges).toHaveLength(4)
    expect(graph.edges.filter(edge => edge.self)).toHaveLength(1)
    expect(graph.nodes.some(node => node.unresolved)).toBe(true)
    expect(notesFromPage(snapshot).map(note => note.path)).toEqual(['memory/now/a.md', 'memory/now/b.md'])
  })

  it('assembles cursor pages and refuses to mark a bounded first page complete', () => {
    const first = page({
      snapshot: 'sha256:a', complete: false, nextCursor: 'memory/now/a.md', incompleteReason: 'page',
      counts: { nodes: 2, edges: 0, unresolved: 0, orphans: 2, matched: 2 },
      nodes: [{ id: 'memory/now/a.md', path: 'memory/now/a.md', title: 'A', digest: 'sha256:1', kind: 'note', exists: true, unresolved: false, orphan: true }],
      edges: [],
    })
    const rest = page({
      snapshot: 'sha256:a', complete: false,
      counts: first.counts,
      nodes: [{ id: 'memory/now/b.md', path: 'memory/now/b.md', title: 'B', digest: 'sha256:2', kind: 'note', exists: true, unresolved: false, orphan: true }],
      edges: [],
    })
    const assembled = assembleKnowledgePages([first, rest])
    expect(assembled.complete).toBe(true)
    expect(assembled.nodes.map(node => node.id)).toEqual(['memory/now/a.md', 'memory/now/b.md'])
    expect(assembleKnowledgePages([first]).complete).toBe(false)
  })

  it('rejects a missing snapshot payload', () => {
    expect(() => assembleKnowledgePages([])).toThrow()
    expect(() => notesFromPage({} as KnowledgePage)).toThrow()
  })
})
