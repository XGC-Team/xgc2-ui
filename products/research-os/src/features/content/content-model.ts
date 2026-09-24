import type { CanvasNodeV2, CanvasEdgeV2, CanvasEvidence, OutlineArrangement, SourceBinding, ThinkingCanvasV2, WritingConstraints } from '../projects/canvas-model'
import type { DraftBook, DraftScope, ResearchDraft, ObjectLink } from '../projects/draft-model'

export const CONTENT_PATH = 'research-content.json'
// Must match the backend contract (researchcontent.Validate): the server rejects any other object kind.
export const CONTENT_KINDS = ['question', 'claim', 'assumption', 'evidence', 'design', 'note', 'method', 'workflow', 'tool'] as const
export type ContentKind = typeof CONTENT_KINDS[number]
/* Card roles refine a backend kind for the revision logic board without changing the schema:
   a reviewer comment is a question put to the paper, a decision is a claim about what we will do, a constraint is a binding assumption.
   Persisted as an extension field `role`, which the backend preserves. */
export const CARD_ROLES = { revision: 'question', decision: 'claim', constraint: 'assumption' } as const satisfies Record<string, ContentKind>
export type CardRole = keyof typeof CARD_ROLES
export type CardType = ContentKind | CardRole
export const CARD_TYPES: readonly CardType[] = ['question', 'revision', 'claim', 'decision', 'evidence', 'assumption', 'constraint', 'design', 'note', 'method', 'workflow', 'tool']
export const CARD_TYPE_LABELS: Record<'zh' | 'en', Record<CardType, string>> = {
  zh: { question: '问题', claim: '主张', assumption: '假设', evidence: '证据', decision: '决策', constraint: '约束', revision: '修订项', design: '设计', note: '笔记', method: '方法', workflow: '流程', tool: '工具' },
  en: { question: 'Question', claim: 'Claim', assumption: 'Assumption', evidence: 'Evidence', decision: 'Decision', constraint: 'Constraint', revision: 'Revision item', design: 'Design', note: 'Note', method: 'Method', workflow: 'Workflow', tool: 'Tool' },
}
export const isCardType = (value: unknown): value is CardType => (CARD_TYPES as readonly unknown[]).includes(value)
/** The type a card shows: its role when it has a known one, otherwise its backend kind. */
export function cardType(object: { kind: ContentKind; role?: unknown }): CardType {
  return typeof object.role === 'string' && object.role in CARD_ROLES && CARD_ROLES[object.role as CardRole] === object.kind ? object.role as CardRole : object.kind
}
/** Persisted fields for a card type: a backend kind, plus a role when the type is a refinement. */
export function cardTypeFields(type: CardType): { kind: ContentKind; role?: CardRole } {
  return type in CARD_ROLES ? { kind: CARD_ROLES[type as CardRole], role: type as CardRole } : { kind: type as ContentKind }
}
export type ResourceReference = {
  kind: 'content' | 'artifact' | 'file' | 'knowledge' | 'literature' | 'workflow' | 'run' | 'build'
  workspace?: string; path?: string; id?: string; revision?: string; digest?: string
  selector?: { objectId?: string; blockId?: string; start?: number; end?: number; quote?: string; page?: number; buildId?: string }
  [key: string]: unknown
}
export type ContentObject = {
  id: string; kind: ContentKind; title: string; body?: string; sources: ResourceReference[]
  tags?: string[]; status?: string; writing?: WritingConstraints; bindings?: SourceBinding[]; definition?: Record<string, unknown>
  legacyKind?: 'chapter' | 'idea'; [key: string]: unknown
}
export type ContentRelation = {
  id: string; from: ResourceReference; to: ResourceReference
  relation: 'supports' | 'contradicts' | 'depends' | 'exemplifies' | 'continues' | 'cites' | 'questions' | 'verifies' | 'affects'
  [key: string]: unknown
}
export type ContentPlacement = { objectId: string; x: number; y: number; collapsed?: boolean; [key: string]: unknown }
export type ContentDocument = DraftScope & {
  schemaVersion: 'research.content/v1'; objects: ContentObject[]; relations: ContentRelation[]; artifacts: ResearchDraft[]
  views: { canvas: { placements: ContentPlacement[]; connections?: CanvasEdgeV2[]; [key: string]: unknown }; outlines: OutlineArrangement[]; [key: string]: unknown }
  links?: ObjectLink[]; [key: string]: unknown
}
export type LegacySource = { path: string; exists: boolean; digest?: string; changed?: boolean }
export type ContentSnapshot = { content?: string; document: ContentDocument; digest: string; migrationState: 'empty' | 'legacy' | 'migrated' | 'legacy-changed' | 'archived'; legacySources: LegacySource[] }
export type ContentRevision = DraftScope & { digest: string; sizeBytes: number; observedAt: string }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export function parseContentDocument(content: string, scope?: DraftScope): ContentDocument {
  const d: unknown = JSON.parse(content, (_key, value: unknown) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('Research content contains a number that this editor cannot preserve exactly. No changes were saved.')
    return value
  })
  if (!record(d) || d.schemaVersion !== 'research.content/v1' || typeof d.projectId !== 'string' || typeof d.workspace !== 'string' ||
    !Array.isArray(d.objects) || !Array.isArray(d.relations) || !Array.isArray(d.artifacts) || !record(d.views) || !record(d.views.canvas) || !Array.isArray(d.views.canvas.placements) || !Array.isArray(d.views.outlines)) throw new Error('Unsupported research content document.')
  if (scope && (d.projectId !== scope.projectId || d.workspace !== scope.workspace)) throw new Error('Research content belongs to another project or workspace.')
  const ids = new Set<string>()
  for (const object of d.objects) {
    if (!record(object) || typeof object.id !== 'string' || !object.id || ids.has(object.id) || !(CONTENT_KINDS as readonly unknown[]).includes(object.kind) || typeof object.title !== 'string' || !Array.isArray(object.sources)) throw new Error('Invalid research content object.')
    ids.add(object.id)
  }
  for (const placement of d.views.canvas.placements) if (!record(placement) || typeof placement.objectId !== 'string' || !ids.has(placement.objectId) || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) throw new Error('Invalid research canvas placement.')
  return d as ContentDocument
}
export const serializeContent = (document: ContentDocument): string => JSON.stringify(document, null, 2) + '\n'
export const emptyContent = (scope: DraftScope): ContentDocument => ({ ...scope, schemaVersion: 'research.content/v1', objects: [], relations: [], artifacts: [], views: { canvas: { placements: [] }, outlines: [{ artifact: 'canvas', items: [] }] } })
const local = (ref: ResourceReference, document: ContentDocument) => ref.kind === 'content' && (!ref.workspace || ref.workspace === document.workspace) && (!ref.path || ref.path === CONTENT_PATH)

type ProjectedEvidence = CanvasEvidence & { contentSource?: ResourceReference; page?: number; buildId?: string }
const evidenceSource = (source: ResourceReference) => source.kind === 'file' || source.kind === 'knowledge' || source.kind === 'literature'
function projectEvidence(object: ContentObject): ProjectedEvidence[] {
  return object.sources.filter(evidenceSource).map((source, i) => ({
    ...source, id: source.legacyId as string || source.id || `source-${object.id}-${i}`,
    path: source.path, workspace: source.workspace, digest: source.digest,
    url: typeof source.url === 'string' ? source.url : source.kind === 'literature' && /^https?:\/\//.test(source.id ?? '') ? source.id : undefined,
    excerpt: source.selector?.quote ?? source.excerpt as string | undefined,
    page: source.selector?.page, buildId: source.selector?.buildId,
    contentSource: source,
  }))
}
function applyEvidence(object: ContentObject, node: CanvasNodeV2): ResourceReference[] {
  const refs = object.sources.filter(source => !evidenceSource(source))
  for (const evidence of (node.evidence ?? []) as ProjectedEvidence[]) {
    const old = evidence.contentSource
    if (old) {
      const next = { ...old }
      for (const key of ['path', 'workspace', 'digest', 'url', 'note'] as const) {
        const previous = key === 'url' && old.kind === 'literature' && /^https?:\/\//.test(old.id ?? '') ? old.url ?? old.id : old[key]
        if (evidence[key] !== previous) {
          if (evidence[key] === undefined) delete next[key]
          else next[key] = evidence[key]
        }
      }
      if (evidence.excerpt !== (old.selector?.quote ?? old.excerpt)) {
        next.selector = { ...old.selector }
        if (evidence.excerpt === undefined) delete next.selector.quote
        else next.selector.quote = evidence.excerpt
        // Migrate an edited legacy excerpt to the selector rather than keep two values.
        delete next.excerpt
      }
      refs.push(next)
    }
    else refs.push({ ...evidence, kind: evidence.url ? 'literature' : 'file', id: evidence.url || evidence.id, ...(evidence.excerpt ? { selector: { quote: evidence.excerpt } } : {}) })
  }
  return refs
}

/** Editor projections are in memory. The only persisted representation is ContentDocument. */
export function projectCanvas(document: ContentDocument): ThinkingCanvasV2 {
  const places = new Map(document.views.canvas.placements.map(p => [p.objectId, p]))
  const nodes: CanvasNodeV2[] = document.objects.map((object, i) => {
    const p = places.get(object.id)
    return { ...object, cardType: cardType(object), evidence: projectEvidence(object), kind: object.legacyKind ?? (object.kind === 'design' ? 'chapter' : 'idea'), x: p?.x ?? 48 + (i % 3) * 360, y: p?.y ?? 40 + Math.floor(i / 3) * 180, ...(p?.collapsed !== undefined ? { collapsed: p.collapsed } : {}) } as CanvasNodeV2
  })
  const ids = new Set(nodes.map(n => n.id))
  const edges = document.relations.filter(r => local(r.from, document) && local(r.to, document) && ids.has(r.from.id!) && ids.has(r.to.id!))
    .map(r => ({ from: r.from.id!, to: r.to.id!, relation: r.relation, contentRelationId: r.id }) as CanvasEdgeV2)
  return { version: 2, nodes, edges: [...edges, ...(document.views.canvas.connections ?? []).filter(e => ids.has(e.from) && ids.has(e.to))], outlines: document.views.outlines }
}

/** Apply only the canvas fields onto the latest shared document, preserving assets and extensions. */
export function applyCanvasProjection(document: ContentDocument, canvas: ThinkingCanvasV2): ContentDocument {
  const before = new Map(document.objects.map(o => [o.id, o])); const placements = new Map(document.views.canvas.placements.map(p => [p.objectId, p]))
  const objects = canvas.nodes.map(node => {
    const previous = before.get(node.id)
    const { x: _x, y: _y, collapsed: _collapsed, kind, ...fields } = node
    const typed = isCardType(node.cardType) ? cardTypeFields(node.cardType) : undefined
    const next: ContentObject = { ...previous, ...fields, kind: typed?.kind ?? previous?.kind ?? (kind === 'chapter' ? 'design' : 'note'), sources: applyEvidence(previous ?? { ...fields, kind: 'note', sources: [] }, node), legacyKind: previous?.legacyKind ?? kind }
    // A removed optional field is a real edit, not an invitation to revive the old value.
    for (const key of ['writing', 'bindings', 'evidence', 'ref', 'anchor', 'body'] as const) if (!(key in node)) delete next[key]
    delete next.evidence
    delete next.cardType
    if (typed) { if (typed.role) next.role = typed.role; else delete next.role }
    if (JSON.stringify(previous?.ref) !== JSON.stringify(node.ref)) {
      const oldRef = previous?.ref as { path?: string } | undefined
      next.sources = next.sources.filter(s => !(s.kind === 'knowledge' && s.path === oldRef?.path && !s.selector))
      if (node.ref) next.sources.push({ kind: 'knowledge', workspace: 'academic', path: node.ref.path })
    }
    if (previous?.anchor !== node.anchor) {
      const prefix = `${CONTENT_PATH}#artifact/`
      const oldID = typeof previous?.anchor === 'string' && previous.anchor.startsWith(prefix) ? previous.anchor.slice(prefix.length) : undefined
      next.sources = next.sources.filter(s => !(s.kind === 'artifact' && s.id === oldID))
      if (node.anchor?.startsWith(prefix)) next.sources.push({ kind: 'artifact', workspace: document.workspace, id: node.anchor.slice(prefix.length) })
    }
    return next
  })
  const ids = new Set(objects.map(o => o.id))
  const priorRelations = new Map(document.relations.map(r => [r.id, r]))
  const projectedIds = new Set(projectCanvas(document).edges.map(e => (e as CanvasEdgeV2 & { contentRelationId?: string }).contentRelationId))
  const relations = document.relations.filter(r => !projectedIds.has(r.id) && !(local(r.from, document) && !ids.has(r.from.id!)) && !(local(r.to, document) && !ids.has(r.to.id!)))
  const connections: CanvasEdgeV2[] = []
  for (const e of canvas.edges) {
    if (!e.relation) { const { contentRelationId: _id, ...connection } = e as CanvasEdgeV2 & { contentRelationId?: string }; connections.push(connection); continue }
    const id = (e as CanvasEdgeV2 & { contentRelationId?: string }).contentRelationId ?? crypto.randomUUID()
    const previous = priorRelations.get(id)
    const endpoint = (ref: ResourceReference | undefined, objectId: string): ResourceReference => ref?.id === objectId && local(ref, document) ? ref : { ...ref, kind: 'content', workspace: document.workspace, id: objectId }
    relations.push({ ...previous, id, from: endpoint(previous?.from, e.from), to: endpoint(previous?.to, e.to), relation: e.relation })
  }
  return { ...document, objects, relations, views: { ...document.views, canvas: { ...document.views.canvas, connections, placements: canvas.nodes.map(n => ({ ...placements.get(n.id), objectId: n.id, x: n.x, y: n.y, ...(n.collapsed === undefined ? { collapsed: false } : { collapsed: n.collapsed }) })) }, outlines: canvas.outlines } }
}
export function projectDraftBook(document: ContentDocument): DraftBook {
  return { version: 1, projectId: document.projectId, workspace: document.workspace, drafts: document.artifacts, ...(document.links ? { links: document.links } : {}) }
}
export function applyDraftProjection(document: ContentDocument, book: DraftBook): ContentDocument {
  if (document.projectId !== book.projectId || document.workspace !== book.workspace) throw new Error('Draft scope changed.')
  const ids = new Set(book.drafts.map(d => d.id))
  const removed = new Set(document.artifacts.filter(d => !ids.has(d.id)).map(d => d.id))
  const removedRef = (ref: ResourceReference) => ref.kind === 'artifact' && (!ref.workspace || ref.workspace === document.workspace) && (!ref.path || ref.path === CONTENT_PATH) && removed.has(ref.id!)
  return { ...document, artifacts: book.drafts, links: book.links ?? [], relations: document.relations.filter(r => !removedRef(r.from) && !removedRef(r.to)) }
}
