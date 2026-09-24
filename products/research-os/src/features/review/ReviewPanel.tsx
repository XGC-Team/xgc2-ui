import { observedFiles, subscribeObservations } from './file-observations'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { applyKnowledgePromotion } from '../resources/knowledge-promotion-api'
import type { PromotionReceipt } from '../resources/knowledge-promotion'
import { Button, RightMore } from '../../components/ui'
import { ChevronLeft } from 'lucide-react'
import { cn } from '../../lib/cn'
import { wordDiff } from './word-diff'
import { answeredCards } from '../revision/source-patch'
import { markAnswered } from '../revision/revision-actions'
import { saveDownload } from '../../lib/api'
import { useWorkbench } from '../../store'
import { DRAFTS_PATH } from '../projects/draft-model'
import { CONTENT_PATH } from '../content/content-model'
import { useReview } from './useReview'
import { readReviewFile, captureTarget } from './review-api'
import { assertEditorClean } from './write-coordinator'
import { openFeedbackAnchor } from './review-navigation'
import { impactedDrafts, patchTarget, targetChoices, targetValue } from './review-targets'
import { writingCopy } from '../workbench/writing-copy'
import { check, dependencyClosure, now, operationState, requiresContentReview, REVIEW_PATH, scopeKey, selectedGroups, uid, validPath, type FileRecord, type Operation, type Proposal, type Scope, type Target } from './review-model'

type ReviewPanelProps = {scope: Scope; tabId: string; onTitle: (title: string) => void; surface?: 'panel' | 'writing'}
/** Standalone panels own one journal; the writing dock passes its existing instance. */
export function ReviewPanel(props: ReviewPanelProps) {
  const [dirty, setDirty] = useState(false)
  const api = useReview(props.scope, props.tabId, dirty)
  return <ReviewPanelContents {...props} api={api} onFormDirty={setDirty}/>
}
export function ReviewPanelContents({scope, tabId, onTitle, surface = 'panel', api, onFormDirty, onConfirmDesign}: ReviewPanelProps & {
  api: ReturnType<typeof useReview>; onFormDirty: (dirty: boolean) => void
  onConfirmDesign?: (proposalId: string, operationIds: string[], actor: string) => Promise<void>
}) {
  const {locale, reviewIntents, consumeReviewFeedback} = useWorkbench(), zh = locale === 'zh'
  const t = (cn: string, en: string) => zh ? cn : en
  const observations=useSyncExternalStore(subscribeObservations,observedFiles).filter(o=>scopeKey(o)===scopeKey(scope))
  const incoming = reviewIntents.filter(i => scopeKey(i.scope) === scopeKey(scope) && (surface !== 'writing' || !i.designDiscussion))
  const [feedbackId, setFeedbackId] = useState(''), [selected, setSelected] = useState('')
  const seed = incoming.find(i => i.id === feedbackId) || incoming[0]
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [author, setAuthor] = useState('researcher')
  const [promotionReceipts, setPromotionReceipts] = useState<Record<string, PromotionReceipt>>({})
  const [marked, setMarked] = useState<Record<string, boolean>>({})
  const [operations, setOperations] = useState<Operation[]>([]), [localError, setLocalError] = useState('')
  const [kind, setKind] = useState<'text' | 'canvas' | 'block'>('text'), [path, setPath] = useState('')
  const [source, setSource] = useState<FileRecord | null>(null), [choice, setChoice] = useState('0'), [range, setRange] = useState({start: 0, end: 0})
  const [after, setAfter] = useState(''), [reason, setReason] = useState(''), [depends, setDepends] = useState<string[]>([]), [impact, setImpact] = useState('')
  const [checked, setChecked] = useState<string[]>([]), [decisionReason, setDecisionReason] = useState(''), [preview, setPreview] = useState('')
  const [inspection, setInspection] = useState<Record<string, {digest: string; match: string}>>({})
  const [promotion, setPromotion] = useState(false), [conditions, setConditions] = useState(''), [knowledgeScope, setKnowledgeScope] = useState(''), [verification, setVerification] = useState('unverified')
  const [reading, setReading] = useState(false), [rejecting, setRejecting] = useState(false)
  const formDirty = !!(title || body || operations.length || after || reason || conditions || knowledgeScope)
  useEffect(() => { onFormDirty(formDirty) }, [formDirty, onFormDirty])
  // The dock opens the newest proposal that still needs the reviewer — never an already-settled one.
  const newest = api.book ? [...api.book.proposals].reverse().find(p => p.writing || p.operations.some(o => operationState(api.book!, p.id, o.id) === 'review'))?.id : undefined
  useEffect(() => { if (surface === 'writing' && newest) setSelected(newest) }, [surface, newest])
  const report = useRef(onTitle); report.current = onTitle
  useEffect(() => { report.current(zh ? '反馈与修改审阅' : 'Feedback and change review') }, [zh])
  const previousSeed = useRef('')
  useEffect(() => {
    if (!seed || previousSeed.current === seed.id) return
    if (previousSeed.current && (title || body || operations.length || after || reason)) return
    previousSeed.current = seed.id; setBody(seed.body || ''); setTitle(seed.body?.slice(0, 80) || '')
    setKind(seed.anchor.target?.kind || 'text'); setPath(seed.anchor.target?.path || (seed.anchor.kind !== 'pdf' ? seed.anchor.path : ''))
    setSource(null); setSelected('')
  }, [seed?.id, title, operations.length, after])
  // Opening a proposal selects everything still awaiting review (Cursor: review all, deselect what you don't want).
  useEffect(() => {
    const book = api.book, p = book?.proposals.find(x => x.id === selected)
    setChecked(p && book ? p.operations.filter(o => operationState(book, p.id, o.id) === 'review').map(o => o.id) : []); setPreview(''); setInspection({}); setRejecting(false)
  }, [selected]) // Deliberately keyed on the selection only: a journal reload must not reset the reviewer's choices.
  const proposal = api.book?.proposals.find(p => p.id === selected)
  const busy = api.busy || reading
  const call = async (fn: () => Promise<unknown>) => { setLocalError(''); try { await fn() } catch (e) { setLocalError(e instanceof Error ? e.message : String(e)) } }
  const sourcePath = kind === 'canvas' ? CONTENT_PATH : kind === 'block' ? DRAFTS_PATH : path
  let choices: ReturnType<typeof targetChoices> = []
  try { if (source && kind !== 'text') choices = targetChoices(source.content, kind, scope) } catch { /* Load reports validation errors. */ }
  const target: Target | undefined = !source ? undefined : kind === 'text' ? {kind, workspace: scope.workspace, path: sourcePath, ...range} : choices[Number(choice)]?.target
  let before = ''
  try { if (target && source) before = targetValue(source.content, target, scope) } catch { /* A range has not yet been selected. */ }
  const loadSource = async () => {
    check(validPath(sourcePath), 'Choose a relative research file path.')
    assertEditorClean(scope.workspace, sourcePath); setReading(true)
    try {
      const r = await readReviewFile(scope.workspace, sourcePath, scope.projectId)
      if (kind !== 'text') targetChoices(r.content, kind, scope)
      setSource(r); setChoice('0'); setAfter(''); setRange({start: 0, end: 0})
      if(kind!=='text'&&seed?.anchor.target){
        const list=targetChoices(r.content,kind,scope),original=seed.anchor.target
        const index=list.findIndex(c=>c.target.kind===original.kind&&'objectId' in c.target&&'objectId' in original&&c.target.objectId===original.objectId&&c.target.field===original.field&&(!('blockId' in original)||('blockId' in c.target&&c.target.blockId===original.blockId)))
        if(index>=0)setChoice(String(index))
      }
      if (kind === 'text' && seed?.anchor.kind === 'text' && seed.anchor.path === sourcePath && seed.anchor.digest === r.digest && seed.anchor.quote) {
        const start = r.content.indexOf(seed.anchor.quote)
        if (start >= 0 && r.content.indexOf(seed.anchor.quote, start + 1) < 0) setRange({start, end: start + seed.anchor.quote.length})
      }
    } finally { setReading(false) }
  }
  const addOperation = async () => {
    check(seed && target && source, 'Capture feedback and load its explicit target.')
    check(reason.trim() && before !== after, 'A difference and reason are required.')
    const targetAnchor = await captureTarget(scope, target, before)
    check(targetAnchor.digest === source.digest, 'Target changed while composing. Reload the baseline.')
    let related: string[] = []
    try { related = impactedDrafts((await readReviewFile(scope.workspace, DRAFTS_PATH, scope.projectId)).content, scope, target) } catch { /* No inference from missing relationships. */ }
    const o: Operation = {id: uid(), target: structuredClone(target), baseDigest: source.digest, before, after, reason: reason.trim(),
      evidence: [structuredClone(seed.anchor), targetAnchor], dependsOn: [...depends], impacts: [...new Set([...related, ...impact.split('\n').map(s => s.trim()).filter(Boolean)])]}
    const samePath = operations.filter(x => x.target.path === target.path)
    if (samePath.length) patchTarget(source.content, [...samePath, o], scope)
    patchTarget(source.content, [o], scope)
    setOperations(current => [...current, o]); setAfter(''); setReason(''); setDepends([]); setImpact('')
  }
  const saveProposal = async () => {
    check(seed, 'Capture a versioned feedback object first.')
    const p: Proposal = {id: uid(), title: title.trim(), author: author.trim(), at: now(), feedback: {id: seed.id, author: author.trim(), at: seed.at, body: body.trim(), anchor: structuredClone(seed.anchor)}, operations,
      ...(promotion ? {promotion: {destination: 'global-knowledge' as const, scope: knowledgeScope.trim(), conditions: conditions.trim(), verification: verification.trim(), decision: 'pending' as const}} : {})}
    await api.action(engine => engine.add(p))
    consumeReviewFeedback(seed.id); setSelected(p.id); setTitle(''); setBody(''); setOperations([]); setAfter(''); setReason(''); setConditions(''); setKnowledgeScope(''); setPromotion(false); previousSeed.current = ''
  }
  const previewSelected = async () => {
    setPreview('')
    check(proposal, 'Select a proposal.')
    // A cross-file dependency remains a useful diff preview; no execution capability is implied.
    const groups = new Map<string, Operation[]>()
    for (const o of proposal.operations.filter(o => checked.includes(o.id))) groups.set(o.target.path, [...(groups.get(o.target.path) || []), o])
    check(groups.size, 'Select operations.')
    const lines: string[] = []
    for (const [path, ops] of groups) {
      assertEditorClean(scope.workspace, path); const r = await readReviewFile(scope.workspace, path, scope.projectId)
      check(ops.every(o => o.baseDigest === r.digest), `Baseline changed: ${path}`)
      patchTarget(r.content, ops, scope); lines.push(`${path} · ${r.digest}`)
    }
    setPreview(`${t('仅预览通过，未写入任何目标文件', 'Preview only; no target file was written')}\n${lines.join('\n')}`)
  }
  const stateLabel = (value: string) => ({review: t('待审阅', 'Review'), 'migration-review-required': t('内容已迁移，需重新提案审阅', 'Content migrated; a new proposal is required'), applied: t('已写入', 'Applied'), reverted: t('已受保护撤回', 'Reverted'), uncertain: t('结果待核对，禁止盲目重试', 'Uncertain; inspect before retry'), conflict: t('版本冲突', 'Conflict'), rejected: t('已拒绝', 'Rejected'), 'not-written': t('未写入', 'Not written'), pending: t('写入意图已登记／结果待核对', 'Intent recorded / outcome unresolved'), 'observed-applied': t('人工确认当前匹配修改后内容', 'Confirmed matching after content'), 'observed-not-written': t('人工确认当前匹配基线', 'Confirmed matching baseline') }[value] || value)

  const stateOf = (o: Operation) => api.book ? operationState(api.book, proposal!.id, o.id) : 'review'
  const pendingCount = (p: Proposal) => api.book ? p.operations.filter(o => operationState(api.book!, p.id, o.id) === 'review').length : 0
  const origin = (p: Proposal) => p.id.startsWith('src-') ? t('Agent · 稿件', 'Agent · manuscript') : p.promotion ? t('知识晋升', 'Knowledge') : p.writing ? t('改稿', 'Writing') : t('批注', 'Annotation')
  const evidenceLabel = (a: Operation['evidence'][number]) => a.kind === 'canvas' ? a.quote || t('画布卡片', 'Canvas card') : a.kind === 'pdf' ? `${a.path.split('/').pop()} · p.${a.page ?? '?'}` : a.path.split('/').pop() || a.path
  const unresolved = proposal ? api.book!.attempts.filter(a => a.proposalId === proposal.id && ['pending', 'uncertain'].includes(a.outcome)) : []
  const records = proposal ? api.book!.attempts.filter(a => a.proposalId === proposal.id) : []

  /* 修改审阅（Cursor / VS Code 内联差异语法）：列表 → 单个提案；每处修改是一段行内词级差异，
     默认全选待审项，一个主操作「应用所选」；摘要、基线版本、写入回执等技术细节折叠在「详情」里。 */
  return <section className="flex h-full min-h-0 flex-col" aria-label={t('反馈与修改审阅', 'Feedback and change review')} data-review-project={scope.projectId}>
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
      {proposal ? <button type="button" data-xgc-role="review-back" onClick={() => setSelected('')} className="flex min-w-0 flex-1 items-center gap-1 text-caption text-ink-3 hover:text-ink-2"><ChevronLeft size={13}/><span className="truncate">{t('全部修改', 'All changes')}</span></button>
        : <span className="min-w-0 flex-1 truncate font-display text-[14px] tracking-tight">{t('修改审阅', 'Change review')}</span>}
      <RightMore label={t('审阅记录', 'Review journal')}>
        <label className="block text-caption text-ink-3">{t('操作者（本地记录身份，不是身份认证）', 'Actor (local record label, not authentication)')}<input className="ui-input mt-1 h-7 w-full" value={author} onChange={e => setAuthor(e.target.value)}/></label>
        <p className="break-all text-caption text-ink-3" title={t('预览、目标写入、回执保存分别记录；跨文件不是原子事务。', 'Preview, target writes and journal acknowledgements are separate. Cross-file writes are not atomic.')}>{scope.workspace}/{REVIEW_PATH}</p>
        <div className="flex flex-wrap gap-1">
          <Button size="xs" disabled={busy} onClick={() => void call(() => api.action(e => e.load()))}>{t('重新读取记录', 'Reload journal')}</Button>
          <Button size="xs" disabled={!api.book} onClick={() => saveDownload(`${scope.projectId}-review-evidence.json`, {book: api.book, transient: api.transient, error: api.error})}>{t('导出记录', 'Export record')}</Button>
          {observations.length > 0 && <Button size="xs" onClick={() => saveDownload(`${scope.projectId}-save-observations.json`, observations)}>{t('导出保存观察', 'Export save observations')}</Button>}
        </div>
      </RightMore>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
     <div className="mx-auto w-full max-w-[44rem] space-y-4 px-4 py-4">
      {(api.error || localError) && <p role="alert" className="whitespace-pre-wrap rounded-md bg-elevated px-3 py-2 text-secondary">{localError || api.error}</p>}
      {api.auditUncertain && <p role="alert" className="rounded-md bg-elevated px-3 py-2 text-secondary">{t('回执未确认：停止后续写入，导出记录后重新读取并核对。', 'Journal unconfirmed: stop writes, export the record, reload and inspect.')}</p>}
      {api.transient && <details className="text-caption"><summary>{t('进行中的写入意图', 'Write intent in flight')}</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(api.transient, null, 2)}</pre></details>}
      {!api.book && <p role="status" className="text-secondary text-ink-3">{busy ? t('读取中…', 'Loading…') : t('记录尚不可用。', 'Journal unavailable.')}</p>}

      {!proposal && api.book && <nav aria-label={t('已保存提案', 'Saved proposals')} className="flex flex-col gap-0.5" data-xgc-role="review-list">
        {seed && <button type="button" onClick={() => setSelected('')} className="flex min-h-10 items-center gap-2 rounded-md border border-dashed border-line px-3 py-2 text-left text-secondary text-ink-2">{t('待保存的反馈', 'Unsaved feedback')} · {incoming.length}</button>}
        {[...api.book.proposals].reverse().map(p => { const open = pendingCount(p); return <button key={p.id} type="button" aria-pressed={false} onClick={() => setSelected(p.id)} data-review-proposal={p.id}
          className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-hover">
          <span className="min-w-0 flex-1"><span className="block truncate text-secondary text-ink">{p.title}</span><span className="block truncate text-caption text-ink-3">{origin(p)} · {new Date(p.at).toLocaleString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></span>
          <span className={cn('shrink-0 text-caption', open ? 'text-ink' : 'text-ink-3')}>{p.operations.length ? (open ? t(`${open} 处待审`, `${open} to review`) : t('已处理', 'Settled')) : p.promotion ? ({ pending: t('待认可', 'Awaiting approval'), 'approved-scope': t('已认可', 'Approved'), rejected: t('已拒绝', 'Rejected') }[p.promotion.decision]) : ''}</span>
        </button> })}
        {!api.book.proposals.length && !seed && <p className="px-3 py-6 text-center text-secondary text-ink-3">{t('还没有待审的修改。Agent 在对话里提出的稿件修改、PDF 批注与画布反馈会出现在这里。', 'No changes to review yet. Manuscript edits the agent proposes in chat, PDF annotations and canvas feedback appear here.')}</p>}
      </nav>}
      {!proposal && seed && <fieldset disabled={busy || !api.book || api.auditUncertain} className="space-y-3">
        <legend className="font-display">{t('形成局部提案', 'Compose a local proposal')}</legend>
        {incoming.length > 1 && <select aria-label={t('反馈来源', 'Feedback source')} className="ui-input w-full" value={seed.id} onChange={e => {
          if ((operations.length || title || body || after || reason) && !window.confirm(t('放弃当前尚未保存的提案表单？原反馈仍保留。', 'Discard this unsaved proposal form? Original feedback remains.'))) return
          setFeedbackId(e.target.value); setOperations([]); setTitle(''); setAfter(''); previousSeed.current = ''
        }}>{incoming.map(i => <option key={i.id} value={i.id}>{i.anchor.path} · {i.anchor.quote.slice(0, 50)}</option>)}</select>}
        <p className="break-all text-caption">{seed.anchor.kind} · {seed.anchor.path} · {seed.anchor.digest}</p>
        <blockquote className="whitespace-pre-wrap text-secondary">{seed.anchor.quote}</blockquote>
        <Button size="xs" onClick={() => void call(() => openFeedbackAnchor(seed.anchor, scope))}>{t('核对并返回来源', 'Verify and return to source')}</Button>
        <div className="block text-secondary"><label htmlFor={`${tabId}-review-body`}>{t('原始反馈', 'Original feedback')}</label><textarea id={`${tabId}-review-body`} required className="ui-input mt-1 w-full" value={body} onChange={e => setBody(e.target.value)}/></div>
        <label className="block text-secondary">{t('提案标题', 'Proposal title')}<input required className="ui-input mt-1 w-full" value={title} onChange={e => setTitle(e.target.value)}/></label>
        <p className="text-caption">{t('以下建议由操作者填写；没有伪造 Agent 生成或自动语义映射。', 'The operator authors these suggestions. No Agent generation or automatic semantic mapping is claimed.')}</p>
        <div className="space-y-2 rounded-lg border border-line p-3">
          <label>{t('修改目标类型', 'Target type')}<select className="ui-input ml-2" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setSource(null) }}>
            <option value="text">{t('源码／文本片段', 'Source/text range')}</option><option value="canvas">{t('画布卡片字段', 'Canvas card field')}</option><option value="block">{t('论文／演示／分镜内容块', 'Paper/slide/storyboard block')}</option>
          </select></label>
          {kind === 'text' && <label className="block">{t('目标相对路径（须显式确认）', 'Target relative path (explicit confirmation required)')}<input className="ui-input mt-1 w-full" value={path} onChange={e => {setPath(e.target.value); setSource(null)}}/></label>}
          <Button onClick={() => void call(loadSource)}>{t('读取当前基线', 'Load baseline')}</Button>
          {source && <>
            <p className="break-all text-caption">{sourcePath} · {source.digest}</p>
            {kind === 'text' && seed.anchor.kind === 'pdf' && <p role="status" className="text-caption">{t('PDF 位置不是源码语义映射；请在当前源码中明确选择修改范围。', 'PDF position is not a semantic source mapping. Select the intended range in current source explicitly.')}</p>}
            {kind === 'text' ? <div className="block text-secondary"><label htmlFor={`${tabId}-review-range`}>{t('在原始文本中选择要修改的片段', 'Select the exact range in raw text')}</label><textarea id={`${tabId}-review-range`} readOnly rows={6} className="ui-input mt-1 w-full font-mono" value={source.content} onSelect={e => setRange({start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd})}/></div>
              : <select aria-label={t('目标字段', 'Target field')} className="ui-input w-full" value={choice} onChange={e => {setChoice(e.target.value); setAfter('')}}>{choices.map((c, i) => <option key={i} value={i}>{c.title}</option>)}</select>}
            <p className="text-caption">{t('修改前', 'Before')}</p><pre className="whitespace-pre-wrap break-words text-secondary">{before}</pre>
            <div className="block text-secondary"><label htmlFor={`${tabId}-review-after`}>{t('修改后（该目标字段的完整值）', 'After (complete value of this field)')}</label><textarea id={`${tabId}-review-after`} rows={4} className="ui-input mt-1 w-full" value={after} onChange={e => setAfter(e.target.value)}/></div>
            <div className="block text-secondary"><label htmlFor={`${tabId}-review-reason`}>{t('理由与依据解释', 'Rationale and evidence explanation')}</label><textarea id={`${tabId}-review-reason`} className="ui-input mt-1 w-full" value={reason} onChange={e => setReason(e.target.value)}/></div>
            {operations.map(o => <label key={o.id} className="flex gap-2 text-caption"><input type="checkbox" checked={depends.includes(o.id)} onChange={e => setDepends(v => e.target.checked ? [...v, o.id] : v.filter(i => i !== o.id))}/>{t('依赖操作', 'Depends on')} {o.id} · {o.target.path}</label>)}
            <div className="block text-secondary"><label htmlFor={`${tabId}-review-impact`}>{t('额外待检查对象（每行一个，不自动修改）', 'Additional affected objects (one per line; no automatic edits)')}</label><textarea id={`${tabId}-review-impact`} className="ui-input mt-1 w-full" value={impact} onChange={e => setImpact(e.target.value)}/></div>
            <Button onClick={() => void call(addOperation)}>{t('加入待审阅操作', 'Add operation for review')}</Button>
          </>}
        </div>
        {operations.map((o, i) => <p key={o.id} className="break-all text-caption">{i + 1}. {o.id} · {o.target.kind} · {o.target.path} · {o.reason}</p>)}
        <label className="flex gap-2"><input type="checkbox" checked={promotion} onChange={e => setPromotion(e.target.checked)}/>{t('包含项目知识晋升范围审查', 'Include knowledge-promotion scope review')}</label>
        {promotion && <div className="space-y-2">
          <p>{t('仅审查以下范围；通过也不自动写全局知识库。', 'Review this scope only; approval does not write global knowledge.')}</p>
          <div className="block"><label htmlFor={`${tabId}-review-kscope`}>{t('目标知识范围', 'Target knowledge scope')}</label><textarea id={`${tabId}-review-kscope`} className="ui-input w-full" value={knowledgeScope} onChange={e => setKnowledgeScope(e.target.value)}/></div>
          <div className="block"><label htmlFor={`${tabId}-review-conds`}>{t('适用条件与限制', 'Conditions and limitations')}</label><textarea id={`${tabId}-review-conds`} className="ui-input w-full" value={conditions} onChange={e => setConditions(e.target.value)}/></div>
          <div className="block"><label htmlFor={`${tabId}-review-verif`}>{t('验证状态与待核验项', 'Verification state and remaining checks')}</label><textarea id={`${tabId}-review-verif`} className="ui-input w-full" value={verification} onChange={e => setVerification(e.target.value)}/></div>
        </div>}
        <Button variant="solid" disabled={!title.trim() || !body.trim() || (!operations.length && !promotion)} onClick={() => void call(saveProposal)}>{t('保存提案供审阅（不应用）', 'Save proposal for review (do not apply)')}</Button>
      </fieldset>}

      {proposal && <article className="space-y-4" data-review-detail={proposal.id}>
        <header>
          <p className="text-caption uppercase tracking-[0.08em] text-ink-3">{origin(proposal)} · {proposal.author}</p>
          <h2 className="mt-1 font-display text-[20px] leading-snug tracking-tight">{proposal.title}</h2>
          {proposal.feedback.body && <p className="mt-1.5 whitespace-pre-wrap text-secondary text-ink-2">{proposal.feedback.body}</p>}
          {requiresContentReview(proposal) && <p role="status" className="mt-2 text-caption text-ink-2">{t('此记录属于迁移前版本，仅保留历史。请基于当前研究内容重新建立提案和确认。', 'This record belongs to the pre-migration version and remains historical. Create a new proposal and confirmation against the current research content.')}</p>}
        </header>
        {proposal.operations.map(o => { const state = stateOf(o); return <section key={o.id} className="overflow-hidden rounded-lg border border-line bg-panel" data-review-operation={o.id} data-operation-state={state}>
          <label className="flex items-center gap-2 border-b border-line px-3 py-2">
            <input type="checkbox" disabled={requiresContentReview(proposal)} checked={checked.includes(o.id)} onChange={e => { const group = dependencyClosure(proposal, [o.id]); setChecked(v => e.target.checked ? [...new Set([...v, ...group])] : v.filter(id => !group.includes(id))) }}/>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2" title={o.target.path}>{o.target.path}{'objectId' in o.target ? ` · ${o.target.field}` : ''}</span>
            <span className={cn('shrink-0 text-caption', state === 'review' ? 'text-ink' : 'text-ink-3')}>{stateLabel(state)}</span>
          </label>
          <div className="space-y-2 px-3 py-2.5">
            <p className="text-secondary text-ink-2">{o.reason}</p>
            <p className="whitespace-pre-wrap break-words rounded-md bg-inset px-2.5 py-2 font-mono text-[12.5px] leading-6" aria-label={t('前后差异', 'Before and after difference')} data-xgc-role="inline-diff">
              {wordDiff(o.before, o.after).map((seg, i) => seg.kind === 'same' ? <span key={i} className="text-ink-2">{seg.text}</span>
                : seg.kind === 'del' ? <del key={i} className="text-ink-3 decoration-ink-3">{seg.text}</del>
                : <ins key={i} className="rounded-sm bg-active text-ink no-underline">{seg.text}</ins>)}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {o.evidence.map((a, i) => <button key={i} type="button" title={`${a.path} @ ${a.digest}`} onClick={() => void call(() => openFeedbackAnchor(a, scope))} className="flex h-6 max-w-56 items-center gap-1 rounded-md border border-line px-1.5 text-caption text-ink-2 hover:bg-hover hover:text-ink"><span className="truncate">{evidenceLabel(a)}</span></button>)}
            </div>
            <details className="text-caption text-ink-3"><summary className="cursor-pointer">{t('详情', 'Details')}</summary>
              <p className="mt-1 break-all">{t('基于版本', 'Base revision')} · {o.baseDigest}</p>
              {'objectId' in o.target && <p className="break-all">{t('对象标识', 'Object identity')} · {o.target.objectId}{o.target.kind === 'block' ? ` / ${o.target.blockId} / ${o.target.artifact}` : ''}</p>}
              {o.dependsOn.length > 0 && <p className="break-all">{t('依赖组（整体审阅）', 'Dependency group (review together)')} · {o.dependsOn.join(', ')}</p>}
              <p>{t('可能受影响／待检查，不自动覆盖', 'Potential impact / review needed, not automatically overwritten')} · {o.impacts.length ? o.impacts.join(' · ') : t('未声明', 'none declared')}</p>
            </details>
          </div>
        </section> })}
        {proposal.operations.length > 0 && <fieldset disabled={busy || api.auditUncertain} className="sticky bottom-0 -mx-4 space-y-2 border-t border-line bg-app/95 px-4 py-3 backdrop-blur-0" data-xgc-role="review-actions">
          <div className="flex flex-wrap items-center gap-1">
            {surface === 'writing' && onConfirmDesign && !proposal.writing && <Button data-xgc-role="review-confirm-design" variant="solid" disabled={!checked.length || proposal.operations.filter(o => checked.includes(o.id)).some(o => o.target.kind !== 'canvas')} onClick={() => void call(async () => {
              selectedGroups(proposal, checked)
              await onConfirmDesign(proposal.id, checked, author)
              setPreview('')
            })}>{t('确认设计并准备改稿', 'Confirm design and prepare writing')}</Button>}
            {surface !== 'writing' && <Button data-xgc-role="review-apply" disabled={!checked.length} variant="solid" onClick={() => void call(async () => {
              selectedGroups(proposal, checked)
              if (!window.confirm(t('按所选范围进行真实条件写入？独立文件逐项处理，不是原子提交。', 'Write the selected changes with version checks? Independent files are sequential, not atomic.'))) return
              await api.action(e => e.run(proposal.id, checked, author, 'apply')); setPreview(''); setChecked([])
            })}>{checked.length ? t(`应用所选 · ${checked.length}`, `Apply selected · ${checked.length}`) : t('应用所选', 'Apply selected')}</Button>}
            <Button disabled={!checked.length} onClick={() => void call(previewSelected)}>{t('校验预览', 'Validate preview')}</Button>
            <span className="flex-1"/>
            <RightMore menu label={t('更多审阅操作', 'More review actions')}>
              {surface !== 'writing' && <Button size="xs" data-xgc-role="review-revert" disabled={!checked.length} onClick={() => void call(async () => {
                if (!window.confirm(t('撤回所选已应用改动？仅在保护条件仍满足时写入。', 'Recover selected applied changes only where recovery guards still match?'))) return
                await api.action(e => e.run(proposal.id, checked, author, 'revert')); setPreview(''); setChecked([])
              })}>{t('受保护撤回所选', 'Guarded recovery of selected')}</Button>}
              {!proposal.writing && <Button size="xs" disabled={!checked.length} onClick={() => setRejecting(true)}>{t('拒绝所选…', 'Reject selected…')}</Button>}
              <Button size="xs" onClick={() => void call(() => openFeedbackAnchor(proposal.feedback.anchor, scope))}>{t('返回被批注版本', 'Return to annotated version')}</Button>
            </RightMore>
          </div>
          {rejecting && !proposal.writing && <div className="flex items-center gap-1">
            <input autoFocus aria-label={t('拒绝理由', 'Rejection reason')} placeholder={t('拒绝理由（记入审阅记录）', 'Reason (recorded in the journal)')} className="ui-input h-8 min-w-0 flex-1" value={decisionReason} onChange={e => setDecisionReason(e.target.value)}/>
            <Button disabled={!checked.length || !decisionReason.trim()} onClick={() => void call(async () => { await api.action(e => e.reject(proposal.id, checked, author, decisionReason)); setRejecting(false); setDecisionReason(''); setChecked([]) })}>{t('拒绝', 'Reject')}</Button>
            <Button onClick={() => setRejecting(false)}>{t('取消', 'Cancel')}</Button>
          </div>}
          {surface === 'writing' && <p role="status" className="text-caption text-ink-3">{writingCopy[locale].reviewHint}</p>}
          {preview && <p role="status" className="whitespace-pre-wrap text-caption text-ink-2">{preview}</p>}
        </fieldset>}
        {(() => {
          // Plan ↔ manuscript: an applied source proposal that answered revision cards can close them and link the passage.
          const cards = answeredCards(proposal)
          const applied = api.book!.attempts.find(a => a.proposalId === proposal.id && a.mode === 'apply' && (a.outcome === 'applied' || a.outcome === 'observed-applied'))
          const text = proposal.operations.find(o => o.target.kind === 'text')
          if (!applied || !text) return null
          return <section className="space-y-1.5 rounded-lg bg-elevated px-3 py-2.5 text-caption" data-xgc-role="manuscript-applied">
            <p className="text-ink-2">{t(`源文件已写入 ${applied.path}。PDF 不会自动重新编译。`, `Source written to ${applied.path}. The PDF is not recompiled automatically.`)}</p>
            {cards.length > 0 && <Button size="xs" variant="outline" data-xgc-role="mark-answered" disabled={busy || marked[proposal.id]} onClick={() => void call(async () => {
              const result = await markAnswered(scope, cards, { path: text.target.path, digest: applied.afterDigest, quote: text.after })
              if (!result.ok) throw new Error(result.detail || result.reason)
              setMarked(v => ({ ...v, [proposal.id]: true }))
            })}>{marked[proposal.id] ? t(`已将 ${cards.length} 个修订项标为已修改`, `${cards.length} revision item(s) marked addressed`) : t(`将 ${cards.length} 个修订项标为已修改并链接段落`, `Mark ${cards.length} revision item(s) addressed and link the passage`)}</Button>}
          </section>
        })()}
        {proposal.promotion && <section className="space-y-2 rounded-lg border border-line p-3">
          <h3>{t('知识晋升范围审查；不执行全局写入', 'Knowledge scope review; no global write')}</h3>
          <p>{proposal.promotion.scope}</p><p>{proposal.promotion.conditions}</p><p>{proposal.promotion.verification}</p>
          <p role="status">{proposal.promotion.decision} · {proposal.promotion.decidedBy} · {proposal.promotion.decidedAt}</p>
          <Button disabled={busy || proposal.promotion.decision !== 'pending'} onClick={() => void call(() => api.action(e => e.decidePromotion(proposal.id, 'approved-scope', author)))}>{t('仅认可此审查范围', 'Approve this scope only')}</Button>
          <Button disabled={busy || proposal.promotion.decision !== 'pending'} onClick={() => void call(() => api.action(e => e.decidePromotion(proposal.id, 'rejected', author)))}>{t('拒绝晋升', 'Reject promotion')}</Button>
          {proposal.promotion.candidate && <div className="space-y-1 border-t border-line pt-2" data-xgc-role="promotion-candidate">
            <p className="text-caption text-ink-3">{t('候选知识', 'Knowledge candidate')} · {proposal.promotion.candidate.kind} · {proposal.promotion.candidate.evidence.map(e => `${e.workspace}/${e.path}`).join(', ')}</p>
            <p className="max-h-32 overflow-auto whitespace-pre-wrap text-caption">{proposal.promotion.candidate.body}</p>
            {proposal.promotion.approvalDigest && <p className="break-all text-caption text-ink-3">{t('认可指纹', 'Approval digest')} · {proposal.promotion.approvalDigest}</p>}
            {proposal.promotion.decision === 'approved-scope' && proposal.promotion.approvalDigest && <Button size="xs" variant="outline" data-xgc-role="apply-promotion" disabled={busy} onClick={() => void call(async () => {
              const receipt = await api.action(e => e.applyPromotion(proposal.id, applyKnowledgePromotion))
              setPromotionReceipts(v => ({ ...v, [proposal.id]: receipt }))
            })}>{t('写入全局知识库', 'Write to global knowledge')}</Button>}
            {promotionReceipts[proposal.id] && <p role="status" data-xgc-role="promotion-receipt" data-outcome={promotionReceipts[proposal.id].outcome} className="break-all text-caption">
              {promotionReceipts[proposal.id].outcome}{promotionReceipts[proposal.id].document ? ` · academic/${promotionReceipts[proposal.id].document!.path} @ ${promotionReceipts[proposal.id].document!.digest}` : ''}{promotionReceipts[proposal.id].detail ? ` · ${promotionReceipts[proposal.id].detail}` : ''}
            </p>}
          </div>}
        </section>}
        {api.book!.decisions.filter(d => d.proposalId === proposal.id).map(d => <p key={d.id} className="text-caption text-ink-3">{t('已拒绝', 'Rejected')} · {d.reason} · {d.actor}</p>)}
        {api.book!.notDispatched?.filter(d => d.proposalId === proposal.id).map(d => <p role="status" key={d.id} className="whitespace-pre-wrap text-caption">{d.mode} · {d.at} · {d.detail}</p>)}
        {/* 待核对的写入必须留在眼前；其余回执折叠为「写入记录」 */}
        {unresolved.map(a => <article key={a.id} className="space-y-2 rounded-lg bg-elevated p-3">
          <p className="break-all">{a.path} · {a.mode} · {stateLabel(a.outcome)}</p>
          <p className="break-all text-caption">{a.id} · {a.actor} · {a.at}</p>
          <p className="break-all text-caption">{a.beforeDigest} → {a.afterDigest || t('无已确认的写入版本', 'No confirmed write revision')}</p>
          <p className="break-all text-caption">{a.operationIds.join(', ')}</p>{a.detail && <p className="whitespace-pre-wrap text-caption">{a.detail}</p>}
          {['pending', 'uncertain'].includes(a.outcome) && <>
            <Button disabled={busy} onClick={() => void call(async () => { const r = await api.action(e => e.inspect(a.id)); if (r) setInspection(v => ({...v, [a.id]: r as {digest: string; match: string}})) })}>{t('读取并核对实际内容', 'Inspect actual content')}</Button>
            {inspection[a.id] && <><p>{inspection[a.id].match} · {inspection[a.id].digest}</p><Button disabled={busy || inspection[a.id].match === 'different'} onClick={() => void call(async () => {
              if (!window.confirm(t('确认当前内容匹配所示状态？这不证明由哪次请求写入；不会重试目标写入。', 'Confirm the observed content state? This does not prove which request wrote it and does not retry the write.'))) return
              await api.action(e => e.confirmObservation(a.id, inspection[a.id].digest, author))
            })}>{t('人工确认观察结果', 'Confirm observed state')}</Button></>}
          </>}
        </article>)}
        {records.length > 0 && <details className="text-caption text-ink-3" data-xgc-role="review-records"><summary className="cursor-pointer">{t('写入记录', 'Write records')} · {records.length}</summary>
          {records.map(a => <div key={a.id} className="mt-2 space-y-0.5 border-t border-line pt-2">
            <p className="text-ink-2">{a.path} · {a.mode} · {stateLabel(a.outcome)}</p>
            <p className="break-all">{a.at} · {a.actor}</p>
            <p className="break-all">{a.beforeDigest} → {a.afterDigest || t('无已确认的写入版本', 'No confirmed write revision')}</p>
            {a.detail && <p className="whitespace-pre-wrap">{a.detail}</p>}
          </div>)}
        </details>}
      </article>}
     </div>
    </div>
  </section>
}
