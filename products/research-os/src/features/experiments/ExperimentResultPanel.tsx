import {useEffect, useState} from 'react'
import {projectResultInspection, type ResultScope, type ResultEvidenceView, type ResultUseView, type ResultView} from './result-model'

/** Pure read-only consumption. There is deliberately no Start, run, upload,
 * archive allocation or implicit knowledge-promotion action in this component.
 */
export function ExperimentResultPanel({scope, canonicalBundle, inspection, onOpenEvidence, onOpenUse}: {
  scope: ResultScope; canonicalBundle: string; inspection: unknown
  onOpenEvidence: (source: ResultEvidenceView) => void
  onOpenUse: (use: ResultUseView) => void
}) {
  const [bound, setBound] = useState<{bundle: string; inspection: unknown; key: string; view?: ResultView; error?: string} | null>(null)
  const key = JSON.stringify([scope.projectId, scope.workspace])
  useEffect(() => {
    let current = true
    void projectResultInspection(canonicalBundle, inspection, scope).then(view => {
      if (current) setBound({bundle: canonicalBundle, inspection, key, view})
    }, reason => { if (current) setBound({bundle: canonicalBundle, inspection, key, error: String(reason)}) })
    return () => { current = false }
  }, [canonicalBundle, inspection, key])
  const ready = bound?.key === key && bound.bundle === canonicalBundle && bound.inspection === inspection ? bound : null
  if (!ready) return <p role="status" className="p-4">正在核对结果引用包与检查回执；不会启动实验。</p>
  if (ready.error || !ready.view) return <p role="alert" className="p-4">{ready.error || '结果不可读取。'}</p>
  const view = ready.view
  return <section className="min-w-0 space-y-4 p-4" aria-label="实验结果与证据追溯">
    <header>
      <h2 className="text-primary">实验结果回流</h2>
      <p role="status">{view.referencesVerified ? '原件引用与字节核对完整' : '原件检查不完整：保留可用证据'}</p>
      <p className="text-secondary">这不是科学验证通过、实验执行成功或发布批准。参数与录制事实内容仍以所属 Record 原件为准。</p>
    </header>
    <dl className="space-y-2 break-all text-caption">
      <dt>项目 / 工作区</dt><dd>{scope.projectId} / {scope.workspace}</dd>
      <dt>Station / Target / Session</dt><dd>{view.stationId} / {view.targetId} / {view.sessionId}</dd>
      <dt>Run / Attempt</dt><dd>{view.runId} / {view.attemptId}</dd>
      <dt>实验定义提交</dt><dd>{view.experimentCommitId}</dd>
      <dt>验证计划</dt><dd>{view.planId} · {view.planDigest}</dd>
      <dt>Record / manifest</dt><dd>{view.recordId || '缺失'} · {view.recordManifestDigest || '缺失'}</dd>
      <dt>检查版本 / 时间</dt><dd>{view.bundleDigest} · {view.checkedAt}</dd>
    </dl>
    {view.recordingProblem && <p role="alert">{view.recordingProblem}</p>}
    {view.missingRoles.length > 0 && <p role="alert">尚缺原件核对：{view.missingRoles.join('、')}</p>}
    <div className="space-y-3">{view.evidence.map(source => <article key={source.id} className="rounded-lg border border-line p-3">
      <h3 className="text-secondary">{source.name}</h3>
      <p>{source.status === 'verified' ? '原件字节已核对' : source.status === 'mismatch' ? '归属或字节不符' : '未取得确定原件'}</p>
      <p className="text-caption">用途：{source.roles.join('、')}</p>
      <p className="break-all text-caption">{source.id} · {source.digest} · {source.sizeBytes} bytes</p>
      <p className="break-all text-caption">成员 {source.memberId} · 绑定 {source.bindingId} · owner {source.ownerId} · {source.artifactPath}</p>
      {source.reason && <p role="alert">{source.reason}</p>}
      <button type="button" className="ui-input mt-2" disabled={source.status !== 'verified'} onClick={() => onOpenEvidence(source)}>按原始引用查看证据</button>
    </article>)}</div>
    <section className="space-y-2"><h3>结论、设计、正文和产物的直接用途</h3>
      <p className="text-caption text-ink-3">这里只展示原有证据边；变更影响由知识图谱负责人沿同一图谱继续传播。</p>
      {view.uses.map(use => <button type="button" key={`${use.kind}:${use.objectId}:${use.digest}`} className="ui-list-row break-all text-left" onClick={() => onOpenUse(use)}>{use.kind} · {use.objectId} · {use.digest} · 证据 {use.evidenceArtifactIds.join('、')}</button>)}
    </section>
  </section>
}
