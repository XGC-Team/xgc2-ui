import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { artifactPaths, kindFromDraft, markdownFromDraft, parseArtifactDefinition, unpinnedSources, type ArtifactKind } from './artifact-model'
import { artifactView, selectArtifactBuild, verifyArtifactBytes, type ArtifactFile, type ArtifactIdentity, type ArtifactView } from './artifact-record'
import { definitionForSavedDraft, loadArtifactView, readWorkspaceFile, requestArtifactBuild, saveArtifactSources, type ArtifactObservation } from './artifact-api'
import type { DraftScope, ResearchDraft } from '../projects/draft-model'
import { classifyBuildRefusal, observeRenderer, useRendererObservation } from './renderer-gate'

type Props = { scope: DraftScope; draft: ResearchDraft; saved: boolean; locale: 'zh' | 'en'; onOpenPDF?: (file: ArtifactFile) => void }
export function ArtifactStudio(props: Props) {
  // Remount immediately on object/scope changes; no prior rights, receipts or
  // async operation can become the next project's state.
  return <ArtifactStudioInstance key={JSON.stringify([props.scope.projectId, props.scope.workspace, props.draft.id])} {...props} />
}
function ArtifactStudioInstance({ scope, draft, saved, locale, onOpenPDF }: Props) {
  const zh = locale === 'zh'
  const label = (cn: string, en: string) => zh ? cn : en
  const paths = artifactPaths(draft.id)
  const identity: ArtifactIdentity = { ...scope, artifactId: draft.id, entryPoint: paths.definition }
  const [rights, setRights] = useState(''), [attribution, setAttribution] = useState(''), [template, setTemplate] = useState('')
  const [kind, setKind] = useState<ArtifactKind>(() => kindFromDraft(draft))
  const [composition, setComposition] = useState(''), [source, setSource] = useState(''), [propsPath, setPropsPath] = useState('')
  const [view, setView] = useState<ArtifactView>(() => artifactView([], identity))
  const [selected, setSelected] = useState(''), [revision, setRevision] = useState(0)
  const [observation, setObservation] = useState<ArtifactObservation | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => () => operation.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    setObservation(null); setError('')
    void Promise.all([readWorkspaceFile(scope.workspace, paths.definition, controller.signal), readWorkspaceFile(scope.workspace, paths.source, controller.signal), loadArtifactView(identity, controller.signal)])
      .then(([definition, original, records]) => {
        if (controller.signal.aborted) return
        if (definition) {
          const value = parseArtifactDefinition(definition.content)
          if (value.artifactId !== draft.id) throw new Error('Saved definition belongs to another artifact.')
          setKind(value.kind); setRights(value.rights); setAttribution(value.attribution); setTemplate(value.template || '')
          setComposition(value.composition || ''); setPropsPath(value.props || ''); setSource(value.source === paths.source ? '' : value.source)
        }
        setObservation({ definition, source: original }); setView(records); setUncertain(false)
      }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)) })
    return () => controller.abort()
  }, [revision])

  const run = async (generate: boolean) => {
    if (!observation || !saved || operation.current || uncertain) return
    const controller = new AbortController(); operation.current = controller
    setBusy(true); setError(''); setNotice('')
    try {
      const definition = await definitionForSavedDraft(identity, draft, { rights, attribution, kind, template: kind === 'remotion' ? undefined : template, composition: kind === 'remotion' ? composition : undefined, props: kind === 'remotion' ? propsPath : undefined, source: source.trim() || undefined }, controller.signal)
      const markdown = kind !== 'remotion' && definition.source === paths.source ? markdownFromDraft(draft) : undefined
      const receipt = await saveArtifactSources(scope.workspace, paths.definition, paths.source, definition, observation, markdown, controller.signal)
      if (controller.signal.aborted) return
      setObservation(receipt.observed)
      setNotice(label('定义和源稿已取得保存回执；尚未声称执行或生成。', 'Definition/source save acknowledged; this is not execution or generation.'))
      if (generate) {
        const build = await requestArtifactBuild(identity, [...receipt.inputs, ...definition.dependencies], controller.signal)
        if (controller.signal.aborted) return
        setView(previous => artifactView([build.record, ...previous.builds.filter(item => item.buildId !== build.buildId).map(item => item.record)], identity))
        setNotice(label(`收到构建终态：${build.status}。`, `Build receipt: ${build.status}.`))
        observeRenderer({ rendered: true })
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        const refusal = classifyBuildRefusal(reason)
        // A definitive "renderer unavailable" means nothing was built: say so plainly, keep the form usable.
        if (refusal.kind === 'renderer-unavailable') { observeRenderer({ unavailable: refusal.detail }); setError(label('渲染器不可用：后端拒绝了这次生成，没有产生任何文件。定义与源稿已保存。', 'Renderer unavailable: the service refused this generation and produced no file. The definition and source are saved.')) }
        else {
          setError(`${refusal.detail} ${label('未取得完整确定回执；先刷新源稿和账本核对。不会自动重复保存或提交。', 'No complete receipt. Refresh source and ledger before retrying; no automatic resubmission.')}`)
          setUncertain(true)
        }
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      if (operation.current === controller) operation.current = null
    }
  }
  const renderer = useRendererObservation()
  const build = selectArtifactBuild(view, selected)
  const skipped = unpinnedSources(draft)
  return <section className="space-y-3" data-artifact-studio={draft.id} data-artifact-phase={view.phase} data-scientific-status={view.scientific}>
    <h3 className="text-secondary text-ink-2" title={label('只在显式生成时调用公共构建链。历史成功不代表当前表单已生成；打开页面不会编译、提交 Git 或启动实验。', 'Only explicit generation calls the common builder. Historical success does not mean the current form is generated. Opening this page does not compile, commit Git or start an experiment.')}>{label('渲染为 PPTX / 视频', 'Render to PPTX / video')}</h3>
    <p role="status" className="text-caption text-ink-3" title={`${scope.workspace}/${paths.definition}`}>{label('最近构建', 'Latest build')}：{view.phase} · {renderer.state === 'unavailable' ? label('渲染器不可用（已观察）', 'renderer unavailable (observed)') : renderer.state === 'rendered' ? label('渲染器已返回回执', 'renderer returned a receipt') : label('渲染器状态待首次请求', 'renderer state known after a request')} · {label('科学验证：未声称', 'scientific validation: not claimed')}</p>
    {view.laterFailure && <p role="status">{label('后续请求失败或取消，保留上次成功产物。', 'A later request failed or was cancelled; the previous successful artifact remains available.')}</p>}
    {!saved && <p role="status">{label('先保存研究对象，再生成制品。', 'Save the research object before generating.')}</p>}
    {skipped.length > 0 && <p>{label('这些来源缺少固定字节版本，未作为证据依赖', 'These sources have no pinned byte version and are not evidence dependencies')}: {skipped.join(', ')}</p>}
    <label className="block">{label('制品类型', 'Artifact kind')}<select className="ui-input mt-1 w-full" value={kind} onChange={event => setKind(event.target.value as ArtifactKind)}>{(['pptx', 'docx', 'video', 'remotion'] as const).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label className="block">{label('权利声明（必填；不是发表批准）', 'Rights statement (required; not publication approval)')}<textarea className="ui-input mt-1 w-full" value={rights} onChange={event => setRights(event.target.value)} /></label>
    <label className="block">{label('署名（必填）', 'Attribution (required)')}<input className="ui-input mt-1 w-full" value={attribution} onChange={event => setAttribution(event.target.value)} /></label>
    <label className="block">{label('已保存内容源路径；非 Remotion 留空表示显式更新本草稿的派生 Markdown', 'Saved source path; for non-Remotion, leave empty to explicitly update this draft\'s derived Markdown')}<input className="ui-input mt-1 w-full" value={source} onChange={event => setSource(event.target.value)} /></label>
    {kind !== 'remotion' && <label className="block">{label('可选参考文档路径', 'Optional reference document path')}<input className="ui-input mt-1 w-full" value={template} onChange={event => setTemplate(event.target.value)} /></label>}
    {kind === 'remotion' && <>
      <label className="block">Composition<input className="ui-input mt-1 w-full" value={composition} onChange={event => setComposition(event.target.value)} /></label>
      <label className="block">{label('可选 props 文件路径', 'Optional props file path')}<input className="ui-input mt-1 w-full" value={propsPath} onChange={event => setPropsPath(event.target.value)} /></label>
    </>}
    <div className="flex flex-wrap gap-1">
      <Button size="xs" disabled={!saved || busy || !observation || uncertain} onClick={() => void run(false)}>{label('保存定义与源稿', 'Save definition/source')}</Button>
      <Button size="xs" variant="solid" disabled={!saved || busy || !observation || uncertain} title={renderer.state === 'unavailable' ? label('本次会话中渲染器曾被拒绝；可再试一次。', 'The renderer was refused earlier in this session; you may try again.') : undefined} onClick={() => void run(true)}>{renderer.state === 'unavailable' ? label('再试生成', 'Try generating again') : label('生成制品', 'Generate artifact')}</Button>
      <Button size="xs" disabled={busy} onClick={() => setRevision(value => value + 1)}>{label('重新读取源稿与账本', 'Reload source and ledger')}</Button>
    </div>
    {busy && <p role="status">{label('正在等待公共保存／构建回执；没有声称成功。', 'Waiting for the common save/build receipt; success is not claimed.')}</p>}
    {!observation && !error && <p role="status">{label('正在读取保存稿与构建账本。', 'Loading saved source and build ledger.')}</p>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {view.rejected.map((reason, index) => <p role="alert" key={index}>{reason}</p>)}
    {view.latest?.diagnostics.map((message, index) => <p role="alert" key={index}>{message}</p>)}
    {view.builds.length > 0 && <label className="block">{label('产物历史', 'Artifact history')}<select className="ui-input ml-2 max-w-full" value={selected} onChange={event => setSelected(event.target.value)}><option value="">{label('最近成功版本（或最近失败的部分文件）', 'Latest success (or partial files of the latest failure)')}</option>{view.builds.map(item => <option key={item.buildId} value={item.buildId}>{item.buildId} · {item.status} · {item.requestedAt}</option>)}</select></label>}
    {selected && !build && <p role="alert">{label('所选历史版本缺失，没有替换为别的版本。', 'Selected historical version is missing; no silent substitution.')}</p>}
    {build && <div className="space-y-2">
      <p className="break-all">{build.buildId} · {build.status}</p>
      {build.status !== 'succeeded' && <p role="status">{label('失败或取消构建的部分产物，不是完整成功。', 'Partial artifacts from a failed/cancelled build, not complete success.')}</p>}
      <details><summary>{label('固定输入、环境与日志', 'Frozen inputs, environment and log')}</summary><p className="break-all">{build.sourceDigest} · {build.requestedBy} · {build.requestedAt}</p><p className="break-all">{JSON.stringify(build.toolchain)}</p><p className="break-all">{build.logArtifactRef}</p>{build.inputs.map(input => <p className="break-all" key={input.path}>{input.path} · {input.digest}</p>)}</details>
      {build.files.map(file => <VerifiedArtifact key={JSON.stringify(file)} file={file} locale={locale} onOpenPDF={onOpenPDF} />)}
    </div>}
  </section>
}
function VerifiedArtifact({ file, locale, onOpenPDF }: { file: ArtifactFile; locale: 'zh' | 'en'; onOpenPDF?: (file: ArtifactFile) => void }) {
  const zh = locale === 'zh'
  const [revision, setRevision] = useState(0), [url, setURL] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!revision) return
    const controller = new AbortController(); let blobURL = ''
    setLoading(true); setError(''); setLoaded(false)
    void fetch(file.url, { signal: controller.signal }).then(response => verifyArtifactBytes(file, response)).then(blob => {
      if (!controller.signal.aborted) { blobURL = URL.createObjectURL(blob); setURL(blobURL) }
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); if (blobURL) URL.revokeObjectURL(blobURL) }
  }, [revision, file.url, file.digest, file.sizeBytes, file.mediaType])
  const failed = () => { setLoaded(false); setError(zh ? '字节匹配，但浏览器未能解码媒体。' : 'Bytes match, but the browser could not decode this media.') }
  return <article className="space-y-1 border border-line p-2">
    <p className="break-all">{file.extension.toUpperCase()} · {file.sizeBytes} bytes · SHA-256 {file.digest}</p>
    {!url && <Button size="xs" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? (zh ? '正在核对字节…' : 'Verifying bytes…') : (zh ? '读取并核对原件' : 'Read and verify original')}</Button>}
    {error && <p role="alert">{error}</p>}
    {url && <>
      <p role="status">{zh ? '原件大小和 SHA-256 已核对。' : 'Original size and SHA-256 verified.'}</p>
      <a className="underline" href={url} download={`${file.buildId}.${file.extension}`}>{zh ? '保存实际文件' : 'Save actual file'} · {file.extension.toUpperCase()}</a>
      {file.kind === 'image' && <img alt={`${file.buildId} ${file.digest}`} src={url} className="max-h-64 max-w-full" onLoad={() => setLoaded(true)} onError={failed} />}
      {file.kind === 'video' && <video controls preload="metadata" src={url} className="max-h-64 max-w-full" onLoadedData={() => setLoaded(true)} onError={failed} />}
      {file.kind === 'pdf' && (onOpenPDF ? <Button size="xs" onClick={() => onOpenPDF(file)}>{zh ? '在项目 PDF 阅读器查看' : 'Open in project PDF reader'}</Button> : <p>{zh ? '已核对 PDF；项目阅读器接线待 A 组合，不创建第二阅读器。' : 'PDF verified; project reader composition is pending. No second viewer is created.'}</p>)}
      {loaded && <p role="status">{zh ? '浏览器已加载媒体，可以预览。' : 'Browser media loaded; preview available.'}</p>}
    </>}
  </article>
}
