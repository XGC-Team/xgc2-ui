import { useWorkbench } from '../../store'
import { fileTarget } from './project-object-model'
import type { DraftScope, DraftSource } from './draft-model'

/** Preserve the observed revision; changed sources are disclosed by the reader, never silently repinned. */
export function openResearchSource(source: DraftSource, scope: DraftScope): void {
  const store = useWorkbench.getState()
  const workspace = source.workspace || scope.workspace
  if (source.url) store.openResource({ kind: 'web', url: source.url })
  else if (source.buildId && source.digest) {
    const pdf = { workspace, path: source.path, buildId: source.buildId, digest: source.digest,
      url: `/api/v1/manuscripts/build-records/${encodeURIComponent(source.buildId)}/artifacts/${encodeURIComponent(source.digest)}` }
    store.openPDF(pdf)
    if (source.page) store.flashPDF({ buildId: source.buildId, page: source.page }, pdf)
  } else {
    store.openResource({ kind: 'file', target: { ...fileTarget(scope.projectId, workspace, 'files', source.path), projectWorkspace: scope.workspace } })
    store.setReadingAnchor({ ...source, workspace })
  }
}
