import { useWorkbench } from '../../store'
import { openResearchSource } from '../projects/research-navigation'
import type { DraftScope } from '../projects/draft-model'
import { buildArtifactURL, listBuildRecords, pdfFromRecord } from '../resources/manuscript'
import { stepArtifactUrl } from '../workflow/workflow-client'
import { requestWorkflowFocus } from '../workflow/workflow-focus'
import type { ResourceReference } from './content-model'

export function runSourceLocation(source: ResourceReference): { project: string; version: number; runId: string; nodeId?: string } {
  const project = typeof source.projectId === 'string' ? source.projectId : ''
  const version = Number(source.version ?? source.planVersion)
  if (!project || !Number.isSafeInteger(version) || version < 1 || !source.id) throw new Error('The run reference is missing its project, plan version or run identity.')
  return { project, version, runId: source.id, nodeId: source.selector?.objectId }
}
export function runArtifactURL(source: ResourceReference): string {
  const location = runSourceLocation(source)
  if (!source.path || !source.digest || !location.nodeId) throw new Error('The artifact reference is missing its producing step or digest.')
  return stepArtifactUrl(location.project, location.version, location.runId, location.nodeId, source.digest)
}
const download = (url: string) => { const anchor = document.createElement('a'); anchor.href = url; anchor.download = ''; anchor.click() }
export async function openContentResource(source: ResourceReference, scope: DraftScope): Promise<void> {
  const store = useWorkbench.getState(), workspace = source.workspace ?? scope.workspace
  const ownerProjectId = typeof source.projectId === 'string' ? source.projectId : workspace === scope.workspace ? scope.projectId : workspace
  if (source.kind === 'run') {
    if (source.path) download(runArtifactURL(source))
    else { const focus = runSourceLocation(source); requestWorkflowFocus(focus); store.setProjectId(focus.project); store.setActiveNav('workflow') }
    return
  }
  if (source.kind === 'content' || source.kind === 'workflow') {
    store.openResource({ kind: 'research', workspace, ownerProjectId, view: 'table', objectId: source.id ?? source.selector?.objectId, ...(source.digest ? { digest: source.digest } : {}) }); return
  }
  if (source.kind === 'artifact') {
    if (!source.id) throw new Error('Missing research artifact identity.')
    if (source.digest) store.openResource({ kind: 'research', workspace, ownerProjectId, view: 'table', digest: source.digest, artifactId: source.id })
    else store.selectResearchDraft({ workspace, projectId: ownerProjectId }, source.id)
    return
  }
  if (source.kind === 'build') {
    const buildId = source.selector?.buildId ?? source.id
    const record = (await listBuildRecords(workspace)).find(r => r.manifest.buildId === buildId)
    if (!record) throw new Error('The referenced build is not available in its workspace.')
    const pdf = pdfFromRecord(record), expected = source.digest?.replace(/^sha256:/, '')
    if (pdf && (!expected || pdf.digest === expected)) { store.openPDF(pdf); if (source.selector?.page) store.flashPDF({ buildId: pdf.buildId, page: source.selector.page }, pdf); return }
    if (expected && (record.manifest.outputs?.some(o => o.digest === expected) || record.manifest.logArtifactRef.endsWith(expected))) { download(buildArtifactURL(record.manifest.buildId, expected)); return }
    throw new Error('The build receipt does not contain the referenced artifact.')
  }
  const url = typeof source.url === 'string' ? source.url : source.kind === 'literature' && /^https?:\/\//.test(source.id ?? '') ? source.id : undefined
  if (url) { store.openResource({ kind: 'web', url }); return }
  if (!source.path) throw new Error('This reference has no readable location.')
  if (/\.(pdf|txt)$/i.test(source.path)) { store.openResource({ kind: 'original', workspace, path: source.path, digest: source.digest, page: source.selector?.page, quote: source.selector?.quote }); return }
  if (source.kind === 'knowledge' || /\.md$/i.test(source.path)) {
    store.openDocument({ workspace, path: source.path, title: source.path.split('/').pop() || source.path })
    store.setReadingAnchor({ id: source.id || 'content-source', workspace, path: source.path, digest: source.digest, excerpt: source.selector?.quote }); return
  }
  openResearchSource({ id: source.id || 'content-source', path: source.path, workspace, digest: source.digest, excerpt: source.selector?.quote, buildId: source.selector?.buildId, page: source.selector?.page }, scope)
}
