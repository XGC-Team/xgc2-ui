import { lazy, Suspense, useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { BuildProvenance } from '../review/BuildProvenance'
import type { ManuscriptPDF } from '../resources/manuscript'
import { useManuscriptBuild } from '../resources/useManuscriptBuild'
import { canAdvancePreview } from './preview-selection'

const PDFReader = lazy(() => import('../resources/PDFReader'))

/** Viewer selection belongs here; the build owner only supplies verified candidates. */
export function ManuscriptPreview({ pdf, followCurrent = false, onPDF, onQuote, onTitle }: {
  pdf: ManuscriptPDF
  followCurrent?: boolean
  onPDF: (pdf: ManuscriptPDF) => void
  onQuote: (text: string, project?: string) => void
  onTitle: (title: string) => void
}) {
  const zh = useWorkbench(state => state.locale === 'zh')
  const [following, setFollowing] = useState(followCurrent)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setFollowing(followCurrent) }, [followCurrent])
  const manuscript = /\.tex$/i.test(pdf.path)
  const build = useManuscriptBuild(manuscript ? { workspace: pdf.workspace, entryPoint: pdf.path } : null)
  const busy = build.phase === 'building' || build.phase === 'queued'
  useEffect(() => {
    if (build.phase === 'succeeded' && build.freshness === 'saved-snapshot'
      && canAdvancePreview(pdf, build.pdf, following, dirty)) onPDF(build.pdf)
  }, [pdf, build.pdf, build.phase, build.freshness, following, dirty, onPDF])
  return <>
    {manuscript && <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-caption" data-xgc-role="manuscript-preview-controls" data-xgc-id={pdf.path}>
      <span className="min-w-0 flex-1 truncate" role="status">{busy ? (zh ? '编译中' : 'Building') : following ? (zh ? '当前稿件' : 'Current draft') : (zh ? '固定版本' : 'Pinned version')}</span>
      {!following && <Button size="xs" disabled={dirty || !build.pdf} onClick={() => { setFollowing(true); if (build.pdf) onPDF(build.pdf) }}>{zh ? '跟随当前稿件' : 'Follow current draft'}</Button>}
      <Button size="xs" disabled={busy || build.capability?.available === false} onClick={() => void build.retry()}>{zh ? '编译' : 'Build'}</Button>
      {busy && <Button size="xs" onClick={build.cancel}>{zh ? '取消' : 'Cancel'}</Button>}
    </div>}
    {build.error && <p role="alert" className="ui-error">{build.error}</p>}
    <BuildProvenance pdf={pdf}/>
    <Suspense fallback={<p className="p-4 text-ink-3">{zh ? '正在打开 PDF…' : 'Opening PDF…'}</p>}>
      <PDFReader pdf={pdf} onDraftChange={setDirty} onPDF={version => { setFollowing(false); onPDF(version) }} onQuote={onQuote} onTitle={onTitle}/>
    </Suspense>
  </>
}
