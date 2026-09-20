/** Projection of the server's current manuscript/v2 receipt; not a client-authored task. */
export type BuildRecord = {
  task: {
    schemaVersion: 'xgc.research.manuscript/v2'
    workspaceRef: string
    entryPoint: string
    sourceDigest: string
    requestedAt: string
    inputs: { path: string; digest: string }[]
  }
  manifest: {
    schemaVersion: 'xgc.research.manuscript/v2'
    buildId: string
    completedAt: string
    status: 'succeeded' | 'failed' | 'cancelled'
    logArtifactRef: string
    diagnostics?: { message: string; severity?: string; path?: string; line?: number }[]
    outputs?: { digest: string; mediaType: string; artifactRef?: string; sizeBytes?: number }[]
  }
}
export const digestKey = (value: string): string => value.replace(/^sha256:/, '')
export const validDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function validSourcePath(value: unknown): value is string {
  return typeof value === 'string' && !!value && value.trim() === value && !/[\\\x00\r\n]/.test(value) &&
    !value.split('/').some(part => !part || ['.', '..', '.git', '.research-build'].includes(part))
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export function isBuildRecord(value: unknown): value is BuildRecord {
  if (!object(value) || !object(value.task) || !object(value.manifest)) return false
  const { task, manifest } = value
  return task.schemaVersion === 'xgc.research.manuscript/v2' && manifest.schemaVersion === task.schemaVersion &&
    typeof task.workspaceRef === 'string' && !!task.workspaceRef && validSourcePath(task.entryPoint) && validDigest(task.sourceDigest) &&
    typeof task.requestedAt === 'string' && Number.isFinite(Date.parse(task.requestedAt)) &&
    Array.isArray(task.inputs) && task.inputs.length > 0 &&
    task.inputs.every(input => object(input) && validSourcePath(input.path) && validDigest(input.digest)) &&
    new Set(task.inputs.map(input => input.path)).size === task.inputs.length && task.inputs.some(input => input.path === task.entryPoint) &&
    typeof manifest.buildId === 'string' && !!manifest.buildId && typeof manifest.completedAt === 'string' && Number.isFinite(Date.parse(manifest.completedAt)) &&
    ['succeeded', 'failed', 'cancelled'].includes(String(manifest.status)) && typeof manifest.logArtifactRef === 'string' && /^sha256:[a-f0-9]{64}$/.test(manifest.logArtifactRef) &&
    (manifest.outputs === undefined || (Array.isArray(manifest.outputs) && manifest.outputs.every(output => object(output) && validDigest(output.digest) && typeof output.mediaType === 'string'))) &&
    (manifest.diagnostics === undefined || (Array.isArray(manifest.diagnostics) && manifest.diagnostics.every(diagnostic => object(diagnostic) && typeof diagnostic.message === 'string'))) &&
    (manifest.status !== 'succeeded' || (Array.isArray(manifest.outputs) && manifest.outputs.length > 0))
}
// Go emits UTC RFC3339Nano with variable fractional precision. Pad before lexical
// comparison so two requests in the same second are ordered without losing ns.
const requestKey = (record: BuildRecord): string => record.task.requestedAt.replace(/(\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/, (_, second: string, fraction = '') => `${second}.${fraction.padEnd(9, '0')}Z`)
export const compareBuildRequests = (a: BuildRecord, b: BuildRecord): number => requestKey(b).localeCompare(requestKey(a)) || b.manifest.buildId.localeCompare(a.manifest.buildId)
export function buildSourceMatch(record: BuildRecord | undefined, workspace: string, path: string, digest: string): 'match' | 'changed' | 'unknown' {
  if (!record || !isBuildRecord(record) || record.manifest.status !== 'succeeded' || record.task.workspaceRef !== workspace || !validDigest(digestKey(digest))) return 'unknown'
  const input = record.task.inputs.find(item => item.path === path)
  return !input ? 'unknown' : input.digest === digestKey(digest) ? 'match' : 'changed'
}
export function previewProvenance(records: BuildRecord[], pdf: { workspace: string; path: string; buildId: string; digest: string }) {
  const relevant = records.filter(record => isBuildRecord(record) && record.task.workspaceRef === pdf.workspace && record.task.entryPoint === pdf.path).sort(compareBuildRequests)
  const selected = relevant.find(record => record.manifest.buildId === pdf.buildId)
  const valid = selected?.manifest.status === 'succeeded' && !!selected.manifest.outputs?.some(output => output.mediaType === 'application/pdf' && output.digest === digestKey(pdf.digest))
  const latest = relevant[0]
  return { selected, valid, latest, oldPreview: !!latest && latest.manifest.buildId !== pdf.buildId,
    laterFailure: !!latest && latest.manifest.buildId !== pdf.buildId && latest.manifest.status !== 'succeeded' }
}
