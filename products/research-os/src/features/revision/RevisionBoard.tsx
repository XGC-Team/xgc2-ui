import { useMemo, useState } from 'react'
import { Check, Crosshair, MessageSquarePlus, X } from 'lucide-react'
import { Button } from '../../components/ui'
import { Textarea } from '../../components/forms'
import { useWorkbench } from '../../store'
import { cn } from '../../lib/cn'
import { useNativeAgentSession } from '../chat/Session'
import { newContextItem } from '../projects/context-model'
import { requestDesignFocus } from '../projects/design-focus'
import { CARD_TYPE_LABELS, CONTENT_PATH, cardType, type ContentDocument, type ContentObject } from '../content/content-model'
import { LinkedKnowledge } from './FindingCapture'
import { useProposals, type CanvasProposal, type ProposalOrigin } from './proposal-store'
import { editFailureCopy, editResearchContent } from './revision-actions'
import {
  REVISION_STATUSES, addRevisionItems, applyCanvasPatch, extractCanvasPatches, sampleRevisionProposal, splitReviewComments, validateCanvasPatch,
  type CanvasPatch, type PatchOp,
} from './revision-model'
import { sessionProject, useStartRevisionThread } from './useRevisionThread'

type Copy = Record<string, string>
const COPY: Record<'zh' | 'en', Copy> = {
  zh: {
    start: '新建修订线程', startHint: '停靠讨论，起草带修订项与提议格式的消息（不自动发送）。',
    intake: '审稿意见', intakeHint: '粘贴审稿意见（支持 Reviewer N 标题与编号/条目）。每条成为一张「修订项」卡片，保存在项目研究内容里。',
    intakePlaceholder: 'Reviewer 1:\n1. …\n2. …', create: '生成 {n} 张修订项卡片', items: '修订项', none: '还没有修订项。',
    locate: '在画布定位', attach: '加入对话上下文', attached: '已加入对话上下文（未发送）。', decisions: '决策 {n}',
    proposals: '画布修改提议', proposalsHint: '提议只在你接受后写入研究内容；拒绝不会改动任何内容。',
    fromThread: '读取当前线程的提议', paste: '粘贴 Agent 回复', sample: '示例提议（规则生成，非 Agent）', read: '读取',
    noThread: '当前线程未绑定此项目，或还没有 Agent 回复。', noPatch: '没有找到 research-canvas-patch 提议块。', added: '新增 {n} 条待审提议。', noSample: '所有未处理的修订项都已有决策卡。',
    accept: '接受并写入', reject: '拒绝', pending: '待审', applied: '已应用', rejected: '已拒绝', clear: '清除已处理',
    origin_agent: 'Agent 回复', origin_pasted: '粘贴的回复', origin_sample: '规则示例',
    appliedAt: '已写入研究内容 {rev}',
  },
  en: {
    start: 'New revision thread', startHint: 'Docks the discussion and drafts a message with the revision items and the proposal format (not sent).',
    intake: 'Reviewer comments', intakeHint: 'Paste reviewer comments (Reviewer N headings and numbered or bulleted items). Each becomes a revision-item card saved in the project research content.',
    intakePlaceholder: 'Reviewer 1:\n1. …\n2. …', create: 'Create {n} revision cards', items: 'Revision items', none: 'No revision items yet.',
    locate: 'Locate on canvas', attach: 'Add to chat context', attached: 'Added to chat context (not sent).', decisions: '{n} decisions',
    proposals: 'Canvas change proposals', proposalsHint: 'Proposals change research content only after you accept them; rejecting changes nothing.',
    fromThread: 'Read proposals from this thread', paste: 'Paste agent reply', sample: 'Sample proposal (rule-based, not an agent)', read: 'Read',
    noThread: 'The current thread is not bound to this project, or has no agent reply yet.', noPatch: 'No research-canvas-patch block found.', added: '{n} new proposal(s) to review.', noSample: 'Every open revision item already has a decision card.',
    accept: 'Accept and write', reject: 'Reject', pending: 'Pending', applied: 'Applied', rejected: 'Rejected', clear: 'Clear decided',
    origin_agent: 'Agent reply', origin_pasted: 'Pasted reply', origin_sample: 'Rule-based sample',
    appliedAt: 'Written to research content {rev}',
  },
}
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''))
const short = (digest?: string) => digest ? digest.replace(/^sha256:/, '').slice(0, 8) : ''

function Rule({ children, action }: { children: string; action?: React.ReactNode }) {
  return <div className="mb-2 mt-6 flex items-center gap-3 first:mt-0"><h2 className="shrink-0 text-caption font-medium uppercase tracking-[0.08em] text-ink-3">{children}</h2><span aria-hidden className="h-px flex-1 bg-line"/>{action}</div>
}

function describeOp(op: PatchOp, document: ContentDocument, locale: 'zh' | 'en', patch: CanvasPatch): string {
  // Patch-local refs ("d1") name cards the same patch adds; show their titles, not the ref.
  const title = (id: string) => document.objects.find(o => o.id === id)?.title ?? patch.ops.find((o): o is Extract<PatchOp, { op: 'add-card' }> => o.op === 'add-card' && o.ref === id)?.title ?? id
  const zh = locale === 'zh'
  switch (op.op) {
    case 'add-card': return `${zh ? '新增' : 'Add'} ${CARD_TYPE_LABELS[locale][op.kind]}：${op.title}`
    case 'update-card': return `${zh ? '更新' : 'Update'} “${title(op.id)}”${op.status ? ` → ${op.status}` : ''}${op.title ? ` · ${op.title}` : ''}${op.kind ? ` · ${CARD_TYPE_LABELS[locale][op.kind]}` : ''}`
    case 'add-relation': return `${title(op.from)} —${op.relation}→ ${title(op.to)}`
  }
}

/** Review-driven revision on the same research content: comments → revision cards, agent proposals → accepted canvas edits. */
export function RevisionBoard({ project, workspace, document, digest, dirty, editable, onView }: {
  project: string; workspace: string; document: ContentDocument; digest: string; dirty: boolean; editable: boolean; onView: (view: 'canvas') => void
}) {
  const { locale, addContextItem } = useWorkbench()
  const c = COPY[locale], zh = locale === 'zh'
  const native = useNativeAgentSession()
  const startThread = useStartRevisionThread()
  const { proposals, propose, decide, clearDecided } = useProposals()
  const [intake, setIntake] = useState(''), [pasted, setPasted] = useState(''), [pasting, setPasting] = useState(false)
  const [note, setNote] = useState(''), [busy, setBusy] = useState(''), [expanded, setExpanded] = useState<string | null>(null)
  const scope = { projectId: project, workspace }
  const comments = useMemo(() => splitReviewComments(intake), [intake])
  const items = document.objects.filter(o => cardType(o) === 'revision')
  const mine = proposals.filter(p => p.project === project).slice().reverse()
  const decisionCount = (item: ContentObject) => document.relations.filter(r => r.to.id === item.id && document.objects.some(o => o.id === r.from.id && cardType(o) === 'decision')).length

  const report = (result: Awaited<ReturnType<typeof editResearchContent>>, success = '') => setNote(result.ok ? success : editFailureCopy(result, locale))
  const createItems = async () => {
    setBusy('intake')
    const result = await editResearchContent(scope, d => addRevisionItems(d, comments).document)
    setBusy(''); if (result.ok) setIntake(''); report(result)
  }
  const setStatus = async (item: ContentObject, status: string) => report(await editResearchContent(scope, d => ({ ...d, objects: d.objects.map(o => o.id === item.id ? { ...o, status } : o) })))
  const attach = (item: ContentObject) => {
    addContextItem(newContextItem({ project, kind: 'canvas-node', label: item.title, ref: `${CONTENT_PATH}#object/${item.id}`, digest: digest || undefined, excerpt: item.body?.slice(0, 200), source: { id: item.id, path: CONTENT_PATH, workspace, digest: digest || undefined, excerpt: item.body?.slice(0, 200) } }))
    setNote(c.attached)
  }
  const record = (patches: { patch?: CanvasPatch; error?: string }[], origin: ProposalOrigin, sourceLabel: string, keyBase: string) => {
    const valid = patches.filter(p => p.patch)
    const errors = patches.filter(p => p.error).map(p => p.error)
    if (!patches.length) { setNote(c.noPatch); return }
    const count = valid.filter((p, i) => propose({ project, origin, sourceLabel, key: `${keyBase}:${i}:${JSON.stringify(p.patch)}`, patch: p.patch! })).length
    setNote([fill(c.added, { n: count }), ...errors].join(' '))
  }
  const fromThread = () => {
    const bound = native.session && sessionProject(native.session) === project && native.streamMatchesSelection
    const replies = bound ? native.state.items.filter(item => item.role === 'assistant' && item.text) : []
    if (!replies.length) { setNote(c.noThread); return }
    const found = replies.flatMap(item => extractCanvasPatches(item.text).map(p => ({ ...p, item })))
    record(found, 'agent', `${native.session?.title || native.session?.provider || 'thread'} · ${native.selectedId.slice(0, 8)}`, `agent:${native.selectedId}`)
  }
  const fromPaste = () => { record(extractCanvasPatches(pasted), 'pasted', zh ? '粘贴的回复' : 'Pasted reply', `pasted:${pasted.length}`); setPasted(''); setPasting(false) }
  const sample = () => { const patch = sampleRevisionProposal(document, locale); if (!patch) { setNote(c.noSample); return } record([{ patch }], 'sample', c.origin_sample, `sample:${digest}`) }
  const accept = async (proposal: CanvasProposal) => {
    setBusy(proposal.id)
    let failure = ''
    const result = await editResearchContent(scope, d => { try { return applyCanvasPatch(d, proposal.patch) } catch (error) { failure = error instanceof Error ? error.message : String(error); return d } }, true)
    setBusy('')
    if (failure) { setNote(failure); return }
    if (result.ok) { decide(proposal.id, 'applied', result.revision); setNote(fill(c.appliedAt, { rev: short(result.revision) })) } else report(result)
  }

  return <div className="h-full min-h-0 overflow-y-auto" data-xgc-role="revision-board" data-xgc-id={project}>
    <div className="mx-auto w-full max-w-[46rem] px-5 pb-12 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="solid" icon={MessageSquarePlus} onClick={() => void startThread(project)} data-xgc-role="start-revision-thread">{c.start}</Button>
        <p className="min-w-0 flex-1 text-caption text-ink-3">{c.startHint}</p>
      </div>
      {note && <p role="status" className="mt-3 rounded-md bg-elevated px-3 py-2 text-caption text-ink-2">{note}</p>}

      <Rule>{c.intake}</Rule>
      <p className="mb-2 text-caption text-ink-3">{c.intakeHint}</p>
      <Textarea aria-label={c.intake} rows={5} className="ui-input w-full resize-y text-secondary" placeholder={c.intakePlaceholder} value={intake} disabled={!editable} onChange={e => setIntake(e.target.value)}/>
      <div className="mt-2 flex items-center gap-2">
        <Button size="xs" variant="outline" disabled={!editable || !comments.length} loading={busy === 'intake'} onClick={() => void createItems()}>{fill(c.create, { n: comments.length })}</Button>
        {comments.length > 0 && <span className="truncate text-caption text-ink-3">{comments.map(item => item.label).join(' · ')}</span>}
      </div>

      <Rule>{`${c.items} · ${items.length}`}</Rule>
      {!items.length && <p className="text-secondary text-ink-3">{c.none}</p>}
      <ul className="space-y-1">
        {items.map(item => <li key={item.id} className={cn('rounded-lg px-2 py-1.5 transition-colors', expanded === item.id ? 'bg-elevated' : 'hover:bg-hover')} data-revision-item={item.id}>
          <div className="flex items-center gap-2">
            <button type="button" className="min-w-0 flex-1 truncate text-left text-secondary text-ink" onClick={() => setExpanded(expanded === item.id ? null : item.id)} title={item.body}>{item.title}</button>
            <span className="shrink-0 text-caption text-ink-3">{fill(c.decisions, { n: decisionCount(item) })}</span>
            <select aria-label={zh ? '处理状态' : 'Status'} className="ui-select-compact w-28 shrink-0" value={item.status ?? 'open'} disabled={!editable} onChange={e => void setStatus(item, e.target.value)}>
              {REVISION_STATUSES.map(status => <option key={status} value={status}>{zh ? { open: '待处理', planned: '已定方案', addressed: '已修改', declined: '不采纳' }[status] : status}</option>)}
            </select>
          </div>
          {expanded === item.id && <div className="mt-2 space-y-3 pl-1">
            <p className="whitespace-pre-wrap text-secondary text-ink-2">{item.body}</p>
            <div className="flex flex-wrap gap-1">
              <Button size="xs" icon={Crosshair} onClick={() => { onView('canvas'); requestDesignFocus(project, [item.id]) }}>{c.locate}</Button>
              <Button size="xs" onClick={() => attach(item)}>{c.attach}</Button>
            </div>
            <LinkedKnowledge project={project} workspace={workspace} object={item} sources={item.sources}/>
          </div>}
        </li>)}
      </ul>

      <Rule action={mine.some(p => p.status !== 'pending') ? <Button size="xs" onClick={() => clearDecided(project)}>{c.clear}</Button> : undefined}>{c.proposals}</Rule>
      <p className="mb-2 text-caption text-ink-3">{c.proposalsHint}</p>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="outline" onClick={fromThread}>{c.fromThread}</Button>
        <Button size="xs" onClick={() => setPasting(v => !v)}>{c.paste}</Button>
        <Button size="xs" onClick={sample} data-xgc-role="sample-proposal">{c.sample}</Button>
      </div>
      {pasting && <div className="mt-2 space-y-1">
        <Textarea aria-label={c.paste} rows={5} className="ui-input w-full resize-y font-mono text-caption" value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'```research-canvas-patch\n{"ops":[…]}\n```'}/>
        <Button size="xs" variant="outline" disabled={!pasted.trim()} onClick={fromPaste}>{c.read}</Button>
      </div>}
      <ul className="mt-3 space-y-2">
        {mine.map(proposal => {
          const issues = proposal.status === 'pending' ? validateCanvasPatch(document, proposal.patch) : []
          return <li key={proposal.id} className="rounded-lg border border-line bg-panel p-3 shadow-soft" data-proposal={proposal.id} data-proposal-status={proposal.status}>
            <div className="flex flex-wrap items-center gap-2 text-caption">
              <span className="rounded-md bg-elevated px-1.5 py-0.5 text-ink-2">{c[`origin_${proposal.origin}`]}</span>
              <span className="min-w-0 flex-1 truncate text-ink-3" title={proposal.sourceLabel}>{proposal.sourceLabel !== c[`origin_${proposal.origin}`] ? proposal.sourceLabel : ''}</span>
              <span className={cn('shrink-0', proposal.status === 'pending' ? 'font-medium text-ink' : 'text-ink-3')}>{c[proposal.status]}{proposal.status === 'applied' && proposal.baseRevision ? ` · ${short(proposal.baseRevision)}` : ''}</span>
            </div>
            {proposal.patch.summary && <p className="mt-1.5 text-secondary text-ink">{proposal.patch.summary}</p>}
            <ol className="mt-1.5 space-y-0.5 text-caption text-ink-2">{proposal.patch.ops.map((op, i) => <li key={i}>{i + 1}. {describeOp(op, document, locale, proposal.patch)}</li>)}</ol>
            {issues.map(issue => <p key={issue} role="alert" className="mt-1 text-caption text-ink-2">⚠ {issue}</p>)}
            {proposal.status === 'pending' && <div className="mt-2 flex gap-1">
              <Button size="xs" variant="outline" icon={Check} disabled={!editable || issues.length > 0 || dirty} loading={busy === proposal.id} onClick={() => void accept(proposal)}>{c.accept}</Button>
              <Button size="xs" icon={X} onClick={() => decide(proposal.id, 'rejected')}>{c.reject}</Button>
            </div>}
          </li>
        })}
      </ul>
    </div>
  </div>
}
