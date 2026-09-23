import { useState } from 'react'
import { ReviewPanelContents } from '../review/ReviewPanel'
import { writingCopy } from './writing-copy'
import { useDesignWriting } from './useDesignWriting'
import { useReview } from '../review/useReview'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { scopeKey, type Scope } from '../review/review-model'
import './writing-workbench.css'

export function DesignReviewDock() {
  const projectId = useWorkbench(s => s.projectId)
  const selectedScope=useWorkbench(s=>s.reviewScopes[projectId])
  const scope=selectedScope??{projectId,workspace:projectId}
  return projectId ? <ProjectDesignReviewDock key={scopeKey(scope)} scope={scope}/> : null
}

function ProjectDesignReviewDock({ scope }: { scope: Scope }) {
  const {projectId}=scope
  const { locale, reviewDockOpen, setReviewDockOpen, reviewIntents, openResource } = useWorkbench()
  const copy = writingCopy[locale]
  const [formDirty, setFormDirty] = useState(false), [error, setError] = useState('')
  const review = useReview(scope, `writing-review:${projectId}`, formDirty)
  const writing = useDesignWriting(scope, review)
  const incoming = reviewIntents.filter(item => scopeKey(item.scope) === scopeKey(scope)).length
  const call = async (action: () => Promise<unknown>) => { setError(''); try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  // Collapsing chrome retains the native observer, journal and unsaved review form.
  return <section hidden={!reviewDockOpen} style={reviewDockOpen ? undefined : { display: 'none' }} className="writing-review-dock" data-xgc-role="writing-review-dock" data-xgc-id={projectId} aria-label={copy.review}>
    <div className="writing-review-dock__header">
      <span className="min-w-0 flex-1 truncate font-display text-[13px]">{copy.review}{incoming ? ` · ${incoming}` : ''}</span>
      <Button size="xs" data-xgc-role="open-design" data-xgc-id={projectId} onClick={() => openResource({kind:'research',workspace:scope.workspace,ownerProjectId:projectId,view:'canvas'},'primary')}>{copy.openDesign}</Button>
      <Button size="xs" data-xgc-role="collapse-review" data-xgc-id={projectId} onClick={() => setReviewDockOpen(false)}>{copy.collapseReview}</Button>
    </div>
    <p className="px-3 pb-2 text-caption text-ink-2">{copy.reviewHint}</p>
    {writing.busy && <p role="status" className="px-3 pb-2 text-caption">{locale === 'zh' ? '正在处理当前设计与改稿请求；会话中的权限请求仍需在对话里处理。' : 'Processing the current design or writing request. Resolve permission requests in the conversation.'}</p>}
    {(error || writing.error) && <p role="alert" className="px-3 pb-2 text-caption">{error || writing.error}</p>}
    {writing.incoming.map(intent => <div key={intent.id} className="px-3 pb-2 text-caption">
      <p>{intent.body}</p>
      <p>{locale === 'zh' ? '将相关设计卡片加入讨论上下文；批注保留原 PDF 版本。' : 'Add the relevant design cards to the discussion context. The annotation keeps its original PDF revision.'}</p>
      <Button size="xs" disabled={!review.book || review.busy || writing.busy} onClick={() => void writing.discuss(intent)}>{locale === 'zh' ? '发送设计讨论' : 'Send design discussion'}</Button>
    </div>)}
    {review.book?.proposals.filter(p => p.writing).map(proposal => <div key={proposal.id} className="space-y-1 border-t border-line px-3 py-2 text-caption">
      <p>{proposal.title} · {proposal.writing!.status}</p>
      <p>{proposal.writing!.selection.sources.map(source => source.anchor.path).join(' · ')}</p>
      <details><summary>{locale === 'zh' ? '核对当前设计与正文范围' : 'Review the saved design and manuscript ranges'}</summary>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{proposal.writing!.selection.context}</pre>
        {proposal.writing!.selection.sources.map(source => <div key={source.id} className="mt-2"><p>{source.anchor.path}</p><blockquote className="max-h-32 overflow-auto whitespace-pre-wrap border-l border-line pl-2">{source.anchor.quote}</blockquote></div>)}
      </details>
      {proposal.writing!.detail && <p role="status">{proposal.writing!.detail}</p>}
      {['running','ready'].includes(proposal.writing!.status)&&proposal.writing!.execution?.turnId&&<div className="flex gap-1">
        <Button size="xs" disabled={review.busy||writing.busy} onClick={()=>void call(()=>writing.openWritingSession(proposal.id))}>{locale==='zh'?'打开原会话':'Open original conversation'}</Button>
        <Button size="xs" data-xgc-role="resume-writing" data-xgc-id={proposal.id} disabled={review.busy||writing.busy||review.auditUncertain} onClick={()=>void call(()=>writing.resumeWriting(proposal.id))}>{locale==='zh'?'继续读取原结果':'Continue from original result'}</Button>
      </div>}
      {['proposed', 'confirmed'].includes(proposal.writing!.status) && <Button size="xs" data-xgc-role="confirm-writing" data-xgc-id={proposal.id} disabled={review.busy || writing.busy || review.auditUncertain} onClick={() => void call(() => writing.confirmAndWrite(proposal.id, proposal.author))}>{copy.confirmWrite}</Button>}
      {!['settled', 'cancelled', 'failed'].includes(proposal.writing!.status) && <Button size="xs" onClick={() => void call(() => writing.cancel(proposal.id, proposal.author, 'The author stopped this writing request.'))}>{locale === 'zh' ? '停止本次改稿' : 'Stop this writing request'}</Button>}
      {proposal.writing!.mapping && <p role="status">{locale === 'zh' ? '设计映射' : 'Design mapping'} · {proposal.writing!.mapping.status} {proposal.writing!.mapping.detail}</p>}
      {proposal.writing!.mapping && proposal.writing!.mapping.status !== 'updated' && <Button size="xs" disabled={review.busy || writing.busy} onClick={() => void call(() => writing.retryMapping(proposal.id))}>{locale === 'zh' ? '核对并重试设计映射' : 'Inspect and retry design mapping'}</Button>}
    </div>)}
    <div className="writing-review-dock__body min-h-0 flex-1">
      <ReviewPanelContents surface="writing" scope={scope} tabId={`writing-review:${projectId}`} api={review} onFormDirty={setFormDirty} onConfirmDesign={writing.confirmDesign} onTitle={() => { /* Dock chrome owns the visible title. */ }}/>
    </div>
  </section>
}
