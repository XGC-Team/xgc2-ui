import { validateSourceBinding, type CanvasSourceBinding } from './design-source'

/* The canvas is the single design document. Positions are visual only; outlines hold writing
 * order, edges hold explicit relations, and sourceBindings hold versioned many-to-many links. */
export type CanvasNodeKind = 'chapter' | 'idea'
export type CanvasNode = {
  id: string
  kind: CanvasNodeKind
  title: string
  body?: string
  x: number
  y: number
  ref?: { path: string; title: string }
  /** A navigable file/object reference, not a verified source-block mapping. */
  anchor?: string
}
export type CanvasEdge = { from: string; to: string }
export const CANVAS_PATH = 'thinking.canvas.json'
export const PRIMARY_OUTLINE = 'canvas'
export const SEMANTIC_RELATIONS = ['supports', 'contradicts', 'depends', 'exemplifies', 'continues', 'cites'] as const
export type SemanticRelation = typeof SEMANTIC_RELATIONS[number]
export const RELATION_PROMPT: Record<SemanticRelation, string> = {
  supports: '支持', contradicts: '反驳', depends: '依赖', exemplifies: '举例', continues: '承接', cites: '引用',
}
export type CanvasEvidence = {
  id: string
  path?: string
  workspace?: string
  url?: string
  digest?: string
  excerpt?: string
  note?: string
}
export const WRITING_FIELDS = ['purpose', 'argument', 'detail', 'unwritten', 'conditions', 'template'] as const
export type WritingConstraints = Partial<Record<typeof WRITING_FIELDS[number], string>>
export const WRITING_LABELS = {
  zh: { purpose: '写作目的', argument: '论证与表达策略', detail: '详略安排', unwritten: '正文外细节', conditions: '适用条件', template: '模板要求' },
  en: { purpose: 'Writing purpose', argument: 'Argument and expression strategy', detail: 'Level of detail', unwritten: 'Details outside the manuscript', conditions: 'Applicable conditions', template: 'Template requirements' },
} as const
export type CanvasNodeV2 = CanvasNode & { collapsed?: boolean; evidence?: CanvasEvidence[]; writing?: WritingConstraints }
export type CanvasEdgeV2 = { from: string; to: string; relation?: SemanticRelation }
export type OutlineItem = { node: string; children?: OutlineItem[] }
export type OutlineArrangement = { artifact: string; items: OutlineItem[] }
export type ThinkingCanvasV2 = {
  version: 2; nodes: CanvasNodeV2[]; edges: CanvasEdgeV2[]; outlines: OutlineArrangement[]
  sourceBindings?: CanvasSourceBinding[]
}
/** All supported editable canvases use the current format. There is no v1 reader or migration. */
export type AnyCanvas = ThinkingCanvasV2
export function emptyCanvasV2(): ThinkingCanvasV2 {
  return { version: 2, nodes: [], edges: [], outlines: [{ artifact: PRIMARY_OUTLINE, items: [] }] }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function requireCanvas(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
function canvasSourcePathOK(path: string): boolean {
  return Boolean(path.trim()) && !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') && path.split('/').every(part => Boolean(part) && part !== '.' && part !== '..')
}
function validateEvidence(raw: unknown): void {
  requireCanvas(record(raw) && typeof raw.id === 'string' && raw.id.trim(), 'Invalid canvas evidence.')
  requireCanvas(raw.path === undefined || (typeof raw.path === 'string' && canvasSourcePathOK(raw.path)), 'Invalid canvas evidence source.')
  requireCanvas(raw.url === undefined || (typeof raw.url === 'string' && /^https?:\/\//.test(raw.url)), 'Invalid canvas evidence URL.')
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
/** Reject unsupported/damaged documents without filtering, empty replacement or an automatic migration. */
export function parseEditableCanvas(text: string, workspace?: string): ThinkingCanvasV2 {
  const raw: unknown = JSON.parse(text)
  requireCanvas(record(raw) && raw.version === 2 && Array.isArray(raw.nodes) && Array.isArray(raw.edges) && Array.isArray(raw.outlines), 'Unsupported canvas format. Expected version 2.')
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
    if (node.writing !== undefined) {
      requireCanvas(record(node.writing), 'Invalid writing constraints.')
      for (const key of WRITING_FIELDS) requireCanvas(node.writing[key] === undefined || typeof node.writing[key] === 'string', 'Invalid writing constraints.')
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
  if (raw.sourceBindings !== undefined) {
    requireCanvas(Array.isArray(raw.sourceBindings), 'Invalid source bindings.')
    const bindingIds = new Set<string>()
    for (const binding of raw.sourceBindings) {
      validateSourceBinding(binding, ids, workspace)
      requireCanvas(!bindingIds.has(binding.id), 'Duplicate source binding identity.')
      bindingIds.add(binding.id)
    }
  }
  return raw as unknown as ThinkingCanvasV2
}
export function serializeCanvas(canvas: ThinkingCanvasV2): string {
  const text = JSON.stringify(canvas, null, 2) + '\n'
  parseEditableCanvas(text)
  return text
}

/* Layout, hierarchy/order and semantic relations are independent editing operations. */
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
export function ensureArrangement(canvas: ThinkingCanvasV2, artifact: string): ThinkingCanvasV2 {
  return canvas.outlines.some(outline => outline.artifact === artifact) ? canvas : { ...canvas, outlines: [...canvas.outlines, { artifact, items: [] }] }
}
export function flatOutline(arrangement: OutlineArrangement): { node: string; depth: number }[] {
  const out: { node: string; depth: number }[] = []
  const walk = (items: OutlineItem[], depth: number) => items.forEach(item => {
    out.push({ node: item.node, depth })
    if (item.children) walk(item.children, depth + 1)
  })
  walk(arrangement.items, 0)
  return out
}
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
export function removeNodeFromArrangement(canvas: ThinkingCanvasV2, artifact: string, node: string): ThinkingCanvasV2 {
  return updateArrangement(canvas, artifact, outline => ({ ...outline, items: removeItem(outline.items, node) }))
}
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
export function removeCanvasNode(canvas: ThinkingCanvasV2, id: string): ThinkingCanvasV2 {
  return {
    ...canvas,
    nodes: canvas.nodes.filter(n => n.id !== id),
    edges: canvas.edges.filter(e => e.from !== id && e.to !== id),
    outlines: canvas.outlines.map(outline => ({ ...outline, items: removeItem(outline.items, id) })),
    ...(canvas.sourceBindings ? { sourceBindings: canvas.sourceBindings.map(binding => ({ ...binding, nodeIds: binding.nodeIds.filter(node => node !== id) })).filter(binding => binding.nodeIds.length) } : {}),
  }
}
export function addCanvasEdge(canvas: ThinkingCanvasV2, from: string, to: string): ThinkingCanvasV2 {
  if (from === to || canvas.edges.some(e => e.from === from && e.to === to)) return canvas
  return { ...canvas, edges: [...canvas.edges, { from, to }] }
}
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
export function setNodeWriting(canvas: ThinkingCanvasV2, id: string, key: keyof WritingConstraints, value: string): ThinkingCanvasV2 {
  return { ...canvas, nodes: canvas.nodes.map(n => {
    if (n.id !== id) return n
    const writing: WritingConstraints = { ...n.writing }
    if (value) writing[key] = value; else delete writing[key]
    const next: CanvasNodeV2 = { ...n, writing }
    if (!Object.keys(writing).length) delete next.writing
    return next
  }) }
}
/** Content, hierarchy, writing order, explicit relations, evidence, constraints and source bindings.
 * Visual position and collapse state are not design semantics. */
export function semanticFingerprint(canvas: ThinkingCanvasV2): string {
  const norm = (value: unknown): unknown => Array.isArray(value) ? value.map(norm)
    : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, norm(value[key])])) : value
  const nodes = canvas.nodes.map(({ x: _x, y: _y, collapsed: _collapsed, ...rest }) => rest)
  return JSON.stringify(norm({ nodes, edges: canvas.edges, outlines: canvas.outlines, sourceBindings: canvas.sourceBindings }))
}
/** Discussion-only design export. Application requires a freshly checked, scoped writing context. */
export function canvasToPrompt(canvas: ThinkingCanvasV2, projectTitle: string, nodeIds?: readonly string[]): string {
  const include = new Set(nodeIds ?? canvas.nodes.map(node => node.id))
  const byId = new Map(canvas.nodes.filter(node => include.has(node.id)).map(n => [n.id, n]))
  const lines = [`# ${projectTitle} · 写作蓝图`, '设计说明表达意图，不是待逐字复制的正文，也不授权修改源码。正文外细节可以保持不写入；证据和适用条件不得被表达策略掩盖。', '']
  const nodeLine = (n: CanvasNodeV2, prefix: string) => {
    const extras = [n.ref ? `[[${n.ref.path}]]` : '', n.anchor ? `@${n.anchor}` : ''].filter(Boolean).join(' ')
    lines.push(`${prefix}${n.title} [${n.id}]${extras ? ` ${extras}` : ''}`)
    if (n.body?.trim()) lines.push(n.body.trim())
    for (const key of WRITING_FIELDS) if (n.writing?.[key]?.trim()) lines.push(`${WRITING_LABELS.zh[key]}： ${n.writing[key]!.trim()}`)
    for (const item of n.evidence ?? []) {
      const at = item.path ? `${item.workspace ? `${item.workspace}/` : ''}${item.path}${item.digest ? `@${item.digest}` : '（版本无法自动校验）'}` : (item.url ?? '')
      lines.push(`证据引用（非验证结论）： ${at}${item.excerpt ? ` — ${item.excerpt}` : ''}${item.note ? `；${item.note}` : ''}`)
    }
    for (const binding of canvas.sourceBindings ?? []) if (binding.nodeIds.includes(n.id)) {
      lines.push(`正文关联： ${binding.workspace}/${binding.path}@${binding.digest} [${binding.start}, ${binding.end})；使用前须校验当前源码。`)
    }
  }
  const arranged = new Set<string>()
  const render = (items: OutlineItem[], depth: number) => items.forEach((item, index) => {
    const node = byId.get(item.node)
    if (node) { arranged.add(item.node); nodeLine(node, depth === 0 ? `${index + 1}. ` : `${'   '.repeat(depth)}- `) }
    if (item.children) render(item.children, depth + 1)
  })
  render(getArrangement(canvas, PRIMARY_OUTLINE).items, 0)
  const labeled = canvas.edges.filter(e => e.relation && byId.has(e.from) && byId.has(e.to))
  if (labeled.length) {
    lines.push('', '## 语义关系')
    for (const edge of labeled) lines.push(`- ${byId.get(edge.from)!.title} ${RELATION_PROMPT[edge.relation!]} ${byId.get(edge.to)!.title}`)
  }
  const loose = canvas.nodes.filter(n => include.has(n.id) && !arranged.has(n.id))
  if (loose.length) { lines.push('', '## 待归档想法'); loose.forEach(idea => nodeLine(idea, '- ')) }
  return lines.join('\n') + '\n'
}
