import { ReviewPanel } from '../review/ReviewPanel'
import { writingCopy } from './writing-copy'
import { writingConfirmPort } from './seams'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { scopeKey } from '../review/review-model'
import './writing-workbench.css'

export function DesignReviewDock() {
  const { locale, projectId, reviewDockOpen, setReviewDockOpen, reviewIntents, openCanvas } = useWorkbench()
  const copy = writingCopy[locale]
  if (!projectId || !reviewDockOpen) return null
  const scope = { projectId, workspace: projectId }
  const incoming = reviewIntents.filter(item => scopeKey(item.scope) === scopeKey(scope)).length
  const confirm = writingConfirmPort()
  return <section className="writing-review-dock" data-xgc-role="writing-review-dock" data-xgc-id={projectId} aria-label={copy.review}>
    <div className="writing-review-dock__header">
      <span className="min-w-0 flex-1 truncate font-display text-[13px]">{copy.review}{incoming ? ` · ${incoming}` : ''}</span>
      <Button size="xs" data-xgc-role="open-design" data-xgc-id={projectId} onClick={() => openCanvas(projectId)}>{copy.openDesign}</Button>
      <Button size="xs" data-xgc-role="confirm-writing" data-xgc-id={projectId} disabled title={confirm.detail}>{copy.confirmWrite}</Button>
      <Button size="xs" data-xgc-role="collapse-review" data-xgc-id={projectId} onClick={() => setReviewDockOpen(false)}>{copy.collapseReview}</Button>
    </div>
    <p className="px-3 pb-2 text-caption text-ink-2">{copy.reviewHint}</p>
    <p role="status" className="px-3 pb-2 text-caption text-ink-3">{confirm.detail}</p>
    <div className="writing-review-dock__body min-h-0 flex-1">
      <ReviewPanel surface="writing" scope={scope} tabId={`writing-review:${projectId}`} onTitle={() => { /* Dock chrome owns the visible title. */ }}/>
    </div>
  </section>
}
