import type { ArchiveIdentity } from './types.ts'

const sha256 = /^[0-9a-f]{64}$/
const identity = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** PDF intake is accepted only when the archive returns durable work/document/acquisition identity. */
export function parseArchiveIdentity(payload: unknown): ArchiveIdentity {
  if (!object(payload)) throw new Error('PDF archive returned an unreadable receipt.')
  const manifest = object(payload.manifest) ? payload.manifest : {}
  const document = object(payload.document) ? payload.document : {}
  const job = object(payload.extractionJob) ? payload.extractionJob : {}
  const work = object(payload.work) ? payload.work : {}
  const manifestation = object(payload.manifestation) ? payload.manifestation : {}
  const sourceSha256 = typeof document.sha256 === 'string' ? document.sha256 : typeof manifest.sourceSha256 === 'string' ? manifest.sourceSha256 : ''
  const identityFields = {
    manifestId: manifest.id,
    workId: work.id ?? manifest.workId,
    manifestationId: manifestation.id ?? manifest.manifestationId,
    documentVersionId: document.id ?? manifest.documentVersionId,
    acquisitionId: manifest.acquisitionId,
    extractionJobId: job.id ?? manifest.extractionJobId,
  }
  for (const [key, value] of Object.entries(identityFields)) {
    if (!identity(value)) throw new Error(`PDF archive receipt is missing ${key}.`)
  }
  if (!sha256.test(sourceSha256)) throw new Error('PDF archive receipt is missing the archived document digest.')
  return {
    manifestId: identityFields.manifestId as string,
    workId: identityFields.workId as string,
    manifestationId: identityFields.manifestationId as string,
    documentVersionId: identityFields.documentVersionId as string,
    acquisitionId: identityFields.acquisitionId as string,
    sourceSha256,
    extractionJobId: identityFields.extractionJobId as string,
    extractionState: typeof job.state === 'string' ? job.state : '',
    extractionAvailability: typeof job.adapterAvailability === 'string' ? job.adapterAvailability : '',
    replayed: payload.replayed === true,
  }
}

export function archivedDocumentURL(sourceSha256: string): string {
  if (!sha256.test(sourceSha256)) throw new Error('Archived document digest is invalid.')
  return `/api/v1/documents/${sourceSha256}/content`
}

export function sameArchive(left: ArchiveIdentity, right: ArchiveIdentity): boolean {
  return left.sourceSha256 === right.sourceSha256 && left.acquisitionId === right.acquisitionId &&
    left.documentVersionId === right.documentVersionId && left.workId === right.workId
}
