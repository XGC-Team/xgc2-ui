import { request } from '../../lib/api.ts'
import { compareBuildRequests, digestKey, isBuildRecord, validDigest, validSourcePath, type BuildRecord } from '../review/build-provenance.ts'
export type { BuildRecord } from '../review/build-provenance.ts'
export type ManuscriptPDF = { workspace: string; path: string; buildId: string; digest: string; url: string }
export type ManuscriptScope = { workspace: string; entryPoint: string }
export type SavedInput = { path: string; digest: string }
export type BuildCapability = { available: boolean; detail: string }
export const buildArtifactURL = (buildId: string, digest: string): string => `/api/v1/manuscripts/build-records/${encodeURIComponent(buildId)}/artifacts/${digestKey(digest)}`
export function pdfFromRecord(record: BuildRecord): ManuscriptPDF | null {
  if (!isBuildRecord(record) || record.manifest.status !== 'succeeded') return null
  const output = record.manifest.outputs?.find(item => item.mediaType === 'application/pdf')
  return output ? { workspace: record.task.workspaceRef, path: record.task.entryPoint, buildId: record.manifest.buildId, digest: output.digest, url: buildArtifactURL(record.manifest.buildId, output.digest) } : null
}
export async function listBuildRecords(workspace: string, signal?: AbortSignal): Promise<BuildRecord[]> {
  const records = await request<unknown>(`/manuscripts/build-records?manuscriptId=${encodeURIComponent(workspace)}`, { signal })
  if (!Array.isArray(records) || !records.every(isBuildRecord)) throw new Error('Build history is not in the current saved-source contract. It was not converted or treated as current.')
  return records.filter(record => record.task.workspaceRef === workspace).sort(compareBuildRequests)
}
export async function listPDFVersions(workspace: string, path: string | undefined, signal?: AbortSignal): Promise<(ManuscriptPDF & { completedAt: string })[]> {
  const records = await listBuildRecords(workspace, signal)
  return records.filter(record => !path || record.task.entryPoint === path).flatMap(record => {
    const pdf = pdfFromRecord(record)
    return pdf ? [{ ...pdf, completedAt: record.manifest.completedAt }] : []
  })
}
export async function latestPDF(workspace: string, path: string, signal?: AbortSignal): Promise<ManuscriptPDF | null> {
  return (await listPDFVersions(workspace, path, signal))[0] || null
}
export function normalizeSavedInputs(inputs: readonly SavedInput[]): SavedInput[] {
  const unique = new Map<string, string>()
  for (const input of inputs) {
    if (!validSourcePath(input.path) || typeof input.digest !== 'string' || !validDigest(digestKey(input.digest))) throw new Error('Invalid saved file receipt.')
    const digest = digestKey(input.digest)
    if (unique.has(input.path) && unique.get(input.path) !== digest) throw new Error('One completed batch cannot declare conflicting file revisions.')
    unique.set(input.path, digest)
  }
  return [...unique].map(([path, digest]) => ({ path, digest })).sort((a, b) => a.path.localeCompare(b.path))
}
export async function buildSavedManuscript(scope: ManuscriptScope, inputs: readonly SavedInput[] = [], signal?: AbortSignal): Promise<BuildRecord> {
  if (!scope.workspace || !validSourcePath(scope.entryPoint)) throw new Error('Select a workspace and an explicit manuscript entry point.')
  const expectedInputs = normalizeSavedInputs(inputs)
  const record = await request<unknown>('/manuscripts/builds', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceRef: scope.workspace, entryPoint: scope.entryPoint, ...(expectedInputs.length ? { expectedInputs } : {}) }),
  })
  if (!isBuildRecord(record) || record.task.workspaceRef !== scope.workspace || record.task.entryPoint !== scope.entryPoint ||
    expectedInputs.some(input => !record.task.inputs.some(captured => captured.path === input.path && captured.digest === input.digest))) {
    throw new Error('Build receipt does not match the requested saved sources. No preview was published.')
  }
  if (record.manifest.status === 'succeeded' && !pdfFromRecord(record)) throw new Error('Successful manuscript receipt contains no PDF.')
  return record
}
export async function manuscriptCapability(signal?: AbortSignal): Promise<BuildCapability> {
  const capabilities = await request<{ latex?: BuildCapability }>('/capabilities', { signal })
  if (!capabilities.latex || typeof capabilities.latex.available !== 'boolean' || typeof capabilities.latex.detail !== 'string') throw new Error('Invalid LaTeX capability response.')
  return capabilities.latex
}
