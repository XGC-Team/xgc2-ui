import { FeedbackButton } from '../review/FeedbackButton'
import { IntakePanel } from './IntakePanel'
import { SourcePicker } from './SourcePicker'
import { openResearchSource } from './research-navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, RotateCw, Trash2 } from 'lucide-react'
import { Button, IconBtn, RightMore } from '../../components/ui'
import { saveDownload } from '../../lib/api'
import { useWorkbench } from '../../store'
import { useDraftBook } from './useDraftBook'
import { draftCopy } from './draft-copy'
import { newContextItem } from './context-model'
import {
  DRAFTS_PATH, DRAFT_KINDS, DRAFT_FIELDS, addSource, appendDraft, changeDraft, draftContext,
  editBlock, moveBlock, newBlock, newDraft, validSourcePath,
  archiveDraft, captureIntoBook, draftScopeKey, linkSource, linkProjectObject, archiveProjectObject, researchStructure,
  type DraftKind, type DraftScope, type ResearchDraft,
} from './draft-model'

/** One stable project file per tab. Draft editing never invokes an Agent, build or executor. */
export function DraftsPage({ scope, tabId, onQuote, onTitle }: {
  scope: DraftScope; tabId: string
  onQuote: (text: string, targetProject?: string) => void
  onTitle: (title: string) => void
}) {
  const { locale, setProjectId, setActiveNav, closeSourceView, draftIntents, consumeDraftIntent, draftSelection, requestCanvasReference, openCanvas, addContextItem } = useWorkbench()
  const reviewFocus=useWorkbench(s=>s.reviewFocus)
  const root=useRef<HTMLElement>(null)
  const copy = draftCopy[locale]
  const [selected, setSelected] = useState(''), [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<DraftKind>('paper'), [name, setName] = useState('')
  const [sourcePath, setSourcePath] = useState(''), [sourceError, setSourceError] = useState('')
  const state = useDraftBook(scope, tabId, locale, creating && Boolean(name.trim()))
  const [archived, setArchived] = useState(false), [view, setView] = useState<'list' | 'cards'>('list')
  const [filter, setFilter] = useState<DraftKind | ''>('')
  const [missing, setMissing] = useState('')
  const zh = locale === 'zh'
  useEffect(() => {
    if (!state.value || state.reviewLocked) return
    for (const intent of draftIntents) {
      if (draftScopeKey(intent.scope) !== draftScopeKey(scope) || !useWorkbench.getState().draftIntents.some(item => item.id === intent.id)) continue
      if (!state.mutate(book => captureIntoBook(book, intent))) continue
      consumeDraftIntent(intent.id); setSelected(intent.id); setCreating(false); setArchived(false); setFilter(intent.kind)
    }
  }, [draftIntents, state.value, state.reviewLocked, state.mutate, scope.projectId, scope.workspace, consumeDraftIntent])
  useEffect(() => {
    if (draftSelection && draftScopeKey(draftSelection.scope) === draftScopeKey(scope)) {
      setSelected(draftSelection.id); setCreating(false); setMissing(''); if (!draftSelection.id) setFilter(draftSelection.kind || '')
    }
  }, [draftSelection, scope.projectId, scope.workspace])
  useEffect(() => { setMissing(state.value && selected && !state.value.drafts.some(item => item.id === selected) ? (zh ? '原对象未找到。引用没有被替换成其他对象。' : 'The referenced object was not found. It has not been substituted.') : '') }, [state.value, selected, zh])
  const current = state.value?.drafts.find(draft => draft.id === selected)
  useEffect(()=>{
    const focus=reviewFocus,target=focus?.anchor.target
    if(!focus||!target||target.kind!=='block'||draftScopeKey(focus.scope)!==draftScopeKey(scope)||target.objectId!==current?.id||state.reviewLocked)return
    const b=current.blocks.find(b=>b.id===target.blockId),value=target.field==='title'?b?.title:b?.fields[target.field]
    if(value!==focus.anchor.quote){setMissing(zh?'当前字段与被核对内容不一致，未自动定位。':'Current field does not match the verified content; it was not highlighted.');return}
    const block=root.current?.querySelector<HTMLElement>(`[data-draft-block="${CSS.escape(target.blockId)}"]`)
    block?.scrollIntoView({block:'center'});block?.querySelector<HTMLElement>(`#${CSS.escape(`${tabId}-${target.blockId}-${target.field}`)}`)?.focus({preventScroll:true})
  },[reviewFocus,current,state.reviewLocked,scope.projectId,scope.workspace,tabId,zh])
  const titleRef = useRef(onTitle); titleRef.current = onTitle
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => { titleRef.current(current ? current.title || copy.untitled : copy.title) }, [current?.title, current?.id, copy])
  useEffect(() => { setSourcePath(''); setSourceError('') }, [selected])
  useEffect(() => { if (creating) nameInput.current?.focus() }, [creating])
  const update = (change: (draft: ResearchDraft) => ResearchDraft) => {
    if (current) state.mutate(book => changeDraft(book, current.id, change))
  }
  const returnToProject = () => { setProjectId(scope.projectId); setActiveNav('chat'); closeSourceView() }
  const failed = state.status === 'save-error' || state.status === 'conflict'
  const statusText = state.status === 'saved' ? copy.saved : state.status === 'saving' ? copy.saving : state.status === 'new' ? copy.fresh : copy.unsaved
  const exportLocal = () => { if (state.value) saveDownload(`research-drafts-${scope.projectId}.local.json`, state.value) }
  const reload = () => {
    if (!state.dirty || window.confirm(copy.discardConfirm)) state.reload(state.dirty)
  }

  return <section ref={root} className="flex h-full min-h-0 flex-col" aria-label={copy.title} data-draft-project={scope.projectId} data-draft-state={state.status}>
    <div className="flex h-9 shrink-0 items-center gap-1 px-2">
      {(current || creating) && <IconBtn icon={ArrowLeft} label={copy.list} onClick={() => { setSelected(''); setCreating(false) }}/>} 
      <span className="min-w-0 flex-1 truncate text-caption text-ink-2">{current?.title || copy.title}</span>
      <IconBtn icon={RotateCw} label={copy.reload} disabled={state.status === 'loading' || state.status === 'saving'} onClick={reload}/>
      {state.value && <Button size="xs" disabled={!state.dirty || state.status === 'conflict'} loading={state.status === 'saving'} onClick={state.save}>{copy.save}</Button>}
      {state.value && <RightMore label={copy.title}>
        <Button onClick={exportLocal}>{copy.export}</Button>
        {current && <Button onClick={() => onQuote(draftContext(state.value!, current), scope.projectId)}>{copy.quote}</Button>}
      </RightMore>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <button type="button" className="text-caption text-ink-2 hover:underline" aria-label={`${copy.back} · ${scope.projectId}`} onClick={returnToProject}>{scope.projectId}</button>
      <p className="mt-1 break-all text-caption text-ink-3">{copy.storage} · {scope.workspace}/{DRAFTS_PATH}</p>
      <p className="mt-2 text-caption text-ink-3">{copy.boundary}</p>
      {!state.value ? <div className="mt-4">
        <p role={state.status === 'loading' ? 'status' : 'alert'} className="text-secondary text-ink-2">{state.status === 'loading' ? copy.loading : state.status === 'invalid' ? copy.invalid : copy.loadError}</p>
        {state.error && <p className="mt-2 break-words text-caption text-ink-3">{state.error}</p>}
      </div> : <>
        <p role="status" className="my-3 text-caption text-ink-3">{copy.draft} · {statusText}</p>
        {failed && <div className="mb-4 space-y-2">
          <p role="alert" className="text-secondary text-ink-2">{state.status === 'conflict' ? copy.conflict : copy.saveError}</p>
          <p className="break-words text-caption text-ink-3">{state.error}</p>
          <div className="flex flex-wrap gap-1">
            {state.status === 'save-error' && <Button size="xs" onClick={state.save}>{copy.retry}</Button>}
            <Button size="xs" onClick={exportLocal}>{copy.export}</Button>
            <Button size="xs" onClick={() => { if (window.confirm(copy.discardConfirm)) state.reload(true) }}>{copy.discard}</Button>
          </div>
        </div>}
        {missing && <p role="alert" className="mb-3 text-secondary">{missing}</p>}
        {!current ? <>
          <IntakePanel scope={scope}/>
          <div className="my-3 flex flex-wrap gap-1">
            <Button size="xs" aria-pressed={!archived} onClick={() => setArchived(false)}>{zh ? '当前对象' : 'Active objects'}</Button>
            <Button size="xs" aria-pressed={archived} onClick={() => setArchived(true)}>{zh ? '归档与恢复' : 'Archive and restore'}</Button>
            <Button size="xs" onClick={() => state.mutate(book => linkProjectObject(book, 'canvas'))}>{zh ? '关联现有画布' : 'Link existing canvas'}</Button>
            <Button size="xs" onClick={() => state.mutate(book => linkProjectObject(book, 'workflow'))}>{zh ? '关联现有工作流' : 'Link existing workflow'}</Button>
          </div>
          <label className="my-2 block text-secondary">{zh ? '对象类型' : 'Object type'}<select className="ui-input ml-2" value={filter} onChange={event => setFilter(event.target.value as DraftKind | '')}><option value="">{zh ? '全部' : 'All'}</option>{DRAFT_KINDS.map(value => <option key={value} value={value}>{copy.kinds[value]}</option>)}</select></label>
          {(state.value.links || []).filter(link => Boolean(link.archivedAt) === archived).map(link => <div key={link.id} className="flex items-center gap-1">
            <Button onClick={() => { setProjectId(scope.projectId); closeSourceView(); if (link.kind === 'canvas') openCanvas(scope.projectId); else setActiveNav('workflow') }}>{link.kind === 'canvas' ? zh ? '研究画布' : 'Research canvas' : zh ? '既有项目工作流' : 'Existing project workflow'}</Button>
            <Button size="xs" onClick={() => state.mutate(book => archiveProjectObject(book, link.id, !archived))}>{archived ? zh ? '恢复引用' : 'Restore reference' : zh ? '归档引用' : 'Archive reference'}</Button>
          </div>)}
          {archived && <p className="my-2 text-caption text-ink-3">{zh ? '归档只整理项目引用或草稿，不删除原始文件，也不停止既有工作流。' : 'Archiving organizes references and drafts. It neither deletes original files nor stops existing workflows.'}</p>}
          {!creating ? <Button icon={Plus} variant="outline" onClick={() => setCreating(true)}>{copy.create}</Button> : <form className="mb-4 space-y-3" onSubmit={event => {
            event.preventDefault()
            if (!name.trim()) return
            const draft = newDraft(kind, name)
            state.mutate(book => appendDraft(book, draft)); setSelected(draft.id); setFilter(draft.kind); setArchived(false); setName(''); setCreating(false)
          }}>
            <label className="block text-secondary text-ink-2">{copy.kind}<select className="ui-input mt-1 w-full" value={kind} onChange={event => setKind(event.target.value as DraftKind)}>
              {DRAFT_KINDS.map(value => <option key={value} value={value}>{copy.kinds[value]}</option>)}
            </select></label>
            <label className="block text-secondary text-ink-2">{copy.name}<input ref={nameInput} required maxLength={200} className="ui-input mt-1 w-full" value={name} onChange={event => setName(event.target.value)}/></label>
            <div className="flex gap-1"><Button type="submit" variant="solid" disabled={!name.trim()}>{copy.create}</Button><Button onClick={() => setCreating(false)}>{copy.cancel}</Button></div>
          </form>}
          <div className="mt-3 space-y-1">
            {state.value.drafts.filter(draft => Boolean(draft.archivedAt) === archived && (!filter || draft.kind === filter)).map(draft => <button key={draft.id} type="button" className="ui-list-row flex-col items-start" data-draft-id={draft.id} onClick={() => { setSelected(draft.id); setCreating(false) }}>
              <span className="w-full truncate text-secondary text-ink-2">{draft.title || copy.untitled}</span>
              <span className="text-caption text-ink-3">{copy.kinds[draft.kind]}</span>
            </button>)}
            {!state.value.drafts.some(draft => Boolean(draft.archivedAt) === archived && (!filter || draft.kind === filter)) && <p className="py-4 text-secondary text-ink-3">{copy.empty}</p>}
          </div>
        </> : <div className="space-y-5" data-editing-draft={current.id}>
          <div className="flex flex-wrap gap-1">
            <Button onClick={() => state.mutate(book => archiveDraft(book, current.id, !current.archivedAt))}>{current.archivedAt ? zh ? '恢复对象' : 'Restore object' : zh ? '归档对象' : 'Archive object'}</Button>
            <Button disabled={state.status !== 'saved' || Boolean(current.archivedAt) || scope.projectId !== scope.workspace} onClick={() => {
              if (window.confirm(zh ? '向所属项目画布添加此对象的引用？只保存引用，不复制正文。可在画布删除此引用回退。' : 'Add a reference to this object in the owning project canvas? No body is copied. Remove the reference in the canvas to undo.')) requestCanvasReference(scope.projectId, current.id, current.title)
            }}>{zh ? '关联到研究画布' : 'Reference in research canvas'}</Button>
            <Button aria-pressed={view === 'list'} onClick={() => setView('list')}>{zh ? '线性结构' : 'Linear structure'}</Button>
            <Button aria-pressed={view === 'cards'} onClick={() => setView('cards')}>{zh ? '研究卡片' : 'Research cards'}</Button>
            <Button onClick={() => addContextItem(newContextItem({ project: scope.projectId, kind: 'draft', label: current.title || copy.untitled,
              ref: `${DRAFTS_PATH}#${current.id}`, source: { id: `ctx-${current.id}`, workspace: scope.workspace, path: DRAFTS_PATH } }))}>{copy.addToContext}</Button>
          </div>
          {current.archivedAt && <p role="status">{zh ? '已归档；恢复后继续编辑。来源原件未删除。' : 'Archived. Restore to edit. Original sources are unchanged.'}</p>}
          <fieldset disabled={Boolean(current.archivedAt)} className="min-w-0 space-y-5">
          {current.kind === 'paper' && <div className="space-y-2">
            {(['goal', 'template', 'citationRequirements'] as const).map(key => <label key={key} className="block text-secondary">{({goal: zh ? '研究目标' : 'Research goal', template: zh ? '模板要求' : 'Template requirements', citationRequirements: zh ? '引用要求' : 'Citation requirements'})[key]}<textarea className="ui-input mt-1 w-full" value={current.settings?.[key] || ''} onChange={event => update(draft => ({ ...draft, settings: { ...draft.settings, [key]: event.target.value } }))}/></label>)}
          </div>}

          <label className="block text-secondary text-ink-2">{copy.name}<input maxLength={200} className="ui-input mt-1 w-full" value={current.title} onChange={event => update(draft => ({ ...draft, title: event.target.value }))}/></label>
          <p className="text-caption text-ink-3">{copy.kinds[current.kind]} · {current.id}</p>
          <div className={view === 'cards' ? 'grid gap-3' : 'space-y-3'} style={view === 'cards' ? {gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))'} : undefined} data-research-view={view}>
          {researchStructure(current).map((block, index) => <article key={block.id} data-draft-block={block.id} className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center gap-1">
              <h3 className="min-w-0 flex-1 text-secondary text-ink-2">{copy.blocks[current.kind]} {index + 1}</h3>
              <IconBtn icon={ArrowUp} label={`${copy.up} ${index + 1}`} disabled={index === 0} onClick={() => update(draft => moveBlock(draft, block.id, -1))}/>
              <IconBtn icon={ArrowDown} label={`${copy.down} ${index + 1}`} disabled={index === current.blocks.length - 1} onClick={() => update(draft => moveBlock(draft, block.id, 1))}/>
              <IconBtn icon={Trash2} label={`${copy.remove} ${copy.blocks[current.kind]} ${index + 1}`} onClick={() => { if (window.confirm(copy.removeConfirm)) update(draft => ({ ...draft, blocks: draft.blocks.filter(item => item.id !== block.id) })) }}/>
            </div>
            {current.kind === 'paper' && <label className="block text-caption">{zh ? '结构层次' : 'Writing block role'}<select className="ui-input ml-2" value={block.role || 'section'} onChange={event => update(draft => ({ ...draft, blocks: draft.blocks.map(item => item.id === block.id ? { ...item, role: event.target.value as 'section' | 'paragraph' } : item) }))}><option value="section">{zh ? '章节' : 'Section'}</option><option value="paragraph">{zh ? '段落意图' : 'Paragraph intent'}</option></select></label>}
            <label className="block text-secondary text-ink-2">{copy.blockTitle}<input className="ui-input mt-1 w-full" value={block.title} onChange={event => update(draft => editBlock(draft, block.id, 'title', event.target.value))}/></label>
            {DRAFT_FIELDS[current.kind].map(field => <div key={field} className="block text-secondary text-ink-2"><label htmlFor={`${tabId}-${block.id}-${field}`}>{copy.fields[field]}</label>
              <FeedbackButton scope={scope} disabled={state.dirty || state.status !== 'saved'} displayed={block.fields[field] || ''} target={{kind:'block',workspace:scope.workspace,path:DRAFTS_PATH,objectId:current.id,blockId:block.id,field,artifact:current.kind}}/>
              <textarea id={`${tabId}-${block.id}-${field}`} rows={3} className="ui-input mt-1 w-full resize-y" value={block.fields[field] || ''} onChange={event => update(draft => editBlock(draft, block.id, field, event.target.value))}/>
            </div>)}
            {current.sources.length > 0 && <fieldset className="space-y-1"><legend className="text-caption">{zh ? '此条目的证据与媒体' : 'Evidence and media for this item'}</legend>
              {current.sources.map(source => <label key={source.id} className="flex gap-1 text-caption"><input type="checkbox" checked={block.sourceIds?.includes(source.id) || false} onChange={event => update(draft => ({ ...draft, blocks: draft.blocks.map(item => item.id !== block.id ? item : { ...item, sourceIds: event.target.checked ? [...new Set([...(item.sourceIds || []), source.id])] : item.sourceIds?.filter(id => id !== source.id) }) }))}/><span className="truncate">{source.excerpt?.slice(0, 60) || source.path || source.url}</span></label>)}
            </fieldset>}
          </article>)}
          </div>
          <Button icon={Plus} variant="outline" onClick={() => update(draft => ({ ...draft, blocks: [...draft.blocks, newBlock(draft.kind)] }))}>{copy.addBlock} {copy.blocks[current.kind]}</Button>
          <div className="space-y-2">
            <h3 className="text-secondary text-ink-2">{copy.sources}</h3>
            <p className="text-caption text-ink-3">{zh ? '来源保留工作区、记录时版本和摘录。打开时若版本变化会提示；不静默更新旧引用。' : 'Sources retain workspace, observed revision and excerpt. Changed versions are disclosed, not silently repinned.'}</p>
            <SourcePicker book={state.value} locale={locale} onChoose={source => update(draft => linkSource(draft, source, scope.workspace))}/>

            {current.sources.map(source => <div key={source.id} className="space-y-1 rounded-md bg-elevated p-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-secondary text-ink-2 hover:underline" title={`${source.workspace || scope.workspace}/${source.path}`} onClick={() => openResearchSource(source, scope)}>{source.path || source.url}</button>
              <p className="break-all text-caption text-ink-3">{source.workspace || scope.workspace} · {source.digest || (zh ? '未固定版本：打开当前原件' : 'Unpinned: opens current original')}{source.page ? ` · ${source.page}` : ''}</p>
              {source.excerpt && <blockquote className="whitespace-pre-wrap text-secondary">{source.excerpt}</blockquote>}
              <Button size="xs" onClick={() => addContextItem(newContextItem({ project: scope.projectId, kind: 'source', label: source.excerpt?.slice(0, 60) || source.path || source.url || source.id,
                ref: source.path || source.url || source.id, source, digest: source.digest, excerpt: source.excerpt }))}>{copy.sourceToContext}</Button>
              <IconBtn icon={Trash2} label={`${copy.remove} ${source.path}`} onClick={() => update(draft => ({ ...draft, sources: draft.sources.filter(item => item.id !== source.id), blocks: draft.blocks.map(block => ({ ...block, sourceIds: block.sourceIds?.filter(id => id !== source.id) })) }))}/>
            </div>)}
            <form className="space-y-2" onSubmit={event => {
              event.preventDefault()
              if (!validSourcePath(sourcePath)) { setSourceError(copy.sourceInvalid); return }
              update(draft => addSource(draft, sourcePath)); setSourcePath(''); setSourceError('')
            }}>
              <label className="block text-secondary text-ink-2">{copy.sourcePath}<input className="ui-input mt-1 w-full" value={sourcePath} onChange={event => setSourcePath(event.target.value)}/></label>
              <Button type="submit" disabled={!sourcePath.trim()}>{copy.addSource}</Button>
              {sourceError && <p role="alert" className="text-caption text-ink-3">{sourceError}</p>}
            </form>
          </div>
          {current.kind === 'note' && <section className="space-y-2">
            <h3 className="text-secondary">{zh ? '知识沉淀建议' : 'Knowledge promotion suggestion'}</h3>
            <p className="text-caption text-ink-3">{zh ? '只记录待审查建议；不会写入全局知识库，也不把推断标为已验证。' : 'Records a suggestion for review; does not write global knowledge or mark interpretations verified.'}</p>
            <textarea aria-label={zh ? '沉淀理由与待核验项' : 'Promotion rationale and checks'} className="ui-input w-full" value={current.knowledgeSuggestion?.rationale || ''} onChange={event => update(draft => ({ ...draft, knowledgeSuggestion: { status: draft.knowledgeSuggestion?.status || 'dismissed', rationale: event.target.value } }))}/>
            <Button disabled={!current.knowledgeSuggestion?.rationale.trim()} onClick={() => update(draft => ({ ...draft, knowledgeSuggestion: { status: draft.knowledgeSuggestion?.status === 'suggested' ? 'dismissed' : 'suggested', rationale: draft.knowledgeSuggestion?.rationale || '' } }))}>{current.knowledgeSuggestion?.status === 'suggested' ? zh ? '撤回建议' : 'Withdraw suggestion' : zh ? '提交沉淀建议草稿' : 'Propose knowledge promotion'}</Button>
            {current.knowledgeSuggestion?.status === 'suggested' && <p role="status">{zh ? '待人工审查；以本页保存状态为准。' : 'Pending human review; check this page’s save state.'}</p>}
          </section>}
          </fieldset>
        </div>}
      </>}
    </div>
  </section>
}
