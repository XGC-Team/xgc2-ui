import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileText, Network, Plus, Presentation, X } from 'lucide-react'
import { Button, Popover, RightMore } from '../../components/ui'
import { useWorkbench } from '../../store'
import { cn } from '../../lib/cn'
import { useNativeAgentSession } from './Session'
import { CONTENT_PATH, cardType, CARD_TYPE_LABELS, type ContentDocument } from '../content/content-model'
import { sharedContentSession } from '../content/useContentDocument'
import { checkContextForSend, contextManifest, newContextItem, type ContextItem } from '../projects/context-model'
import { ContextPanel } from '../projects/ContextPanel'
import { useAcademicNotes } from '../resources/useAcademicNotes'
import { patchContract } from '../revision/revision-model'
import { sessionProject } from '../revision/useRevisionThread'

/* Chat 是控制面：研究对象以「版本化引用」挂到输入框上方（T3/Cursor 的附件语法），
   加入 ≠ 发送；插入草稿与请求画布提议是显式动作。版本细节收进「管理引用」。 */
const ICON = { 'canvas-node': Network, draft: Presentation, source: FileText } as const

type Candidate = { key: string; group: 'cards' | 'notes' | 'artifacts'; label: string; hint: string; item: () => ContextItem }

function useCandidates(project: string, query: string) {
  const { locale, resourceLayout, knowledgeDocuments } = useWorkbench()
  const [document, setDocument] = useState<{ value: ContentDocument; digest: string } | null>(null)
  useEffect(() => {
    if (!project) return
    let live = true
    try {
      const session = sharedContentSession({ projectId: project, workspace: project })
      const read = () => { const s = session.snapshot(); if (live && s.value) setDocument({ value: s.value, digest: s.digest ?? '' }) }
      if (session.snapshot().status === 'loading') void session.load().then(read).catch(() => {}); else read()
    } catch { /* The workspace is bound to another project; cards are simply not offered. */ }
    return () => { live = false }
  }, [project])
  return useMemo(() => {
    const out: Candidate[] = []
    const digest = document?.digest || undefined
    for (const object of document?.value.objects ?? []) out.push({
      key: `card:${object.id}`, group: 'cards', label: object.title || object.id, hint: CARD_TYPE_LABELS[locale][cardType(object)],
      item: () => newContextItem({ project, kind: 'canvas-node', label: object.title, ref: `${CONTENT_PATH}#object/${object.id}`, digest, excerpt: object.body?.slice(0, 200), source: { id: object.id, path: CONTENT_PATH, workspace: project, digest, excerpt: object.body?.slice(0, 200) } }),
    })
    for (const draft of document?.value.artifacts ?? []) if (!draft.archivedAt) out.push({
      key: `draft:${draft.id}`, group: 'artifacts', label: draft.title || draft.id, hint: draft.kind,
      item: () => newContextItem({ project, kind: 'draft', label: draft.title, ref: `${CONTENT_PATH}#artifact/${draft.id}`, digest, source: { id: draft.id, path: CONTENT_PATH, workspace: project, digest } }),
    })
    for (const tab of resourceLayout.tabs) if (tab.projectId === project && (tab.kind === 'pdf' || tab.kind === 'original')) {
      const pdf = tab.kind === 'pdf' ? { workspace: tab.pdf.workspace, path: tab.pdf.path, digest: tab.pdf.digest } : { workspace: tab.workspace, path: tab.path, digest: tab.digest }
      out.push({ key: `pdf:${pdf.workspace}:${pdf.path}`, group: 'artifacts', label: pdf.path.split('/').pop() || pdf.path, hint: 'PDF', item: () => newContextItem({ project, kind: 'source', label: pdf.path.split('/').pop() || pdf.path, ref: `${pdf.workspace}/${pdf.path}`, digest: pdf.digest, source: { id: pdf.path, path: pdf.path, workspace: pdf.workspace, digest: pdf.digest } }) })
    }
    // Notes from the list carry no observed revision here, so they are attached as unverifiable — never invented.
    for (const note of knowledgeDocuments) out.push({ key: `note:${note.path}`, group: 'notes', label: note.title, hint: note.path, item: () => newContextItem({ project, kind: 'source', label: note.title, ref: `academic/${note.path}`, source: { id: note.path, path: note.path, workspace: 'academic' } }) })
    const q = query.trim().toLowerCase()
    return q ? out.filter(c => `${c.label} ${c.hint}`.toLowerCase().includes(q)) : out
  }, [document, resourceLayout.tabs, knowledgeDocuments, project, query, locale])
}

function AttachList({ project, onPick }: { project: string; onPick: (candidate: Candidate) => void }) {
  const { locale, contextItems } = useWorkbench()
  useAcademicNotes() // mounted only while the menu is open: loads knowledge notes on demand
  const zh = locale === 'zh'
  const [query, setQuery] = useState('')
  const candidates = useCandidates(project, query)
  const attached = new Set(contextItems.filter(i => i.project === project).map(i => i.ref))
  const groups = [['cards', zh ? '画布卡片' : 'Canvas cards', Network], ['notes', zh ? '知识笔记' : 'Knowledge notes', BookOpen], ['artifacts', zh ? '制品与 PDF' : 'Artifacts & PDFs', Presentation]] as const
  return <>
    <input autoFocus aria-label={zh ? '查找可附加的对象' : 'Find an object to attach'} placeholder={zh ? '查找卡片、笔记、制品…' : 'Find cards, notes, artifacts…'} className="ui-input h-7 shrink-0" value={query} onChange={e => setQuery(e.target.value)}/>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map(([group, title, Icon]) => {
        const list = candidates.filter(c => c.group === group).slice(0, 30)
        if (!list.length) return null
        return <section key={group} className="py-1">
          <p className="px-1.5 pb-0.5 text-caption text-ink-3">{title}</p>
          {list.map(c => { const done = attached.has(c.item().ref); return <button key={c.key} type="button" disabled={done} onClick={() => onPick(c)}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-secondary text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50">
            <Icon size={12} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="min-w-0 flex-1 truncate">{c.label}</span><span className="max-w-24 shrink-0 truncate text-caption text-ink-3">{done ? (zh ? '已附加' : 'attached') : c.hint}</span>
          </button> })}
        </section>
      })}
      {!candidates.length && <p className="px-1.5 py-3 text-caption text-ink-3">{zh ? '没有可附加的对象。' : 'Nothing to attach.'}</p>}
    </div>
  </>
}

export function ContextTray({ blockedReason }: { blockedReason?: string }) {
  const { locale, projectId, contextItems, addContextItem, removeContextItem, openSettings } = useWorkbench()
  const native = useNativeAgentSession()
  const zh = locale === 'zh'
  const [manage, setManage] = useState(false), [note, setNote] = useState('')
  const project = sessionProject(native.session) || projectId
  const items = contextItems.filter(item => item.project === project)
  const stale = (item: ContextItem) => item.state !== 'current'
  const insert = (withContract: boolean) => {
    const { include, issues } = checkContextForSend(items, project)
    if (!include.length) return
    native.appendDraft(contextManifest(include, project) + (withContract ? `\n${zh ? '请基于以上上下文，对研究画布提出修改建议。' : 'Based on this context, propose research canvas changes.'}\n${patchContract(locale)}\n` : ''))
    setNote(issues.length ? (zh ? `已插入草稿；${issues.length} 项需核对版本（见「管理引用」）。` : `Inserted into the draft; ${issues.length} item(s) need a version check (see Manage).`) : '')
  }
  return <div className="flex flex-col gap-1" data-xgc-role="context-tray" data-xgc-id={project || 'global'}>
    {manage && items.length > 0 && <div className="max-h-64 overflow-y-auto"><ContextPanel open/></div>}
    <div className="flex min-h-7 flex-wrap items-center gap-1">
      {items.map(item => { const Icon = ICON[item.kind]; return <span key={item.id} data-context-chip={item.id} data-context-state={item.state}
        className={cn('group flex h-6 max-w-52 items-center gap-1 rounded-md border border-line bg-panel pl-1.5 pr-0.5 text-caption text-ink-2', stale(item) && 'border-dashed')}
        title={`${item.ref}${item.digest ? ` @ ${item.digest}` : ''}${stale(item) ? ` · ${zh ? '版本需核对' : 'version needs a check'}` : ''}`}>
        <Icon size={11} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="min-w-0 truncate">{item.label}</span>
        <button type="button" aria-label={`${zh ? '移除' : 'Remove'} ${item.label}`} className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-3 hover:bg-hover hover:text-ink" onClick={() => removeContextItem(item.id)}><X size={10}/></button>
      </span> })}
      {project ? <Popover label={zh ? '附加上下文' : 'Attach context'} side="top" align="left" width="w-80" trigger={({ open, toggle }) =>
        <button type="button" aria-expanded={open} onClick={toggle} data-xgc-role="attach-context" className="flex h-6 items-center gap-1 rounded-md px-1.5 text-caption text-ink-3 transition-colors hover:bg-hover hover:text-ink"><Plus size={12} strokeWidth={1.75}/>{items.length ? '' : (zh ? '附加卡片、笔记或 PDF' : 'Attach a card, note or PDF')}</button>}>
        {close => <AttachList project={project} onPick={c => { addContextItem(c.item()); close() }}/>}
      </Popover> : <span className="px-1.5 text-caption text-ink-3">{zh ? '选择项目后可附加研究对象' : 'Select a project to attach research objects'}</span>}
      {items.length > 0 && <RightMore label={zh ? '上下文操作' : 'Context actions'}>
        <Button size="xs" onClick={() => insert(false)}>{zh ? '插入引用清单到草稿' : 'Insert references into draft'}</Button>
        <Button size="xs" onClick={() => insert(true)}>{zh ? '请 Agent 提议画布修改' : 'Ask agent for canvas changes'}</Button>
        <Button size="xs" onClick={() => setManage(v => !v)}>{manage ? (zh ? '收起版本管理' : 'Hide version details') : (zh ? '管理引用与版本…' : 'Manage references…')}</Button>
      </RightMore>}
      {/* 环境闸门只占一行安静状态，不再是正文里的警告卡片 */}
      {blockedReason && <button type="button" onClick={() => openSettings('connections')} className="ml-auto truncate px-1 text-caption text-ink-3 hover:text-ink-2" title={blockedReason} data-xgc-role="no-agent-notice">{zh ? '未连接原生 Agent · 连接与模型' : 'No native agent · Connections'}</button>}
    </div>
    {note && <p role="status" className="px-1 text-caption text-ink-3">{note}</p>}
  </div>
}
