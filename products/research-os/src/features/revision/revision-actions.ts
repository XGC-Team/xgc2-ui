import { APIError, request } from '../../lib/api'
import type { DraftScope } from '../projects/draft-model'
import { isReviewLocked } from '../review/write-coordinator'
import { CONTENT_PATH, cardType, type ContentDocument, type ContentObject, type ResourceReference } from '../content/content-model'
import { sharedContentSession } from '../content/useContentDocument'
import { findingMarkdown, findingPath, findingPromotionProposal } from './revision-model'
import { connectReview } from '../review/review-api'
import { resolveSourcePatch, sourcePatchProposal, type SavedFile, type SourcePatch } from './source-patch'
import { listProjectMaterials } from '../resources/project-files'

/* All writes go through the one shared content writer (autosave + CAS) or a saved-file receipt.
   Each helper reports why it could not act instead of pretending it did. */

export type EditResult = { ok: true; revision?: string } | { ok: false; reason: 'no-content' | 'locked' | 'refused' | 'save-failed'; detail?: string }

async function loaded(scope: DraftScope) {
  const session = sharedContentSession(scope)
  if (session.snapshot().status === 'loading') await session.load()
  return session
}

/** Edit the project's research content; with `awaitSave` the result carries the acknowledged revision. */
export async function editResearchContent(scope: DraftScope, update: (document: ContentDocument) => ContentDocument, awaitSave = false): Promise<EditResult> {
  const session = await loaded(scope)
  const state = session.snapshot()
  if (!state.value || !state.digest) return { ok: false, reason: 'no-content' }
  if (isReviewLocked(scope.workspace, CONTENT_PATH)) return { ok: false, reason: 'locked' }
  if (!session.edit(update)) return { ok: false, reason: 'refused' }
  if (!awaitSave) return { ok: true }
  try { await session.flush() } catch (error) { return { ok: false, reason: 'save-failed', detail: error instanceof Error ? error.message : String(error) } }
  return { ok: true, revision: session.snapshot().digest }
}

export function editFailureCopy(result: Exclude<EditResult, { ok: true }>, locale: 'zh' | 'en'): string {
  const zh = locale === 'zh'
  switch (result.reason) {
    case 'no-content': return zh ? '该项目还没有研究内容：先在研究内容中「建立研究内容」。' : 'This project has no research content yet: create it first in Research content.'
    case 'locked': return zh ? '研究内容正被审阅写入锁定，稍后再试。' : 'Research content is locked by a review write; try again shortly.'
    case 'refused': return zh ? '内容编辑器拒绝了此修改（可能有冲突或未保存修改）。' : 'The content editor refused the change (conflict or unsaved changes).'
    case 'save-failed': return (zh ? '修改已应用到本地，但保存失败：' : 'Applied locally, but saving failed: ') + (result.detail ?? '')
  }
}

export const withObject = (document: ContentDocument, object: ContentObject, place?: { x: number; y: number }): ContentDocument => {
  const bottom = document.views.canvas.placements.reduce((y, p) => Math.max(y, p.y + 240), 40)
  return { ...document, objects: [...document.objects, object], views: { ...document.views, canvas: { ...document.views.canvas, placements: [...document.views.canvas.placements, { objectId: object.id, ...(place ?? { x: 48, y: bottom }) }] } } }
}
export const addObjectSource = (document: ContentDocument, objectId: string, source: ResourceReference): ContentDocument => ({
  ...document, objects: document.objects.map(o => o.id === objectId && !o.sources.some(s => s.kind === source.kind && s.path === source.path && s.workspace === source.workspace) ? { ...o, sources: [...o.sources, source] } : o),
})

/** Save a derivation as a durable Markdown note in the academic knowledge tree and link it from its card. */
export async function captureFinding(input: { scope: DraftScope; object: Pick<ContentObject, 'id' | 'title'>; title: string; body: string; thread?: string; at?: Date }): Promise<{ path: string; digest: string; linked: EditResult }> {
  const at = input.at ?? new Date()
  const session = await loaded(input.scope)
  const path = findingPath(input.scope.projectId, input.title, at)
  const content = findingMarkdown({ title: input.title, body: input.body, project: input.scope.projectId, cardId: input.object.id, cardTitle: input.object.title, contentDigest: session.snapshot().digest || undefined, thread: input.thread, at })
  const saved = await request<{ digest?: string }>(`/workspaces/academic/files/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, createOnly: true }),
  })
  if (!saved?.digest) throw new Error('The knowledge note has no saved-file receipt.')
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('research:knowledge-changed'))
  const linked = await editResearchContent(input.scope, document => addObjectSource(document, input.object.id, { kind: 'knowledge', workspace: 'academic', path, digest: saved.digest, title: input.title }))
  return { path, digest: saved.digest, linked }
}

/** File a promotion request for one saved finding in the project's review journal. Nothing is written to
 * global knowledge here: approval (in the review panel) and the executor's receipt are separate, later steps. */
export async function proposeFindingPromotion(input: { scope: DraftScope; path: string; title: string; locale: 'zh' | 'en'; author?: string }): Promise<{ proposalId: string }> {
  // Pin the evidence to the bytes on disk now; the executor re-verifies this digest before writing.
  const file = await request<{ content: string; digest: string }>(`/workspaces/academic/files/${input.path.split('/').map(encodeURIComponent).join('/')}`)
  if (typeof file?.content !== 'string' || !file.digest) throw new Error('The finding note has no readable saved revision.')
  const body = file.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart().replace(/^#\s+.*\n+/, '').trim()
  const proposal = findingPromotionProposal({ project: input.scope.projectId, finding: { path: input.path, digest: file.digest, title: input.title, body }, author: input.author || 'researcher', locale: input.locale, at: new Date(), id: crypto.randomUUID() })
  const engine = connectReview(input.scope, () => {})
  try { await engine.load(); await engine.add(proposal) } finally { engine.dispose() }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('research:review-journal-changed', { detail: input.scope }))
  return { proposalId: proposal.id }
}

// ---------- plan → manuscript: agent source patches filed into the review journal ----------

export async function readSaved(workspace: string, path: string): Promise<SavedFile | null> {
  try {
    const file = await request<{ content: string; digest: string }>(`/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`)
    return typeof file?.content === 'string' && file.digest ? { content: file.content, digest: file.digest } : null
  } catch (error) { if (error instanceof APIError && error.status === 404) return null; throw error }
}

export type FiledSourcePatches = { filed: string[]; existing: string[]; problems: string[] }

/** Locate each agent patch against the saved manuscript and file it as one review-journal proposal.
 * Already-filed patches (same stable id) are left alone. Nothing is written to the manuscript here. */
export async function fileSourcePatches(input: { scope: DraftScope; locale: 'zh' | 'en'; author?: string; found: { id: string; label: string; patch: SourcePatch }[] }): Promise<FiledSourcePatches> {
  const out: FiledSourcePatches = { filed: [], existing: [], problems: [] }
  const paths = [...new Set(input.found.flatMap(f => f.patch.edits.map(e => e.path)))]
  const files: Record<string, SavedFile | null> = {}
  for (const path of paths) files[path] = await readSaved(input.scope.workspace, path)
  let cards: { id: string; title: string }[] = [], contentDigest: string | undefined
  try { const session = await loaded(input.scope); cards = (session.snapshot().value?.objects ?? []).map(o => ({ id: o.id, title: o.title })); contentDigest = session.snapshot().digest || undefined } catch { /* Cards are optional evidence; edits still carry their passage. */ }
  const engine = connectReview(input.scope, () => {})
  try {
    await engine.load()
    const known = new Set(engine.snapshot().book?.proposals.map(p => p.id) ?? [])
    for (const f of input.found) {
      if (known.has(f.id)) { out.existing.push(f.id); continue }
      const { edits, problems } = resolveSourcePatch(f.patch, files)
      out.problems.push(...problems)
      if (!edits.length) continue
      await engine.add(sourcePatchProposal({ scope: input.scope, id: f.id, author: input.author || 'researcher', at: new Date(), label: f.label, patch: f.patch, edits, cards, contentDigest, locale: input.locale }))
      out.filed.push(f.id); known.add(f.id)
    }
  } finally { engine.dispose() }
  if (out.filed.length && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('research:review-journal-changed', { detail: input.scope }))
  return out
}

/** After an applied manuscript proposal: mark the revision items it answered as addressed and link the edited passage. */
export async function markAnswered(scope: DraftScope, cardIds: string[], passage: { path: string; digest?: string; quote: string }): Promise<EditResult> {
  return editResearchContent(scope, document => cardIds.reduce((d, id) => {
    const linked = addObjectSource(d, id, { kind: 'file', workspace: scope.workspace, path: passage.path, ...(passage.digest ? { digest: passage.digest } : {}), selector: { quote: passage.quote.slice(0, 200) }, title: passage.path.split('/').pop() })
    return { ...linked, objects: linked.objects.map(o => o.id === id && cardType(o) === 'revision' ? { ...o, status: 'addressed' } : o) }
  }, document))
}

/** Text manuscript files in the project (two directory levels), for the agent's source contract. */
export async function listManuscriptFiles(workspace: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (directory: string, depth: number) => {
    const entries = await listProjectMaterials(workspace, directory)
    for (const entry of entries) {
      if (entry.kind === 'directory' && depth < 2 && !entry.path.split('/').pop()!.startsWith('.')) await walk(entry.path, depth + 1)
      else if (entry.kind === 'file' && /\.(tex|bib)$/i.test(entry.path)) out.push(entry.path)
    }
  }
  try { await walk('', 0) } catch { /* The contract then says no manuscript was found. */ }
  return out.slice(0, 30)
}
