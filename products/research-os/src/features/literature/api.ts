import { APIError, post, request } from '../../lib/api.ts'
import { parseArchiveIdentity } from './archive.ts'
import type { ArchiveIdentity, ExtractionResult, KnowledgeProjection, PageProjection, ReadingSession, ReadingTurn } from './types.ts'

async function responseData(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new APIError(body?.error?.message || `HTTP ${response.status}`, response.status)
  if (!body || !('data' in body)) throw new Error('服务返回了无法读取的数据。')
  return body.data
}

export async function archivePDF(file: File, idempotencyKey: string, title = ''): Promise<ArchiveIdentity> {
  const form = new FormData()
  form.append('metadata', JSON.stringify({
    work: { title: title || file.name.replace(/\.pdf$/i, '') },
    manifestation: { kind: 'managed-copy', label: file.name },
    rights: { accessBasis: 'user-owned-copy' },
  }))
  form.append('file', file)
  const response = await fetch('/api/v1/intakes/pdf', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Idempotency-Key': idempotencyKey },
    body: form,
  })
  return parseArchiveIdentity(await responseData(response))
}

export function runExtraction(manifestId: string, idempotencyKey: string) {
  return post<ExtractionResult>(`/intakes/${encodeURIComponent(manifestId)}/extraction`, {}, idempotencyKey)
}

export function latestExtraction(manifestId: string, signal?: AbortSignal) {
  return request<ExtractionResult>(`/intakes/${encodeURIComponent(manifestId)}/extraction`, { signal })
}

export function createReadingSession(acquisitionId: string, idempotencyKey: string, title: string) {
  return post<ReadingSession>('/reading/sessions', { acquisitionId, idempotencyKey, createdBy: 'research-os:workbench', title })
}

export function getReadingSession(sessionId: string, signal?: AbortSignal) {
  return request<{ session: ReadingSession; turns: ReadingTurn[] }>(`/reading/sessions/${encodeURIComponent(sessionId)}`, { signal })
}

export function projectReadingPage(sessionId: string, page: number, signal?: AbortSignal) {
  return request<PageProjection>(`/reading/sessions/${encodeURIComponent(sessionId)}/pages/${page}`, { signal })
}

export function appendReadingNote(sessionId: string, input: {
  expectedRevision: number; idempotencyKey: string; body: string; page?: number; quote?: string
}) {
  return post<ReadingTurn>(`/reading/sessions/${encodeURIComponent(sessionId)}/turns`, {
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    role: 'researcher',
    body: input.body,
    authorRef: 'research-os:workbench',
    ...(input.page && input.quote ? { citations: [{ page: input.page, quote: input.quote }] } : {}),
  })
}

export function promoteReadingNote(sessionId: string, turnId: string, input: {
  expectedRevision: number; idempotencyKey: string; kind: string; title: string; note: string
}) {
  return post<KnowledgeProjection>(
    `/reading/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/promotions`,
    { expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey, reviewerRef: 'research-os:workbench', kind: input.kind, title: input.title, note: input.note },
  )
}
