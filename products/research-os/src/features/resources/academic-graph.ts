import { request } from '../../lib/api'
import type { GraphData, GroupId } from '../../lib/graph'
import { KnowledgePageCollector, validateKnowledgePage, knowledgeQueryIdentity, trimKnowledgeQuery, type KnowledgeQuery, type KnowledgeNode, type KnowledgeEdge, type KnowledgePage } from './knowledge-snapshot'
export { KNOWLEDGE_GRAPH_SCHEMA, assembleKnowledgePages } from './knowledge-snapshot'
export type { KnowledgeNode, KnowledgeEdge, KnowledgePage, KnowledgeQuery } from './knowledge-snapshot'

export type AcademicNote = { path: string; digest: string; title: string; kind?: string; tags?: string[] }

export function noteTitle(path: string, content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.split('/').pop()!.replace(/\.md$/i, '')
}

export function notesFromPage(page: KnowledgePage): AcademicNote[] {
  if (!page.complete) throw new Error('Knowledge graph is incomplete; file tree was not replaced.')
  return page.nodes.filter(node => node.exists && node.path).map(node => ({
    path: node.path!, digest: node.digest!, title: node.title, kind: node.kind, tags: node.tags,
  }))
}

function queryString(query: KnowledgeQuery = {}) {
  const params = new URLSearchParams()
  params.set('scope', query.scope || 'knowledge')
  if (query.query) params.set('q', query.query)
  if (query.unresolved) params.set('unresolved', query.unresolved)
  if (query.orphans) params.set('orphans', query.orphans)
  for (const tag of query.tags || []) params.append('tag', tag)
  if (query.focus) params.set('focus', query.focus)
  if (query.depth !== undefined) params.set('depth', String(query.depth))
  if (query.direction) params.set('direction', query.direction)
  if (query.snapshot) params.set('snapshot', query.snapshot)
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  return params.toString()
}

export async function loadKnowledgePage(query: KnowledgeQuery = {}, signal?: AbortSignal): Promise<KnowledgePage> {
  const page = await request<unknown>(`/workspaces/academic/knowledge-graph?${queryString(query)}`, { signal })
  validateKnowledgePage(page)
  if (page.queryId !== await knowledgeQueryIdentity(query)) throw new Error('Knowledge graph response belongs to a different query.')
  if (page.scope !== (query.scope || 'knowledge') || (page.query || '') !== trimKnowledgeQuery(query.query || '') ||
    (page.focus || '') !== (query.focus || '') || (query.snapshot && page.snapshot !== query.snapshot)) {
    throw new Error('Knowledge graph response belongs to a different request.')
  }
  return page
}

export const KNOWLEDGE_PAGE_LIMIT = 5000

export async function loadCompleteKnowledgeGraph(query: KnowledgeQuery = {}, signal?: AbortSignal): Promise<KnowledgePage> {
  const collector = new KnowledgePageCollector()
  // Capture caller-owned arrays too: changing the query mid-flight starts a new retrieval.
  // The service's maximum page (MaxPageLimit = 5000): a ten-thousand-note vault is three round trips, not six.
  const original = { ...query, limit: query.limit ?? KNOWLEDGE_PAGE_LIMIT, tags: query.tags?.slice(), cursor: undefined }
  let next: KnowledgeQuery = original
  for (;;) {
    signal?.throwIfAborted()
    const page = collector.add(await loadKnowledgePage(next, signal))
    signal?.throwIfAborted()
    if (!page.nextCursor) break
    next = { ...original, snapshot: page.snapshot, cursor: page.nextCursor }
  }
  const result = await collector.finish()
  signal?.throwIfAborted()
  return result
}

export async function loadAcademicNotes(signal: AbortSignal, scope = 'knowledge'): Promise<AcademicNote[]> {
  return notesFromPage(await loadCompleteKnowledgeGraph({ scope }, signal))
}

export async function inspectKnowledgeResource(id: string, snapshot?: string, signal?: AbortSignal, scope = 'knowledge') {
  const params = new URLSearchParams({ id, scope })
  if (snapshot) params.set('snapshot', snapshot)
  const inspection = await request<{ snapshot: string; node: KnowledgeNode; outgoing: KnowledgeEdge[] | null; incoming: KnowledgeEdge[] | null }>(
    `/workspaces/academic/knowledge-graph/inspect?${params}`, { signal })
  signal?.throwIfAborted()
  if (!inspection || inspection.node?.id !== id || (snapshot && inspection.snapshot !== snapshot) ||
    ![inspection.outgoing, inspection.incoming].every(list => list === null || Array.isArray(list))) throw new Error('Knowledge inspection returned a different resource or snapshot.')
  // The current Go inspection endpoint emits nil slices for empty relations.
  const outgoing = inspection.outgoing ?? [], incoming = inspection.incoming ?? []
  if (outgoing.some(edge => edge.source !== id) || incoming.some(edge => edge.target !== id)) throw new Error('Knowledge inspection returned unrelated assertions.')
  return { ...inspection, outgoing, incoming }

}

function groupOf(node: KnowledgeNode): GroupId {
  if (node.kind === 'paper' || node.kind === 'concept' || node.kind === 'project' || node.kind === 'note') return node.kind
  const name = (node.path || node.id).split('/').pop() || ''
  if (name.startsWith('paper-')) return 'project'
  if (name.startsWith('lit-') || (node.path || '').includes('monograph')) return 'paper'
  if ((node.path || '').includes('/ontology/')) return 'concept'
  return 'note'
}

export function academicGraph(page: KnowledgePage): GraphData {
  if (!page.complete) throw new Error('Incomplete knowledge graph cannot be rendered as the library.')
  const index = new Map(page.nodes.map((node, i) => [node.id, i]))
  if (index.size !== page.nodes.length) throw new Error('Duplicate knowledge node.')
  const adj = new Map<number, number[]>()
  const degrees = Array<number>(page.nodes.length).fill(0)
  const edges: GraphData['edges'] = []
  const appendNeighbor = (a: number, b: number) => {
    const neighbors = adj.get(a)
    if (neighbors) neighbors.push(b)
    else adj.set(a, [b])
  }
  for (const edge of page.edges) {
    const s = index.get(edge.source), t = index.get(edge.target)
    if (s === undefined || t === undefined) throw new Error('Knowledge assertion has a missing endpoint.')
    edges.push({ s, t, self: edge.self, directed: true, kind: edge.kind, resolved: edge.resolved, resourceId: edge.id, sourceRevision: edge.sourceRevision, anchor: edge.anchor, targetHint: edge.targetHint })
    degrees[s]++
    if (s !== t) { degrees[t]++; appendNeighbor(s, t); appendNeighbor(t, s) }
  }
  return {
    complete: true, snapshot: page.snapshot, edges, adj,
    nodes: page.nodes.map((node, id) => {
      const degree = degrees[id]
      const angle = id * 2.39996323, radius = 45 * Math.sqrt(id + 1)
      return {
        id, label: node.title, group: groupOf(node), degree, hub: degree >= 8,
        x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0,
        r: Math.min(10, 3 + Math.sqrt(degree)), mass: 1,
        unresolved: node.unresolved, resourceId: node.id, path: node.path, kind: node.kind,
      }
    }),
  }
}
