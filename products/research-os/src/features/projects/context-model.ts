import type { DraftSource } from './draft-model'

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

/** Version state is derived from what was actually observed; a missing digest is unverifiable, never invented. */
export function newContextItem(input: {
  id?: string; project: string; kind: ContextItemKind; label: string; ref: string
  source?: DraftSource; digest?: string; excerpt?: string; capturedAt?: string
}): ContextItem {
  requireContext(input.project.trim() && input.ref.trim() && input.label !== undefined, 'Invalid context item.')
  return {
    id: input.id ?? crypto.randomUUID(), project: input.project, kind: input.kind, label: input.label, ref: input.ref,
    ...(input.source ? { source: input.source } : {}), ...(input.digest ? { digest: input.digest } : {}),
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    state: input.digest ? 'current' : 'unverifiable',
  }
}

/** Compare against a freshly observed revision. `null` means the source file no longer exists. */
export function assessContextItem(item: ContextItem, observed: { digest?: string } | null): ContextItem {
  if (observed === null) return { ...item, state: 'missing' }
  if (item.digest && observed.digest) {
    if (item.digest === observed.digest) {
      const next = { ...item, state: 'current' as const }
      delete next.latestDigest
      return next
    }
    return { ...item, state: 'update-available', latestDigest: observed.digest }
  }
  return { ...item, state: 'unverifiable', ...(observed.digest ? { latestDigest: observed.digest } : {}) }
}

/** User choice after a change: pin the newly observed version… */
export function adoptContextVersion(item: ContextItem): ContextItem {
  requireContext(item.latestDigest, 'No observed revision to adopt.')
  const next = { ...item, digest: item.latestDigest, state: 'current' as const }
  delete next.latestDigest
  return next
}
/** …or keep the old snapshot, explicitly labeled as old. History is never silently repinned. */
export function keepStaleSnapshot(item: ContextItem): ContextItem {
  requireContext(item.state === 'update-available', 'Only a changed reference can be kept as an old snapshot.')
  const next = { ...item, state: 'stale-snapshot' as const }
  delete next.latestDigest
  return next
}

export type ContextIssueReason = 'foreign-project' | 'missing' | 'stale-snapshot' | 'update-available' | 'unverifiable'
export type ContextIssue = { id: string; label: string; reason: ContextIssueReason }
/** Pre-send scope and validity check. Items from another project or with missing sources are excluded,
 * never silently routed; stale or unverifiable items stay visible as warnings. */
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

/** The manifest the user explicitly inserts into the Chat draft. Inserting is not sending. */
export function contextManifest(items: ContextItem[], sessionProject: string): string {
  const lines = ['[研究上下文 · 用户显式提供，不等于已发送]', `项目 / 会话范围： ${sessionProject || '（全局）'}`]
  for (const item of items) {
    const kind = ({ 'canvas-node': '画布卡片', draft: '研究对象', source: '来源' } as const)[item.kind]
    const version = item.state === 'stale-snapshot' ? `旧快照 ${item.digest}（已明确标注）` : item.digest ?? '版本无法自动校验'
    lines.push(`- ${item.label}（${kind} · ${item.ref}）`, `  版本： ${version}`)
    if (item.excerpt) lines.push(`  摘录： ${item.excerpt.replace(/\s+/g, ' ').slice(0, 200)}`)
  }
  lines.push('历史消息使用的仍是当时的内容；此处只是本次可见的引用清单。')
  return lines.join('\n') + '\n'
}
