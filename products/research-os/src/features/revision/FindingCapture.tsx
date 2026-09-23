import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '../../components/ui'
import { Input, Textarea } from '../../components/forms'
import { useWorkbench } from '../../store'
import type { ContentObject, ResourceReference } from '../content/content-model'
import { useNativeAgentSession } from '../chat/Session'
import { captureFinding, editFailureCopy } from './revision-actions'

/** Knowledge notes linked from a card, plus the form that saves a new finding and links it back. */
export function LinkedKnowledge({ project, workspace = project, object, sources }: { project: string; workspace?: string; object: Pick<ContentObject, 'id' | 'title' | 'body'>; sources: ResourceReference[] }) {
  const { locale, openDocument } = useWorkbench()
  const native = useNativeAgentSession()
  const zh = locale === 'zh'
  const notes = sources.filter(source => source.kind === 'knowledge' && source.path)
  const [open, setOpen] = useState(false), [title, setTitle] = useState(''), [body, setBody] = useState('')
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [error, setError] = useState('')
  const start = () => { setOpen(true); setTitle(object.title); setBody(object.body ?? ''); setNote(''); setError('') }
  const save = async () => {
    setBusy(true); setError(''); setNote('')
    try {
      const result = await captureFinding({ scope: { projectId: project, workspace }, object, title: title.trim(), body, thread: native.selectedId || undefined })
      setOpen(false)
      setNote(result.linked.ok ? (zh ? `已保存 academic/${result.path}，并链接到此卡片。` : `Saved academic/${result.path} and linked it to this card.`) : `${zh ? `已保存 academic/${result.path}，但未能链接：` : `Saved academic/${result.path}, but could not link it: `}${editFailureCopy(result.linked, locale)}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
  }
  return <section className="space-y-2" data-xgc-role="linked-knowledge" data-xgc-id={object.id}>
    <p className="text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{zh ? '关联知识笔记' : 'Linked knowledge notes'}</p>
    {notes.map(source => <button key={source.path} type="button" className="flex w-full items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-left text-caption text-ink-2 hover:text-ink" title={`academic/${source.path}${source.digest ? ` @ ${source.digest}` : ''}`}
      onClick={() => openDocument({ workspace: source.workspace || 'academic', path: source.path!, title: String(source.title ?? source.path!.split('/').pop()) })}>
      <BookOpen size={11} strokeWidth={1.75} className="shrink-0"/><span className="min-w-0 flex-1 truncate">{String(source.title ?? source.path!.split('/').pop())}</span>
      <span className="shrink-0 text-ink-3">{source.digest ? (zh ? '已保存' : 'saved') : (zh ? '未校验' : 'unverified')}</span>
    </button>)}
    {!notes.length && !open && <p className="text-caption text-ink-3">{zh ? '尚无。把这张卡上的推导或发现沉淀为知识笔记。' : 'None yet. Capture a derivation or finding from this card as a knowledge note.'}</p>}
    {open ? <div className="space-y-1.5 rounded-md bg-elevated p-2">
      <Input aria-label={zh ? '发现标题' : 'Finding title'} className="ui-input w-full" value={title} onChange={e => setTitle(e.target.value)}/>
      <Textarea aria-label={zh ? '发现正文' : 'Finding body'} rows={4} className="ui-input w-full resize-y" value={body} onChange={e => setBody(e.target.value)}/>
      <p className="text-caption text-ink-3">{zh ? '保存为 academic/memory/findings/… 的持久文件，回链此卡片与当前线程；尚未经过全局知识晋升审阅。' : 'Saved as a durable file under academic/memory/findings/, back-linked to this card and the current thread; not yet promoted to global knowledge.'}</p>
      <div className="flex gap-1"><Button size="xs" variant="outline" loading={busy} disabled={!title.trim() || !body.trim()} onClick={() => void save()}>{zh ? '保存到知识库' : 'Save to knowledge'}</Button><Button size="xs" disabled={busy} onClick={() => setOpen(false)}>{zh ? '取消' : 'Cancel'}</Button></div>
    </div> : <Button size="xs" icon={BookOpen} onClick={start}>{zh ? '沉淀为知识笔记' : 'Capture as knowledge'}</Button>}
    {note && <p role="status" className="text-caption text-ink-2">{note}</p>}
    {error && <p role="alert" className="text-caption text-ink-2">{error}</p>}
  </section>
}
