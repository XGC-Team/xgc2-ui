import { APIError, request } from '../../lib/api.ts'
import { digestKey, validDigest, validSourcePath } from '../review/build-provenance.ts'
export type SavedSource = { content: string; digest: string }
export type SaveAttempt = { before: SavedSource; content: string }
export const sourceFileURL = (workspace: string, path: string): string => {
  if (!workspace || !validSourcePath(path)) throw new Error('Invalid source file identity.')
  return `/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
}
export async function readSavedSource(workspace: string, path: string, signal?: AbortSignal): Promise<SavedSource> {
  const value = await request<SavedSource>(sourceFileURL(workspace, path), { signal })
  if (!value || typeof value.content !== 'string' || typeof value.digest !== 'string' || !validDigest(digestKey(value.digest))) throw new Error('Invalid saved source response; no empty file was substituted.')
  return value
}
export async function saveSource(workspace: string, path: string, attempt: SaveAttempt): Promise<SavedSource> {
  if (!validDigest(digestKey(attempt.before.digest))) throw new Error('A real file revision is required to save.')
  const result = await request<{ digest: string }>(sourceFileURL(workspace, path), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: attempt.content, expectedDigest: attempt.before.digest }),
  })
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attempt.content))
  const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  if (!result || typeof result.digest !== 'string' || digestKey(result.digest) !== digest) throw new Error('The save response did not verify the submitted bytes. Check the actual file before retrying.')
  return { content: attempt.content, digest: result.digest }
}
export function saveFailure(error: unknown): 'conflict' | 'rejected' | 'uncertain' {
  if (!(error instanceof APIError)) return 'uncertain'
  if (error.status === 409 || error.status === 412) return 'conflict'
  return error.status >= 400 && error.status < 500 && error.status !== 408 ? 'rejected' : 'uncertain'
}
/** A GET is the only recovery from an uncertain PUT. This never retries a write,
 * adopts a foreign revision as the new CAS baseline, or emits a fabricated receipt.
 */
export function reconcileSave(attempt: SaveAttempt, actual: SavedSource): 'saved' | 'not-saved' | 'conflict' {
  if (actual.content === attempt.content) return 'saved'
  return actual.digest === attempt.before.digest && actual.content === attempt.before.content ? 'not-saved' : 'conflict'
}
