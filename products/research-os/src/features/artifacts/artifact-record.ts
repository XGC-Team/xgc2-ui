import type { BuildRecord } from '../review/build-provenance'

// Read-only projections of B's ledger; never a second wire DTO or build store.
export type ArtifactIdentity = { projectId: string; workspace: string; artifactId: string; entryPoint: string }
export type ArtifactFile = {
  buildId: string; kind: 'image' | 'video' | 'pdf' | 'file'; mediaType: string
  digest: string; sizeBytes: number; url: string; extension: string
}
export type ArtifactBuild = {
  record: BuildRecord; buildId: string; status: 'succeeded' | 'failed' | 'cancelled'
  requestedAt: string; completedAt: string; sourceDigest: string; requestedBy: string
  toolchain: Readonly<Record<string, unknown>>; inputs: ReadonlyArray<{ path: string; digest: string }>
  logArtifactRef: string; diagnostics: string[]; files: ArtifactFile[]
}
export type ArtifactView = {
  phase: 'definition' | 'generated' | 'failed' | 'cancelled'; latest?: ArtifactBuild
  successful?: ArtifactBuild; builds: ArtifactBuild[]; rejected: string[]
  laterFailure: boolean; scientific: 'not-claimed'
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const time = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
const relative = (v: unknown): v is string => typeof v === 'string' && v === v.trim() && !!v && !/[\\\x00\r\n]/.test(v) && !v.split('/').some(p => ['', '.', '..', '.git', '.research-build'].includes(p))
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
const formats: Record<string, [ArtifactFile['kind'], string]> = {
  'image/png': ['image', 'png'], 'video/mp4': ['video', 'mp4'], 'application/pdf': ['pdf', 'pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['file', 'docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['file', 'pptx'],
}

/** Only a complete, same-object v2 record can become a view. Old Git tasks and
 * bare manifests are rejected, not upgraded with client-invented provenance. */
export function validateArtifactIdentity(scope: ArtifactIdentity): void {
  demand(text(scope.projectId) && text(scope.workspace) && text(scope.artifactId) && relative(scope.entryPoint) && scope.entryPoint.endsWith('.artifact.json'), 'Invalid artifact scope.')
}

export function inspectArtifactBuild(raw: unknown, scope: ArtifactIdentity): ArtifactBuild {
  validateArtifactIdentity(scope)
  demand(object(raw) && object(raw.task) && object(raw.manifest), 'Expected the build owner\'s complete task and manifest.')
  const task = raw.task, manifest = raw.manifest
  demand(task.schemaVersion === 'xgc.research.manuscript/v2' && manifest.schemaVersion === task.schemaVersion && !('gitCommit' in task), 'Expected the current saved-source v2 record, not a legacy task.')
  demand(task.workspaceRef === scope.workspace && task.manuscriptId === scope.artifactId && task.entryPoint === scope.entryPoint, 'Build belongs to another artifact or workspace.')
  demand(text(task.taskId) && manifest.taskId === task.taskId && text(manifest.buildId), 'Build/task identity is incomplete.')
  demand(hash(task.sourceDigest) && time(task.requestedAt) && text(task.requestedBy) && time(manifest.startedAt) && time(manifest.completedAt), 'Build provenance is incomplete.')
  demand(Date.parse(manifest.completedAt) >= Date.parse(manifest.startedAt), 'Build time interval is invalid.')
  demand(['succeeded', 'failed', 'cancelled'].includes(String(manifest.status)), 'Build is not a terminal receipt.')
  demand(typeof manifest.logArtifactRef === 'string' && /^cas:\/\/sha256\/[a-f0-9]{64}$/.test(manifest.logArtifactRef), 'Build log reference is missing.')
  const toolchain = task.toolchain
  demand(object(toolchain) && text(toolchain.engine) && /^research-artifact\/(docx|pptx|video|remotion)$/.test(toolchain.engine) && text(toolchain.imageRef) && hash(toolchain.imageDigest) && text(toolchain.engineVersion) && ['local-runtime-fingerprint', 'oci-image-digest'].includes(String(toolchain.pinKind)), 'Build has no pinned artifact renderer.')
  demand(Array.isArray(task.inputs) && task.inputs.length > 0 && task.inputs.length <= 10000, 'Build has no frozen inputs.')
  const paths = new Set<string>(), inputs: { path: string; digest: string }[] = []
  for (const input of task.inputs) {
    demand(object(input) && relative(input.path) && hash(input.digest) && !paths.has(input.path), 'Invalid or duplicated frozen input.')
    paths.add(input.path); inputs.push({ path: input.path, digest: input.digest })
  }
  demand(paths.has(scope.entryPoint), 'Definition is absent from the frozen inputs.')
  demand(manifest.outputs === undefined || Array.isArray(manifest.outputs), 'Invalid output list.')
  const files: ArtifactFile[] = [], seen = new Set<string>()
  for (const output of (manifest.outputs || []) as unknown[]) {
    demand(object(output) && hash(output.digest) && output.artifactRef === `cas://sha256/${output.digest}` && text(output.mediaType) && Number.isSafeInteger(output.sizeBytes) && Number(output.sizeBytes) > 0 && !seen.has(output.digest), 'Output lacks an exact immutable reference, size or digest.')
    seen.add(output.digest)
    const format = formats[output.mediaType]
    if (format) files.push({ buildId: manifest.buildId, digest: output.digest, mediaType: output.mediaType, sizeBytes: Number(output.sizeBytes), kind: format[0], extension: format[1], url: `/api/v1/manuscripts/build-records/${encodeURIComponent(manifest.buildId)}/artifacts/${output.digest}` })
  }
  if (manifest.status === 'succeeded') {
    const primary = toolchain.engine === 'research-artifact/docx' ? 'docx' : toolchain.engine === 'research-artifact/pptx' ? 'pptx' : 'mp4'
    demand(files.some(file => file.extension === primary), 'Successful receipt has no actual primary artifact.')
  }
  demand(manifest.diagnostics === undefined || Array.isArray(manifest.diagnostics), 'Invalid diagnostics.')
  const diagnostics = ((manifest.diagnostics || []) as unknown[]).map(item => { demand(object(item) && typeof item.message === 'string', 'Invalid diagnostic.'); return item.message })
  return { record: raw as unknown as BuildRecord, buildId: manifest.buildId, status: manifest.status as ArtifactBuild['status'], requestedAt: task.requestedAt, completedAt: manifest.completedAt, sourceDigest: task.sourceDigest, requestedBy: task.requestedBy, toolchain, inputs, logArtifactRef: manifest.logArtifactRef, diagnostics, files }
}

export function artifactView(records: unknown, scope: ArtifactIdentity): ArtifactView {
  validateArtifactIdentity(scope)
  demand(Array.isArray(records), 'Build records are not a list.')
  const builds: ArtifactBuild[] = [], rejected: string[] = [], ids = new Map<string, number>()
  for (const raw of records) {
    // Foreign records never enter this object's history. Malformed own receipts
    // remain a visible error instead of being repaired into success.
    if (!object(raw) || !object(raw.task) || raw.task.workspaceRef !== scope.workspace || raw.task.manuscriptId !== scope.artifactId || raw.task.entryPoint !== scope.entryPoint) continue
    try { const build = inspectArtifactBuild(raw, scope); builds.push(build); ids.set(build.buildId, (ids.get(build.buildId) || 0) + 1) }
    catch (error) { rejected.push(String(error)) }
  }
  const unique = builds.filter(build => {
    if (ids.get(build.buildId) === 1) return true
    const message = `Duplicate build identity: ${build.buildId}`
    if (!rejected.includes(message)) rejected.push(message)
    return false
  }).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt) || b.buildId.localeCompare(a.buildId))
  const latest = unique[0], successful = unique.find(build => build.status === 'succeeded')
  return { phase: !latest ? 'definition' : latest.status === 'succeeded' ? 'generated' : latest.status, latest, successful, builds: unique, rejected, laterFailure: !!latest && !!successful && latest.buildId !== successful.buildId && latest.status !== 'succeeded', scientific: 'not-claimed' }
}

export function selectArtifactBuild(view: ArtifactView, selected: string): ArtifactBuild | undefined {
  return selected ? view.builds.find(build => build.buildId === selected) : view.successful || view.latest
}

/** Metadata is not a preview. Bound the stream before allocating the final Blob;
 * only matching actual bytes may be downloaded or handed to a media element. */
export async function verifyArtifactBytes(file: ArtifactFile, response: Response, limit = 128 * 1024 * 1024): Promise<Blob> {
  demand(response.ok && response.status !== 206 && response.body, 'Artifact request did not return a complete file.')
  demand(hash(file.digest) && Number.isSafeInteger(file.sizeBytes) && file.sizeBytes > 0 && file.sizeBytes <= limit, 'Artifact exceeds the browser verification limit.')
  const length = response.headers.get('content-length')
  demand(length === null || (/^\d+$/.test(length) && Number(length) === file.sizeBytes), 'Artifact length header differs from the receipt.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      demand(size <= file.sizeBytes && size <= limit, 'Artifact stream is larger than its receipt.')
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  demand(size === file.sizeBytes, 'Artifact stream is truncated.')
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
  demand(digest === file.digest, 'Artifact bytes differ from the recorded SHA-256.')
  return new Blob([bytes], { type: file.mediaType })
}
