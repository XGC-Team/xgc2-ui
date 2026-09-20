import { request } from '../../lib/api'
import { validateKnowledgePage, knowledgeQueryIdentity, trimKnowledgeQuery, readCompleteKnowledgeGraph, normalizeKnowledgeInspection, type KnowledgeQuery, type KnowledgePage } from './knowledge-snapshot'
export { KNOWLEDGE_GRAPH_SCHEMA, assembleKnowledgePages } from './knowledge-snapshot'
export type { KnowledgeNode, KnowledgeEdge, KnowledgePage, KnowledgeQuery } from './knowledge-snapshot'
export { academicGraph } from './knowledge-graph-layout'

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
  signal?.throwIfAborted()
  const original = { ...query, tags: query.tags?.slice() }
  const page = await request<unknown>(`/workspaces/academic/knowledge-graph?${queryString(original)}`, { signal })
  signal?.throwIfAborted()
  validateKnowledgePage(page)
  const queryId = await knowledgeQueryIdentity(original)
  signal?.throwIfAborted()
  if (page.queryId !== queryId) throw new Error('Knowledge graph response belongs to a different query.')
  if (page.scope !== (original.scope || 'knowledge') || (page.query || '') !== trimKnowledgeQuery(original.query || '') ||
    (page.focus || '') !== (original.focus || '') || (original.snapshot && page.snapshot !== original.snapshot)) {
    throw new Error('Knowledge graph response belongs to a different request.')
  }
  return page
}

export function loadCompleteKnowledgeGraph(query: KnowledgeQuery = {}, signal?: AbortSignal): Promise<KnowledgePage> {
  return readCompleteKnowledgeGraph(loadKnowledgePage, query, signal)
}

export async function loadAcademicNotes(signal: AbortSignal, scope = 'knowledge'): Promise<AcademicNote[]> {
  return notesFromPage(await loadCompleteKnowledgeGraph({ scope }, signal))
}

export async function inspectKnowledgeResource(id: string, snapshot?: string, signal?: AbortSignal, scope = 'knowledge') {
  const params = new URLSearchParams({ id, scope })
  if (snapshot) params.set('snapshot', snapshot)
  const value = await request<unknown>(`/workspaces/academic/knowledge-graph/inspect?${params}`, { signal })
  signal?.throwIfAborted()
  return normalizeKnowledgeInspection(value, id, snapshot)
}
