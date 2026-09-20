import { APIError, request } from '../../lib/api.ts'
import { rawDigest, digestOK, definitionFromDraft, serializeArtifactDefinition, uniquePinnedInputs, type ArtifactDefinition } from './artifact-model.ts'
import { artifactView, inspectArtifactBuild, validateArtifactIdentity, type ArtifactIdentity } from './artifact-record.ts'
import { DRAFTS_PATH, parseDraftBook, type ResearchDraft } from '../projects/draft-model.ts'

export type WorkspaceFile = { content: string; digest: string; path?: string }
export type ArtifactObservation = { definition: WorkspaceFile | null; source: WorkspaceFile | null }
function filePath(workspace: string, path: string) {
  return `/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
}
async function contentDigest(content: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}
export async function readWorkspaceFile(workspace: string, path: string, signal?: AbortSignal): Promise<WorkspaceFile | null> {
  try {
    const file = await request<WorkspaceFile>(filePath(workspace, path), { signal })
    if (typeof file?.content !== 'string' || typeof file.digest !== 'string' || !digestOK(file.digest) || await contentDigest(file.content) !== rawDigest(file.digest)) throw new Error('File content does not match its save receipt.')
    return file
  } catch (error) {
    if (error instanceof APIError && error.status === 404) return null
    throw error
  }
}
export async function writeWorkspaceFile(workspace: string, path: string, content: string, expectedDigest: string | undefined, signal?: AbortSignal) {
  // The digest is the editor's observation, not a just-in-time GET that would
  // authorize overwriting somebody else's intervening save.
  const result = await request<{ digest: string }>(filePath(workspace, path), {
    signal, method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expectedDigest ? { content, expectedDigest } : { content, createOnly: true }),
  })
  if (typeof result?.digest !== 'string' || !digestOK(result.digest) || rawDigest(result.digest) !== await contentDigest(content)) throw new Error('Write has no matching byte receipt; reload before another save.')
  return result
}
export async function listArtifactRecords(scope: ArtifactIdentity, signal?: AbortSignal): Promise<unknown[]> {
  validateArtifactIdentity(scope)
  const records = await request<unknown>(`/manuscripts/build-records?manuscriptId=${encodeURIComponent(scope.artifactId)}`, { signal })
  if (!Array.isArray(records)) throw new Error('Build records are not a list.')
  return records
}
export async function loadArtifactView(scope: ArtifactIdentity, signal?: AbortSignal) {
  return artifactView(await listArtifactRecords(scope, signal), scope)
}

/** B owns the request and complete receipt. This endpoint is never retried here,
 * and a bare manifest cannot be turned into a task using client input. */
export async function requestArtifactBuild(scope: ArtifactIdentity, expectedInputs: { path: string; digest: string }[], signal?: AbortSignal) {
  validateArtifactIdentity(scope)
  const body = { workspaceRef: scope.workspace, entryPoint: scope.entryPoint, manuscriptId: scope.artifactId, expectedInputs: uniquePinnedInputs(expectedInputs) }
  const result = await request<unknown>('/manuscripts/builds', {
    signal, method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `artifact-render:${crypto.randomUUID()}` }, body: JSON.stringify(body),
  })
  const build = inspectArtifactBuild(result, scope)
  for (const expected of body.expectedInputs) {
    if (!build.inputs.some(input => input.path === expected.path && input.digest === expected.digest)) throw new Error('Build receipt differs from the observed saved bytes. Reconcile the ledger before retrying.')
  }
  return build
}

export async function saveArtifactSources(workspace: string, definitionPath: string, sourcePath: string, definition: ArtifactDefinition, observed: ArtifactObservation, markdown?: string, signal?: AbortSignal) {
  // Validate all intent before the first write. These two existing file CAS
  // operations are not claimed to be an atomic multi-file transaction.
  const content = serializeArtifactDefinition(definition)
  uniquePinnedInputs(definition.dependencies)
  if (markdown !== undefined && definition.source !== sourcePath) throw new Error('Refusing to overwrite a different authoritative source.')
  const inputs: { path: string; digest: string }[] = []
  let source = observed.source
  if (markdown !== undefined) {
    const written = await writeWorkspaceFile(workspace, sourcePath, markdown, observed.source?.digest, signal)
    source = { content: markdown, digest: written.digest }
    inputs.push({ path: sourcePath, digest: rawDigest(written.digest) })
  }
  try {
    const written = await writeWorkspaceFile(workspace, definitionPath, content, observed.definition?.digest, signal)
    inputs.push({ path: definitionPath, digest: rawDigest(written.digest) })
    return { inputs: uniquePinnedInputs(inputs), observed: { definition: { content, digest: written.digest }, source } }
  } catch (error) {
    throw new Error(`${inputs.length ? 'Source saved, but definition did not obtain a confirmed save receipt. ' : ''}${String(error)} Reload before retrying; no build has been submitted.`)
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameValue(value, b[index]))
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
}

/** Derive from the existing saved design authority, never from a stale editor
 * labelled saved. The exact book is a design dependency in B's frozen snapshot. */
export async function definitionForSavedDraft(scope: ArtifactIdentity, draft: ResearchDraft, options: Parameters<typeof definitionFromDraft>[1], signal?: AbortSignal): Promise<ArtifactDefinition> {
  validateArtifactIdentity(scope)
  if (draft.id !== scope.artifactId) throw new Error('Editor belongs to another artifact.')
  const origin = await readWorkspaceFile(scope.workspace, DRAFTS_PATH, signal)
  if (!origin) throw new Error('Authoritative saved draft book is missing.')
  const original = parseDraftBook(origin.content, scope).drafts.find(item => item.id === draft.id)
  if (!sameValue(original, draft)) throw new Error('The saved design differs from this editor. Reload it before deriving artifact source.')
  const definition = definitionFromDraft(draft, { ...options, workspace: scope.workspace })
  definition.dependencies.push({ kind: 'design', objectId: draft.id, path: DRAFTS_PATH, digest: rawDigest(origin.digest) })
  return definition
}
