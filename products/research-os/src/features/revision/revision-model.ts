import { CARD_TYPES, CONTENT_PATH, cardType, cardTypeFields, isCardType, type CardType, type ContentDocument, type ContentObject, type ContentRelation } from '../content/content-model'
import { SEMANTIC_RELATIONS, type SemanticRelation } from '../projects/canvas-model'
import type { DraftBlock, DraftSource, ResearchDraft } from '../projects/draft-model'

/* Review-driven revision on the one research content document.
   Reviewer comments become `revision` objects; agents propose canvas patches that a human accepts or rejects.
   Nothing here performs I/O: callers apply the result through the shared content writer. */

// ---------- reviewer comments → revision items ----------

export type ReviewComment = { reviewer: string; label: string; text: string }

const REVIEWER = /^\s*(?:#+\s*)?(?:reviewer|referee|审稿人|评审人)\s*#?\s*([A-Za-z0-9]+)\b[\s:：.-]*$/i
const ITEM = /^\s*(?:(?:comment|point|q|r)\s*)?(?:\(?(\d+(?:\.\d+)*)[).:：]|(\d+(?:\.\d+)*)\s*[-–—]|[-*•])\s+/i

/** Split pasted reviewer text into items. Headings like "Reviewer 2" set the reviewer; numbered or bulleted
 * lines start items; without markers, blank-line separated paragraphs are items. Text is never rewritten. */
export function splitReviewComments(text: string): ReviewComment[] {
  const out: ReviewComment[] = []
  let reviewer = '', current: ReviewComment | null = null, counter = 0
  const flush = () => { if (current && current.text.trim()) out.push({ ...current, text: current.text.trim() }); current = null }
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const marked = lines.some(line => ITEM.test(line))
  for (const line of lines) {
    const head = line.match(REVIEWER)
    if (head) { flush(); reviewer = `R${head[1]}`; counter = 0; continue }
    const item = marked ? line.match(ITEM) : null
    if (item) {
      flush(); counter += 1
      const number = item[1] ?? item[2] ?? String(counter)
      current = { reviewer, label: `${reviewer || 'R'}.${number}`, text: line.slice(item[0].length) }
      continue
    }
    if (!line.trim()) { if (!marked) flush(); else if (current) current.text += '\n'; continue }
    if (!current) { counter += 1; current = { reviewer, label: `${reviewer || 'R'}.${counter}`, text: line } }
    else current.text += (current.text && !current.text.endsWith('\n') ? '\n' : '') + line
  }
  flush()
  return out
}

const firstLine = (text: string, max = 72) => { const line = text.split('\n')[0].trim(); return line.length > max ? line.slice(0, max - 1) + '…' : line }

/** Place new revision cards in a column right of everything already on the canvas. */
export function addRevisionItems(document: ContentDocument, comments: ReviewComment[], makeId: () => string = () => crypto.randomUUID()): { document: ContentDocument; ids: string[] } {
  const right = document.views.canvas.placements.reduce((x, p) => Math.max(x, p.x + 360), 48)
  const ids: string[] = []
  const objects: ContentObject[] = comments.map(comment => {
    const id = makeId(); ids.push(id)
    return { id, ...cardTypeFields('revision'), title: `${comment.label} · ${firstLine(comment.text)}`, body: comment.text, sources: [], status: 'open', tags: ['review', ...(comment.reviewer ? [comment.reviewer] : [])] }
  })
  const placements = objects.map((object, i) => ({ objectId: object.id, x: right, y: 40 + i * ROW }))
  return { ids, document: { ...document, objects: [...document.objects, ...objects], views: { ...document.views, canvas: { ...document.views.canvas, placements: [...document.views.canvas.placements, ...placements] } } } }
}

const ROW = 240, COLUMN = 360

export const REVISION_STATUSES = ['open', 'planned', 'addressed', 'declined'] as const
export type RevisionStatus = typeof REVISION_STATUSES[number]

// ---------- canvas patches (agent proposals) ----------

export const PATCH_FENCE = 'research-canvas-patch'
export type PatchOp =
  | { op: 'add-card'; ref?: string; kind: CardType; title: string; body?: string; status?: string }
  | { op: 'update-card'; id: string; title?: string; body?: string; status?: string; kind?: CardType }
  | { op: 'add-relation'; from: string; to: string; relation: SemanticRelation }
export type CanvasPatch = { summary?: string; ops: PatchOp[] }
export type ExtractedPatch = { patch?: CanvasPatch; error?: string; raw: string }

function decodeOp(value: unknown): PatchOp {
  if (!value || typeof value !== 'object') throw new Error('An operation must be an object.')
  const op = value as Record<string, unknown>
  const text = (key: string) => typeof op[key] === 'string' ? op[key] as string : undefined
  const kind = (key: string) => { const k = op[key]; if (k === undefined) return undefined; if (!isCardType(k)) throw new Error(`Unknown card kind: ${String(k)}`); return k }
  switch (op.op) {
    case 'add-card': {
      const title = text('title')?.trim(); if (!title) throw new Error('add-card needs a title.')
      return { op: 'add-card', ref: text('ref'), kind: kind('kind') ?? 'note', title, body: text('body'), status: text('status') }
    }
    case 'update-card': {
      const id = text('id'); if (!id) throw new Error('update-card needs an id.')
      return { op: 'update-card', id, title: text('title'), body: text('body'), status: text('status'), kind: kind('kind') }
    }
    case 'add-relation': {
      const from = text('from'), to = text('to'), relation = op.relation
      if (!from || !to) throw new Error('add-relation needs from and to.')
      if (!(SEMANTIC_RELATIONS as readonly unknown[]).includes(relation)) throw new Error(`Unknown relation: ${String(relation)}`)
      return { op: 'add-relation', from, to, relation: relation as SemanticRelation }
    }
    default: throw new Error(`Unknown operation: ${String(op.op)}`)
  }
}

/** Find fenced ```research-canvas-patch blocks in an agent reply. A block that fails to parse is reported, never guessed. */
export function extractCanvasPatches(text: string): ExtractedPatch[] {
  const out: ExtractedPatch[] = []
  const fence = new RegExp('```' + PATCH_FENCE + '\\s*\\n([\\s\\S]*?)```', 'g')
  for (const match of text.matchAll(fence)) {
    const raw = match[1].trim()
    try {
      const value: unknown = JSON.parse(raw)
      const ops = Array.isArray(value) ? value : (value as { ops?: unknown })?.ops
      if (!Array.isArray(ops) || !ops.length) throw new Error('The patch has no operations.')
      const summary = !Array.isArray(value) && typeof (value as { summary?: unknown }).summary === 'string' ? (value as { summary: string }).summary : undefined
      out.push({ raw, patch: { summary, ops: ops.map(decodeOp) } })
    } catch (error) { out.push({ raw, error: error instanceof Error ? error.message : String(error) }) }
  }
  return out
}

/** Problems that make a patch unsafe to apply to this document (unknown targets). */
export function validateCanvasPatch(document: ContentDocument, patch: CanvasPatch): string[] {
  const ids = new Set(document.objects.map(o => o.id)), refs = new Set<string>(), issues: string[] = []
  for (const op of patch.ops) {
    if (op.op === 'add-card' && op.ref) { if (refs.has(op.ref) || ids.has(op.ref)) issues.push(`Duplicate card reference: ${op.ref}`); refs.add(op.ref) }
    if (op.op === 'update-card' && !ids.has(op.id)) issues.push(`Card not found: ${op.id}`)
    if (op.op === 'add-relation') for (const end of [op.from, op.to]) if (!ids.has(end) && !refs.has(end)) issues.push(`Relation endpoint not found: ${end}`)
  }
  return issues
}

const withType = (type: CardType): Partial<ContentObject> => { const fields = cardTypeFields(type); return { kind: fields.kind, role: fields.role } }

/** Apply an accepted patch. New cards stack below the current layout; relations become typed content relations. */
export function applyCanvasPatch(document: ContentDocument, patch: CanvasPatch, makeId: () => string = () => crypto.randomUUID()): ContentDocument {
  const issues = validateCanvasPatch(document, patch)
  if (issues.length) throw new Error(issues.join(' '))
  const refs = new Map<string, string>()
  const bottom = document.views.canvas.placements.reduce((y, p) => Math.max(y, p.y + ROW), 40)
  let objects = [...document.objects], placements = [...document.views.canvas.placements], added = 0
  // A new card related to an existing one sits beside it (answer next to the comment); others stack below the layout.
  const anchorOf = new Map<string, string>()
  for (const op of patch.ops) if (op.op === 'add-relation') for (const [card, other] of [[op.from, op.to], [op.to, op.from]]) if (!anchorOf.has(card) && document.objects.some(o => o.id === other)) anchorOf.set(card, other)
  const taken = (x: number, y: number) => placements.some(p => Math.abs(p.x - x) < COLUMN && Math.abs(p.y - y) < ROW / 2)
  const relations: ContentRelation[] = [...document.relations]
  const resolve = (id: string) => refs.get(id) ?? id
  for (const op of patch.ops) {
    if (op.op === 'add-card') {
      const id = makeId(); if (op.ref) refs.set(op.ref, id)
      objects.push({ id, ...cardTypeFields(op.kind), title: op.title, ...(op.body ? { body: op.body } : {}), sources: [], ...(op.status ? { status: op.status } : {}), tags: ['proposal'] })
      const anchor = op.ref ? placements.find(p => p.objectId === anchorOf.get(op.ref!)) : undefined
      let spot = anchor ? { x: anchor.x + COLUMN, y: anchor.y } : undefined
      while (spot && taken(spot.x, spot.y)) spot = { x: spot.x + COLUMN, y: spot.y }
      if (!spot) { spot = { x: 48 + (added % 3) * COLUMN, y: bottom + Math.floor(added / 3) * ROW }; added += 1 }
      placements.push({ objectId: id, ...spot })
    } else if (op.op === 'update-card') {
      objects = objects.map(o => o.id === op.id ? { ...o, ...(op.title !== undefined ? { title: op.title } : {}), ...(op.body !== undefined ? { body: op.body } : {}), ...(op.status !== undefined ? { status: op.status } : {}), ...(op.kind ? withType(op.kind) : {}) } : o)
    } else {
      const end = (id: string) => ({ kind: 'content' as const, workspace: document.workspace, path: CONTENT_PATH, id: resolve(id) })
      relations.push({ id: makeId(), from: end(op.from), to: end(op.to), relation: op.relation })
    }
  }
  placements = placements.filter((p, i, all) => all.findIndex(q => q.objectId === p.objectId) === i)
  return { ...document, objects, relations, views: { ...document.views, canvas: { ...document.views.canvas, placements } } }
}

/** Rule-based sample, clearly not an agent: pair each open revision item that has no decision yet with a decision card. */
export function sampleRevisionProposal(document: ContentDocument, locale: 'zh' | 'en'): CanvasPatch | null {
  const decided = new Set(document.relations.filter(r => r.relation === 'depends').map(r => r.to.id))
  const open = document.objects.filter(o => cardType(o) === 'revision' && (o.status ?? 'open') === 'open' && !decided.has(o.id)).slice(0, 3)
  if (!open.length) return null
  const ops: PatchOp[] = []
  open.forEach((item, i) => {
    const ref = `decision-${i + 1}`
    ops.push({ op: 'add-card', ref, kind: 'decision', title: locale === 'zh' ? `应对方案：${item.title}` : `Response plan: ${item.title}`, body: locale === 'zh' ? '待讨论：接受 / 部分接受 / 反驳，并说明修改位置与证据。' : 'To discuss: accept / partly accept / rebut, with the change location and evidence.', status: 'draft' })
    ops.push({ op: 'add-relation', from: ref, to: item.id, relation: 'depends' })
  })
  return { summary: locale === 'zh' ? `为 ${open.length} 条未处理的审稿意见各起草一个决策卡（规则生成示例，非 Agent）` : `Draft a decision card for ${open.length} open review item(s) (rule-based sample, not an agent)`, ops }
}

/** How any native agent should propose canvas edits: fenced JSON patches that a human reviews. */
export function patchContract(locale: 'zh' | 'en'): string {
  const zh = locale === 'zh'
  return [
    zh ? `如需修改研究画布，请只以提议形式给出，用 \`\`\`${PATCH_FENCE} 代码块包裹 JSON：{"summary":"…","ops":[{"op":"add-card","ref":"d1","kind":"decision","title":"…","body":"…"},{"op":"add-relation","from":"d1","to":"<卡片 id>","relation":"depends"},{"op":"update-card","id":"<卡片 id>","status":"planned"}]}。提议由人在界面中接受或拒绝，不会自动写回。`
      : `To change the research canvas, only propose it, as JSON inside a \`\`\`${PATCH_FENCE} block: {"summary":"…","ops":[{"op":"add-card","ref":"d1","kind":"decision","title":"…","body":"…"},{"op":"add-relation","from":"d1","to":"<card id>","relation":"depends"},{"op":"update-card","id":"<card id>","status":"planned"}]}. A human accepts or rejects proposals in the UI; nothing is written back automatically.`,
    `kinds: ${CARD_TYPES.join(', ')} · relations: ${SEMANTIC_RELATIONS.join(', ')}`
  ].join('\n')
}

/** Instructions appended to a revision thread so any native agent can answer with reviewable patches. */
export function revisionThreadSeed(input: { project: string; locale: 'zh' | 'en'; items: Pick<ContentObject, 'id' | 'title' | 'status'>[] }): string {
  const zh = input.locale === 'zh'
  const list = input.items.length ? input.items.map(item => `- ${item.id} · ${item.title} [${item.status ?? 'open'}]`).join('\n') : (zh ? '（尚无修订项：先在「修订」视图粘贴审稿意见）' : '(No revision items yet: paste reviewer comments in the Revision view first)')
  return [
    zh ? `[修订线程] 项目：${input.project}` : `[Revision thread] Project: ${input.project}`,
    zh ? '目标：逐条讨论审稿意见，确定修订方案（接受 / 部分接受 / 反驳 + 证据），再改稿。' : 'Goal: discuss each reviewer comment, decide a revision plan (accept / partly accept / rebut + evidence), then revise.',
    zh ? '修订项（画布卡片 id · 标题 [状态]）：' : 'Revision items (canvas card id · title [status]):',
    list,
    patchContract(input.locale),
  ].join('\n') + '\n'
}

// ---------- derivations / findings → knowledge ----------

export const FINDINGS_ROOT = 'memory/findings'
const slug = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'finding'

export function findingPath(project: string, title: string, at: Date): string {
  const safeProject = project.replace(/[^A-Za-z0-9._-]/g, '-') || 'project'
  return `${FINDINGS_ROOT}/${safeProject}/${at.toISOString().slice(0, 10)}-${slug(title)}.md`
}

/** A durable Markdown finding with an explicit back-link to its card and (optionally) thread. */
export function findingMarkdown(input: { title: string; body: string; project: string; cardId: string; cardTitle: string; contentDigest?: string; thread?: string; at: Date }): string {
  const quote = (value: string) => JSON.stringify(value)
  return [
    '---',
    `title: ${quote(input.title)}`,
    'type: finding',
    `project: ${quote(input.project)}`,
    `source: ${quote(`${input.project}/${CONTENT_PATH}#object/${input.cardId}`)}`,
    ...(input.contentDigest ? [`source_revision: ${quote(input.contentDigest)}`] : []),
    ...(input.thread ? [`thread: ${quote(input.thread)}`] : []),
    `created: ${input.at.toISOString()}`,
    'status: project-finding  # not yet promoted to global knowledge',
    '---',
    '',
    `# ${input.title}`,
    '',
    input.body.trim(),
    '',
    `Derived from canvas card “${input.cardTitle}” in project ${input.project}.`,
    '',
  ].join('\n')
}

// ---------- PDF annotation → canvas card ----------

/** A saved PDF annotation becomes a revision card anchored to the exact PDF version, page and quote. */
export function annotationCard(input: { annotationId: string; id: string; pdf: { workspace: string; path: string; digest: string; buildId?: string }; page: number; quote: string; comment: string }): ContentObject {
  const quote = input.quote.trim()
  return {
    id: input.id, ...cardTypeFields('revision'), status: 'open', tags: ['pdf-annotation'],
    title: `PDF p.${input.page} · ${firstLine(input.comment)}`,
    body: input.comment.trim() + (quote ? `\n\n> ${quote.replace(/\n/g, '\n> ')}` : ''),
    annotationId: input.annotationId,
    sources: [{ kind: 'file', workspace: input.pdf.workspace, path: input.pdf.path, digest: input.pdf.digest, selector: { page: input.page, ...(quote ? { quote } : {}), ...(input.pdf.buildId ? { buildId: input.pdf.buildId } : {}) } }],
  }
}

// ---------- revision → outputs (same objects, existing draft/artifact pipeline) ----------

/** A response-to-reviewers letter (paper draft) or talk slides built from the revision and decision cards.
 * Blocks cite the cards by id at the observed content revision; the drafts editor and ArtifactStudio take it from there. */
export function revisionOutputDraft(input: { document: ContentDocument; kind: 'paper' | 'slides'; locale: 'zh' | 'en'; digest?: string; at: Date; makeId?: () => string }): ResearchDraft {
  const { document, kind, locale } = input, zh = locale === 'zh', makeId = input.makeId ?? (() => crypto.randomUUID())
  const at = input.at.toISOString()
  const decisionsFor = (id: string) => document.relations.filter(r => r.to.id === id || r.from.id === id)
    .map(r => document.objects.find(o => o.id === (r.to.id === id ? r.from.id : r.to.id)))
    .filter((o): o is ContentObject => Boolean(o) && cardType(o!) === 'decision')
  const items = document.objects.filter(o => cardType(o) === 'revision')
  const sources: DraftSource[] = items.map(o => ({ id: o.id, path: CONTENT_PATH, workspace: document.workspace, ...(input.digest ? { digest: input.digest } : {}), excerpt: o.title }))
  const blocks: DraftBlock[] = items.map((item): DraftBlock => {
    const answers = decisionsFor(item.id)
    const answer = answers.map(d => `${d.title}${d.body ? `\n${d.body}` : ''}`).join('\n\n')
    return kind === 'paper'
      ? { id: makeId(), title: item.title, role: 'section', sourceIds: [item.id], fields: { purpose: item.body ?? item.title, argument: answer, evidence: '', constraints: item.status ?? 'open' } }
      : { id: makeId(), title: item.title, sourceIds: [item.id], fields: { message: answers[0]?.title ?? item.title, visual: '', speakerNotes: [item.body ?? '', answer].filter(Boolean).join('\n\n') } }
  })
  return {
    id: makeId(), kind, status: 'draft', createdAt: at, updatedAt: at, blocks, sources,
    title: kind === 'paper' ? (zh ? '审稿意见回复信' : 'Response to reviewers') : (zh ? '修订答辩幻灯片' : 'Revision talk slides'),
  }
}
