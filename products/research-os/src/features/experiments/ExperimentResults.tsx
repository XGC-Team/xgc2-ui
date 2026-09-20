import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { experimentPhase, parseLatestDigests, parseResultBundle, parseVerificationPlan, resultPaths, scientificStatus, type ExperimentPhase, type ResultBundle, type ResultInspection, type ResultUse, type VerificationPlan } from './experiment-model'
import { captureSession, inspectResult, listAffectedUses } from './experiment-api'
import { readWorkspaceFile, writeWorkspaceFileCas } from '../artifacts/artifact-api'
import type { DraftScope, ResearchDraft } from '../projects/draft-model'

const copy = {
  zh: {
    title: '实验结果回流',
    boundary: '这里只引用已有 Session / Record / Artifact。打开本页不会 Start、不会控制机器人、也不会把草稿当成一次运行。',
    requirement: '仍是实验需求草稿',
    referenced: '已引用冻结 Session，尚未完成原文核对',
    inspected: '已完成引用与原文核对（不是科学通过）',
    scientific: '科学验证：未声称',
    station: '地面站 ID',
    target: '执行目标 ID',
    session: 'Session ID',
    capture: '读取已有 Session（不启动）',
    plan: '冻结验证计划 JSON',
    bundle: '结果引用包 JSON',
    latest: '当前授权 digest 图 JSON（可空则只比对本包内原文）',
    save: '保存计划与引用包',
    inspect: '核对原文与成员边',
    affected: '列出受影响直接对象',
    unsaved: '请先保存实验需求草稿。',
    missing: '缺少计划或结果引用，无法核对。',
    uses: '受影响对象（供知识/设计 owner 继续传播）',
    items: '原文核对条目',
  },
  en: {
    title: 'Experiment result tracing',
    boundary: 'This page only references an existing Session / Record / Artifact. Opening it does not Start, control robots, or treat the draft as a run.',
    requirement: 'Experiment requirement draft only',
    referenced: 'Frozen Session referenced; original bytes not inspected yet',
    inspected: 'Reference and original-byte inspection completed (not scientific success)',
    scientific: 'Scientific verification: not claimed',
    station: 'Station ID',
    target: 'Execution target ID',
    session: 'Session ID',
    capture: 'Read existing Session (does not start)',
    plan: 'Frozen verification plan JSON',
    bundle: 'Result reference bundle JSON',
    latest: 'Authorized current digest map JSON (empty compares against this bundle only)',
    save: 'Save plan and bundle',
    inspect: 'Inspect original bytes and member edges',
    affected: 'List directly affected objects',
    unsaved: 'Save the experiment requirement draft first.',
    missing: 'A plan and result bundle are required before inspection.',
    uses: 'Affected objects (for the knowledge/design owners to propagate)',
    items: 'Original-byte inspection items',
  },
} as const

export function ExperimentResults({ scope, draft, saved, locale }: { scope: DraftScope; draft: ResearchDraft; saved: boolean; locale: 'zh' | 'en' }) {
  const text = copy[locale]
  const paths = resultPaths(draft.id)
  const [stationId, setStationId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [planText, setPlanText] = useState('')
  const [bundleText, setBundleText] = useState('')
  const [latestText, setLatestText] = useState('')
  const [bundle, setBundle] = useState<ResultBundle | null>(null)
  const [plan, setPlan] = useState<VerificationPlan | null>(null)
  const [inspection, setInspection] = useState<ResultInspection | null>(null)
  const [uses, setUses] = useState<ResultUse[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const phase: ExperimentPhase = experimentPhase(bundle, inspection)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const planFile = await readWorkspaceFile(scope.workspace, paths.plan, controller.signal)
      const bundleFile = await readWorkspaceFile(scope.workspace, paths.bundle, controller.signal)
      if (controller.signal.aborted) return
      if (planFile) {
        setPlanText(planFile.content)
        try { setPlan(parseVerificationPlan(planFile.content)) } catch { /* keep raw text; do not invent a plan */ }
      }
      if (bundleFile) {
        setBundleText(bundleFile.content)
        try { setBundle(parseResultBundle(bundleFile.content, scope)) } catch { /* keep raw text; do not invent a bundle */ }
      }
    })().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => controller.abort()
  }, [scope.projectId, scope.workspace, paths.plan, paths.bundle])

  const run = async (action: 'save' | 'capture' | 'inspect' | 'affected') => {
    setBusy(true); setError('')
    try {
      if (action === 'capture') {
        const observation = await captureSession(stationId.trim(), targetId.trim(), sessionId.trim())
        const next = bundleText.trim() ? parseResultBundle(bundleText, scope) : null
        setBundle(next)
        setError(`${observation.State || 'captured'} · ${observation.Reference.sessionId}`)
        return
      }
      const nextPlan = parseVerificationPlan(planText)
      const nextBundle = parseResultBundle(bundleText, scope)
      setPlan(nextPlan); setBundle(nextBundle)
      if (action === 'save') {
        await writeWorkspaceFileCas(scope.workspace, paths.plan, planText.endsWith('\n') ? planText : `${planText}\n`)
        await writeWorkspaceFileCas(scope.workspace, paths.bundle, bundleText.endsWith('\n') ? bundleText : `${bundleText}\n`)
        return
      }
      if (action === 'inspect') {
        setInspection(await inspectResult(nextPlan, nextBundle))
        return
      }
      setUses(await listAffectedUses(nextBundle, parseLatestDigests(latestText, nextBundle)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return <section className="space-y-2" data-experiment-results={draft.id} data-experiment-phase={phase} data-scientific-status={scientificStatus(inspection)} data-page-open-start="never">
    <h3 className="text-secondary text-ink-2">{text.title}</h3>
    <p className="text-caption text-ink-3">{text.boundary}</p>
    <p role="status" className="text-caption">{phase === 'inspected' ? text.inspected : phase === 'referenced' ? text.referenced : text.requirement} · {text.scientific}</p>
    {!saved && <p role="status" className="text-caption">{text.unsaved}</p>}
    <label className="block text-secondary">{text.station}<input className="ui-input mt-1 w-full" value={stationId} onChange={event => setStationId(event.target.value)} /></label>
    <label className="block text-secondary">{text.target}<input className="ui-input mt-1 w-full" value={targetId} onChange={event => setTargetId(event.target.value)} /></label>
    <label className="block text-secondary">{text.session}<input className="ui-input mt-1 w-full" value={sessionId} onChange={event => setSessionId(event.target.value)} /></label>
    <Button size="xs" disabled={!saved || busy || !stationId.trim() || !targetId.trim() || !sessionId.trim()} loading={busy} onClick={() => void run('capture')}>{text.capture}</Button>
    <label className="block text-secondary">{text.plan}<textarea className="ui-input mt-1 w-full font-mono" rows={8} value={planText} onChange={event => setPlanText(event.target.value)} /></label>
    <label className="block text-secondary">{text.bundle}<textarea className="ui-input mt-1 w-full font-mono" rows={10} value={bundleText} onChange={event => setBundleText(event.target.value)} /></label>
    <label className="block text-secondary">{text.latest}<textarea className="ui-input mt-1 w-full font-mono" rows={4} value={latestText} onChange={event => setLatestText(event.target.value)} /></label>
    <div className="flex flex-wrap gap-1">
      <Button size="xs" disabled={!saved || busy} loading={busy} onClick={() => void run('save')}>{text.save}</Button>
      <Button size="xs" variant="solid" disabled={!saved || busy || !planText.trim() || !bundleText.trim()} loading={busy} onClick={() => void run('inspect')}>{text.inspect}</Button>
      <Button size="xs" disabled={!saved || busy || !bundleText.trim()} loading={busy} onClick={() => void run('affected')}>{text.affected}</Button>
    </div>
    {!plan && !bundle && <p className="text-caption text-ink-3">{text.missing}</p>}
    {error && <p role="alert" className="break-words text-caption text-ink-3">{error}</p>}
    {inspection && <div className="space-y-1">
      <h4 className="text-caption">{text.items}</h4>
      <p className="text-caption">referencesVerified={String(inspection.referencesVerified)} · missing={inspection.missingRoles.join(',') || 'none'}</p>
      {inspection.recordingProblem && <p className="text-caption">{inspection.recordingProblem}</p>}
      {inspection.items.map(item => <p key={item.source.artifact.artifactId} className="break-all text-caption">{item.source.artifact.artifactId} · {item.status}{item.reason ? ` · ${item.reason}` : ''}</p>)}
    </div>}
    {uses.length > 0 && <div className="space-y-1">
      <h4 className="text-caption">{text.uses}</h4>
      {uses.map(use => <p key={`${use.kind}:${use.objectId}:${use.digest}`} className="break-all text-caption">{use.kind} · {use.objectId} · {use.digest.slice(0, 12)}</p>)}
    </div>}
  </section>
}
