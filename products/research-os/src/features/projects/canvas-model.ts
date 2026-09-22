/* 思维白板数据模型：存进项目 git 仓库的 thinking.canvas.json。
   现行只有 v2。v1 自动迁移与宽松读取已删除：不支持的版本 fail-closed，不改写原文件。
   x/y 只是视觉位置；outlines 是各制品的层级与写作顺序；边上 relation 是显式语义。
   writing 记录写作意图与正文外细节；bindings 是设计卡与源码选区的多对多对应。
   node.anchor 只保留研究对象引用（research-drafts.json#id），不是源码行号绑定。 */
export type CanvasNodeKind = 'chapter' | 'idea'
export type CanvasNode = {
  id: string
  kind: CanvasNodeKind
  title: string
  body?: string
  x: number
  y: number
  ref?: { path: string; title: string }
  /** Draft-object locator only (`research-drafts.json#<id>`). Not a manuscript line binding. */
  anchor?: string
}
export type CanvasEdge = { from: string; to: string }

export const CANVAS_PATH = 'thinking.canvas.json'
/** The canvas's own writing outline; other arrangements belong to artifact draft IDs. */
export const PRIMARY_OUTLINE = 'canvas'

export const SEMANTIC_RELATIONS = ['supports', 'contradicts', 'depends', 'exemplifies', 'continues', 'cites'] as const
export type SemanticRelation = typeof SEMANTIC_RELATIONS[number]
/** Prompt-facing labels; UI copy lives in workspace-copy. */
export const RELATION_PROMPT: Record<SemanticRelation, string> = {
  supports: '支持', contradicts: '反驳', depends: '依赖', exemplifies: '举例', continues: '承接', cites: '引用',
}

/** A pinned evidence reference. Without a digest the version cannot be auto-verified; never fabricate one. */
export type CanvasEvidence = {
  id: string
  path?: string
  workspace?: string
  url?: string
  digest?: string
  excerpt?: string
  note?: string
}
export const WRITING_FIELDS = ['purpose', 'conditions', 'template', 'argument', 'omission', 'aside'] as const
export type WritingField = typeof WRITING_FIELDS[number]
/** Free-text design notes. None are required. omission/aside must not be copied into the manuscript. */
export type WritingConstraints = Partial<Record<WritingField, string>>
/** Captured source identity. start/end are UTF-16 at bind time and never silently rebound. */
export type SourceBinding = {
  id: string
  workspace: string
  path: string
  digest: string
  quote: string
  start: number
  end: number
}
export type CanvasNodeV2 = CanvasNode & {
  collapsed?: boolean
  evidence?: CanvasEvidence[]
  writing?: WritingConstraints
  bindings?: SourceBinding[]
}
export type CanvasEdgeV2 = { from: string; to: string; relation?: SemanticRelation }
export type OutlineItem = { node: string; children?: OutlineItem[] }
export type OutlineArrangement = { artifact: string; items: OutlineItem[] }
export type ThinkingCanvasV2 = { version: 2; nodes: CanvasNodeV2[]; edges: CanvasEdgeV2[]; outlines: OutlineArrangement[] }

export function emptyCanvasV2(): ThinkingCanvasV2 {
  return { version: 2, nodes: [], edges: [], outlines: [{ artifact: PRIMARY_OUTLINE, items: [] }] }
}
export const emptyCanvas = emptyCanvasV2

/** Read-only node list for non-editor consumers. Unsupported files yield no nodes and are never rewritten. */
export function parseCanvas(text: string): { nodes: CanvasNodeV2[] } {
  try { return { nodes: parseEditableCanvas(text).nodes } }
  catch { return { nodes: [] } }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function requireCanvas(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
function canvasSourcePathOK(path: string): boolean {
  return Boolean(path.trim()) && !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') && path.split('/').every(part => Boolean(part) && part !== '.' && part !== '..')
}

export function validateSourceBinding(raw: unknown): asserts raw is SourceBinding {
  requireCanvas(record(raw) && typeof raw.id === 'string' && raw.id.trim(), 'Invalid source binding identity.')
  requireCanvas(typeof raw.workspace === 'string' && raw.workspace.trim(), 'Source binding needs a workspace.')
  requireCanvas(typeof raw.path === 'string' && canvasSourcePathOK(raw.path), 'Source binding needs a relative manuscript path.')
  requireCanvas(typeof raw.digest === 'string' && raw.digest.trim(), 'Source binding needs the observed file digest.')
  requireCanvas(typeof raw.quote === 'string' && raw.quote.length > 0, 'Source binding needs the captured quote.')
  requireCanvas(Number.isSafeInteger(raw.start) && Number.isSafeInteger(raw.end) && Number(raw.start) >= 0 && Number(raw.end) > Number(raw.start), 'Source binding needs a nonempty UTF-16 range.')
  requireCanvas(raw.quote.length === Number(raw.end) - Number(raw.start), 'Source binding quote must match its captured UTF-16 range.')
}

function validateEvidence(raw: unknown): void {
  requireCanvas(record(raw) && typeof raw.id === 'string' && raw.id.trim(), 'Invalid canvas evidence.')
  requireCanvas((raw.path === undefined || (typeof raw.path === 'string' && canvasSourcePathOK(raw.path))) ||
    (raw.url !== undefined && typeof raw.url === 'string'), 'Invalid canvas evidence source.')
  requireCanvas(raw.path !== undefined || raw.url !== undefined, 'Canvas evidence needs a file or URL.')
  for (const key of ['workspace', 'digest', 'excerpt', 'note']) requireCanvas(raw[key] === undefined || typeof raw[key] === 'string', 'Invalid canvas evidence provenance.')
}

function validateOutlineItems(raw: unknown, ids: Set<string>, seen: Set<string>): void {
  requireCanvas(Array.isArray(raw), 'Invalid canvas outline.')
  for (const item of raw) {
    requireCanvas(record(item) && typeof item.node === 'string' && ids.has(item.node), 'Outline references a missing node.')
    requireCanvas(!seen.has(item.node), 'Outline repeats or cycles a node.')
    seen.add(item.node)
    if (item.children !== undefined) validateOutlineItems(item.children, ids, seen)
  }
}

function validateV2(raw: Record<string, unknown>): ThinkingCanvasV2 {
  requireCanvas(Array.isArray(raw.nodes) && Array.isArray(raw.edges) && Array.isArray(raw.outlines), 'Unsupported canvas format.')
  const ids = new Set<string>()
  for (const node of raw.nodes) {
    requireCanvas(record(node) && typeof node.id === 'string' && node.id && !ids.has(node.id) &&
      (node.kind === 'chapter' || node.kind === 'idea') && typeof node.title === 'string' &&
      typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y) &&
      (node.body === undefined || typeof node.body === 'string') && (node.anchor === undefined || typeof node.anchor === 'string') &&
      (node.collapsed === undefined || typeof node.collapsed === 'boolean') &&
      (node.ref === undefined || (record(node.ref) && typeof node.ref.path === 'string' && typeof node.ref.title === 'string')), 'Invalid canvas node.')
    if (node.evidence !== undefined) {
      requireCanvas(Array.isArray(node.evidence), 'Invalid canvas evidence.')
      const evidenceIds = new Set<string>()
      for (const item of node.evidence) {
        validateEvidence(item)
        requireCanvas(!evidenceIds.has((item as CanvasEvidence).id), 'Duplicate canvas evidence identity.')
        evidenceIds.add((item as CanvasEvidence).id)
      }
    }
    if (node.writing !== undefined) validateWritingConstraints(node.writing)
    if (node.bindings !== undefined) {
      requireCanvas(Array.isArray(node.bindings), 'Invalid source bindings.')
      const bindingIds = new Set<string>()
      for (const item of node.bindings) {
        validateSourceBinding(item)
        requireCanvas(!bindingIds.has(item.id), 'Duplicate source binding identity.')
        bindingIds.add(item.id)
      }
    }
    ids.add(node.id as string)
  }
  for (const edge of raw.edges) {
    requireCanvas(record(edge) && typeof edge.from === 'string' && typeof edge.to === 'string' && ids.has(edge.from) && ids.has(edge.to), 'Invalid canvas edge.')
    requireCanvas(edge.relation === undefined || (typeof edge.relation === 'string' && (SEMANTIC_RELATIONS as readonly string[]).includes(edge.relation)), 'Unsupported semantic relation.')
  }
  const artifacts = new Set<string>()
  for (const outline of raw.outlines) {
    requireCanvas(record(outline) && typeof outline.artifact === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(outline.artifact) && !artifacts.has(outline.artifact), 'Invalid outline arrangement.')
    artifacts.add(outline.artifact)
    validateOutlineItems(outline.items, ids, new Set())
  }
  return raw as unknown as ThinkingCanvasV2
}

/** The editor must reject unsupported/damaged files rather than overwrite them with a filtered empty canvas.
 * Unknown fields on a valid v2 file are retained. v1 and unknown versions fail closed. */
export function parseEditableCanvas(text: string): ThinkingCanvasV2 {
  const raw: unknown = JSON.parse(text)
  requireCanvas(record(raw) && raw.version === 2, 'Unsupported canvas format.')
  return validateV2(raw)
}

export function serializeCanvas(canvas: ThinkingCanvasV2): string {
  return JSON.stringify(canvas, null, 2) + '\n'
}

export function writingFieldValue(writing: WritingConstraints | undefined, field: WritingField): string {
  return writing?.[field] ?? ''
}

export function serializeWriting(writing: WritingConstraints | undefined): WritingConstraints | undefined {
  if (!writing) return undefined
  const next: WritingConstraints = {}
  for (const field of WRITING_FIELDS) {
    const value = writing[field]?.trim()
    if (value) next[field] = writing[field]!
  }
  return Object.keys(next).length ? next : undefined
}

export function validateWritingConstraints(raw: unknown): asserts raw is WritingConstraints {
  requireCanvas(record(raw), 'Invalid writing constraints.')
  for (const key of Object.keys(raw)) requireCanvas((WRITING_FIELDS as readonly string[]).includes(key) && typeof raw[key] === 'string', 'Invalid writing constraints.')
}

export function applyCanvasWriting(canvas: ThinkingCanvasV2, id: string, field: WritingField, value: string): ThinkingCanvasV2 {
  return setNodeWriting(canvas, id, field, value)
}

export function applyNodeWriting(canvas: ThinkingCanvasV2, id: string, writing: WritingConstraints | undefined): ThinkingCanvasV2 {
  if (writing) validateWritingConstraints(writing)
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id) return n
    const next: CanvasNodeV2 = { ...n, writing: serializeWriting(writing) }
    if (!next.writing) delete next.writing
    return next
  }) }
}

export function newSourceBinding(input: Omit<SourceBinding, 'id'> & { id?: string }): SourceBinding {
  const binding: SourceBinding = { ...input, id: input.id ?? crypto.randomUUID() }
  validateSourceBinding(binding)
  return binding
}

export function addNodeBinding(canvas: ThinkingCanvasV2, id: string, binding: SourceBinding): ThinkingCanvasV2 {
  validateSourceBinding(binding)
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id) return n
    if ((n.bindings ?? []).some(item => item.id === binding.id)) return n
    return { ...n, bindings: [...(n.bindings ?? []), binding] }
  }) }
}

export function removeNodeBinding(canvas: ThinkingCanvasV2, id: string, bindingId: string): ThinkingCanvasV2 {
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id) return n
    const bindings = (n.bindings ?? []).filter(item => item.id !== bindingId)
    const next: CanvasNodeV2 = { ...n, bindings }
    if (!bindings.length) delete next.bindings
    return next
  }) }
}

export function replaceNodeBinding(canvas: ThinkingCanvasV2, id: string, binding: SourceBinding): ThinkingCanvasV2 {
  validateSourceBinding(binding)
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id) return n
    const bindings = n.bindings ?? []
    const index = bindings.findIndex(item => item.id === binding.id)
    if (index < 0) return { ...n, bindings: [...bindings, binding] }
    return { ...n, bindings: bindings.map((item, i) => i === index ? binding : item) }
  }) }
}

export function quoteOccurrences(content: string, quote: string): number[] {
  if (!quote) return []
  const starts: number[] = []
  for (let index = content.indexOf(quote); index >= 0; index = content.indexOf(quote, index + 1)) starts.push(index)
  return starts
}

/* ---------- v2 编辑操作：布局、层级/顺序、语义关系互不干扰 ---------- */

type Located = { items: OutlineItem[]; index: number; parent: OutlineItem | null }
function findItem(items: OutlineItem[], node: string, parent: OutlineItem | null = null): Located | null {
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (item.node === node) return { items, index, parent }
    const found = item.children ? findItem(item.children, node, item) : null
    if (found) return found
  }
  return null
}
function updateArrangement(canvas: ThinkingCanvasV2, artifact: string, update: (outline: OutlineArrangement) => OutlineArrangement): ThinkingCanvasV2 {
  return { ...canvas, outlines: canvas.outlines.map(outline => outline.artifact === artifact ? update(outline) : outline) }
}

export function getArrangement(canvas: ThinkingCanvasV2, artifact: string): OutlineArrangement {
  return canvas.outlines.find(outline => outline.artifact === artifact) ?? { artifact, items: [] }
}

/** Sentence cards are outline children of a claim. They are not a second layer of floating notes. */
export function isCanvasSentence(id: string): boolean {
  return id.startsWith('s-')
}

/** Chapter column, then each claim column. Widths match the card chrome, not a fixed 132px stack. */
const DESIGN_COLUMN_X = [48, 336, 664] as const
const DESIGN_CARD_GAP = 28

/** Width and height of one design card from its own title, body and writing notes. */
export function designCardBox(node: CanvasNodeV2): { width: number; height: number } {
  const width = node.kind === 'chapter' ? 240 : 280
  const charsPerLine = Math.max(12, Math.floor((width - 28) / 14))
  const titleLines = Math.max(1, Math.ceil((node.title.trim() || ' ').length / Math.max(8, Math.floor((width - 56) / 15))))
  const bodyLines = (node.body ?? '').trim().split('\n').filter(line => line.trim()).reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0)
  const notes = WRITING_FIELDS.reduce((sum, field) => {
    const text = node.writing?.[field]?.trim()
    return text ? sum + Math.max(1, Math.ceil(text.length / charsPerLine)) : sum
  }, 0)
  const height = 52 + titleLines * 24 + (bodyLines ? 8 + bodyLines * 22 : 0) + (notes ? 8 + notes * 22 : 0)
  return { width, height }
}

function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** True when two visible design cards occupy the same space. Sentence rows are not cards. */
export function designLayoutOverlaps(canvas: ThinkingCanvasV2): boolean {
  const boxes = canvas.nodes.filter(node => !isCanvasSentence(node.id)).map(node => ({ ...designCardBox(node), x: node.x, y: node.y }))
  return boxes.some((box, index) => boxes.slice(index + 1).some(other => boxesOverlap(box, other)))
}

/**
 * Place each chapter and its claims from the outline.
 * A claim column starts beside its chapter; the next chapter starts below that group.
 * Manuscript sentence nodes stay where they are and are not drawn as cards.
 */
export function layoutDesignCanvas(canvas: ThinkingCanvasV2): ThinkingCanvasV2 {
  const byId = new Map(canvas.nodes.map(node => [node.id, node]))
  const positions = new Map<string, { x: number; y: number }>()
  const place = (items: OutlineItem[], depth: number, top: number): number => {
    let y = top
    for (const item of items) {
      if (isCanvasSentence(item.node)) {
        if (item.children?.length) y = Math.max(y, place(item.children, depth, y))
        continue
      }
      const node = byId.get(item.node)
      if (!node) continue
      const x = DESIGN_COLUMN_X[Math.min(depth, DESIGN_COLUMN_X.length - 1)]
      positions.set(node.id, { x, y })
      const ownBottom = y + designCardBox(node).height
      const childBottom = item.children?.length ? place(item.children, depth + 1, y) : y
      y = Math.max(ownBottom, childBottom) + DESIGN_CARD_GAP
    }
    return y
  }
  let bottom = place(getArrangement(canvas, PRIMARY_OUTLINE).items, 0, 40)
  for (const node of canvas.nodes) {
    if (positions.has(node.id) || isCanvasSentence(node.id)) continue
    positions.set(node.id, { x: DESIGN_COLUMN_X[0], y: bottom })
    bottom += designCardBox(node).height + DESIGN_CARD_GAP
  }
  return {
    ...canvas,
    nodes: canvas.nodes.map(node => {
      const at = positions.get(node.id)
      return at ? { ...node, x: at.x, y: at.y } : node
    }),
  }
}

/** Readable manuscript text for a card. Display math and commands stay out of the sentence the operator reads. */
export function plainManuscript(text: string): string {
  return text
    .replace(/\\IEEEPARstart\{([A-Za-z])\}\{([A-Za-z]+)\}/g, '$1$2')
    .replace(/\\eqref\{([^}]+)\}/g, '($1)')
    .replace(/\\(?:ref|label|cite)\{([^}]+)\}/g, '$1')
    .replace(/\\(?:mathbb|mathcal|mathrm|boldsymbol|operatorname|text)\{([^{}]*)\}/g, '$1')
    .replace(/\\ge\b/g, '≥').replace(/\\le\b/g, '≤').replace(/\\in\b/g, '∈')
    .replace(/\\subseteq\b/g, '⊆').replace(/\\oplus\b/g, '⊕')
    .replace(/\\[A-Za-z]+/g, '')
    .replace(/\$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function outlineItem(items: OutlineItem[], id: string): OutlineItem | undefined {
  for (const item of items) {
    if (item.node === id) return item
    if (item.children) {
      const found = outlineItem(item.children, id)
      if (found) return found
    }
  }
}

/** Direct manuscript sentences under one claim, in writing order, with the sentence's own marked relation. */
export function canvasSentenceLines(canvas: ThinkingCanvasV2, id: string): { id: string; text: string; relation?: SemanticRelation }[] {
  const item = outlineItem(getArrangement(canvas, PRIMARY_OUTLINE).items, id)
  if (!item?.children) return []
  const byId = new Map(canvas.nodes.map(node => [node.id, node]))
  return item.children.flatMap(child => {
    const node = byId.get(child.node)
    if (!node || !isCanvasSentence(node.id)) return []
    const edge = canvas.edges.find(link => link.from === node.id && link.relation)
    return [{ id: node.id, text: plainManuscript(node.title), relation: edge?.relation }]
  })
}
export function ensureArrangement(canvas: ThinkingCanvasV2, artifact: string): ThinkingCanvasV2 {
  return canvas.outlines.some(outline => outline.artifact === artifact) ? canvas : { ...canvas, outlines: [...canvas.outlines, { artifact, items: [] }] }
}
/** Depth-first flat view of one arrangement. Children of collapsed nodes are still listed; the view hides them. */
export function flatOutline(arrangement: OutlineArrangement): { node: string; depth: number }[] {
  const out: { node: string; depth: number }[] = []
  const walk = (items: OutlineItem[], depth: number) => items.forEach(item => {
    out.push({ node: item.node, depth })
    if (item.children) walk(item.children, depth + 1)
  })
  walk(arrangement.items, 0)
  return out
}
/** Ideas not yet arranged in this outline. They keep their content and lose nothing. */
export function unarrangedNodeIds(canvas: ThinkingCanvasV2, artifact: string): string[] {
  const arranged = new Set(flatOutline(getArrangement(canvas, artifact)).map(item => item.node))
  return canvas.nodes.map(n => n.id).filter(id => !arranged.has(id))
}

export function arrangeNode(canvas: ThinkingCanvasV2, artifact: string, node: string, parentNode?: string): ThinkingCanvasV2 {
  if (!canvas.nodes.some(n => n.id === node)) return canvas
  const base = ensureArrangement(canvas, artifact)
  if (findItem(getArrangement(base, artifact).items, node)) return base
  return updateArrangement(base, artifact, outline => {
    if (!parentNode) return { ...outline, items: [...outline.items, { node }] }
    const parent = findItem(outline.items, parentNode)
    if (!parent) return { ...outline, items: [...outline.items, { node }] }
    const host = parent.items[parent.index]
    return { ...outline, items: replaceItem(outline.items, parentNode, { ...host, children: [...(host.children ?? []), { node }] }) }
  })
}
function replaceItem(items: OutlineItem[], node: string, next: OutlineItem): OutlineItem[] {
  return items.map(item => item.node === node ? next : { ...item, ...(item.children ? { children: replaceItem(item.children, node, next) } : {}) })
}
function removeItem(items: OutlineItem[], node: string): OutlineItem[] {
  return items.filter(item => item.node !== node).map(item => item.children ? { ...item, children: removeItem(item.children, node) } : item)
}

/** Detach a node from one arrangement without deleting it; it returns to the unarranged bucket. */
export function removeNodeFromArrangement(canvas: ThinkingCanvasV2, artifact: string, node: string): ThinkingCanvasV2 {
  return updateArrangement(canvas, artifact, outline => ({ ...outline, items: removeItem(outline.items, node) }))
}

/** Reorder within the same sibling level. This is writing order, never visual position. */
export function moveOutlineItem(canvas: ThinkingCanvasV2, artifact: string, node: string, offset: -1 | 1): ThinkingCanvasV2 {
  return updateArrangement(canvas, artifact, outline => {
    const found = findItem(outline.items, node)
    if (!found) return outline
    const to = found.index + offset
    if (to < 0 || to >= found.items.length) return outline
    const items = [...found.items]
    ;[items[found.index], items[to]] = [items[to], items[found.index]]
    return { ...outline, items: replaceSiblings(outline.items, found, items) }
  })
}
function replaceSiblings(root: OutlineItem[], found: Located, items: OutlineItem[]): OutlineItem[] {
  if (!found.parent) return items
  return replaceItem(root, found.parent.node, { ...found.parent, children: items })
}
/** Indent: become the last child of the previous sibling. */
export function indentOutlineItem(canvas: ThinkingCanvasV2, artifact: string, node: string): ThinkingCanvasV2 {
  return updateArrangement(canvas, artifact, outline => {
    const found = findItem(outline.items, node)
    if (!found || found.index === 0) return outline
    const host = found.items[found.index - 1]
    const moved = found.items[found.index]
    const siblings = found.items.filter((_, index) => index !== found.index)
    const withHost = siblings.map(item => item === host ? { ...item, children: [...(item.children ?? []), moved] } : item)
    return { ...outline, items: replaceSiblings(outline.items, found, withHost) }
  })
}
/** Outdent: become the next sibling of the current parent. */
export function outdentOutlineItem(canvas: ThinkingCanvasV2, artifact: string, node: string): ThinkingCanvasV2 {
  return updateArrangement(canvas, artifact, outline => {
    const found = findItem(outline.items, node)
    if (!found?.parent) return outline
    const parent = findItem(outline.items, found.parent.node)
    if (!parent) return outline
    const moved = found.items[found.index]
    const siblings = found.items.filter((_, index) => index !== found.index)
    const root = replaceSiblings(outline.items, found, siblings)
    const relocated = findItem(root, found.parent.node)
    if (!relocated) return outline
    const items = [...relocated.items]
    items.splice(relocated.index + 1, 0, moved)
    return { ...outline, items: replaceSiblings(root, relocated, items) }
  })
}

/** Deleting a node cascades to edges and every arrangement; evidence and content go with the node only. */
export function removeCanvasNode(canvas: ThinkingCanvasV2, id: string): ThinkingCanvasV2 {
  return {
    ...canvas,
    nodes: canvas.nodes.filter(n => n.id !== id),
    edges: canvas.edges.filter(e => e.from !== id && e.to !== id),
    outlines: canvas.outlines.map(outline => ({ ...outline, items: removeItem(outline.items, id) })),
  }
}
export function addCanvasEdge(canvas: ThinkingCanvasV2, from: string, to: string): ThinkingCanvasV2 {
  if (from === to || canvas.edges.some(e => e.from === from && e.to === to)) return canvas
  return { ...canvas, edges: [...canvas.edges, { from, to }] }
}
/** An undefined relation is a plain association; it must not be read as causality or order. */
export function setEdgeRelation(canvas: ThinkingCanvasV2, index: number, relation?: SemanticRelation): ThinkingCanvasV2 {
  const edge = canvas.edges[index]
  if (!edge || edge.relation === relation) return canvas
  const next: CanvasEdgeV2 = { from: edge.from, to: edge.to }
  if (relation) next.relation = relation
  return { ...canvas, edges: canvas.edges.map((item, i) => i === index ? next : item) }
}
export function setNodeCollapsed(canvas: ThinkingCanvasV2, id: string, collapsed: boolean): ThinkingCanvasV2 {
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id || Boolean(n.collapsed) === collapsed) return n
    if (collapsed) return { ...n, collapsed: true }
    const cleaned = { ...n }; delete cleaned.collapsed; return cleaned
  }) }
}
export function newCanvasEvidence(input: Omit<CanvasEvidence, 'id'> & { id?: string }): CanvasEvidence {
  const evidence = { ...input, id: input.id ?? crypto.randomUUID() }
  validateEvidence(evidence)
  return evidence as CanvasEvidence
}
export function addNodeEvidence(canvas: ThinkingCanvasV2, id: string, evidence: CanvasEvidence): ThinkingCanvasV2 {
  return { ...canvas, nodes: canvas.nodes.map(n => n.id !== id ? n : { ...n, evidence: [...(n.evidence ?? []), evidence] }) }
}
export function removeNodeEvidence(canvas: ThinkingCanvasV2, id: string, evidenceId: string): ThinkingCanvasV2 {
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id) return n
    const evidence = (n.evidence ?? []).filter(item => item.id !== evidenceId)
    const next: CanvasNodeV2 = { ...n, evidence }
    if (!evidence.length) delete next.evidence
    return next
  }) }
}
export function setNodeWriting(canvas: ThinkingCanvasV2, id: string, key: WritingField, value: string): ThinkingCanvasV2 {
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id) return n
    const writing: WritingConstraints = { ...n.writing }
    if (value) writing[key] = value; else delete writing[key]
    const next: CanvasNodeV2 = { ...n, writing: serializeWriting(writing) }
    if (!next.writing) delete next.writing
    return next
  }) }
}

/** Semantic identity: content, hierarchy, writing order, relations, evidence and constraints.
 * Visual position (x/y) and collapse state are excluded — moving a card must not change it. */
export function semanticFingerprint(canvas: ThinkingCanvasV2): string {
  const norm = (value: unknown): unknown => Array.isArray(value) ? value.map(norm)
    : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, norm(value[key])])) : value
  const nodes = canvas.nodes.map(({ x: _x, y: _y, collapsed: _collapsed, ...rest }) => rest)
  return JSON.stringify(norm({ nodes, edges: canvas.edges, outlines: canvas.outlines }))
}

/* 白板拓扑 → 写作系统提示词。使用显式大纲的层级与顺序；只有标注了语义的边进入关系清单。
   写作意图进入上下文；omission/aside 标明不得写入正文。 */
export function canvasToPrompt(canvas: ThinkingCanvasV2, projectTitle: string): string {
  const byId = new Map(canvas.nodes.map(n => [n.id, n]))
  const lines: string[] = [`# ${projectTitle} · 写作蓝图`, '']
  const nodeLine = (n: CanvasNodeV2, prefix: string) => {
    const extras = [n.ref ? `[[${n.ref.path}]]` : '', n.anchor ? `@${n.anchor}` : ''].filter(Boolean).join(' ')
    lines.push(`${prefix}${n.title}${extras ? ` ${extras}` : ''}`)
    if (n.body?.trim()) lines.push(`${prefix}  ${n.body.trim().replace(/\n+/g, ' ')}`)
    for (const item of n.evidence ?? []) {
      const at = item.path ? `${item.path}${item.digest ? `@${item.digest}` : '（版本无法自动校验）'}` : (item.url ?? '')
      lines.push(`${prefix}  证据： ${at}${item.excerpt ? ` — ${item.excerpt.trim().slice(0, 120)}` : ''}`)
    }
    if (n.writing?.purpose) lines.push(`${prefix}  写作目的： ${n.writing.purpose.trim().replace(/\n+/g, ' ')}`)
    if (n.writing?.argument) lines.push(`${prefix}  论证安排： ${n.writing.argument.trim().replace(/\n+/g, ' ')}`)
    if (n.writing?.conditions) lines.push(`${prefix}  适用条件： ${n.writing.conditions.trim().replace(/\n+/g, ' ')}`)
    if (n.writing?.template) lines.push(`${prefix}  模板要求： ${n.writing.template.trim().replace(/\n+/g, ' ')}`)
    if (n.writing?.omission) lines.push(`${prefix}  详略（不得写入正文）： ${n.writing.omission.trim().replace(/\n+/g, ' ')}`)
    if (n.writing?.aside) lines.push(`${prefix}  正文外细节（不得写入正文）： ${n.writing.aside.trim().replace(/\n+/g, ' ')}`)
    for (const item of n.bindings ?? []) {
      lines.push(`${prefix}  对应正文： ${item.path}@${item.digest} 「${item.quote.trim().replace(/\n+/g, ' ').slice(0, 160)}」`)
    }
  }
  const arranged = new Set<string>()
  // Roots are numbered, children dashed with indentation by depth.
  const render = (items: OutlineItem[], depth: number) => {
    items.forEach((item, index) => {
      const node = byId.get(item.node)
      if (!node) return
      arranged.add(item.node)
      const indent = '   '.repeat(depth)
      nodeLine(node, depth === 0 ? `${index + 1}. ` : `${indent}- `)
      if (item.children) render(item.children, depth + 1)
    })
  }
  render(getArrangement(canvas, PRIMARY_OUTLINE).items, 0)
  const labeled = canvas.edges.filter(e => e.relation)
  if (labeled.length) {
    lines.push('', '## 语义关系')
    for (const edge of labeled) {
      const from = byId.get(edge.from), to = byId.get(edge.to)
      if (from && to) lines.push(`- ${from.title} ${RELATION_PROMPT[edge.relation!]} ${to.title}`)
    }
  }
  const loose = canvas.nodes.filter(n => !arranged.has(n.id)).sort((a, b) => a.y - b.y || a.x - b.x)
  if (loose.length) {
    lines.push('', '## 待归档想法')
    loose.forEach(idea => nodeLine(idea, '- '))
  }
  return lines.join('\n') + '\n'
}
