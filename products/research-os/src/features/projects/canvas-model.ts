/* 思维白板数据模型：存进项目 git 仓库的 thinking.canvas.json，随仓库版本化。
   v1：节点 = 章节 / 想法；边 = 关联；ref = 知识库笔记引用；anchor = 源稿文件锚点。
   v2：四种关系分开存放——x/y 只是视觉位置；outlines 是各制品的层级与写作顺序；
   边上的 relation 是显式语义（未标注 = 普通关联，禁止当成因果或执行顺序）；
   节点上的 evidence / writing 是证据引用与写作约束。 */
export type CanvasNodeKind = 'chapter' | 'idea'
export type CanvasNode = {
  id: string
  kind: CanvasNodeKind
  title: string
  body?: string
  x: number
  y: number
  ref?: { path: string; title: string }
  anchor?: string
}
export type CanvasEdge = { from: string; to: string }
export type ThinkingCanvas = { version: 1; nodes: CanvasNode[]; edges: CanvasEdge[] }

export const CANVAS_PATH = 'thinking.canvas.json'
export const CANVAS_V1_BACKUP_PATH = 'thinking.canvas.v1.backup.json'
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
export type WritingConstraints = { purpose?: string; conditions?: string; template?: string }
export type CanvasNodeV2 = CanvasNode & { collapsed?: boolean; evidence?: CanvasEvidence[]; writing?: WritingConstraints }
export type CanvasEdgeV2 = { from: string; to: string; relation?: SemanticRelation }
export type OutlineItem = { node: string; children?: OutlineItem[] }
export type OutlineArrangement = { artifact: string; items: OutlineItem[] }
export type ThinkingCanvasV2 = { version: 2; nodes: CanvasNodeV2[]; edges: CanvasEdgeV2[]; outlines: OutlineArrangement[] }
export type AnyCanvas = ThinkingCanvas | ThinkingCanvasV2

export function emptyCanvas(): ThinkingCanvas {
  return { version: 1, nodes: [], edges: [] }
}
export function emptyCanvasV2(): ThinkingCanvasV2 {
  return { version: 2, nodes: [], edges: [], outlines: [{ artifact: PRIMARY_OUTLINE, items: [] }] }
}

export function parseCanvas(text: string): ThinkingCanvas {
  try {
    const raw = JSON.parse(text) as Partial<ThinkingCanvas>
    const nodes = Array.isArray(raw.nodes) ? raw.nodes.filter(n => n && typeof n.id === 'string' && typeof n.title === 'string') : []
    const ids = new Set(nodes.map(n => n.id))
    const edges = Array.isArray(raw.edges) ? raw.edges.filter(e => e && ids.has(e.from) && ids.has(e.to)) : []
    return { version: 1, nodes, edges }
  } catch {
    return emptyCanvas()
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function requireCanvas(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
function canvasSourcePathOK(path: string): boolean {
  return Boolean(path.trim()) && !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') && path.split('/').every(part => Boolean(part) && part !== '.' && part !== '..')
}

function validateV1(raw: Record<string, unknown>): ThinkingCanvas {
  requireCanvas(Array.isArray(raw.nodes) && Array.isArray(raw.edges), 'Unsupported canvas format.')
  const ids = new Set<string>()
  for (const node of raw.nodes) {
    requireCanvas(record(node) && typeof node.id === 'string' && node.id && !ids.has(node.id) &&
      (node.kind === 'chapter' || node.kind === 'idea') && typeof node.title === 'string' &&
      typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y) &&
      (node.body === undefined || typeof node.body === 'string') && (node.anchor === undefined || typeof node.anchor === 'string') &&
      (node.ref === undefined || (record(node.ref) && typeof node.ref.path === 'string' && typeof node.ref.title === 'string')), 'Invalid canvas node.')
    ids.add(node.id as string)
  }
  for (const edge of raw.edges) {
    requireCanvas(record(edge) && typeof edge.from === 'string' && typeof edge.to === 'string' && ids.has(edge.from) && ids.has(edge.to), 'Invalid canvas edge.')
  }
  return raw as unknown as ThinkingCanvas
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
    if (node.writing !== undefined) {
      requireCanvas(record(node.writing), 'Invalid writing constraints.')
      for (const key of ['purpose', 'conditions', 'template']) requireCanvas(node.writing[key] === undefined || typeof node.writing[key] === 'string', 'Invalid writing constraints.')
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
 * Unknown fields on a valid file are retained for round-trip compatibility. Unknown versions fail closed. */
export function parseEditableCanvas(text: string): AnyCanvas {
  const raw: unknown = JSON.parse(text)
  requireCanvas(record(raw) && (raw.version === 1 || raw.version === 2), 'Unsupported canvas format.')
  return raw.version === 1 ? validateV1(raw) : validateV2(raw)
}

export function serializeCanvas(canvas: AnyCanvas): string {
  return JSON.stringify(canvas, null, 2) + '\n'
}

/** v1 → v2: IDs, refs, anchors, content and unknown fields are preserved. Chapter→idea edges seed the
 * outline hierarchy and y/x seeds its order exactly once; the edges themselves stay plain associations —
 * unlabeled links are never promoted into causal or hierarchical semantics. */
export function migrateCanvasV1toV2(canvas: ThinkingCanvas): ThinkingCanvasV2 {
  const byPosition = (a: CanvasNode, b: CanvasNode) => a.y - b.y || a.x - b.x
  const chapters = canvas.nodes.filter(n => n.kind === 'chapter').sort(byPosition)
  const ideas = new Map(canvas.nodes.filter(n => n.kind === 'idea').map(n => [n.id, n]))
  const attached = new Set<string>()
  const items: OutlineItem[] = chapters.map(chapter => {
    const children = canvas.edges.filter(e => e.from === chapter.id && ideas.has(e.to))
      .map(e => ideas.get(e.to)!).sort(byPosition)
    children.forEach(idea => attached.add(idea.id))
    return { node: chapter.id, ...(children.length ? { children: children.map(idea => ({ node: idea.id })) } : {}) }
  })
  return { ...canvas, version: 2, nodes: canvas.nodes.map(n => ({ ...n })), edges: canvas.edges.map(e => ({ ...e })), outlines: [{ artifact: PRIMARY_OUTLINE, items }] }
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
  return updateArrangement(base, artifact, outline => {
    if (findItem(outline.items, node)) return outline
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

/** Reorder within the same sibling level. This is writing order, never visual position. */export function moveOutlineItem(canvas: ThinkingCanvasV2, artifact: string, node: string, offset: -1 | 1): ThinkingCanvasV2 {
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

/** Semantic identity: content, hierarchy, writing order, relations, evidence and constraints.
 * Visual position (x/y) and collapse state are excluded — moving a card must not change it. */
export function semanticFingerprint(canvas: ThinkingCanvasV2): string {
  const norm = (value: unknown): unknown => Array.isArray(value) ? value.map(norm)
    : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, norm(value[key])])) : value
  const nodes = canvas.nodes.map(({ x: _x, y: _y, collapsed: _collapsed, ...rest }) => rest)
  return JSON.stringify(norm({ nodes, edges: canvas.edges, outlines: canvas.outlines }))
}

/* 白板拓扑 → 写作系统提示词。v1 保留坐标推断的原有行为；v2 使用显式大纲的层级与顺序，
   只有标注了语义的边进入关系清单，未标注的普通关联不产生因果或顺序。 */
export function canvasToPrompt(canvas: AnyCanvas, projectTitle: string): string {
  if (canvas.version === 2) return canvasV2ToPrompt(canvas, projectTitle)
  const chapters = canvas.nodes.filter(n => n.kind === 'chapter').sort((a, b) => a.y - b.y || a.x - b.x)
  const ideas = canvas.nodes.filter(n => n.kind === 'idea')
  const attached = new Set<string>()
  const lines: string[] = [`# ${projectTitle} · 写作蓝图`, '']
  const nodeLine = (n: CanvasNode, prefix: string) => {
    const extras = [n.ref ? `[[${n.ref.path}]]` : '', n.anchor ? `@${n.anchor}` : ''].filter(Boolean).join(' ')
    lines.push(`${prefix}${n.title}${extras ? ` ${extras}` : ''}`)
    if (n.body?.trim()) lines.push(`${prefix}  ${n.body.trim().replace(/\n+/g, ' ')}`)
  }
  chapters.forEach((chapter, index) => {
    nodeLine(chapter, `${index + 1}. `)
    const children = canvas.edges.filter(e => e.from === chapter.id).map(e => ideas.find(n => n.id === e.to)).filter((n): n is CanvasNode => Boolean(n))
    children.sort((a, b) => a.y - b.y || a.x - b.x).forEach(idea => { attached.add(idea.id); nodeLine(idea, `   - `) })
  })
  const loose = ideas.filter(n => !attached.has(n.id)).sort((a, b) => a.y - b.y || a.x - b.x)
  if (loose.length) {
    lines.push('', '## 待归档想法')
    loose.forEach(idea => nodeLine(idea, '- '))
  }
  return lines.join('\n') + '\n'
}

function canvasV2ToPrompt(canvas: ThinkingCanvasV2, projectTitle: string): string {
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
    if (n.writing?.conditions) lines.push(`${prefix}  适用条件： ${n.writing.conditions.trim().replace(/\n+/g, ' ')}`)
    if (n.writing?.template) lines.push(`${prefix}  模板要求： ${n.writing.template.trim().replace(/\n+/g, ' ')}`)
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
