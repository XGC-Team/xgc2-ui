import type { AnyCanvas } from './canvas-model'
/** Project-owned editable definitions. No draft in this schema represents an executed task. */
export const DRAFTS_PATH = 'research-drafts.json'
export const DRAFT_KINDS = ['paper', 'slides', 'storyboard', 'workflow', 'rule', 'experiment', 'note', 'material'] as const
export type DraftKind = typeof DRAFT_KINDS[number]
export type DraftScope = { projectId: string; workspace: string }
export const DRAFT_FIELDS = {
  paper: ['purpose', 'argument', 'evidence', 'constraints'],
  slides: ['message', 'visual', 'speakerNotes'],
  storyboard: ['visual', 'narration', 'duration'],
  workflow: ['objective', 'inputs', 'outputs', 'acceptance'],
  rule: ['feed', 'filter', 'action'],
  experiment: ['question', 'parameters', 'inputs', 'outputs', 'measurement', 'acceptance'],
  note: ['question', 'observation'],
  material: ['description'],
} as const satisfies Record<DraftKind, readonly string[]>
export type DraftField = typeof DRAFT_FIELDS[DraftKind][number]
export type DraftBlock = { id: string; title: string; fields: Record<string, string>; sourceIds?: string[]; role?: 'section' | 'paragraph' }
export type DraftSource = {
  id: string; path: string; workspace?: string; digest?: string; excerpt?: string
  url?: string; buildId?: string; page?: number
}
export type DraftIntent = { id: string; scope: DraftScope; kind: 'note' | 'material'; source: DraftSource }
export type ObjectLink = { id: string; kind: 'canvas' | 'workflow'; archivedAt?: string }

export type ResearchDraft = {
  id: string; kind: DraftKind; status: 'draft'; title: string
  createdAt: string; updatedAt: string; blocks: DraftBlock[]; sources: DraftSource[]
  archivedAt?: string
  settings?: { goal?: string; template?: string; citationRequirements?: string }
  knowledgeSuggestion?: { status: 'suggested' | 'dismissed'; rationale: string }

}
export type DraftBook = DraftScope & { version: 1; drafts: ResearchDraft[]; links?: ObjectLink[] }

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const idOK = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)
const dateOK = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
export function validSourcePath(path: string): boolean {
  return Boolean(path.trim()) && !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') && path.split('/').every(part => Boolean(part) && part !== '.' && part !== '..')
}
export function draftScopeKey(scope: DraftScope): string { return JSON.stringify([scope.projectId, scope.workspace]) }
export function emptyDraftBook(scope: DraftScope): DraftBook {
  requireThat(scope.projectId.trim() && scope.workspace.trim(), 'A project and workspace are required.')
  return { version: 1, ...scope, drafts: [] }
}

/** Reject malformed/future data; never silently repair or overwrite it. Unknown properties survive. */
export function parseDraftBook(text: string, scope: DraftScope): DraftBook {
  const raw: unknown = JSON.parse(text)
  requireThat(object(raw) && raw.version === 1 && Array.isArray(raw.drafts), 'Unsupported or damaged draft book.')
  requireThat(raw.projectId === scope.projectId && raw.workspace === scope.workspace, 'Draft book belongs to another project or workspace.')
  const draftIds = new Set<string>()
  for (const draft of raw.drafts) {
    requireThat(object(draft) && idOK(draft.id) && !draftIds.has(draft.id), 'Invalid or duplicate draft identity.')
    draftIds.add(draft.id)
    requireThat(typeof draft.kind === 'string' && DRAFT_KINDS.includes(draft.kind as DraftKind) && draft.status === 'draft', 'Unsupported draft kind or state.')
    requireThat(draft.archivedAt === undefined || dateOK(draft.archivedAt), 'Invalid archive date.')
    if (draft.settings !== undefined) requireThat(object(draft.settings) && Object.values(draft.settings).every(value => typeof value === 'string'), 'Invalid draft settings.')
    if (draft.knowledgeSuggestion !== undefined) requireThat(object(draft.knowledgeSuggestion) && ['suggested', 'dismissed'].includes(String(draft.knowledgeSuggestion.status)) && typeof draft.knowledgeSuggestion.rationale === 'string', 'Invalid knowledge suggestion.')
    requireThat(typeof draft.title === 'string' && dateOK(draft.createdAt) && dateOK(draft.updatedAt), 'Invalid draft metadata.')
    requireThat(Array.isArray(draft.blocks) && Array.isArray(draft.sources), 'Invalid draft contents.')
    const blockIds = new Set<string>(), sourceIds = new Set<string>()
    for (const block of draft.blocks) {
      requireThat(object(block) && idOK(block.id) && !blockIds.has(block.id) && typeof block.title === 'string' && object(block.fields), 'Invalid or duplicate block.')
      blockIds.add(block.id)
      requireThat(block.role === undefined || ['section', 'paragraph'].includes(String(block.role)), 'Invalid writing block role.')
      requireThat(Object.values(block.fields).every(value => typeof value === 'string'), 'Invalid block field.')
      for (const field of DRAFT_FIELDS[draft.kind as DraftKind]) requireThat(typeof block.fields[field] === 'string' || (draft.kind === 'experiment' && ['inputs', 'outputs'].includes(field) && block.fields[field] === undefined), `Missing field: ${field}`)
    }
    for (const source of draft.sources) {
      requireThat(object(source) && idOK(source.id) && !sourceIds.has(source.id) && typeof source.path === 'string' && (validSourcePath(source.path) || (source.path === '' && typeof source.url === 'string' && validWebSource(source.url))), 'Invalid or duplicate source reference.')
      sourceIds.add(source.id)
      requireThat(source.workspace === undefined || (typeof source.workspace === 'string' && source.workspace.trim()), 'Invalid source workspace.')
      for (const key of ['digest', 'excerpt', 'buildId']) requireThat(source[key] === undefined || typeof source[key] === 'string', 'Invalid source provenance.')
      requireThat(source.url === undefined || (typeof source.url === 'string' && validWebSource(source.url)), 'Invalid source URL.')
      requireThat(source.page === undefined || (Number.isInteger(source.page) && Number(source.page) > 0), 'Invalid source page.')
    }
    for (const block of draft.blocks) {
      requireThat(block.sourceIds === undefined || (Array.isArray(block.sourceIds) && block.sourceIds.every((id: unknown) => typeof id === 'string' && sourceIds.has(id))), 'Block references a missing source.')
    }
  }
  if (raw.links !== undefined) {
    requireThat(Array.isArray(raw.links), 'Invalid linked objects.')
    const ids = new Set<string>()
    for (const link of raw.links) {
      requireThat(object(link) && idOK(link.id) && !ids.has(link.id) && ['canvas', 'workflow'].includes(String(link.kind)), 'Invalid linked object.')
      requireThat(link.archivedAt === undefined || dateOK(link.archivedAt), 'Invalid linked object archive date.')
      ids.add(link.id)
    }
  }
  return raw as DraftBook
}
export function serializeDraftBook(book: DraftBook): string {
  const text = JSON.stringify(book, null, 2) + '\n'
  parseDraftBook(text, book)
  return text
}
export function newBlock(kind: DraftKind, id: string = crypto.randomUUID()): DraftBlock {
  requireThat(DRAFT_KINDS.includes(kind) && idOK(id), 'Invalid block kind or identity.')
  return { id, title: '', fields: Object.fromEntries(DRAFT_FIELDS[kind].map(field => [field, ''])) }
}
export function newDraft(kind: DraftKind, title: string, at = new Date().toISOString(), id: string = crypto.randomUUID()): ResearchDraft {
  requireThat(DRAFT_KINDS.includes(kind) && idOK(id) && title.trim() && dateOK(at), 'Invalid new draft.')
  return { id, kind, title: title.trim(), status: 'draft', createdAt: at, updatedAt: at, blocks: [newBlock(kind)], sources: [] }
}
export function appendDraft(book: DraftBook, draft: ResearchDraft): DraftBook {
  requireThat(!book.drafts.some(item => item.id === draft.id), 'Duplicate draft identity.')
  const next = { ...book, drafts: [...book.drafts, draft] }
  serializeDraftBook(next)
  return next
}
export function changeDraft(book: DraftBook, id: string, update: (draft: ResearchDraft) => ResearchDraft, at = new Date().toISOString()): DraftBook {
  const current = book.drafts.find(draft => draft.id === id)
  requireThat(current, 'Draft no longer exists.')
  const next = update(current)
  if (next === current) return book
  requireThat(next.id === current.id && next.kind === current.kind && next.status === 'draft' && next.createdAt === current.createdAt && dateOK(at), 'Draft identity and kind are immutable.')
  return { ...book, drafts: book.drafts.map(draft => draft.id === id ? { ...next, updatedAt: at } : draft) }
}
export function removeDraft(book: DraftBook, id: string): DraftBook {
  return book.drafts.some(draft => draft.id === id) ? { ...book, drafts: book.drafts.filter(draft => draft.id !== id) } : book
}
export function editBlock(draft: ResearchDraft, id: string, field: 'title' | DraftField, value: string): ResearchDraft {
  requireThat(field === 'title' || (DRAFT_FIELDS[draft.kind] as readonly string[]).includes(field), 'Field does not belong to this draft kind.')
  const block = draft.blocks.find(item => item.id === id)
  requireThat(block, 'Block no longer exists.')
  if ((field === 'title' ? block.title : block.fields[field]) === value) return draft
  return { ...draft, blocks: draft.blocks.map(item => item.id !== id ? item : field === 'title' ? { ...item, title: value } : { ...item, fields: { ...item.fields, [field]: value } }) }
}
export function moveBlock(draft: ResearchDraft, id: string, offset: -1 | 1): ResearchDraft {
  const from = draft.blocks.findIndex(block => block.id === id), to = from + offset
  if (from < 0 || to < 0 || to >= draft.blocks.length) return draft
  const blocks = [...draft.blocks]
  ;[blocks[from], blocks[to]] = [blocks[to], blocks[from]]
  return { ...draft, blocks }
}
export function addSource(draft: ResearchDraft, path: string, id: string = crypto.randomUUID()): ResearchDraft {
  requireThat(validSourcePath(path) && idOK(id), 'Expected a relative source file path.')
  if (draft.sources.some(source => source.path === path)) return draft
  requireThat(!draft.sources.some(source => source.id === id), 'Duplicate source identity.')
  return { ...draft, sources: [...draft.sources, { id, path }] }
}
/** Snapshot for review in Chat; never a claim of a saved version, verified source or completed run. */
export function draftContext(book: DraftBook, draft: ResearchDraft): string {
  return JSON.stringify({ scope: { projectId: book.projectId, workspace: book.workspace, path: DRAFTS_PATH }, state: 'editable-draft-snapshot', draft }, null, 2)
}

/** A source identity includes the observed version and excerpt; a newer capture never silently replaces it. */
export function validWebSource(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
}
export function sourceKey(source: DraftSource, workspace: string): string {
  return JSON.stringify([source.workspace || workspace, source.path, source.url || '', source.digest || '', source.excerpt || '', source.buildId || '', source.page || 0])
}
export function linkSource(draft: ResearchDraft, source: DraftSource, workspace: string): ResearchDraft {
  if (draft.sources.some(item => sourceKey(item, workspace) === sourceKey(source, workspace))) return draft
  requireThat(!draft.sources.some(item => item.id === source.id), 'Duplicate source ID.')
  return { ...draft, sources: [...draft.sources, source] }
}
export function archiveDraft(book: DraftBook, id: string, archived: boolean, at = new Date().toISOString()): DraftBook {
  return changeDraft(book, id, draft => {
    if (archived) return { ...draft, archivedAt: at }
    const next = { ...draft }; delete next.archivedAt; return next
  }, at)
}
export function captureIntoBook(book: DraftBook, intent: DraftIntent, at = new Date().toISOString()): DraftBook {
  requireThat(draftScopeKey(book) === draftScopeKey(intent.scope), 'Capture targets a different project.')
  if (intent.kind === 'note') requireThat(intent.source.digest && intent.source.excerpt?.trim(), 'A captured note needs an observed revision and excerpt.')
  if (book.drafts.some(draft => draft.id === intent.id)) return book
  const title = intent.source.excerpt?.trim().slice(0, 80) || intent.source.path.split('/').pop() || intent.source.url || 'Source'
  const draft = newDraft(intent.kind, title, at, intent.id)
  return appendDraft(book, { ...draft, sources: [intent.source] })
}
export function linkProjectObject(book: DraftBook, kind: ObjectLink['kind']): DraftBook {
  const existing = book.links?.find(link => link.kind === kind)
  if (existing) return existing.archivedAt ? archiveProjectObject(book, existing.id, false) : book
  return { ...book, links: [...(book.links || []), { id: kind, kind }] }
}
export function archiveProjectObject(book: DraftBook, id: string, archived: boolean, at = new Date().toISOString()): DraftBook {
  requireThat(dateOK(at), 'Invalid date.')
  return { ...book, links: (book.links || []).map(link => {
    if (link.id !== id) return link
    const next = { ...link }; if (archived) next.archivedAt = at; else delete next.archivedAt; return next
  }) }
}
/** The list and card views read these exact blocks. There is no second outline or content copy. */
export const researchStructure = (draft: ResearchDraft): readonly DraftBlock[] => draft.blocks

export function draftIdFromAnchor(path: string): string | null {
  const prefix = `${DRAFTS_PATH}#`
  const id = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  return idOK(id) ? id : null
}
/** A label is not document content; this node is a navigable reference, not a second outline.
 * Works on any canvas version and preserves its format, outlines and extension fields. */
export function attachDraftReference<T extends AnyCanvas>(canvas: T, draftId: string, title: string): T {
  requireThat(idOK(draftId), 'Invalid draft identity.')
  const anchor = `${DRAFTS_PATH}#${draftId}`
  if (canvas.nodes.some(node => node.anchor === anchor)) return canvas
  let id = `draft-${draftId}`
  while (canvas.nodes.some(node => node.id === id)) id += '-ref'
  return { ...canvas, nodes: [...canvas.nodes, { id, kind: 'idea' as const, title: `↗ ${title}`,
    body: 'Research object reference / 研究对象引用；打开锚点编辑原对象。', anchor,
    x: 24 + (canvas.nodes.length % 3) * 260, y: 24 + Math.floor(canvas.nodes.length / 3) * 190 }] }
}
