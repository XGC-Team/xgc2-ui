/** The file projection wire contract. View/layout state is never an authority. */
export const KNOWLEDGE_GRAPH_SCHEMA = 'research.knowledge-graph/v2'
export type KnowledgeNode = {
  id: string; path?: string; title: string; digest?: string; kind: string; tags?: string[]
  exists: boolean; attachment?: boolean; unresolved: boolean; orphan: boolean
}
export type KnowledgeEdge = {
  id: string; source: string; target: string; kind: string; resolved: boolean; self: boolean
  sourceRevision?: string; anchor?: string; targetHint?: string
}
export type KnowledgePage = {
  schemaVersion: string; snapshot: string; scope: string; queryId: string; projectionDigest: string; offset: number
  complete: boolean; incompleteReason?: string; query?: string; focus?: string; depth?: number; nextCursor?: string
  counts: { nodes: number; edges: number; unresolved: number; orphans: number; matched: number; matchedEdges: number }
  nodes: KnowledgeNode[]; edges: KnowledgeEdge[]
}
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
const fail = (message: string): never => { throw new Error(`Knowledge graph: ${message}`) }
function check(value: unknown, message: string): asserts value { if (!value) fail(message) }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const optionalText = (v: unknown) => v === undefined || typeof v === 'string'
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
const digest = (v: unknown) => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v)

/** Go string ordering is UTF-8/code-point ordering, not JS locale or UTF-16 ordering. */
export function compareKnowledgeIDs(a: string, b: string): number {
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!, y = b.codePointAt(j)!
    if (x !== y) return x - y
    i += x > 0xffff ? 2 : 1; j += y > 0xffff ? 2 : 1
  }
  return (a.length - i) - (b.length - j)
}

export function validateKnowledgePage(value: unknown): asserts value is KnowledgePage {
  check(object(value) && value.schemaVersion === KNOWLEDGE_GRAPH_SCHEMA, 'unsupported snapshot protocol.')
  check(digest(value.snapshot) && digest(value.queryId) && digest(value.projectionDigest), 'missing snapshot/query/set identity.')
  check(value.scope === 'knowledge' || value.scope === 'all', 'unknown scope.')
  check(integer(value.offset) && typeof value.complete === 'boolean', 'invalid page position.')
  check(optionalText(value.query) && optionalText(value.focus) && (value.depth === undefined || integer(value.depth)), 'invalid query metadata.')
  check(value.incompleteReason === undefined || value.incompleteReason === 'page', 'retrieval is incomplete.')
  check(value.nextCursor === undefined || (text(value.nextCursor) && /^[A-Za-z0-9_-]+$/.test(value.nextCursor)), 'invalid cursor.')
  const counts = value.counts
  check(object(counts) && ['nodes', 'edges', 'unresolved', 'orphans', 'matched', 'matchedEdges'].every(k => integer(counts[k])), 'invalid counts.')
  check(Number(counts.matched) <= Number(counts.nodes) && Number(counts.matchedEdges) <= Number(counts.edges) && Number(counts.orphans) <= Number(counts.matched) && Number(counts.unresolved) <= Number(counts.matched), 'inconsistent counts.')
  check(Array.isArray(value.nodes) && Array.isArray(value.edges), 'missing node/edge arrays.')
  for (const n of value.nodes) {
    check(object(n) && text(n.id) && typeof n.title === 'string' && text(n.kind), 'invalid node.')
    check(typeof n.exists === 'boolean' && typeof n.unresolved === 'boolean' && n.exists !== n.unresolved && typeof n.orphan === 'boolean', 'invalid node state.')
    check(n.attachment === undefined || typeof n.attachment === 'boolean', 'invalid attachment state.')
    check(optionalText(n.path) && optionalText(n.digest) && (!n.exists || (n.path === n.id && digest(n.digest))), 'invalid file identity/revision.')
    check(n.tags === undefined || (Array.isArray(n.tags) && n.tags.every(text)), 'invalid tags.')
  }
  for (const e of value.edges) {
    check(object(e) && ['id', 'source', 'target', 'kind'].every(k => text(e[k])), 'invalid assertion identity.')
    check(typeof e.resolved === 'boolean' && typeof e.self === 'boolean' && e.self === (e.source === e.target), 'invalid assertion state.')
    check(digest(e.sourceRevision) && optionalText(e.anchor) && optionalText(e.targetHint), 'invalid assertion provenance.')
  }
}

/** Same length-prefixed UTF-8 fields as internal/knowledge/projection.go. */
export async function knowledgeProjectionDigest(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): Promise<string> {
  const fields = [KNOWLEDGE_GRAPH_SCHEMA, 'nodes', String(nodes.length)]
  for (const n of nodes) {
    fields.push(n.id, n.path || '', n.title, n.digest || '', n.kind, String(n.exists), String(n.attachment ?? false),
      String(n.unresolved), String(n.orphan), String(n.tags?.length || 0), ...(n.tags || []))
  }
  fields.push('edges', String(edges.length))
  for (const e of edges) fields.push(e.id, e.source, e.target, e.kind, String(e.resolved), String(e.self), e.sourceRevision || '', e.anchor || '', e.targetHint || '')
  return digestFields(fields)
}

async function digestFields(fields: string[]): Promise<string> {
  const encoder = new TextEncoder()
  const framed = fields.map(field => `${encoder.encode(field).byteLength}:${field}`).join('')
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(framed))
  return 'sha256:' + [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Verify the first page against the requested filters, not just later pages against it. */
export async function knowledgeQueryIdentity(query: KnowledgeQuery): Promise<string> {
  const tags = [...new Set(query.tags || [])].sort(compareKnowledgeIDs)
  const focus = query.focus || ''
  const depth = focus && !query.depth ? 1 : (query.depth || 0)
  return digestFields([KNOWLEDGE_GRAPH_SCHEMA, query.scope || 'knowledge', (query.query || '').trim(),
    query.unresolved || 'include', query.orphans || 'include', focus, String(depth), query.direction || 'both',
    String(query.limit || 2000), String(tags.length), ...tags])
}

/** Validate BEFORE requesting a successor, so a repeated cursor cannot loop forever. */
export class KnowledgePageCollector {
  private first?: KnowledgePage
  private nodes = new Map<string, KnowledgeNode>()
  private edges = new Map<string, KnowledgeEdge>()
  private cursors = new Set<string>()
  private terminal = false
  private lastID = ''

  add(value: unknown): KnowledgePage {
    validateKnowledgePage(value)
    const page = structuredClone(value)
    check(!this.terminal, 'page received after the terminal page.')
    check(page.offset === this.nodes.size, 'page gap or overlap.')
    if (!this.first) this.first = page
    const first = this.first
    check(page.snapshot === first.snapshot && page.queryId === first.queryId && page.scope === first.scope && page.projectionDigest === first.projectionDigest &&
      (page.query || '') === (first.query || '') && (page.focus || '') === (first.focus || '') && (page.depth || 0) === (first.depth || 0), 'snapshot or query changed while paging.')
    for (const key of ['nodes', 'edges', 'unresolved', 'orphans', 'matched', 'matchedEdges'] as const) check(page.counts[key] === first.counts[key], 'counts changed while paging.')
    const end = page.offset + page.nodes.length
    check(end <= first.counts.matched, 'page exceeds the declared set.')
    const more = !!page.nextCursor
    check(more ? (page.nodes.length > 0 && end < first.counts.matched) : end === first.counts.matched, 'missing or invalid successor.')
    check(page.complete === (page.offset === 0 && end === first.counts.matched), 'false completeness declaration.')
    check(page.complete ? page.incompleteReason === undefined : page.incompleteReason === 'page', 'invalid completion reason.')
    if (page.nextCursor) {
      check(!this.cursors.has(page.nextCursor), 'cursor repeated.')
      this.cursors.add(page.nextCursor)
    }
    const sources = new Set<string>()
    for (const node of page.nodes) {
      check(!this.nodes.has(node.id) && (!this.lastID || compareKnowledgeIDs(this.lastID, node.id) < 0), 'duplicate or unordered node.')
      this.nodes.set(node.id, node); sources.add(node.id); this.lastID = node.id
    }
    for (const edge of page.edges) {
      check(sources.has(edge.source), 'assertion is not owned by its source page.')
      check(!this.edges.has(edge.id), 'duplicate assertion.')
      this.edges.set(edge.id, edge)
    }
    check(this.edges.size <= first.counts.matchedEdges, 'too many assertions.')
    this.terminal = !more
    return page
  }

  async finish(): Promise<KnowledgePage> {
    const first = this.first
    check(first && this.terminal, 'snapshot is not fully retrieved.')
    check(this.nodes.size === first.counts.matched && this.edges.size === first.counts.matchedEdges, 'incomplete node/assertion set.')
    let orphans = 0, unresolved = 0
    for (const node of this.nodes.values()) { if (node.orphan) orphans++; if (node.unresolved) unresolved++ }
    check(orphans === first.counts.orphans && unresolved === first.counts.unresolved, 'node counts disagree with the projection.')
    for (const edge of this.edges.values()) {
      const source = this.nodes.get(edge.source), target = this.nodes.get(edge.target)
      check(source?.exists && target && edge.sourceRevision === source.digest && edge.resolved === target.exists, 'missing endpoint or incorrect source revision.')
    }
    const nodes = [...this.nodes.values()]
    const edges = [...this.edges.values()].sort((a, b) => compareKnowledgeIDs(a.id, b.id))
    check(await knowledgeProjectionDigest(nodes, edges) === first.projectionDigest, 'logical set digest mismatch.')
    return { ...first, offset: 0, complete: true, incompleteReason: undefined, nextCursor: undefined, nodes, edges }
  }
}

export async function assembleKnowledgePages(pages: KnowledgePage[]): Promise<KnowledgePage> {
  const collector = new KnowledgePageCollector()
  for (const page of pages) collector.add(page)
  return collector.finish()
}
