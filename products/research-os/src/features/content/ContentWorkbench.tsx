import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { Input, Select, Textarea } from '../../components/forms'
import { DefinitionEditor } from './DefinitionEditor'
import { SourceReferenceLink } from './SourceReferenceLink'
import { requestDesignFocus, subscribeDesignFocus } from '../projects/design-focus'
import { registerTabCloseGuard } from '../projects/tab-close-guards'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { ThinkingCanvas } from '../projects/ThinkingCanvas'
import { useContentDocument } from './useContentDocument'
import { CARD_TYPE_LABELS, CONTENT_KINDS, type ContentKind, type ContentObject } from './content-model'
import { hasDefinitionDrafts } from './definition-recovery'
import { ArchivedContentWorkbench, ContentHistory } from './ContentHistory'
import { RevisionBoard } from '../revision/RevisionBoard'
import { SyncStrip } from '../revision/SyncStrip'

export type ContentView = 'table' | 'outline' | 'canvas' | 'revision'
const kindLabels = CARD_TYPE_LABELS.zh
type ContentWorkbenchProps = { project: string; workspace?: string; view?: ContentView; objectId?: string; artifactId?: string; digest?: string; tabId?: string; onViewChange?: (view: ContentView) => void; active?: boolean; onRequestConversation?: () => void }
export function ContentWorkbench(props: ContentWorkbenchProps) {
  return props.digest ? <ArchivedContentWorkbench project={props.project} workspace={props.workspace ?? props.project} digest={props.digest} objectId={props.objectId} artifactId={props.artifactId}/> : <LiveContentWorkbench {...props}/>
}
function LiveContentWorkbench({ project, workspace = project, view = 'table', onViewChange, active = true, onRequestConversation, objectId, tabId }: ContentWorkbenchProps) {
  const state = useContentDocument(project, workspace)
  const { locale } = useWorkbench()
  const zh = locale === 'zh'
  const pane = useRef<HTMLElement>(null)
  const [narrow, setNarrow] = useState(true), [showDetails, setShowDetails] = useState(Boolean(objectId))
  useEffect(() => {
    const element = pane.current; if (!element) return
    const measure = () => setNarrow(element.getBoundingClientRect().width < 700)
    const observer = new ResizeObserver(measure); observer.observe(element); measure()
    return () => observer.disconnect()
  }, [])
  const [definitionDirty, setDefinitionDirty] = useState(false)
  const closing = useRef({ dirty: state.dirty, status: state.status, definitionDirty }); closing.current = { dirty: state.dirty, status: state.status, definitionDirty }
  useEffect(() => tabId ? registerTabCloseGuard(tabId, () => {
    if (closing.current.status === 'saving') { window.alert(zh ? '内容正在保存，请稍后关闭。' : 'Content is saving. Wait before closing.'); return false }
    return !(closing.current.dirty || closing.current.definitionDirty || hasDefinitionDrafts(workspace)) || window.confirm(zh ? '仍有未保存修改，确认关闭此视图？' : 'There are unsaved changes. Close this view?')
  }) : undefined, [tabId, zh, workspace])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasDefinitionDrafts(workspace)) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [workspace])
  const [query, setQuery] = useState(''), [kind, setKind] = useState(''), [selected, setSelected] = useState<string | null>(() => { try { return objectId ?? localStorage.getItem(`research-content-selection:${workspace}`) } catch { return objectId ?? null } })
  useEffect(() => { if (objectId) { setSelected(objectId); setShowDetails(true); requestDesignFocus(project, [objectId]) } }, [objectId, project])
  useEffect(() => subscribeDesignFocus(focus => { if (focus.project === project && focus.cardIds[0]) { setSelected(focus.cardIds[0]); setShowDetails(true) } }), [project])
  useEffect(() => { try { if (selected) localStorage.setItem(`research-content-selection:${workspace}`, selected) } catch { /* Selection is optional. */ } }, [selected, workspace])
  const choose = (id: string) => { setSelected(id); setShowDetails(true); requestDesignFocus(project, [id]) }
  const switchView = (next: ContentView) => { if (selected) requestDesignFocus(project, [selected]); onViewChange?.(next) }
  const objects = state.value?.objects ?? []
  const visible = useMemo(() => objects.filter(o => (!kind || o.kind === kind) && `${o.title}\n${o.body ?? ''}\n${(o.tags ?? []).join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [objects, query, kind])
  const current = objects.find(o => o.id === selected)
  const editable = Boolean(state.digest) && !state.reviewLocked
  const edit = (id: string, update: (o: ContentObject) => ContentObject) => state.mutate(d => ({ ...d, objects: d.objects.map(o => o.id === id ? update(o) : o) }))
  const add = () => {
    const id = crypto.randomUUID()
    if (state.mutate(d => ({ ...d, objects: [...d.objects, { id, kind: 'question', title: zh ? '新问题' : 'New question', body: '', sources: [], status: 'open' }], views: { ...d.views, canvas: { ...d.views.canvas, placements: [...d.views.canvas.placements, { objectId: id, x: 48, y: 40 + d.objects.length * 160 }] } } }))) { setSelected(id); setShowDetails(true) }
  }
  return <section ref={pane} className="flex h-full min-h-0 min-w-0 flex-col" data-content-workbench={workspace}>
    <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1">
      <span className="mr-auto truncate text-secondary font-medium">{zh ? '研究内容' : 'Research content'}</span>
      {(['table', 'outline', 'canvas', 'revision'] as const).map(v => <Button key={v} size="xs" variant={v === view ? 'outline' : 'ghost'} aria-pressed={v === view} onClick={() => switchView(v)}>{zh ? { table: '问题表', outline: '大纲', canvas: '画布', revision: '修订' }[v] : v}</Button>)}
      {state.digest && <ContentHistory scope={{ projectId: project, workspace }} digest={state.digest}/>}
    </header>
    {state.value && <SyncStrip project={project} digest={state.digest ?? ''} dirty={state.dirty} status={state.status}/>}
    {state.recovered && <p role="status" className="border-b border-line px-3 py-2 text-caption text-ink-2">{zh ? '已恢复本地未保存内容，并核对保存版本。' : 'Recovered local unsaved content and checked its saved revision.'}</p>}
    {state.recoveryError && <p role="alert" className="border-b border-line px-3 py-2 text-caption">{state.recoveryError}</p>}
    {state.error && <div role="alert" className="border-b border-line p-3 text-secondary">{state.error}<div className="mt-2 flex gap-2"><Button size="xs" onClick={state.retry}>{zh ? '重试保存' : 'Retry save'}</Button>{state.dirty && <Button size="xs" onClick={() => { if (window.confirm(zh ? '放弃当前研究内容的未保存修改并重新读取？' : 'Discard unsaved research content and reload?')) state.reload(true) }}>{zh ? '放弃修改并重读' : 'Discard and reload'}</Button>}</div></div>}
    {state.value && !state.digest && <div className="border-b border-line bg-surface-2 p-4" data-content-migration>
      <p className="text-secondary">{state.migrationState === 'legacy' ? (zh ? '此项目已有画布或草稿。迁入研究内容后，问题表、大纲和画布将共同编辑这些内容，保留现有对象与来源。' : 'This project has a canvas or drafts. Migrate them to edit the same objects across the table, outline and canvas, preserving sources and identities.') : (zh ? '建立项目的研究内容，开始组织问题、主张和证据。' : 'Create this project’s research content to organize questions, claims and evidence.')}</p>
      <Button className="mt-3" size="sm" disabled={state.status === 'saving'} onClick={state.migrate}>{state.migrationState === 'legacy' ? (zh ? '迁入现有内容' : 'Migrate existing content') : (zh ? '建立研究内容' : 'Create research content')}</Button>
    </div>}
    {state.migrationState === 'legacy-changed' && <p role="status" className="border-b border-line px-3 py-2 text-caption text-ink-2">{zh ? '历史画布或草稿在迁移后发生变化，当前显示研究内容的已保存版本；请核对历史改动。' : 'A historical source changed after migration. This is the saved research content; inspect the historical changes.'}</p>}
    {!state.value ? <p className="p-5 text-secondary text-ink-3">{zh ? '正在读取研究内容…' : 'Loading research content…'}</p> : view === 'revision' ? <div className="min-h-0 flex-1"><RevisionBoard project={project} workspace={workspace} document={state.value} digest={state.digest ?? ''} dirty={state.dirty} editable={editable} onView={switchView}/></div> : view !== 'table' ? <div className="min-h-0 flex-1" inert={!editable || undefined}><ThinkingCanvas project={project} workspace={workspace} active={active} onRequestConversation={onRequestConversation} view={view} onViewChange={onViewChange} locked={!editable}/></div> : <div className="flex min-h-0 flex-1">
      {(!narrow || !current || !showDetails) && <div className="flex min-w-0 flex-1 flex-col" data-content-list>
        <div className="flex items-center gap-2 border-b border-line p-2"><Search className="h-4 w-4 shrink-0 text-ink-3"/><div className="min-w-0 flex-1"><Input aria-label={zh ? '查找研究内容' : 'Find research content'} value={query} onChange={e => setQuery(e.target.value)} placeholder={zh ? '标题、内容或标签' : 'Title, content or tag'}/></div><div className="w-40 max-w-[40%] shrink-0"><Select aria-label={zh ? '内容类型' : 'Content kind'} value={kind} onChange={e => setKind(e.target.value)}><option value="">{zh ? '全部类型' : 'All kinds'}</option>{CONTENT_KINDS.map(k => <option key={k} value={k}>{zh ? kindLabels[k] : k}</option>)}</Select></div><Button size="xs" icon={Plus} disabled={!editable} onClick={add}>{zh ? '新增' : 'Add'}</Button></div>
        <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[560px] text-left text-secondary"><thead className="sticky top-0 bg-surface-1 text-caption text-ink-3"><tr>{(zh ? ['研究内容', '类型', '标签', '状态', '关联'] : ['Content', 'Kind', 'Tags', 'Status', 'Links']).map(t => <th key={t} className="whitespace-nowrap border-b border-line p-2 font-medium">{t}</th>)}</tr></thead><tbody>{visible.map(o => <tr key={o.id} className={selected === o.id ? 'bg-hover' : ''} data-content-object={o.id}><td className="border-b border-line p-2"><button className="text-left hover:underline" onClick={() => choose(o.id)}>{o.title || o.id}</button></td><td className="whitespace-nowrap border-b border-line p-2">{zh ? kindLabels[o.kind] : o.kind}</td><td className="max-w-40 truncate border-b border-line p-2 text-caption text-ink-3" title={o.tags?.join(' · ')}>{o.tags?.join(' · ')}</td><td className="whitespace-nowrap border-b border-line p-2 text-caption">{o.status || '—'}</td><td className="border-b border-line p-2">{state.value!.relations.filter(r => r.from.id === o.id || r.to.id === o.id).length}</td></tr>)}</tbody></table>{visible.length === 0 && <p className="p-4 text-secondary text-ink-3">{zh ? '没有匹配的内容。' : 'No matching content.'}</p>}</div>
      </div>}
      {current && (!narrow || showDetails) && <aside className={`flex min-w-0 flex-col gap-3 overflow-auto border-line p-3 ${narrow ? 'w-full flex-1' : 'w-[340px] shrink-0 border-l'}`} data-content-details>
        {narrow && <div><Button size="xs" variant="ghost" icon={ArrowLeft} onClick={() => setShowDetails(false)}>{zh ? '返回问题表' : 'Back to content table'}</Button></div>}
        <Input aria-label={zh ? '标题' : 'Title'} className="ui-input font-medium" value={current.title} disabled={!editable} onChange={e => edit(current.id, o => ({ ...o, title: e.target.value }))}/>
        <Select aria-label={zh ? '对象类型' : 'Object kind'} className="ui-input" value={current.kind} disabled={!editable} onChange={e => edit(current.id, o => ({ ...o, kind: e.target.value as ContentKind }))}>{CONTENT_KINDS.map(k => <option key={k} value={k}>{zh ? kindLabels[k] : k}</option>)}</Select>
        <Textarea aria-label={zh ? '研究记录' : 'Research note'} className="ui-input min-h-52 resize-y text-secondary" value={current.body ?? ''} disabled={!editable} onChange={e => edit(current.id, o => ({ ...o, body: e.target.value }))}/>
        <label className="text-caption text-ink-3">{zh ? '状态' : 'Status'}<Input className="ui-input mt-1 w-full" value={current.status ?? ''} disabled={!editable} onChange={e => edit(current.id, o => ({ ...o, status: e.target.value }))}/></label>
        <label className="text-caption text-ink-3">{zh ? '标签（逗号分隔）' : 'Tags (comma separated)'}<Input className="ui-input mt-1 w-full" value={(current.tags ?? []).join(', ')} disabled={!editable} onChange={e => edit(current.id, o => ({ ...o, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}/></label>
        <p className="text-caption font-medium text-ink-3">{zh ? '来源' : 'Sources'}</p>
        {current.sources.map((source, i) => <SourceReferenceLink key={i} source={source} scope={{ projectId: project, workspace }}/>) }
        {(['method', 'workflow', 'tool'] as const).some(kind => kind === current.kind) && <DefinitionEditor object={current} disabled={!editable} locale={locale} scope={{projectId:project,workspace}} onDirtyChange={setDefinitionDirty} onChange={definition => edit(current.id, o => ({ ...o, definition }))}/>}
        <p className="text-caption font-medium text-ink-3">{zh ? '相关内容' : 'Related content'}</p>
        {state.value.relations.filter(r => r.from.id === current.id || r.to.id === current.id).map(r => { const other = r.from.id === current.id ? r.to : r.from; const object = objects.find(o => o.id === other.id); return <button key={r.id} className="text-left text-caption text-ink-2 hover:underline" onClick={() => object && choose(object.id)}>{r.relation} · {object?.title ?? other.path ?? other.id}</button> })}
      </aside>}
    </div>}
  </section>
}
