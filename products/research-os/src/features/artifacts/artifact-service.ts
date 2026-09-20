import {request} from '../../lib/api'
import {projectArtifactBuilds, type ArtifactScope} from './artifact-model'

/** Same authoritative build-record collection as the manuscript UI; this service is read-only. */
export async function listArtifactBuilds(scope: ArtifactScope, signal?: AbortSignal) {
  const records = await request<unknown>(`/manuscripts/build-records?manuscriptId=${encodeURIComponent(scope.artifactId)}`, {signal})
  return projectArtifactBuilds(records, scope)
}
