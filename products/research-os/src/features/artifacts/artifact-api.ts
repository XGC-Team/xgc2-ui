import { APIError, post, request } from '../../lib/api'
import { artifactView, rawDigest, uniquePinnedInputs, type ArtifactDefinition, type ArtifactView, type BuildRecord } from './artifact-model'

export type WorkspaceFile = { content: string; digest: string; path?: string }

function filePath(workspace: string, path: string) {
  return `/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
}

export async function readWorkspaceFile(workspace: string, path: string, signal?: AbortSignal): Promise<WorkspaceFile | null> {
  try {
    const file = await request<WorkspaceFile>(filePath(workspace, path), { signal })
    if (typeof file?.content !== 'string' || typeof file.digest !== 'string' || !file.digest) throw new Error('Invalid file response.')
    return file
  } catch (error) {
    if (error instanceof APIError && error.status === 404) return null
    throw error
  }
}

export async function writeWorkspaceFile(workspace: string, path: string, content: string, expectedDigest?: string) {
  return request<{ digest: string }>(filePath(workspace, path), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expectedDigest ? { content, expectedDigest } : { content, createOnly: true }),
  })
}

export async function writeWorkspaceFileCas(workspace: string, path: string, content: string) {
  const existing = await readWorkspaceFile(workspace, path)
  return writeWorkspaceFile(workspace, path, content, existing?.digest)
}

export async function listArtifactRecords(workspace: string, signal?: AbortSignal): Promise<BuildRecord[]> {
  const records = await request<BuildRecord[]>(`/manuscripts/build-records?manuscriptId=${encodeURIComponent(workspace)}`, { signal })
  if (!Array.isArray(records)) throw new Error('Build records are not a list.')
  return records
}

export type SavedSourceBuildRequest = {
  workspaceRef: string
  entryPoint: string
  manuscriptId: string
  expectedInputs?: { path: string; digest: string }[]
}

function asBuildRecord(data: unknown, requestBody: SavedSourceBuildRequest): BuildRecord {
  if (data && typeof data === 'object' && 'task' in data && 'manifest' in data) return data as BuildRecord
  if (data && typeof data === 'object' && 'buildId' in data) {
    return { task: { workspaceRef: requestBody.workspaceRef, entryPoint: requestBody.entryPoint, manuscriptId: requestBody.manuscriptId }, manifest: data as BuildRecord['manifest'] }
  }
  throw new Error('Build owner returned neither a record nor a manifest.')
}

export async function requestArtifactBuild(input: SavedSourceBuildRequest): Promise<BuildRecord> {
  const body: SavedSourceBuildRequest = {
    workspaceRef: input.workspaceRef, entryPoint: input.entryPoint, manuscriptId: input.manuscriptId,
    expectedInputs: input.expectedInputs ? uniquePinnedInputs(input.expectedInputs) : undefined,
  }
  const key = `artifact-render:${input.workspaceRef}:${input.entryPoint}:${(body.expectedInputs || []).map(item => item.digest).join('.')}`
  try {
    return asBuildRecord(await post<unknown>('/manuscripts/builds', body, key), body)
  } catch (error) {
    if (error instanceof APIError && error.status === 400) {
      throw new Error('The shared build owner has not accepted a saved-source non-LaTeX request. Git commit was not sent.')
    }
    if (error instanceof APIError && (error.status === 501 || error.status === 503)) {
      throw new Error(error.message || 'Artifact renderer is not registered on the shared build owner.')
    }
    throw error
  }
}

export async function loadArtifactView(workspace: string, projectId: string, entryPoint: string, signal?: AbortSignal): Promise<ArtifactView> {
  return artifactView(await listArtifactRecords(workspace, signal), { projectId, workspace }, entryPoint)
}

export async function saveArtifactSources(workspace: string, definitionPath: string, sourcePath: string, definition: ArtifactDefinition, markdown?: string) {
  const inputs: { path: string; digest: string }[] = []
  if (markdown !== undefined) {
    const source = await writeWorkspaceFileCas(workspace, sourcePath, markdown)
    inputs.push({ path: sourcePath, digest: rawDigest(source.digest) })
  }
  const written = await writeWorkspaceFileCas(workspace, definitionPath, `${JSON.stringify(definition, null, 2)}\n`)
  inputs.unshift({ path: definitionPath, digest: rawDigest(written.digest) })
  return inputs
}
