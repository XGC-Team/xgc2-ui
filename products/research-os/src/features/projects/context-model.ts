import { CANVAS_PATH, canvasToPrompt, parseEditableCanvas } from './canvas-model'
import { DRAFTS_PATH, draftContext, draftIdFromAnchor, parseDraftBook, type DraftSource } from './draft-model'

/** A visible, project-scoped Chat context item. Adding to the set never sends anything. */
export type ContextItemKind = 'canvas-node' | 'draft' | 'source'
export type ContextState = 'current' | 'unverifiable' | 'update-available' | 'stale-snapshot' | 'missing'
export type ContextItem = {
  id: string
  project: string
  kind: ContextItemKind
  label: string
  /** research-drafts.json#<draftId> · thinking.canvas.json#<nodeId> · source path */
  ref: string
  source?: DraftSource
  digest?: string
  excerpt?: string
  capturedAt: string
  state: ContextState
  latestDigest?: string
}
function requireContext(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }

export function newContextItem(input: {
  id?: string; project: string; kind: ContextItemKind; label: string; ref: string
  source?: DraftSource; digest?: string; excerpt?: string; capturedAt?: string
}): ContextItem {
  requireContext(input.project.trim() && input.ref.trim() && input.label !== undefined, 'Invalid context item.')
  requireContext(!input.digest || !input.source?.digest || input.digest === input.source.digest, 'Context/source revisions disagree.')
  return {
    id: input.id ?? crypto.randomUUID(), project: input.project, kind: input.kind, label: input.label, ref: input.ref,
    ...(input.source ? { source: input.source } : {}), ...(input.digest ? { digest: input.digest } : {}),
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    state: input.digest ? 'current' : 'unverifiable',
  }
}

/** Compare against a freshly observed revision. `null` means the source/object no longer exists. */
export function assessContextItem(item: ContextItem, observed: { digest?: string } | null): ContextItem {
  if (observed === null) { const next = { ...item, state: 'missing' as const }; delete next.latestDigest; return next }
  if (item.digest && observed.digest) {
    if (item.digest === observed.digest) {
      const next = { ...item, state: 'current' as const }
      delete next.latestDigest
      return next
    }
    return { ...item, state: 'update-available', latestDigest: observed.digest }
  }
  const next = { ...item, state: 'unverifiable' as const }
  delete next.latestDigest
  return observed.digest ? { ...next, latestDigest: observed.digest } : next
}
export function canvasContextNodeId(item: ContextItem): string {
  const prefix = `${CANVAS_PATH}#`
  requireContext(item.kind === 'canvas-node' && item.ref.startsWith(prefix) && item.ref.length > prefix.length && item.source?.path === CANVAS_PATH, 'Invalid design context reference.')
  requireContext(!item.source.workspace || item.source.workspace === item.project, 'Design context belongs to another workspace.')
  return item.ref.slice(prefix.length)
}
export type ContextRecord = { content: string; digest: string }
/** Object existence must be checked inside the current file, not inferred from the file's existence. */
export function contextRecordExists(item: ContextItem, record: ContextRecord): boolean {
  requireContext(record.digest?.trim() && typeof record.content === 'string', 'Missing observed context revision.')
  if (item.kind === 'canvas-node') {
    const id = canvasContextNodeId(item)
    return parseEditableCanvas(record.content, item.project).nodes.some(node => node.id === id)
  }
  if (item.kind === 'draft') {
    const id = draftIdFromAnchor(item.ref)
    requireContext(id && item.source?.path === DRAFTS_PATH, 'Invalid draft context reference.')
    return parseDraftBook(record.content, { projectId: item.project, workspace: item.source.workspace || item.project }).drafts.some(draft => draft.id === id)
  }
  return true
}
/** A new digest alone cannot make an old excerpt current. Explicit adoption requires a new read
 * of the exact revision offered to the user, and recaptures the same object from those bytes. */
export function adoptContextVersion(item: ContextItem, observed: ContextRecord): ContextItem {
  requireContext(item.latestDigest && observed?.digest === item.latestDigest, 'The offered revision changed. Refresh and review again.')
  requireContext(contextRecordExists(item, observed), 'The referenced object no longer exists.')
  let label = item.label, excerpt = item.excerpt ?? item.source?.excerpt
  if (item.kind === 'canvas-node') {
    const id = canvasContextNodeId(item), canvas = parseEditableCanvas(observed.content, item.project)
    label = canvas.nodes.find(node => node.id === id)!.title || id
    excerpt = canvasToPrompt(canvas, item.project, [id])
  } else if (item.kind === 'draft') {
    const book = parseDraftBook(observed.content, { projectId: item.project, workspace: item.source!.workspace || item.project })
    const draft = book.drafts.find(draft => draft.id === draftIdFromAnchor(item.ref))!
    label = draft.title; excerpt = draftContext(book, draft)
  } else if (excerpt) {
    // A file reference is not permission to replace a selected quote with unrelated new text.
    requireContext(observed.content.includes(excerpt), 'The captured excerpt changed. Select and capture a current excerpt from the source.')
  }
  const source = item.source ? { ...item.source, digest: observed.digest, ...(excerpt ? { excerpt } : {}) } : undefined
  if (source) { delete source.buildId; delete source.page }
  const next: ContextItem = { ...item, label, excerpt, ...(source ? { source } : {}), digest: observed.digest, state: 'current', capturedAt: new Date().toISOString() }
  delete next.latestDigest
  return next
}
export function keepStaleSnapshot(item: ContextItem): ContextItem {
  requireContext(item.state === 'update-available', 'Only a changed reference can be kept as an old snapshot.')
  const next = { ...item, state: 'stale-snapshot' as const }
  delete next.latestDigest
  return next
}

export type ContextIssueReason = 'foreign-project' | 'missing' | 'stale-snapshot' | 'update-available' | 'unverifiable'
export type ContextIssue = { id: string; label: string; reason: ContextIssueReason }
/** Discussion references can be explicitly stale. Scoped writing has a separate strict read/CAS
 * preflight: these warnings and this manifest never authorize source changes. */
export function checkContextForSend(items: ContextItem[], sessionProject: string): { include: ContextItem[]; issues: ContextIssue[] } {
  const include: ContextItem[] = [], issues: ContextIssue[] = []
  for (const item of items) {
    if (item.project !== sessionProject) { issues.push({ id: item.id, label: item.label, reason: 'foreign-project' }); continue }
    if (item.state === 'missing') { issues.push({ id: item.id, label: item.label, reason: 'missing' }); continue }
    if (item.state !== 'current') issues.push({ id: item.id, label: item.label, reason: item.state })
    include.push(item)
  }
  return { include, issues }
}

/** Explicit discussion-only snapshot insertion. Intent/caveats are not silently truncated away. */
export function contextManifest(items: ContextItem[], sessionProject: string): string {
  const lines = ['[研究上下文 · 用户显式提供，不等于已发送或批准修改]', `项目 / 会话范围： ${sessionProject || '（全局）'}`]
  for (const item of items) {
    const kind = ({ 'canvas-node': '画布卡片', draft: '研究对象', source: '来源' } as const)[item.kind]
    const version = item.state === 'stale-snapshot' ? `旧快照 ${item.digest}（已明确标注）`
      : item.state === 'update-available' ? `待更新；摘录仍属 ${item.digest ?? '未知版本'}，已观察到 ${item.latestDigest ?? '新版'}`
      : item.state === 'unverifiable' ? '版本无法自动校验'
      : item.state === 'missing' ? '引用已缺失' : item.digest ?? '版本无法自动校验'
    lines.push(`- ${item.label}（${kind} · ${item.ref}）`, `  版本： ${version}`)
    if (item.excerpt) lines.push(`  摘录 / 设计说明：\n${item.excerpt}`)
  }
  lines.push('历史消息使用的仍是当时的内容；此处只是本次可见的引用清单，不是写入授权。')
  const result = lines.join('\n') + '\n'
  requireContext(result.length <= 64000, 'Context is too large. Select fewer references; nothing was silently truncated.')
  return result
}
