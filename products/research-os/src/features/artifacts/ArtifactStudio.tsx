import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { artifactPaths, artifactView, definitionFromDraft, kindFromDraft, markdownFromDraft, unpinnedSources, type ArtifactKind, type ArtifactView } from './artifact-model'
import { listArtifactRecords, requestArtifactBuild, saveArtifactSources } from './artifact-api'
import type { DraftScope, ResearchDraft } from '../projects/draft-model'

const copy = {
  zh: {
    title: '非 LaTeX 制品',
    boundary: '草稿仍是定义。只有下面这次显式生成才会调用共享构建账本；打开本页不会编译，也不会提交 Git。',
    rights: '权利声明（必填，渲染不构成发表许可）',
    attribution: '署名（必填）',
    template: '可选参考文档路径',
    kind: '制品类型',
    composition: 'Remotion composition（仅 remotion）',
    remotionSource: 'Remotion 项目入口路径（已保存、已固定）',
    save: '保存定义与源稿',
    render: '生成制品',
    unsaved: '请先保存研究对象，再生成制品。',
    unpinned: '未固定版本的来源不会写入依赖，打开时也不当作证据。',
    later: '之后一次生成失败。仍显示上一次成功产物，没有用失败结果替换它。',
    failed: '这次生成未成功。已验证的部分文件若存在会保留在账本里。',
    generated: '已生成（不是科学验证，也不是发表批准）',
    definition: '仅有定义，尚无成功产物',
    scientific: '科学验证：未声称',
    download: '打开产物',
    empty: '还没有可预览的产物。',
  },
  en: {
    title: 'Non-LaTeX artifacts',
    boundary: 'The draft remains a definition. Only the explicit generate action below uses the shared build ledger. Opening this page does not compile or create a Git commit.',
    rights: 'Rights statement (required; rendering is not publication approval)',
    attribution: 'Attribution (required)',
    template: 'Optional reference document path',
    kind: 'Artifact kind',
    composition: 'Remotion composition (remotion only)',
    remotionSource: 'Pinned Remotion project entry path',
    save: 'Save definition and source',
    render: 'Generate artifact',
    unsaved: 'Save the research object before generating an artifact.',
    unpinned: 'Unpinned sources are not written as dependencies and are not treated as evidence.',
    later: 'A later generate failed. The last successful outputs are still shown and were not replaced.',
    failed: 'This generate did not succeed. Any already verified files remain in the ledger.',
    generated: 'Generated (not scientific verification or publication approval)',
    definition: 'Definition only; no successful artifact yet',
    scientific: 'Scientific verification: not claimed',
    download: 'Open artifact',
    empty: 'No previewable artifact yet.',
  },
} as const

export function ArtifactStudio({ scope, draft, saved, locale }: { scope: DraftScope; draft: ResearchDraft; saved: boolean; locale: 'zh' | 'en' }) {
  const text = copy[locale]
  const [rights, setRights] = useState('')
  const [attribution, setAttribution] = useState('')
  const [template, setTemplate] = useState('')
  const [kind, setKind] = useState<ArtifactKind>(() => kindFromDraft(draft))
  const [composition, setComposition] = useState('')
  const [remotionSource, setRemotionSource] = useState('')
  const [view, setView] = useState<ArtifactView>({ phase: 'definition', laterFailure: false, scientific: 'not-claimed' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const paths = artifactPaths(draft.id)
  const skipped = unpinnedSources(draft)

  useEffect(() => { setKind(kindFromDraft(draft)) }, [draft.id, draft.kind])
  useEffect(() => {
    const controller = new AbortController()
    void listArtifactRecords(scope.workspace, controller.signal)
      .then(records => { if (!controller.signal.aborted) setView(artifactView(records, scope, paths.definition)) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => controller.abort()
  }, [scope.projectId, scope.workspace, paths.definition, draft.updatedAt])

  const run = async (generate: boolean) => {
    setBusy(true); setError('')
    try {
      const definition = definitionFromDraft(draft, { rights, attribution, kind, template, composition, source: kind === 'remotion' ? remotionSource : undefined })
      const savedFiles = await saveArtifactSources(scope.workspace, paths.definition, paths.source, definition, kind === 'remotion' ? undefined : markdownFromDraft(draft))
      if (generate) {
        await requestArtifactBuild({
          workspaceRef: scope.workspace, entryPoint: paths.definition, manuscriptId: draft.id,
          expectedInputs: [
            ...savedFiles,
            ...definition.dependencies.map(item => ({ path: item.path, digest: item.digest })),
          ],
        })
      }
      setView(artifactView(await listArtifactRecords(scope.workspace), scope, paths.definition))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return <section className="space-y-2" data-artifact-studio={draft.id} data-artifact-phase={view.phase} data-scientific-status={view.scientific}>
    <h3 className="text-secondary text-ink-2">{text.title}</h3>
    <p className="text-caption text-ink-3">{text.boundary}</p>
    <p className="break-all text-caption text-ink-3">{scope.workspace}/{paths.definition}</p>
    <p role="status" className="text-caption">{view.phase === 'generated' ? text.generated : view.phase === 'failed' ? text.failed : text.definition} · {text.scientific}</p>
    {view.laterFailure && <p role="status" className="text-caption">{text.later}</p>}
    {!saved && <p role="status" className="text-caption">{text.unsaved}</p>}
    {skipped.length > 0 && <p className="text-caption text-ink-3">{text.unpinned}: {skipped.join(', ')}</p>}
    <label className="block text-secondary">{text.kind}
      <select className="ui-input mt-1 w-full" value={kind} onChange={event => setKind(event.target.value as ArtifactKind)}>
        <option value="pptx">pptx</option>
        <option value="docx">docx</option>
        <option value="video">video</option>
        <option value="remotion">remotion</option>
      </select>
    </label>
    <label className="block text-secondary">{text.rights}<textarea className="ui-input mt-1 w-full" value={rights} onChange={event => setRights(event.target.value)} /></label>
    <label className="block text-secondary">{text.attribution}<input className="ui-input mt-1 w-full" value={attribution} onChange={event => setAttribution(event.target.value)} /></label>
    <label className="block text-secondary">{text.template}<input className="ui-input mt-1 w-full" value={template} onChange={event => setTemplate(event.target.value)} /></label>
    {kind === 'remotion' && <>
      <label className="block text-secondary">{text.remotionSource}<input className="ui-input mt-1 w-full" value={remotionSource} onChange={event => setRemotionSource(event.target.value)} /></label>
      <label className="block text-secondary">{text.composition}<input className="ui-input mt-1 w-full" value={composition} onChange={event => setComposition(event.target.value)} /></label>
    </>}
    <div className="flex flex-wrap gap-1">
      <Button size="xs" disabled={!saved || busy} loading={busy} onClick={() => void run(false)}>{text.save}</Button>
      <Button size="xs" variant="solid" disabled={!saved || busy} loading={busy} onClick={() => void run(true)}>{text.render}</Button>
    </div>
    {error && <p role="alert" className="text-caption text-ink-3">{error}</p>}
    {view.preview ? <div className="space-y-1">
      {view.preview.kind === 'image' && <img alt="" src={view.preview.url} className="max-h-64 max-w-full border border-line" />}
      {view.preview.kind === 'video' && <video controls src={view.preview.url} className="max-h-64 max-w-full" />}
      {view.preview.kind === 'pdf' && <iframe title={draft.title} src={view.preview.url} className="h-64 w-full border border-line" />}
      <a className="text-caption underline" href={view.preview.url}>{text.download} · {view.preview.mediaType} · {view.preview.digest.slice(0, 12)}</a>
    </div> : <p className="text-caption text-ink-3">{text.empty}</p>}
  </section>
}
