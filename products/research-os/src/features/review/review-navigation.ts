import { acquireReviewWrite } from './write-coordinator'
import { useWorkbench } from '../../store'
import { verifyAnchor } from './review-api'
import type { Anchor, Scope } from './review-model'
export async function openFeedbackAnchor(anchor: Anchor, scope: Scope): Promise<void> {
  if(anchor.kind==='canvas'||anchor.kind==='block'){const release=acquireReviewWrite(anchor.workspace,anchor.path);await release()}
  await verifyAnchor(anchor, scope)
  const s = useWorkbench.getState()
  if (anchor.kind === 'pdf') {
    const pdf = {workspace: anchor.workspace, path: anchor.path, buildId: anchor.buildId!, digest: anchor.digest,
      url: `/api/v1/manuscripts/build-records/${encodeURIComponent(anchor.buildId!)}/artifacts/${encodeURIComponent(anchor.digest)}`}
    s.openPDF(pdf); s.flashPDF({buildId: pdf.buildId, page: anchor.page!, rects: anchor.rects}, pdf)
  } else if (anchor.target?.kind === 'block') {
    s.selectResearchDraft(scope, anchor.target.objectId);s.setReviewFocus(scope,anchor)
  } else if (anchor.kind === 'canvas') {
    s.openCanvas(scope.projectId);s.setReviewFocus(scope,anchor)
  } else {
    s.openRightTab({kind: 'file', target: {projectId: scope.projectId, projectWorkspace: scope.workspace, workspace: anchor.workspace, path: anchor.path, view: 'files'}})
    s.setReadingAnchor({id: crypto.randomUUID(), workspace: anchor.workspace, path: anchor.path, digest: anchor.digest, excerpt: anchor.quote})
  }
}
