import { CONTENT_PATH } from '../content/content-model'
import type { Anchor, Operation, Proposal, Scope } from '../review/review-model'

/* Plan → manuscript. In a revision thread the agent proposes source edits as fenced
   ```research-source-patch blocks. Each edit names the exact text it replaces in a saved file,
   so it can be located against the current revision (never by line numbers the agent guessed).
   A resolved patch becomes one proposal in the existing review journal: diff preview, guarded
   apply/revert and receipts are the journal's — no second write path. Editing source needs no TeX;
   nothing here claims a rebuilt PDF. */

export const SOURCE_FENCE = 'research-source-patch'
export type SourceEdit = { path: string; before: string; after: string; reason: string; cards?: string[] }
export type SourcePatch = { summary?: string; edits: SourceEdit[] }
export type ExtractedSourcePatch = { patch?: SourcePatch; error?: string }

const EDITABLE = /\.(tex|md|txt|bib)$/i
const str = (v: unknown): v is string => typeof v === 'string'

export function parseSourcePatch(value: unknown): SourcePatch {
  if (!value || typeof value !== 'object') throw new Error('Source patch must be a JSON object.')
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.edits) || !raw.edits.length) throw new Error('Source patch needs a non-empty "edits" list.')
  if (raw.edits.length > 40) throw new Error('Too many edits in one source patch (max 40).')
  const edits = raw.edits.map((e, i): SourceEdit => {
    const edit = e as Record<string, unknown>
    if (!edit || typeof edit !== 'object') throw new Error(`Edit ${i + 1} is not an object.`)
    const path = str(edit.path) ? edit.path.replace(/^\.?\//, '') : ''
    if (!path || !EDITABLE.test(path) || path.split('/').some(p => !p || p === '..' || p.startsWith('.'))) throw new Error(`Edit ${i + 1}: "path" must be a project .tex/.md/.txt/.bib file.`)
    if (!str(edit.before) || !edit.before) throw new Error(`Edit ${i + 1}: "before" must quote the exact current text.`)
    if (!str(edit.after)) throw new Error(`Edit ${i + 1}: "after" must be a string.`)
    if (edit.before === edit.after) throw new Error(`Edit ${i + 1}: "before" and "after" are identical.`)
    const cards = Array.isArray(edit.cards) ? edit.cards.filter(str) : undefined
    return { path, before: edit.before, after: edit.after, reason: str(edit.reason) && edit.reason.trim() ? edit.reason.trim() : 'Revision edit', ...(cards?.length ? { cards } : {}) }
  })
  return { ...(str(raw.summary) && raw.summary.trim() ? { summary: raw.summary.trim() } : {}), edits }
}

export function extractSourcePatches(text: string): ExtractedSourcePatch[] {
  const out: ExtractedSourcePatch[] = []
  const fence = new RegExp('```' + SOURCE_FENCE + '[^\\n]*\\n([\\s\\S]*?)```', 'g')
  for (const match of text.matchAll(fence)) {
    try { out.push({ patch: parseSourcePatch(JSON.parse(match[1])) }) } catch (error) { out.push({ error: error instanceof Error ? error.message : String(error) }) }
  }
  return out
}

export type SavedFile = { content: string; digest: string }
export type ResolvedEdit = SourceEdit & { start: number; end: number; digest: string }

/** Locate every edit in the saved file it names. An edit resolves only when its "before" text occurs exactly once. */
export function resolveSourcePatch(patch: SourcePatch, files: Record<string, SavedFile | null>): { edits: ResolvedEdit[]; problems: string[] } {
  const edits: ResolvedEdit[] = [], problems: string[] = []
  patch.edits.forEach((edit, i) => {
    const file = files[edit.path]
    if (!file) { problems.push(`Edit ${i + 1}: ${edit.path} was not found in the project.`); return }
    const start = file.content.indexOf(edit.before)
    if (start < 0) { problems.push(`Edit ${i + 1}: the quoted text is not in the saved ${edit.path} (it may have changed).`); return }
    if (file.content.indexOf(edit.before, start + 1) >= 0) { problems.push(`Edit ${i + 1}: the quoted text occurs more than once in ${edit.path}; quote more context.`); return }
    const end = start + edit.before.length
    const clash = edits.find(e => e.path === edit.path && start < e.end && e.start < end)
    if (clash) { problems.push(`Edit ${i + 1} overlaps another edit in ${edit.path}.`); return }
    edits.push({ ...edit, start, end, digest: file.digest })
  })
  return { edits, problems }
}

/** One journal proposal for a resolved patch. Evidence: the replaced passage, plus the revision cards the edit answers. */
export function sourcePatchProposal(input: {
  scope: Scope; id: string; author: string; at: Date; label: string; patch: SourcePatch; edits: ResolvedEdit[]
  cards: { id: string; title: string }[]; contentDigest?: string; locale: 'zh' | 'en'
}): Proposal {
  const { scope, edits } = input, zh = input.locale === 'zh', at = input.at.toISOString()
  if (!edits.length) throw new Error('No edit could be located in the saved manuscript.')
  const cardAnchor = (id: string): Anchor | null => {
    const card = input.cards.find(c => c.id === id)
    return card && input.contentDigest ? { kind: 'canvas', workspace: scope.workspace, path: CONTENT_PATH, digest: input.contentDigest, quote: card.title, target: { kind: 'canvas', workspace: scope.workspace, path: CONTENT_PATH, objectId: id, field: 'title' } } : null
  }
  const operations: Operation[] = edits.map((edit, i) => {
    const passage: Anchor = { kind: 'text', workspace: scope.workspace, path: edit.path, digest: edit.digest, quote: edit.before.slice(0, 400) }
    return {
      id: `${input.id}-e${i + 1}`,
      target: { kind: 'text', workspace: scope.workspace, path: edit.path, start: edit.start, end: edit.end },
      baseDigest: edit.digest, before: edit.before, after: edit.after, reason: edit.reason,
      evidence: [passage, ...(edit.cards ?? []).map(cardAnchor).filter((a): a is Anchor => Boolean(a))],
      dependsOn: [], impacts: [],
    }
  })
  const first = edits[0]
  return {
    id: input.id, author: input.author, at,
    title: input.patch.summary || (zh ? `稿件修改 · ${edits.length} 处` : `Manuscript edits · ${edits.length}`),
    feedback: { id: `${input.id}-f`, author: input.author, at, body: zh ? `Agent 在对话中提出（${input.label}）。接受前逐条核对差异。` : `Proposed by the agent in chat (${input.label}). Check each difference before applying.`, anchor: { kind: 'text', workspace: scope.workspace, path: first.path, digest: first.digest, quote: first.before.slice(0, 400) } },
    operations,
  }
}

/** Revision cards an applied proposal answered (read back from its canvas evidence). */
export function answeredCards(proposal: Pick<Proposal, 'operations'>): string[] {
  const ids = new Set<string>()
  for (const o of proposal.operations) for (const a of o.evidence) if (a.kind === 'canvas' && a.target?.kind === 'canvas') ids.add(a.target.objectId)
  return [...ids]
}

/** Stable journal identity for a patch found in a given agent message, so re-detection never files it twice. */
export function sourceProposalId(session: string, message: string, index: number): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'x'
  return `src-${clean(session)}-${clean(message)}-${index}`
}

/** How an agent should propose manuscript edits: exact quotes of the saved text, reviewed as diffs, never auto-applied. */
export function sourcePatchContract(locale: 'zh' | 'en', files: string[]): string {
  const zh = locale === 'zh'
  const list = files.length ? files.join(', ') : (zh ? '（项目里还没有 .tex/.md 稿件）' : '(no .tex/.md manuscript in the project yet)')
  return [
    zh ? `稿件文件：${list}` : `Manuscript files: ${list}`,
    zh ? `如需修改稿件，请只以提议形式给出，用 \`\`\`${SOURCE_FENCE} 代码块包裹 JSON：{"summary":"…","edits":[{"path":"manuscript/main.tex","before":"<稿件中原样出现、且唯一的原文>","after":"<改后文本>","reason":"…","cards":["<修订项卡片 id>"]}]}。before 必须逐字引用当前保存的原文；修改在界面中逐条审阅后才写入，不会自动编译 PDF。`
      : `To change the manuscript, only propose it, as JSON inside a \`\`\`${SOURCE_FENCE} block: {"summary":"…","edits":[{"path":"manuscript/main.tex","before":"<exact, unique text as currently saved>","after":"<replacement>","reason":"…","cards":["<revision card id>"]}]}. "before" must quote the saved text verbatim; edits are reviewed as diffs in the UI before anything is written, and no PDF is compiled automatically.`,
  ].join('\n')
}

/** The saved manuscript text, bounded, pinned to its digest — so the agent quotes real text instead of guessing. */
export function manuscriptExcerpt(files: { path: string; content: string; digest: string }[], budget = 12000): string {
  let left = budget
  const parts: string[] = []
  for (const file of files) {
    if (left <= 0) break
    const body = file.content.length > left ? `${file.content.slice(0, left)}\n% … truncated` : file.content
    left -= body.length
    parts.push(`${file.path} @ ${file.digest}\n\`\`\`tex\n${body}\n\`\`\``)
  }
  return parts.join('\n')
}
