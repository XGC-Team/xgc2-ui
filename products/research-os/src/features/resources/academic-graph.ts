import { request } from '../../lib/api'
import type { GraphData, GroupId } from '../../lib/graph'

export const KNOWLEDGE_GRAPH_SCHEMA = 'research.knowledge-graph/v1'
export type KnowledgeNode = {
  id: string
  path?: string
  title: string
  digest?: string
  kind: string
  tags?: string[]
  exists: boolean
  unresolved: boolean
  orphan: boolean
}
export type KnowledgeEdge = {
  id: string
  source: string
  target: string
  kind: string
  resolved: boolean
  self: boolean
  sourceRevision?: string
  anchor?: string
  targetHint?: string
}
export type KnowledgePage = {
  schemaVersion: string
  snapshot: string
  scope: string
  complete: boolean
  incompleteReason?: string
  query?: string
  focus?: string
  depth?: number
  nextCursor?: string
  counts: { nodes: number; edges: number; unresolved: number; orphans: number; matched: number }
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
}
export type AcademicNote = { path: string; digest: string; title: string; kind?: string; tags?: string[] }
export type KnowledgeQuery = {
  scope?: string
  query?: string
  unresolved?: 'include' | 'only' | 'exclude'
  orphans?: 'include' | 'only' | 'exclude'
  tags?: string[]
  focus?: string
  depth?: number
  direction?: 'outbound' | 'inbound' | 'both'
  snapshot?: string
  cursor?: string
  limit?: number
}

export function noteTitle(path: string, content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.split('/').pop()!.replace(/\.md$/i, '')
}

export function notesFromPage(page: KnowledgePage): AcademicNote[] {
  return page.nodes.filter(node => node.exists && node.path).map(node => ({
    path: node.path!, digest: node.digest || '', title: node.title, kind: node.kind, tags: node.tags,
  }))
}

export function assembleKnowledgePages(pages: KnowledgePage[]): KnowledgePage {
  if (!pages.length) throw new Error('Knowledge graph returned no snapshot.')
  const first = pages[0]
  if (first.schemaVersion !== KNOWLEDGE_GRAPH_SCHEMA || !first.snapshot || !Array.isArray(first.nodes) || !Array.isArray(first.edges) || !first.counts) {
    throw new Error('Knowledge graph response is not a snapshot.')
  }
  const nodes = new Map<string, KnowledgeNode>()
  const edges = new Map<string, KnowledgeEdge>()
  const cursors = new Set<string>()
  for (const page of pages) {
    if (page.snapshot !== first.snapshot) throw new Error('Knowledge snapshot changed while paging.')
    if (page.nextCursor) {
      if (cursors.has(page.nextCursor)) throw new Error('Knowledge graph cursor repeated; the snapshot is incomplete.')
      cursors.add(page.nextCursor)
    }
    for (const node of page.nodes) nodes.set(node.id, node)
    for (const edge of page.edges) edges.set(edge.id, edge)
  }
  const last = pages[pages.length - 1]
  const assembled = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id))
  const complete = !last.nextCursor && assembled.length === first.counts.matched
  return {
    ...first,
    complete,
    incompleteReason: complete ? undefined : last.incompleteReason || 'page',
    nextCursor: complete ? undefined : last.nextCursor,
    nodes: assembled,
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function queryString(query: KnowledgeQuery = {}) {
  const params = new URLSearchParams()
  params.set('scope', query.scope || 'knowledge')
  if (query.query) params.set('q', query.query)
  if (query.unresolved) params.set('unresolved', query.unresolved)
  if (query.orphans) params.set('orphans', query.orphans)
  for (const tag of query.tags || []) params.append('tag', tag)
  if (query.focus) params.set('focus', query.focus)
  if (query.depth) params.set('depth', String(query.depth))
  if (query.direction) params.set('direction', query.direction)
  if (query.snapshot) params.set('snapshot', query.snapshot)
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  return params.toString()
}

export async function loadKnowledgePage(query: KnowledgeQuery = {}, signal?: AbortSignal): Promise<KnowledgePage> {
  const page = await request<KnowledgePage>(`/workspaces/academic/knowledge-graph?${queryString(query)}`, { signal })
  if (!page || Array.isArray(page) || page.schemaVersion !== KNOWLEDGE_GRAPH_SCHEMA || typeof page.complete !== 'boolean' || !Array.isArray(page.nodes) || !Array.isArray(page.edges)) {
    throw new Error('Knowledge graph response is not a snapshot.')
  }
  return page
}

export async function loadCompleteKnowledgeGraph(query: KnowledgeQuery = {}, signal?: AbortSignal): Promise<KnowledgePage> {
  const pages: KnowledgePage[] = [await loadKnowledgePage({ ...query, cursor: undefined }, signal)]
  while (pages[pages.length - 1].nextCursor) {
    const current = pages[pages.length - 1]
    pages.push(await loadKnowledgePage({ ...query, snapshot: pages[0].snapshot, cursor: current.nextCursor }, signal))
  }
  return assembleKnowledgePages(pages)
}

export async function loadAcademicNotes(signal: AbortSignal, scope = 'knowledge'): Promise<AcademicNote[]> {
  const page = await loadCompleteKnowledgeGraph({ scope }, signal)
  if (!page.complete) throw new Error('Knowledge graph is incomplete; file tree was not substituted from a partial page.')
  return notesFromPage(page)
}

export async function inspectKnowledgeResource(id: string, snapshot?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ id })
  if (snapshot) params.set('snapshot', snapshot)
  return request<{ snapshot: string; node: KnowledgeNode; outgoing: KnowledgeEdge[]; incoming: KnowledgeEdge[] }>(
    `/workspaces/academic/knowledge-graph/inspect?${params}`,
    { signal },
  )
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
  const index = new Map(page.nodes.map((node, i) => [node.id, i]))
  const adj = new Map<number, number[]>()
  const edges: GraphData['edges'] = []
  for (const edge of page.edges) {
    const s = index.get(edge.source)
    const t = index.get(edge.target)
    if (s === undefined || t === undefined) continue
    edges.push({ s, t, self: edge.self, directed: true, kind: edge.kind, resolved: edge.resolved })
    if (s !== t) {
      adj.set(s, [...(adj.get(s) || []), t])
      adj.set(t, [...(adj.get(t) || []), s])
    }
  }
  return {
    complete: page.complete,
    snapshot: page.snapshot,
    edges,
    adj,
    nodes: page.nodes.map((node, id) => {
      const degree = (adj.get(id)?.length || 0) + page.edges.filter(edge => edge.self && edge.source === node.id).length
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
