import { observedFiles, subscribeObservations } from './file-observations'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { readBuildRecords, readReviewFile } from './review-api'
import { previewProvenance, buildSourceMatch, type BuildRecord } from './build-provenance'
import type { ManuscriptPDF } from '../resources/manuscript'
export function BuildProvenance({pdf}: {pdf: ManuscriptPDF}) {
  const observations=useSyncExternalStore(subscribeObservations,observedFiles)
  const sourceEvent=observations.filter(o=>o.workspace===pdf.workspace&&o.path===pdf.path).at(-1)?.id
  const zh = useWorkbench(s => s.locale === 'zh')
  const [records, setRecords] = useState<BuildRecord[]>([]), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const [source, setSource] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    const c = new AbortController(); setLoading(true); setError(''); setSource(''); setRecords([])
    void Promise.all([readBuildRecords(pdf.workspace, c.signal), readReviewFile(pdf.workspace, pdf.path).catch(() => null)]).then(([r, s]) => {
      if (!c.signal.aborted) { setRecords(r); setSource(s?.digest || '') }
    }).catch(e => { if (!c.signal.aborted) setError(String(e.message)) }).finally(() => { if (!c.signal.aborted) setLoading(false) })
    return () => c.abort()
  }, [pdf.workspace, pdf.path, pdf.buildId, pdf.digest, revision, sourceEvent])
  const status = previewProvenance(records, pdf), match = buildSourceMatch(status.selected, pdf.workspace, pdf.path, source)
  return <details className="shrink-0 px-3 py-2 text-caption text-ink-2" data-review-build={pdf.buildId}>
    <summary className="cursor-pointer">{zh ? '预览版本与构建回执' : 'Preview version and build receipt'} · {pdf.buildId}</summary>
    <p className="mt-2 break-all">PDF · {pdf.digest}</p>
    <p>{zh ? '构建提交' : 'Build commit'} · {status.selected?.task.gitCommit || (zh ? '未提供' : 'Not supplied')}</p>
    {loading ? <p role="status">{zh ? '正在读取真实构建回执…' : 'Reading build receipts…'}</p> : error ? <p role="alert">{error}</p> : <>
      {!status.valid && <p role="alert">{zh ? '当前预览未能匹配成功构建回执；请确认来源。' : 'Preview does not match a successful build receipt; confirm its source.'}</p>}
      {status.laterFailure && <p role="alert">{zh ? '后续构建失败；仍保留旧的成功预览，未自动替换。' : 'A later build failed. This is the previous successful preview; it has not been replaced.'}</p>}
      {status.oldPreview && !status.laterFailure && <p>{zh ? '当前选择的是旧预览。' : 'An older preview is selected.'}</p>}
      <p>{zh ? '当前源码与构建输入' : 'Current source versus build inputs'} · {match === 'match' ? zh ? '版本一致' : 'Same version' : match === 'changed' ? zh ? '已变化；预览不是当前源码' : 'Changed; preview is not current source' : zh ? '待确认，不能推定一致' : 'Unknown; do not assume a match'}</p>
      {status.latest && <p>{zh ? '最新回执' : 'Latest receipt'} · {status.latest.manifest.buildId} · {status.latest.manifest.status}</p>}
      {status.latest?.manifest.diagnostics?.map((d, i) => <p key={i}>{d.message}</p>)}
    </>}
    <p>{zh ? '编译成功不代表证据、引用或结论已验证。' : 'A successful build does not verify evidence, citations or research conclusions.'}</p>
    <Button size="xs" disabled={loading} onClick={() => setRevision(n => n + 1)}>{zh ? '刷新真实回执' : 'Refresh receipts'}</Button>
  </details>
}
