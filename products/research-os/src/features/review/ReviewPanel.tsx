import { observedFiles, subscribeObservations } from './file-observations'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '../../components/ui'
import { saveDownload } from '../../lib/api'
import { useWorkbench } from '../../store'
import { DRAFTS_PATH } from '../projects/draft-model'
import { useReview } from './useReview'
import { readReviewFile, captureTarget } from './review-api'
import { assertEditorClean } from './write-coordinator'
import { openFeedbackAnchor } from './review-navigation'
import { impactedDrafts, patchTarget, targetChoices, targetValue } from './review-targets'
import { check, dependencyClosure, now, operationState, REVIEW_PATH, scopeKey, selectedGroups, uid, validPath, type FileRecord, type Operation, type Proposal, type Scope, type Target } from './review-model'

/** Review is a product surface. Diff previews never update the recorded write outcome. */
export function ReviewPanel({scope, tabId, onTitle}: {scope: Scope; tabId: string; onTitle: (title: string) => void}) {
  const {locale, reviewIntents, consumeReviewFeedback} = useWorkbench(), zh = locale === 'zh'
  const t = (cn: string, en: string) => zh ? cn : en
  const observations=useSyncExternalStore(subscribeObservations,observedFiles).filter(o=>scopeKey(o)===scopeKey(scope))
  const incoming = reviewIntents.filter(i => scopeKey(i.scope) === scopeKey(scope))
  const [feedbackId, setFeedbackId] = useState(''), [selected, setSelected] = useState('')
  const seed = incoming.find(i => i.id === feedbackId) || incoming[0]
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [author, setAuthor] = useState('researcher')
  const [operations, setOperations] = useState<Operation[]>([]), [localError, setLocalError] = useState('')
  const [kind, setKind] = useState<'text' | 'canvas' | 'block'>('text'), [path, setPath] = useState('')
  const [source, setSource] = useState<FileRecord | null>(null), [choice, setChoice] = useState('0'), [range, setRange] = useState({start: 0, end: 0})
  const [after, setAfter] = useState(''), [reason, setReason] = useState(''), [depends, setDepends] = useState<string[]>([]), [impact, setImpact] = useState('')
  const [checked, setChecked] = useState<string[]>([]), [decisionReason, setDecisionReason] = useState(''), [preview, setPreview] = useState('')
  const [inspection, setInspection] = useState<Record<string, {digest: string; match: string}>>({})
  const [promotion, setPromotion] = useState(false), [conditions, setConditions] = useState(''), [knowledgeScope, setKnowledgeScope] = useState(''), [verification, setVerification] = useState('unverified')
  const [reading, setReading] = useState(false)
  const api = useReview(scope, tabId, !!(title || body || operations.length || after || reason || conditions || knowledgeScope))
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
  useEffect(() => { setChecked([]); setPreview(''); setInspection({}) }, [selected])
  const proposal = api.book?.proposals.find(p => p.id === selected)
  const busy = api.busy || reading
  const call = async (fn: () => Promise<unknown>) => { setLocalError(''); try { await fn() } catch (e) { setLocalError(e instanceof Error ? e.message : String(e)) } }
  const sourcePath = kind === 'canvas' ? 'thinking.canvas.json' : kind === 'block' ? DRAFTS_PATH : path
  let choices: ReturnType<typeof targetChoices> = []
  try { if (source && kind !== 'text') choices = targetChoices(source.content, kind, scope) } catch { /* Load reports validation errors. */ }
  const target: Target | undefined = !source ? undefined : kind === 'text' ? {kind, workspace: scope.workspace, path: sourcePath, ...range} : choices[Number(choice)]?.target
  let before = ''
  try { if (target && source) before = targetValue(source.content, target, scope) } catch { /* A range has not yet been selected. */ }
  const loadSource = async () => {
    check(validPath(sourcePath), 'Choose a relative research file path.')
    assertEditorClean(scope.workspace, sourcePath); setReading(true)
    try {
      const r = await readReviewFile(scope.workspace, sourcePath)
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
    try { related = impactedDrafts((await readReviewFile(scope.workspace, DRAFTS_PATH)).content, scope, target) } catch { /* No inference from missing relationships. */ }
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
      assertEditorClean(scope.workspace, path); const r = await readReviewFile(scope.workspace, path)
      check(ops.every(o => o.baseDigest === r.digest), `Baseline changed: ${path}`)
      patchTarget(r.content, ops, scope); lines.push(`${path} · ${r.digest}`)
    }
    setPreview(`${t('仅预览通过，未写入任何目标文件', 'Preview only; no target file was written')}\n${lines.join('\n')}`)
  }
  const stateLabel = (value: string) => ({review: t('待审阅', 'Review'), applied: t('已写入', 'Applied'), reverted: t('已受保护撤回', 'Reverted'), uncertain: t('结果待核对，禁止盲目重试', 'Uncertain; inspect before retry'), conflict: t('版本冲突', 'Conflict'), rejected: t('已拒绝', 'Rejected'), 'not-written': t('未写入', 'Not written'), pending: t('写入意图已登记／结果待核对', 'Intent recorded / outcome unresolved'), 'observed-applied': t('人工确认当前匹配修改后内容', 'Confirmed matching after content'), 'observed-not-written': t('人工确认当前匹配基线', 'Confirmed matching baseline') }[value] || value)

  return <section className="flex h-full min-h-0 flex-col" aria-label={t('反馈与修改审阅', 'Feedback and change review')} data-review-project={scope.projectId}>
    <div className="flex h-9 shrink-0 items-center gap-1 px-2">
      <span className="min-w-0 flex-1 truncate text-caption">{scope.projectId} · {t('修改审阅', 'Change review')}</span>
      <Button size="xs" disabled={busy} onClick={() => void call(() => api.action(e => e.load()))}>{t('重新读取记录', 'Reload journal')}</Button>
      <Button size="xs" disabled={!api.book} onClick={() => saveDownload(`${scope.projectId}-review-evidence.json`, {book: api.book, transient: api.transient, error: api.error})}>{t('导出记录', 'Export record')}</Button>
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
      <p className="break-all text-caption text-ink-3">{scope.workspace}/{REVIEW_PATH}</p>
      <p className="text-secondary">{t('预览、目标写入、回执保存分别记录；跨文件不是原子事务。', 'Preview, target writes and journal acknowledgements are separate. Cross-file writes are not atomic.')}</p>
      {(api.error || localError) && <p role="alert" className="whitespace-pre-wrap text-secondary">{localError || api.error}</p>}
      {api.auditUncertain && <p role="alert">{t('回执未确认：停止后续写入，导出记录后重新读取并核对。', 'Journal unconfirmed: stop writes, export the record, reload and inspect.')}</p>}
      {api.transient && <pre className="whitespace-pre-wrap break-all text-caption">{JSON.stringify(api.transient, null, 2)}</pre>}
      {!api.book && <p role="status">{busy ? t('读取中…', 'Loading…') : t('记录尚不可用。', 'Journal unavailable.')}</p>}
      <label className="block text-secondary">{t('操作者（本地记录身份，不是身份认证）', 'Actor (local record label, not authentication)')}<input className="ui-input mt-1 w-full" value={author} onChange={e => setAuthor(e.target.value)}/></label>
      {observations.length>0&&<details className="text-caption"><summary>{t('本次页面会话的真实保存观察（非完整版本历史）','Acknowledged saves in this page session (not full version history)')}</summary>
        {observations.map(o=><p key={o.id} className="mt-1 break-all">{o.at} · {o.origin} · {o.path} · {o.beforeDigest||'—'} → {o.afterDigest} · {o.semantic?t('内容可能影响关联制品，需检查','Content may affect related artifacts; review needed'):t('仅视觉布局变化，不提示语义影响','Layout-only change; no semantic impact inferred')}</p>)}
        <Button size="xs" onClick={()=>saveDownload(`${scope.projectId}-save-observations.json`,observations)}>{t('导出保存观察','Export save observations')}</Button>
      </details>}
      <nav aria-label={t('已保存提案', 'Saved proposals')} className="space-y-1">
        {api.book?.proposals.map(p => <Button key={p.id} aria-pressed={p.id === selected} onClick={() => setSelected(p.id)}>{p.title}</Button>)}
        {seed && <Button aria-pressed={!selected} onClick={() => setSelected('')}>{t('待保存的反馈', 'Unsaved feedback')} · {incoming.length}</Button>}
      </nav>
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
      {!proposal && !seed && <p>{t('从阅读选区、PDF 批注、画布卡片或制品字段发起反馈。', 'Start feedback from a reading selection, PDF annotation, canvas card or artifact field.')}</p>}
      {proposal && <div className="space-y-3">
        <h2 className="font-display text-lg">{proposal.title}</h2>
        <p className="break-all text-caption">{proposal.id} · {proposal.author} · {proposal.at}</p>
        <blockquote className="whitespace-pre-wrap">{proposal.feedback.body}</blockquote>
        <Button size="xs" onClick={() => void call(() => openFeedbackAnchor(proposal.feedback.anchor, scope))}>{t('返回被批注版本', 'Return to annotated version')}</Button>
        {proposal.operations.map(o => <article key={o.id} className="space-y-2 rounded-lg border border-line p-3" data-review-operation={o.id}>
          <label className="flex items-start gap-2"><input type="checkbox" checked={checked.includes(o.id)} onChange={e => { const group = dependencyClosure(proposal, [o.id]); setChecked(v => e.target.checked ? [...new Set([...v, ...group])] : v.filter(i => !group.includes(i))); setPreview('') }}/><span className="min-w-0 break-all">{o.target.kind} · {o.target.path} · {'field' in o.target ? o.target.field : `${o.target.start}–${o.target.end}`}</span></label>
          <p role="status">{stateLabel(operationState(api.book!, proposal.id, o.id))}</p>
          {'objectId' in o.target && <p className="break-all text-caption">{t('对象标识', 'Object identity')} · {o.target.objectId}{o.target.kind === 'block' ? ` / ${o.target.blockId} / ${o.target.artifact}` : ''}</p>}
          <p className="break-all text-caption">{t('基于版本', 'Base revision')} · {o.baseDigest}</p>
          <p>{o.reason}</p>
          <div className="space-y-2" aria-label={t('前后差异', 'Before and after difference')}>
            <div><strong>{t('修改前', 'Before')}</strong><pre className="whitespace-pre-wrap break-words">{o.before || '∅'}</pre></div>
            <div><strong>{t('修改后', 'After')}</strong><pre className="whitespace-pre-wrap break-words">{o.after || '∅'}</pre></div>
          </div>
          {o.evidence.map((a, i) => <details key={i}><summary>{t('依据', 'Evidence')} · {a.path}</summary><p className="break-all">{a.digest}</p><blockquote className="whitespace-pre-wrap">{a.quote}</blockquote><Button size="xs" onClick={() => void call(() => openFeedbackAnchor(a, scope))}>{t('核对来源', 'Verify source')}</Button></details>)}
          {o.dependsOn.length > 0 && <p className="break-all text-caption">{t('依赖组（整体审阅）', 'Dependency group (review together)')} · {o.dependsOn.join(', ')}</p>}
          <p className="text-caption">{t('可能受影响／待检查，不自动覆盖', 'Potential impact / review needed, not automatically overwritten')} · {o.impacts.length ? o.impacts.join(' · ') : t('未声明可确认的关联', 'No confirmed relationship declared')}</p>
        </article>)}
        {proposal.operations.length > 0 && <fieldset disabled={busy || api.auditUncertain} className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <Button disabled={!checked.length} onClick={() => void call(previewSelected)}>{t('校验预览（不写入）', 'Validate preview (no writes)')}</Button>
            <Button disabled={!checked.length} variant="solid" onClick={() => void call(async () => {
              selectedGroups(proposal, checked)
              if (!window.confirm(t('按所选范围进行真实条件写入？独立文件逐项处理，不是原子提交。', 'Write the selected changes with version checks? Independent files are sequential, not atomic.'))) return
              await api.action(e => e.run(proposal.id, checked, author, 'apply')); setPreview('')
            })}>{t('应用所选范围', 'Apply selected scope')}</Button>
            <Button disabled={!checked.length} onClick={() => void call(async () => {
              if (!window.confirm(t('撤回所选已应用改动？仅在保护条件仍满足时写入。', 'Recover selected applied changes only where recovery guards still match?'))) return
              await api.action(e => e.run(proposal.id, checked, author, 'revert')); setPreview('')
            })}>{t('受保护撤回', 'Guarded recovery')}</Button>
          </div>
          <label className="block">{t('拒绝理由', 'Rejection reason')}<input className="ui-input mt-1 w-full" value={decisionReason} onChange={e => setDecisionReason(e.target.value)}/></label>
          <Button disabled={!checked.length || !decisionReason.trim()} onClick={() => void call(() => api.action(e => e.reject(proposal.id, checked, author, decisionReason)))}>{t('拒绝所选组', 'Reject selected group')}</Button>
          {preview && <p role="status" className="whitespace-pre-wrap">{preview}</p>}
        </fieldset>}
        {proposal.promotion && <section className="space-y-2 rounded-lg border border-line p-3">
          <h3>{t('知识晋升范围审查；不执行全局写入', 'Knowledge scope review; no global write')}</h3>
          <p>{proposal.promotion.scope}</p><p>{proposal.promotion.conditions}</p><p>{proposal.promotion.verification}</p>
          <p role="status">{proposal.promotion.decision} · {proposal.promotion.decidedBy} · {proposal.promotion.decidedAt}</p>
          <Button disabled={busy || proposal.promotion.decision !== 'pending'} onClick={() => void call(() => api.action(e => e.decidePromotion(proposal.id, 'approved-scope', author)))}>{t('仅认可此审查范围', 'Approve this scope only')}</Button>
          <Button disabled={busy || proposal.promotion.decision !== 'pending'} onClick={() => void call(() => api.action(e => e.decidePromotion(proposal.id, 'rejected', author)))}>{t('拒绝晋升', 'Reject promotion')}</Button>
        </section>}
        {api.book!.decisions.filter(d => d.proposalId === proposal.id).map(d => <p key={d.id} className="text-caption">{t('拒绝记录', 'Rejection record')} · {d.actor} · {d.at} · {d.reason} · {d.operationIds.join(', ')}</p>)}
        {api.book!.notDispatched?.filter(d => d.proposalId === proposal.id).map(d => <p role="status" key={d.id} className="whitespace-pre-wrap text-caption">{d.mode} · {d.at} · {d.detail}</p>)}
        {api.book!.attempts.filter(a => a.proposalId === proposal.id).map(a => <article key={a.id} className="space-y-2 rounded-lg bg-elevated p-3">
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
      </div>}
    </div>
  </section>
}
