import { observedFiles, subscribeObservations } from './file-observations'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { readReviewFile } from './review-api'
import { previewProvenance, buildSourceMatch, type BuildRecord } from './build-provenance'
import { buildArtifactURL, listBuildRecords, type ManuscriptPDF } from '../resources/manuscript'
import { useManuscriptBuild } from '../resources/useManuscriptBuild'
export function BuildProvenance({ pdf }: { pdf: ManuscriptPDF }) {
  const observations = useSyncExternalStore(subscribeObservations, observedFiles)
  const sourceEvent = observations.filter(observation => observation.workspace === pdf.workspace).at(-1)?.id
  const zh = useWorkbench(state => state.locale === 'zh')
  const build = useManuscriptBuild({ workspace: pdf.workspace, entryPoint: pdf.path })
  const buildEvent = build.record?.manifest.buildId
  const [records, setRecords] = useState<BuildRecord[]>([]), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const [source, setSource] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setSource(''); setRecords([])
    void Promise.all([listBuildRecords(pdf.workspace, controller.signal), readReviewFile(pdf.workspace, pdf.path).catch(() => null)]).then(([receipts, saved]) => {
      if (!controller.signal.aborted) { setRecords(receipts); setSource(saved?.digest || '') }
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason.message)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [pdf.workspace, pdf.path, pdf.buildId, pdf.digest, revision, sourceEvent, buildEvent])
  const status = previewProvenance(records, pdf), match = buildSourceMatch(status.selected, pdf.workspace, pdf.path, source)
  return <details className="shrink-0 px-3 py-2 text-caption text-ink-2" data-review-build={pdf.buildId}>
    <summary className="cursor-pointer">{zh ? '预览版本与构建回执' : 'Preview version and build receipt'} · {pdf.buildId}</summary>
    <p className="mt-2 break-all">PDF · {pdf.digest}</p>
    <p className="break-all">{zh ? '保存快照' : 'Saved source snapshot'} · {status.selected?.task.sourceDigest || (zh ? '未核验' : 'Not verified')}</p>
    {(build.phase === 'queued' || build.phase === 'building') && <p role="status">{zh ? '正在编译新保存版本；当前 PDF 身份保持不变。' : 'Building the newly saved revision; this PDF keeps its original identity.'}</p>}
    {build.error && <p role="alert" className="whitespace-pre-wrap">{build.error}</p>}
    {loading ? <p role="status">{zh ? '正在读取真实构建回执…' : 'Reading build receipts…'}</p> : error ? <p role="alert">{error}</p> : <>
      {!status.valid && <p role="alert">{zh ? '当前预览未能匹配成功构建回执；请确认来源。' : 'Preview does not match a successful build receipt; confirm its source.'}</p>}
      {status.laterFailure && <p role="alert">{zh ? '后续构建失败或取消；仍保留旧的成功预览，未自动替换。' : 'A later build failed or was cancelled. The previous successful preview has not been replaced.'}</p>}
      {status.oldPreview && !status.laterFailure && <p>{zh ? '当前选择的是旧预览，未改写其批注与来源。' : 'An older preview is selected; its annotations and provenance were not rewritten.'}</p>}
      <p>{zh ? '当前主稿文件与该次构建输入（不代表所有依赖）' : 'Current entry file versus this build input (not all dependencies)'} · {match === 'match' ? zh ? '版本一致' : 'Same version' : match === 'changed' ? zh ? '已变化；预览不是当前主稿' : 'Changed; preview is not the current entry file' : zh ? '待确认，不能推定一致' : 'Unknown; do not assume a match'}</p>
      {status.latest && <p>{zh ? '最新请求的回执' : 'Receipt for the latest request'} · {status.latest.manifest.buildId} · {status.latest.manifest.status}</p>}
      {status.latest?.manifest.diagnostics?.map((diagnostic, index) => <p key={index}>{diagnostic.message}</p>)}
      {status.latest && <a className="underline" href={buildArtifactURL(status.latest.manifest.buildId, status.latest.manifest.logArtifactRef)} target="_blank" rel="noreferrer">{zh ? '实际构建日志' : 'Actual build log'}</a>}
    </>}
    <p>{zh ? '编译成功不代表证据、引用或结论已验证。' : 'A successful build does not verify evidence, citations or research conclusions.'}</p>
    <Button size="xs" disabled={loading} onClick={() => { setRevision(value => value + 1); void build.refresh() }}>{zh ? '刷新真实回执' : 'Refresh receipts'}</Button>
  </details>
}
