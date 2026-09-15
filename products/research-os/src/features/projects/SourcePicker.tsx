import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { listProjectMaterials, type ProjectEntry } from '../resources/project-files'
import { sourceKey, type DraftBook, type DraftSource } from './draft-model'

export function SourcePicker({ book, locale, onChoose }: { book: DraftBook; locale: 'zh' | 'en'; onChoose: (source: DraftSource) => void }) {
  const [directory, setDirectory] = useState(''), [entries, setEntries] = useState<ProjectEntry[]>([])
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0)
  const zh = locale === 'zh'
  const shared = [...new Map(book.drafts.filter(draft => !draft.archivedAt).flatMap(draft => draft.sources).map(source => [sourceKey(source, book.workspace), source])).values()]
  useEffect(() => {
    if (!open) return
    const controller = new AbortController(); setLoading(true); setError(''); setEntries([])
    void listProjectMaterials(book.workspace, directory, controller.signal).then(items => { if (!controller.signal.aborted) setEntries(items) }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [book.workspace, directory, open, retry])
  return <div className="space-y-2">
    <details><summary className="cursor-pointer text-secondary">{zh ? '选择共同研究来源' : 'Choose shared research source'}</summary>
      {shared.map(source => <button key={sourceKey(source, book.workspace)} type="button" className="ui-list-row" onClick={() => onChoose({ ...source, id: crypto.randomUUID() })}>{source.excerpt?.slice(0, 50) || source.path || source.url}</button>)}
      {!shared.length && <p className="text-caption text-ink-3">{zh ? '还没有登记来源。可从文件阅读器选区记笔记，或浏览下方项目文件。' : 'No sources registered yet. Capture a selection in a reader or browse project files below.'}</p>}
    </details>
    <Button size="xs" onClick={() => setOpen(value => !value)}>{zh ? '浏览项目文件' : 'Browse project files'}</Button>
    {open && <div className="max-h-60 overflow-auto rounded-md bg-elevated p-2">
      <p className="text-caption">{book.workspace}/{directory}</p>
      {directory && <Button size="xs" onClick={() => setDirectory(directory.split('/').slice(0, -1).join('/'))}>{zh ? '上级目录' : 'Parent directory'}</Button>}
      {loading && <p role="status">{zh ? '读取中…' : 'Loading…'}</p>}
      {error && <><p role="alert">{error}</p><Button onClick={() => setRetry(value => value + 1)}>{zh ? '重试' : 'Retry'}</Button></>}
      {entries.map(entry => <button key={entry.path} type="button" className="ui-list-row" onClick={() => entry.kind === 'directory' ? setDirectory(entry.path) : onChoose({ id: crypto.randomUUID(), path: entry.path, workspace: book.workspace })}>{entry.path.split('/').pop()}{entry.kind === 'directory' ? '/' : ''}</button>)}
      {!loading && !error && !entries.length && <p className="text-caption">{zh ? '目录中没有支持的研究材料。' : 'No supported research materials in this directory.'}</p>}
    </div>}
  </div>
}
