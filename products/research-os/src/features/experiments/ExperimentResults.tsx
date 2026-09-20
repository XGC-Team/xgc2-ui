import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { experimentPhase, parseLatestDigests, parseResultBundle, parseVerificationPlan, resultPaths, scientificStatus, type ResultBundle, type ResultInspection, type ResultUse } from './experiment-model'
import { captureSession, inspectResult, listAffectedUses } from './experiment-api'
import { readWorkspaceFile, writeWorkspaceFile, type WorkspaceFile } from '../artifacts/artifact-api'
import type { DraftScope, ResearchDraft } from '../projects/draft-model'

type Props = { scope: DraftScope; draft: ResearchDraft; saved: boolean; locale: 'zh' | 'en' }
export function ExperimentResults(props: Props) {
  return <ExperimentResultsInstance key={JSON.stringify([props.scope.projectId, props.scope.workspace, props.draft.id])} {...props} />
}
function ExperimentResultsInstance({ scope, draft, saved, locale }: Props) {
  const zh = locale === 'zh', label = (cn: string, en: string) => zh ? cn : en
  const paths = resultPaths(draft.id)
  const [stationId, setStationId] = useState(''), [targetId, setTargetId] = useState(''), [sessionId, setSessionId] = useState('')
  const [planText, setPlanText] = useState(''), [bundleText, setBundleText] = useState(''), [latestText, setLatestText] = useState('')
  const [bundle, setBundle] = useState<ResultBundle | null>(null)
  const [inspection, setInspection] = useState<ResultInspection | null>(null), [uses, setUses] = useState<ResultUse[]>([])
  const [observed, setObserved] = useState<{ plan: WorkspaceFile | null; bundle: WorkspaceFile | null } | null>(null)
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [revision, setRevision] = useState(0)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const operation = useRef<AbortController | null>(null)
  useEffect(() => () => operation.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    setObserved(null); setInspection(null); setUses([]); setBundle(null); setError(''); setNotice('')
    void Promise.all([readWorkspaceFile(scope.workspace, paths.plan, controller.signal), readWorkspaceFile(scope.workspace, paths.bundle, controller.signal)])
      .then(([plan, result]) => {
        if (controller.signal.aborted) return
        setPlanText(plan?.content || ''); setBundleText(result?.content || ''); setObserved({ plan, bundle: result }); setUncertain(false)
        // Preserve invalid original text for explicit repair; do not synthesize a plan/bundle.
        if (plan) parseVerificationPlan(plan.content)
        if (result) setBundle(parseResultBundle(result.content, scope))
      }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)) })
    return () => controller.abort()
  }, [revision])
  const invalidate = () => { setInspection(null); setUses([]); setNotice('') }
  const run = async (action: 'save' | 'capture' | 'inspect' | 'affected') => {
    if (!saved || operation.current || (action === 'save' && (!observed || uncertain))) return
    const controller = new AbortController(); operation.current = controller
    setBusy(true); setError(''); invalidate()
    try {
      if (action === 'capture') {
        const result = await captureSession(stationId.trim(), targetId.trim(), sessionId.trim())
        if (!controller.signal.aborted) setNotice(`${result.State || 'captured'} · ${result.Reference.sessionId}`)
        return
      }
      const nextBundle = parseResultBundle(bundleText, scope)
      const nextPlan = action === 'affected' ? null : parseVerificationPlan(planText)
      setBundle(nextBundle)
      if (action === 'save' && observed) {
        const planContent = planText.endsWith('\n') ? planText : `${planText}\n`
        const bundleContent = bundleText.endsWith('\n') ? bundleText : `${bundleText}\n`
        const planReceipt = await writeWorkspaceFile(scope.workspace, paths.plan, planContent, observed.plan?.digest, controller.signal)
        if (controller.signal.aborted) return
        const savedPlan = { content: planContent, digest: planReceipt.digest }
        setObserved({ ...observed, plan: savedPlan })
        setNotice(label('计划已保存；引用包尚未取得保存回执。', 'Plan saved; bundle save is not yet acknowledged.'))
        const bundleReceipt = await writeWorkspaceFile(scope.workspace, paths.bundle, bundleContent, observed.bundle?.digest, controller.signal)
        if (controller.signal.aborted) return
        setObserved({ plan: savedPlan, bundle: { content: bundleContent, digest: bundleReceipt.digest } })
        setNotice(label('计划与引用包分别取得 CAS 回执；没有执行实验或声称科学通过。', 'Plan and bundle each have a CAS receipt; no experiment was executed or scientific success claimed.'))
      } else if (action === 'inspect' && nextPlan) {
        const result = await inspectResult(nextPlan, nextBundle)
        if (!controller.signal.aborted) setInspection(result)
      } else if (action === 'affected') {
        const result = await listAffectedUses(nextBundle, parseLatestDigests(latestText, nextBundle))
        if (!controller.signal.aborted) setUses(result)
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(`${String(reason)}${action === 'save' ? label(' 保存可能部分完成；重新读取后再操作，不会自动覆盖或重试。', ' Save may be partial; reload before retrying. No automatic overwrite or retry.') : ''}`)
        if (action === 'save') setUncertain(true)
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      if (operation.current === controller) operation.current = null
    }
  }
  const phase = experimentPhase(bundle, inspection)
  return <section className="space-y-2" data-experiment-results={draft.id} data-experiment-phase={phase} data-scientific-status={scientificStatus(inspection)} data-page-open-start="never">
    <h3 className="text-secondary text-ink-2">{label('实验结果回流', 'Experiment result tracing')}</h3>
    <p className="text-caption text-ink-3">{label('只引用已有 Session / Record / Artifact。打开本页不 Start、不控制机器人，也不把草稿当运行。原件权限和解析由原 owner 提供。', 'References existing Session / Record / Artifact only. Opening the page never Starts or controls robots or treats a draft as a run. Original permissions and resolution belong to the archive owner.')}</p>
    <p role="status">{phase} · {label('科学验证：未声称', 'Scientific validation: not claimed')}</p>
    {!saved && <p role="status">{label('先保存实验需求草稿。', 'Save the experiment requirement draft first.')}</p>}
    <fieldset disabled={busy} className="space-y-2">
      <label className="block">{label('地面站 ID', 'Station ID')}<input className="ui-input mt-1 w-full" value={stationId} onChange={event => setStationId(event.target.value)} /></label>
      <label className="block">{label('执行目标 ID', 'Target ID')}<input className="ui-input mt-1 w-full" value={targetId} onChange={event => setTargetId(event.target.value)} /></label>
      <label className="block">Session ID<input className="ui-input mt-1 w-full" value={sessionId} onChange={event => setSessionId(event.target.value)} /></label>
      <Button size="xs" disabled={!saved || busy || !stationId.trim() || !targetId.trim() || !sessionId.trim()} onClick={() => void run('capture')}>{label('读取已有 Session（不启动）', 'Read existing Session (no start)')}</Button>
      <label className="block">{label('冻结验证计划 JSON', 'Frozen verification plan JSON')}<textarea className="ui-input mt-1 w-full font-mono" rows={8} value={planText} onChange={event => { setPlanText(event.target.value); invalidate() }} /></label>
      <label className="block">{label('结果引用包 JSON', 'Result reference bundle JSON')}<textarea className="ui-input mt-1 w-full font-mono" rows={10} value={bundleText} onChange={event => { setBundleText(event.target.value); setBundle(null); invalidate() }} /></label>
      <label className="block">{label('当前授权 digest 图 JSON（空值仅比较本包原文）', 'Authorized current digest map JSON (empty compares this bundle only)')}<textarea className="ui-input mt-1 w-full font-mono" rows={4} value={latestText} onChange={event => { setLatestText(event.target.value); setUses([]) }} /></label>
    </fieldset>
    <div className="flex flex-wrap gap-1">
      <Button size="xs" disabled={!saved || busy || !observed || uncertain} onClick={() => void run('save')}>{label('保存计划与引用包', 'Save plan and bundle')}</Button>
      <Button size="xs" variant="solid" disabled={!saved || busy || !planText.trim() || !bundleText.trim()} onClick={() => void run('inspect')}>{label('核对原文与成员边', 'Inspect originals and member edges')}</Button>
      <Button size="xs" disabled={!saved || busy || !bundleText.trim()} onClick={() => void run('affected')}>{label('列出受影响直接对象', 'List directly affected objects')}</Button>
      <Button size="xs" disabled={busy} onClick={() => setRevision(value => value + 1)}>{label('重新读取保存版本', 'Reload saved versions')}</Button>
    </div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="break-words">{error}</p>}
    {inspection && <div className="space-y-1">
      <h4>{label('原文核对条目', 'Original-byte inspection items')}</h4>
      <p>referencesVerified={String(inspection.referencesVerified)} · missing={inspection.missingRoles.join(',') || 'none'}</p>
      {inspection.recordingProblem && <p>{inspection.recordingProblem}</p>}
      {inspection.items.map(item => <p key={item.source.artifact.artifactId} className="break-all">{item.source.artifact.artifactId} · {item.status}{item.reason ? ` · ${item.reason}` : ''}</p>)}
    </div>}
    {uses.length > 0 && <div className="space-y-1">
      <h4>{label('受影响对象（供知识／设计 owner 继续传播）', 'Affected objects (for knowledge/design owners to propagate)')}</h4>
      {uses.map(use => <p key={`${use.kind}:${use.objectId}:${use.digest}`} className="break-all">{use.kind} · {use.objectId} · {use.digest}</p>)}
    </div>}
  </section>
}
