import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { Scope } from '../review/review-model'
import type { ManuscriptPDF } from '../resources/manuscript'
import { useManuscriptBuild } from '../resources/useManuscriptBuild'
import { ManuscriptBuildSettings } from '../resources/ManuscriptBuildSettings'
import { canAdvancePreview } from './preview-selection'

const PDFReader = lazy(() => import('../resources/PDFReader'))

/** Viewer selection belongs here. Build ids and digests stay off this surface. */
export function ManuscriptPreview({ pdf, scope, active = true, followCurrent = false, onPDF, onQuote, onTitle, actionsHostId, onFollowChange }: {
  pdf: ManuscriptPDF
  scope: Scope
  actionsHostId: string
  onFollowChange: (follow: boolean) => void
  active?: boolean
  followCurrent?: boolean
  onPDF: (pdf: ManuscriptPDF) => void
  onQuote: (text: string, project?: string) => void
  onTitle: (title: string) => void
}) {
  const zh = useWorkbench(state => state.locale === 'zh')
  const [following, setFollowing] = useState(followCurrent)
  const [dirty, setDirty] = useState(false)
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setFollowing(followCurrent) }, [followCurrent])
  useEffect(() => { setActionsHost(document.getElementById(actionsHostId)) }, [actionsHostId])
  const manuscript = /\.tex$/i.test(pdf.path)
  const build = useManuscriptBuild(manuscript ? { workspace: pdf.workspace, entryPoint: pdf.path } : null)
  const busy = build.phase === 'building' || build.phase === 'queued'
  useEffect(() => {
    if (build.phase === 'succeeded' && build.freshness === 'saved-snapshot'
      && canAdvancePreview(pdf, build.pdf, following, dirty)) onPDF(build.pdf)
  }, [pdf, build.pdf, build.phase, build.freshness, following, dirty, onPDF])
  const controls = manuscript && active && actionsHost ? createPortal(
    <div className="flex items-center gap-1" data-xgc-role="manuscript-preview-controls" data-xgc-id={pdf.path}>
      <ManuscriptBuildSettings workspace={pdf.workspace} entryPoint={pdf.path} sourceRoot={build.sourceRoot} disabled={busy}/>
      {!following && <Button size="xs" disabled={dirty || !build.pdf} onClick={() => { setFollowing(true); onFollowChange(true); if (build.pdf) onPDF(build.pdf) }}>{zh ? '跟随当前稿件' : 'Follow current draft'}</Button>}
      <Button size="xs" disabled={busy || build.capability?.available === false} onClick={() => void build.retry()}>{busy ? (zh ? '编译中' : 'Building') : (zh ? '编译' : 'Build')}</Button>
      {busy && <Button size="xs" onClick={build.cancel}>{zh ? '取消' : 'Cancel'}</Button>}
    </div>,
    actionsHost,
  ) : null
  return <>
    {controls}
    {build.error && <p role="alert" className="ui-error">{build.error}</p>}
    <Suspense fallback={<p className="p-4 text-ink-3">{zh ? '正在打开 PDF…' : 'Opening PDF…'}</p>}>
      <PDFReader pdf={pdf} scope={scope} onDraftChange={setDirty} onPDF={version => { setFollowing(false); onFollowChange(false); onPDF(version) }} onQuote={onQuote} onTitle={onTitle}/>
    </Suspense>
  </>
}
