import { request } from '../../lib/api'
import type { DraftScope } from '../projects/draft-model'
import { parseContentDocument, serializeContent, type ContentDocument, type ContentSnapshot, type ContentRevision, type LegacySource } from './content-model'
export type ContentPort = {
  read: (signal: AbortSignal) => Promise<ContentSnapshot>
  write: (document: ContentDocument, expectedDigest: string) => Promise<ContentSnapshot>
  migrate: (sources: LegacySource[]) => Promise<ContentSnapshot>
}
export function contentPort(scope: DraftScope): ContentPort {
  const path = `/workspaces/${encodeURIComponent(scope.workspace)}/research-content`
  const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return {
    read: signal => checkedSnapshot(request(`${path}?projectId=${encodeURIComponent(scope.projectId)}`, { signal }), scope),
    write: (document, expectedDigest) => checkedSnapshot(request(path, json('PUT', { projectId: scope.projectId, document, expectedDigest })), scope),
    migrate: legacySources => checkedSnapshot(request(`${path}/migrate`, json('POST', { projectId: scope.projectId, legacySources })), scope),
  }
}
async function checkedSnapshot(response: Promise<ContentSnapshot>, scope: DraftScope): Promise<ContentSnapshot> {
  const snapshot = await response
  return { ...snapshot, document: parseContentDocument(snapshot.content ?? serializeContent(snapshot.document), scope) }
}
export async function readContentRevision(scope: DraftScope, digest: string, signal?: AbortSignal): Promise<ContentSnapshot> {
  const snapshot = await checkedSnapshot(request(`/workspaces/${encodeURIComponent(scope.workspace)}/research-content?projectId=${encodeURIComponent(scope.projectId)}&digest=${encodeURIComponent(digest)}`, { signal }), scope)
  if (snapshot.digest.replace(/^sha256:/, '') !== digest.replace(/^sha256:/, '')) throw new Error('The server did not return the requested revision. Current content was not substituted.')
  return snapshot
}
export function listContentRevisions(scope: DraftScope, signal?: AbortSignal): Promise<{ revisions: ContentRevision[] }> {
  return request(`/workspaces/${encodeURIComponent(scope.workspace)}/research-content/revisions?projectId=${encodeURIComponent(scope.projectId)}`, { signal })
}
