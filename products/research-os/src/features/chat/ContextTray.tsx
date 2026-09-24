import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileText, MessageSquareText, Network, Plus, Presentation, ScrollText, X } from 'lucide-react'
import { Button, Popover, RightMore } from '../../components/ui'
import { useWorkbench } from '../../store'
import { cn } from '../../lib/cn'
import { useNativeAgentSession } from './Session'
import { CONTENT_PATH, cardType, CARD_TYPE_LABELS, type ContentDocument } from '../content/content-model'
import { sharedContentSession } from '../content/useContentDocument'
import { checkContextForSend, contextManifest, newContextItem, type ContextItem } from '../projects/context-model'
import { ContextPanel } from '../projects/ContextPanel'
import { useProjectShelf } from '../artifacts/ArtifactShelf'
import { useAcademicNotes } from '../resources/useAcademicNotes'
import { extractCanvasPatches, patchContract } from '../revision/revision-model'
import { agentProposalKey, proposalCounts, useProposals } from '../revision/proposal-store'
import { sessionProject } from '../revision/useRevisionThread'
import { extractSourcePatches, sourceProposalId, SOURCE_FENCE } from '../revision/source-patch'
import { fileSourcePatches } from '../revision/revision-actions'
import { request } from '../../lib/api'

/* Chat 是控制面：研究对象以「版本化引用」挂到输入框上方（T3/Cursor 的附件语法），
   加入 ≠ 发送；插入草稿与请求画布提议是显式动作。版本细节收进「管理引用」。 */
const ICON = { 'canvas-node': Network, draft: Presentation, source: FileText } as const

type Candidate = { key: string; group: 'cards' | 'notes' | 'artifacts'; label: string; hint: string; item: () => ContextItem }

function useCandidates(project: string, query: string) {
  const { locale, resourceLayout, knowledgeDocuments } = useWorkbench()
  const shelf = useProjectShelf(project)
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
    // Project PDFs found on the shelf but not open: attached by path; the reader pins the digest once opened.
    for (const path of shelf?.pdfs ?? []) if (!out.some(c => c.key === `pdf:${project}:${path}`)) out.push({ key: `pdf:${project}:${path}`, group: 'artifacts', label: path.split('/').pop() || path, hint: 'PDF', item: () => newContextItem({ project, kind: 'source', label: path.split('/').pop() || path, ref: `${project}/${path}`, source: { id: path, path, workspace: project } }) })
    // Notes from the list carry no observed revision here, so they are attached as unverifiable — never invented.
    for (const note of knowledgeDocuments) out.push({ key: `note:${note.path}`, group: 'notes', label: note.title, hint: note.path, item: () => newContextItem({ project, kind: 'source', label: note.title, ref: `academic/${note.path}`, source: { id: note.path, path: note.path, workspace: 'academic' } }) })
    const q = query.trim().toLowerCase()
    return q ? out.filter(c => `${c.label} ${c.hint}`.toLowerCase().includes(q)) : out
  }, [document, resourceLayout.tabs, knowledgeDocuments, project, query, locale, shelf])
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

export function ContextTray() {
  const { locale, projectId, contextItems, addContextItem, removeContextItem, openResource, threadBriefs, setThreadBrief, reviewIntents, reviewDockOpen, setReviewDockOpen } = useWorkbench()
  const native = useNativeAgentSession()
  const zh = locale === 'zh'
  const [manage, setManage] = useState(false), [note, setNote] = useState('')
  const project = sessionProject(native.session) || projectId
  const items = contextItems.filter(item => item.project === project)
  const brief = threadBriefs[project]
  const reviewCount = reviewIntents.filter(intent => intent.scope.projectId === project).length
  const stale = (item: ContextItem) => item.state !== 'current'
  // Proposals the agent made in this thread: detected here, recorded only when the user chooses to review them.
  const { proposals, propose, load } = useProposals()
  useEffect(() => { if (project) void load(project) }, [project, load])
  const bound = Boolean(native.session && sessionProject(native.session) === project && native.streamMatchesSelection)
  const detected = useMemo(() => bound ? native.state.items.filter(item => item.role === 'assistant' && item.text.includes('```research-canvas-patch'))
    .flatMap(item => extractCanvasPatches(item.text).flatMap((p, i) => p.patch ? [{ key: agentProposalKey(native.selectedId, item.id, i, p.patch), patch: p.patch }] : [])) : [], [bound, native.state.items, native.selectedId])
  // Manuscript edits the agent proposed in this thread (research-source-patch): filed into the review journal on "Review".
  const sourceFound = useMemo(() => bound ? native.state.items.filter(item => item.role === 'assistant' && item.text.includes('```' + SOURCE_FENCE))
    .flatMap(item => extractSourcePatches(item.text).flatMap((p, i) => p.patch ? [{ id: sourceProposalId(native.selectedId, item.id, i), label: `${native.session?.provider || 'agent'} · ${native.selectedId.slice(0, 8)}`, patch: p.patch }] : []))
    // The same message can appear more than once in the stream (delta + final); one patch, one proposal.
    .filter((f, i, all) => all.findIndex(g => g.id === f.id) === i) : [], [bound, native.state.items, native.selectedId, native.session?.provider])
  const [filedIds, setFiledIds] = useState<Set<string>>(new Set())
  const sourceKey = sourceFound.map(f => f.id).join('|')
  useEffect(() => {
    // Which of them the journal already holds (e.g. after a reload): read once per new set, never write.
    if (!project || !sourceKey) return
    let live = true
    request<{ content: string }>(`/workspaces/${encodeURIComponent(project)}/files/research-reviews.json`).then(file => {
      const ids = (JSON.parse(file.content).proposals ?? []).map((p: { id?: string }) => p.id)
      if (live) setFiledIds(new Set(ids))
    }).catch(() => {})
    return () => { live = false }
  }, [project, sourceKey])
  const sourceUnfiled = sourceFound.filter(f => !filedIds.has(f.id))
  const reviewSource = async () => {
    setNote('')
    try {
      const result = await fileSourcePatches({ scope: { projectId: project, workspace: project }, locale, found: sourceUnfiled })
      setFiledIds(ids => new Set([...ids, ...result.filed, ...result.existing]))
      if (result.problems.length) setNote(`${zh ? '部分修改未能定位：' : 'Some edits could not be located: '}${result.problems.join(' ')}`)
      if (result.filed.length || result.existing.length) openResource({ kind: 'reviews', scope: { projectId: project, workspace: project } }, 'secondary')
    } catch (error) { setNote(error instanceof Error ? error.message : String(error)) }
  }
  const known = new Set(proposals.filter(p => p.project === project).map(p => p.key))
  const unseen = detected.filter(d => !known.has(d.key))
  const pending = proposalCounts(proposals, project).pending
  const review = async () => {
    try { for (const d of unseen) await propose({ project, origin: 'agent', sourceLabel: `${native.session?.title || native.session?.provider || 'thread'} · ${native.selectedId.slice(0, 8)}`, key: d.key, patch: d.patch }) }
    catch (error) { setNote(error instanceof Error ? error.message : String(error)); return }
    openResource({ kind: 'research', workspace: project, view: 'revision' }, 'primary')
  }
  const insert = (withContract: boolean) => {
    const { include, issues } = checkContextForSend(items, project)
    if (!include.length) return
    native.appendDraft(contextManifest(include, project) + (withContract ? `\n${zh ? '请基于以上上下文，对研究画布提出修改建议。' : 'Based on this context, propose research canvas changes.'}\n${patchContract(locale)}\n` : ''))
    setNote(issues.length ? (zh ? `已插入草稿；${issues.length} 项需核对版本（见「管理引用」）。` : `Inserted into the draft; ${issues.length} item(s) need a version check (see Manage).`) : '')
  }
  return <div className="flex flex-col gap-1" data-xgc-role="context-tray" data-xgc-id={project || 'global'}>
    {manage && items.length > 0 && <div className="max-h-64 overflow-y-auto"><ContextPanel open/></div>}
    <div className="flex min-h-7 flex-wrap items-center gap-1">
      {brief && <span data-xgc-role="thread-brief" className="flex h-6 max-w-60 items-center gap-0.5 rounded-md border border-line bg-panel pl-0.5 pr-0.5 text-caption text-ink-2">
        <Popover label={brief.label} side="top" align="left" width="w-72" trigger={({ open, toggle }) =>
          <button type="button" aria-expanded={open} onClick={toggle} className="flex h-5 min-w-0 items-center gap-1 rounded px-1 hover:bg-hover hover:text-ink" title={zh ? '随首条消息发送；点开查看全文' : 'Sent with the first message; open to read it'}>
            <ScrollText size={11} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="min-w-0 truncate">{brief.label}</span></button>}>
          <p className="px-1 text-caption text-ink-3">{zh ? '随首条消息原样发送，发送后自动卸下。' : 'Sent verbatim with the first message, then detached.'}</p>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-inset p-2 font-mono text-[11px] leading-5 text-ink-2">{brief.text}</pre>
        </Popover>
        <button type="button" aria-label={`${zh ? '移除' : 'Remove'} ${brief.label}`} className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-3 hover:bg-hover hover:text-ink" onClick={() => setThreadBrief(project, null)}><X size={10}/></button>
      </span>}
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
      {items.length > 0 && <RightMore menu label={zh ? '上下文操作' : 'Context actions'}>
        <Button size="xs" onClick={() => insert(false)}>{zh ? '插入引用清单到草稿' : 'Insert references into draft'}</Button>
        <Button size="xs" onClick={() => insert(true)}>{zh ? '请 Agent 提议画布修改' : 'Ask agent for canvas changes'}</Button>
        <Button size="xs" onClick={() => setManage(v => !v)}>{manage ? (zh ? '收起版本管理' : 'Hide version details') : (zh ? '管理引用与版本…' : 'Manage references…')}</Button>
      </RightMore>}
      {project && (unseen.length > 0 || pending > 0) && <button type="button" onClick={() => void review()} data-xgc-role="review-proposals" data-pending={pending + unseen.length}
        className="flex h-6 items-center gap-1 rounded-md border border-line-strong px-1.5 text-caption text-ink hover:bg-hover">
        {unseen.length ? (zh ? `Agent 提出 ${unseen.length} 项画布修改 · 审阅` : `Agent proposed ${unseen.length} canvas change(s) · Review`) : (zh ? `${pending} 项画布提议待审` : `${pending} canvas proposal(s) to review`)}
      </button>}
      {project && sourceUnfiled.length === 0 && sourceFound.length > 0 && <button type="button" onClick={() => openResource({ kind: 'reviews', scope: { projectId: project, workspace: project } }, 'secondary')} data-xgc-role="open-source-review"
        className="flex h-6 items-center gap-1 rounded-md px-1.5 text-caption text-ink-2 hover:bg-hover hover:text-ink">{zh ? '稿件修改 · 打开审阅' : 'Manuscript edits · open review'}</button>}
      {project && sourceUnfiled.length > 0 && <button type="button" onClick={() => void reviewSource()} data-xgc-role="review-source-patches" data-pending={sourceUnfiled.length}
        className="flex h-6 items-center gap-1 rounded-md border border-line-strong px-1.5 text-caption text-ink hover:bg-hover">
        {zh ? `Agent 提出 ${sourceUnfiled.reduce((n, f) => n + f.patch.edits.length, 0)} 处稿件修改 · 审阅` : `Agent proposed ${sourceUnfiled.reduce((n, f) => n + f.patch.edits.length, 0)} manuscript edit(s) · Review`}
      </button>}
      {/* 设计审阅不再常驻列内：有待讨论的批注时出现一枚计数，点开浮层 */}
      {project && (reviewCount > 0 || reviewDockOpen) && <button type="button" aria-pressed={reviewDockOpen} onClick={() => setReviewDockOpen(!reviewDockOpen)} data-xgc-role="review-chip" data-pending={reviewCount}
        className={cn('flex h-6 items-center gap-1 rounded-md px-1.5 text-caption transition-colors hover:bg-hover', reviewDockOpen ? 'bg-active text-ink' : 'text-ink-2')}>
        <MessageSquareText size={11} strokeWidth={1.75} className="shrink-0 text-ink-3"/>{zh ? '设计审阅' : 'Design review'}{reviewCount ? ` · ${reviewCount}` : ''}
      </button>}
    </div>
    {note && <p role="status" className="px-1 text-caption text-ink-3">{note}</p>}
  </div>
}
