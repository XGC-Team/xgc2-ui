import { publishReviewBatch } from './review-batches.ts'
import { observeSavedFile } from './file-observations.ts'
import { request } from '../../lib/api.ts'
import { createReviewEngine, type ReviewState } from './review-engine.ts'
import { acquireReviewWrite, assertEditorClean } from './write-coordinator.ts'
import { check, REVIEW_PATH, validateAnchor, type Anchor, type FileRecord, type Scope, type Target } from './review-model.ts'
import { targetValue } from './review-targets.ts'
import type { BuildRecord } from './build-provenance.ts'
import { buildSourceMatch, previewProvenance } from './build-provenance.ts'
const fileURL = (workspace: string, path: string) => `/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
export const readReviewFile = (workspace: string, path: string) => request<FileRecord>(fileURL(workspace, path))
export function connectReview(scope: Scope, changed: (s: ReviewState) => void, isCurrent?: () => boolean) {
  return createReviewEngine(scope, {
    read: readReviewFile,
    isCurrent,
    batchComplete: receipt => {
      const failures = publishReviewBatch(receipt)
      if (failures.length) throw new Error(failures.join("\n"))
    },
    write: async (workspace, path, content, guard) => {
      const result=await request<{digest:string}>(fileURL(workspace,path),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,...guard})})
      check(typeof result?.digest === 'string' && result.digest, 'Target acknowledgement lacks a saved revision.')
      // Observers are follow-ups, not part of the server CAS acknowledgement.
      if(path!==REVIEW_PATH)try { observeSavedFile(scope,path,null,{content,digest:result.digest},'review') }
      catch(cause) { console.error('Saved file observer failed; the source write was acknowledged.', cause) }
      return result
    },
    lease: acquireReviewWrite,
  }, changed)
}
export const readBuildRecords = (workspace: string, signal?: AbortSignal) => request<BuildRecord[]>(`/manuscripts/build-records?manuscriptId=${encodeURIComponent(workspace)}`, { signal })
export async function requireBuildSource(workspace: string, path: string, buildId: string, digest: string) {
  const records = await readBuildRecords(workspace)
  const build = records.find(r => r.manifest.buildId === buildId)
  check(buildSourceMatch(build, workspace, path, digest) === 'match', '待确认 / Needs confirmation: current source is not verified against this build. No positional mapping was applied.')
}
export async function captureTarget(scope: Scope, target: Target, displayed?: string): Promise<Anchor> {
  assertEditorClean(target.workspace, target.path)
  const r = await readReviewFile(target.workspace, target.path)
  const quote = targetValue(r.content, target, scope)
  check(displayed === undefined || displayed === quote, 'Displayed content has not been saved or changed remotely. Refresh before capturing a version.')
  return {kind: target.kind, workspace: target.workspace, path: target.path, digest: r.digest, quote, target}
}
export async function verifyAnchor(anchor: Anchor, scope: Scope) {
  validateAnchor(anchor)
  if (anchor.kind === 'pdf') {
    check(anchor.origin === 'project-build' && anchor.buildId, 'External PDF remains evidence. Its original locator must be confirmed; no source mapping is inferred.')
    const records = await readBuildRecords(anchor.workspace)
    const pdf = { workspace: anchor.workspace, path: anchor.path, buildId: anchor.buildId, digest: anchor.digest }
    check(previewProvenance(records, pdf).valid, 'The recorded PDF build is unavailable or mismatched. It was not replaced with the latest PDF.')
    return
  }
  const r = await readReviewFile(anchor.workspace, anchor.path)
  check(r.digest === anchor.digest, 'Recorded source revision is stale. Current content has not been silently re-anchored.')
  if (anchor.target) check(targetValue(r.content, anchor.target, scope) === anchor.quote, 'Recorded object/selection is not found.')
}
