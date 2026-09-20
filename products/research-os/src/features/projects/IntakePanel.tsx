import { useState, useSyncExternalStore } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { LiteratureWorkbench } from '../literature'
import { intakeSnapshot, subscribeIntake, submitIntake, retryIntake } from './intake-queue'
import { validWebSource, type DraftScope } from './draft-model'

/** Shared by Chat drop feedback and the project object list. Upload receipts are not execution receipts. */
export function IntakePanel({ scope, compact = false }: { scope: DraftScope; compact?: boolean }) {
  const records = useSyncExternalStore(subscribeIntake, intakeSnapshot, intakeSnapshot)
  const { locale, requestDraftCapture } = useWorkbench()
  const zh = locale === 'zh', [url, setUrl] = useState(''), [error, setError] = useState('')
  const visible = records.filter(item => item.scope.projectId === scope.projectId && item.scope.workspace === scope.workspace)
  const [registered, setRegistered] = useState<string[]>([])
  const [openArchive, setOpenArchive] = useState<string>('')
  if (compact && !visible.length) return null
  return <section aria-label={zh ? '资料投入' : 'Material intake'} className="my-3 space-y-2">
    {!compact && <>
      <label className="block text-secondary text-ink-2">{zh ? '投入文本或 PDF' : 'Import text or PDF'}
        <input type="file" multiple accept=".md,.mdx,.txt,.tex,.bib,.csv,.tsv,.pdf" className="mt-1 block w-full text-caption" onChange={event => {
          const files = Array.from(event.target.files || []); event.target.value = ''
          for (const file of files) void submitIntake(file, scope).catch(reason => setError(String(reason)))
        }}/>
      </label>
      <form className="flex flex-wrap gap-1" onSubmit={event => {
        event.preventDefault()
        if (!validWebSource(url)) { setError(zh ? '请输入不含账号密码的 HTTP(S) 地址。' : 'Enter an HTTP(S) URL without credentials.'); return }
        requestDraftCapture({ id: crypto.randomUUID(), scope, kind: 'material', source: { id: crypto.randomUUID(), path: '', url } }); setUrl(''); setError('')
      }}>
        <input aria-label={zh ? '资料网址' : 'Material URL'} placeholder="https://" className="ui-input min-w-0 flex-1" value={url} onChange={event => setUrl(event.target.value)}/>
        <Button type="submit" disabled={!url}>{zh ? '记录链接' : 'Record link'}</Button>
      </form>
      <p className="text-caption text-ink-3">{zh ? '文本保存到项目工作区；PDF 进入全局归档并保留阅读身份。链接仅记录引用，不声称已抓取。投入队列仅在本次页面会话中保留。' : 'Text is stored in the project workspace; PDF uses the archive and keeps a reading identity. URLs are references, not fetched content. Queue receipts last for this page session.'}</p>
    </>}
    {visible.map(record => <div key={record.id} className="rounded-md bg-elevated p-2 text-caption" data-intake-state={record.state}>
      <p>{record.name} · {({ uploading: zh ? '上传中' : 'Uploading', accepted: zh ? '接口已确认接收' : 'API accepted', failed: zh ? '失败，未确认接收' : 'Failed, not confirmed', unsupported: zh ? '格式未支持，未上传' : 'Unsupported, not uploaded' })[record.state]}</p>
      {record.archive && <p className="break-all text-ink-3">work {record.archive.workId} · acquisition {record.archive.acquisitionId} · {record.archive.sourceSha256}</p>}
      {record.error && <p role="alert" className="break-words">{record.error}</p>}
      {record.state === 'failed' && <Button size="xs" onClick={() => void retryIntake(record.id).catch(reason => setError(String(reason)))}>{zh ? '重试' : 'Retry'}</Button>}
      {record.state === 'accepted' && record.source && <Button size="xs" onClick={() => {
        requestDraftCapture({ id: record.id, scope: record.scope, kind: 'material', source: record.source! }); setRegistered(ids => [...ids, record.id])
      }}>{registered.includes(record.id) ? zh ? '已交给项目编辑器，请核对保存状态' : 'Sent to project editor; check save state' : zh ? '登记为项目材料' : 'Register project material'}</Button>}
      {record.state === 'accepted' && record.kind === 'pdf' && record.archive && <Button size="xs" onClick={() => setOpenArchive(id => id === record.id ? '' : record.id)}>{openArchive === record.id ? (zh ? '收起原文对照' : 'Hide original compare') : (zh ? '对照原文并研读' : 'Compare original and study')}</Button>}
      {record.state === 'accepted' && record.kind === 'pdf' && record.archive && openArchive === record.id && !compact &&
        <LiteratureWorkbench scope={record.scope} archive={record.archive} title={record.name}/>}
    </div>)}
    {error && <p role="alert" className="text-caption">{error}</p>}
  </section>
}
