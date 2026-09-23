export type OriginalLocator = { workspace: string; path: string; digest?: string }
export function originalAssetURL(source: OriginalLocator): string {
  const path = source.path.split('/').map(encodeURIComponent).join('/')
  return `/api/v1/workspaces/${encodeURIComponent(source.workspace)}/assets/${path}${source.digest ? `?digest=${encodeURIComponent(source.digest)}` : ''}`
}
export function originalResponseDigest(response: Response, expected?: string): string {
  const digest = response.headers.get('X-Content-Digest') || ''
  if (!/^sha256:[a-f0-9]{64}$/.test(digest) || expected && expected !== digest) throw new Error('Original source response does not match its pinned revision.')
  return digest
}
export async function verifyOriginalPDF(source: OriginalLocator): Promise<void> {
  if (!source.digest) throw new Error('Original PDF needs its recorded revision.')
  const response = await fetch(originalAssetURL(source), { headers: { Range: 'bytes=0-4' } })
  try {
    if (!response.ok) throw new Error(`Original PDF revision is unavailable (${response.status}).`)
    originalResponseDigest(response, source.digest)
    if (!response.headers.get('Content-Type')?.startsWith('application/pdf')) throw new Error('The recorded source is not a PDF.')
  } finally { await response.body?.cancel() }
}
