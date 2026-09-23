import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '../../components/ui'
import { Select } from '../../components/forms'
import { useWorkbench } from '../../store'
import { buildArtifactURL, listBuildRecords, type ManuscriptPDF } from './manuscript'
import { useManuscriptBuild } from './useManuscriptBuild'
import { ManuscriptBuildSettings } from './ManuscriptBuildSettings'
import {preferredManuscriptEntry,setPreferredManuscriptEntry,subscribeManuscriptBuildSettings} from './manuscript-build-config'
const labels = {
  zh: { idle: '尚无构建', loading: '读取构建回执', queued: '已保存，等待编译', building: '正在编译保存快照', succeeded: '编译成功', failed: '编译失败', cancelled: '编译已取消', unavailable: '编译环境未就绪', 'source-changed': '保存版本已变化', error: '构建结果待核对' },
  en: { idle: 'No build yet', loading: 'Reading build receipts', queued: 'Saved; build queued', building: 'Building saved snapshot', succeeded: 'Build succeeded', failed: 'Build failed', cancelled: 'Build cancelled', unavailable: 'Compiler unavailable', 'source-changed': 'Saved revision changed', error: 'Build result needs checking' },
}
export function ManuscriptBuildStatus({ workspace, path, entryPoint, active, onOpenPDF }: { workspace: string; path: string; entryPoint?: string; active: boolean; onOpenPDF: (pdf: ManuscriptPDF) => void }) {
  const zh = useWorkbench(state => state.locale === 'zh')
  const [entries, setEntries] = useState<string[]>([]), [selected, setSelected] = useState(''), [historyError, setHistoryError] = useState('')
  const preferred=useSyncExternalStore(subscribeManuscriptBuildSettings,()=>preferredManuscriptEntry(workspace),()=>'')
  useEffect(() => {
    const controller = new AbortController()
    void listBuildRecords(workspace, controller.signal).then(records => {
      if (controller.signal.aborted) return
      const paths = [...new Set(records.map(record => record.task.entryPoint))]
      setEntries(paths); setHistoryError('')
      if (paths.length === 1) setSelected(current => current || paths[0])
    }).catch(error => { if (!controller.signal.aborted) setHistoryError(String(error.message)) })
    return () => controller.abort()
  }, [workspace])
  const main = entryPoint || selected || preferred
  const build = useManuscriptBuild(main ? { workspace, entryPoint: main } : null, { enabled: active })
  const busy = build.phase === 'building' || build.phase === 'queued'
  const choices = [...new Set([...entries, ...(preferred?[preferred]:[]), ...(/\.tex$/i.test(path) ? [path] : [])])]
  return <section className="shrink-0 border-b border-line px-3 py-2 text-caption" data-manuscript-entry={main}>
    {!entryPoint && <label className="flex items-center gap-2">{zh ? '编译主稿' : 'Manuscript entry'}
      <Select aria-label={zh ? '编译主稿' : 'Manuscript entry'} value={main} disabled={busy} onChange={event => {try{setPreferredManuscriptEntry(workspace,event.target.value);setSelected(event.target.value);setHistoryError('')}catch(error){setHistoryError(String((error as Error).message))}}} className="min-w-0 flex-1 rounded bg-elevated p-1">
        <option value="">{zh ? '选择主稿；引用文件不自动当主稿' : 'Select main source; includes are not entry points'}</option>
        {choices.map(value => <option key={value} value={value}>{value}</option>)}
      </Select>
    </label>}
    {main ? <>
      <p role="status" className="mt-2">{labels[zh ? 'zh' : 'en'][build.phase]} · {main}</p>
      <p className="text-ink-3">{zh ? '保存成功后自动编译；不提交 Git。草稿和未完成的 Agent 批次不触发。' : 'Successful saves compile automatically without Git commits. Drafts and incomplete Agent batches do not trigger builds.'}</p>
      {build.error && <p role="alert" className="ui-error whitespace-pre-wrap">{build.error}</p>}
      {build.pdf && (build.freshness !== 'saved-snapshot' || build.phase !== 'succeeded') && <p>{zh ? '保留上次成功 PDF；不能推定与当前源码一致。' : 'Previous successful PDF retained; current-source agreement is not assumed.'}</p>}
      {!build.pdf && <p>{zh ? '尚无成功 PDF。可继续编辑并保存；编译失败不会阻断写作。' : 'No successful PDF yet. Continue editing and saving; a build failure does not block writing.'}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <ManuscriptBuildSettings workspace={workspace} entryPoint={main} sourceRoot={build.sourceRoot} disabled={busy}/>
        <Button size="xs" disabled={busy || !active} onClick={() => void build.retry()}>{zh ? '编译当前已保存版本' : 'Build current saved version'}</Button>
        {busy && <Button size="xs" onClick={build.cancel}>{zh ? '取消编译' : 'Cancel build'}</Button>}
        <Button size="xs" disabled={busy || !active} onClick={() => void build.refresh()}>{zh ? '核对环境与回执' : 'Check runner and receipts'}</Button>
        {build.pdf && <Button size="xs" onClick={() => onOpenPDF(build.pdf!)}>{zh ? '打开此成功 PDF' : 'Open this successful PDF'}</Button>}
        {build.record && <a className="underline" href={buildArtifactURL(build.record.manifest.buildId, build.record.manifest.logArtifactRef)} target="_blank" rel="noreferrer">{zh ? '实际构建日志' : 'Actual build log'}</a>}
      </div>
      {build.record && <p className="mt-1 break-all text-ink-3">{build.record.manifest.buildId} · {build.record.task.sourceDigest}</p>}
    </> : <p className="mt-2 text-ink-3">{zh ? '从主稿文件选择编译入口一次。保存引用文件时复用该主稿，不推测入口。' : 'Select the manuscript entry once from its source file. Dependency saves reuse that entry rather than guessing one.'}</p>}
    {historyError && <p role="alert" className="ui-error">{historyError}</p>}
  </section>
}
