import {useEffect, useState} from 'react'
import {artifactScopeKey, validateSavedArtifact, selectArtifactBuild, verifyArtifactBytes, type ArtifactDefinition, type ArtifactFileView, type ArtifactScope} from './artifact-model'
import {listArtifactBuilds} from './artifact-service'

export type ArtifactActions = {
  /** Availability comes from the shared build owner's real capability, not extension detection. */
  available: boolean; busy: boolean; detail: string
  generate: () => Promise<void>
  /** Present only when the common lifecycle exposes a cancellable active task. */
  cancel?: () => Promise<void>
}
export function ArtifactPanel(props: {
  scope: ArtifactScope; definition: ArtifactDefinition; actions?: ArtifactActions
  onOpenSource: (path: string) => void
  onOpenPDF: (file: ArtifactFileView) => void
}) {
  const {scope} = props
  try { validateSavedArtifact(props.definition, scope) }
  catch (reason) { return <p role="alert" className="p-4">{String(reason)}</p> }
  const key = JSON.stringify([scope.projectId, scope.workspace, scope.artifactId, scope.entryPoint])
  // A different object resets state; edits within it preserve an explicit historical selection.
  return <ArtifactPanelInstance key={key} {...props}/>
}
function ArtifactPanelInstance({scope, definition, actions, onOpenSource, onOpenPDF}: {
  scope: ArtifactScope; definition: ArtifactDefinition; actions?: ArtifactActions
  onOpenSource: (path: string) => void; onOpenPDF: (file: ArtifactFileView) => void
}) {
  const [revision, setRevision] = useState(0), [selected, setSelected] = useState('')
  const observation = artifactScopeKey(scope)
  const [bound, setBound] = useState<{observation: string; data: Awaited<ReturnType<typeof listArtifactBuilds>>} | null>(null)
  const data = bound && (bound.observation === observation ? bound.data : {...bound.data, builds: bound.data.builds.map(build => ({...build, currentInputs: false}))})
  const [operationError, setOperationError] = useState('')
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [requesting, setRequesting] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void listArtifactBuilds(scope, controller.signal).then(value => { if (!controller.signal.aborted) setBound({observation, data: value}) }, reason => { if (!controller.signal.aborted) setError(String(reason)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision, observation])
  const invoke = async (operation: () => Promise<void>) => {
    if (requesting) return
    setRequesting(true); setOperationError('')
    try { await operation() }
    catch (reason) { setOperationError(`请求未取得确定回执：${String(reason)}。请先刷新账本核对，不会自动重复提交。`) }
    finally { setRequesting(false); setRevision(value => value + 1) }
  }
  const build = data ? selectArtifactBuild(data.builds, selected) : null
  const latest = data?.builds[0]
  return <section className="min-w-0 space-y-4 p-4" aria-label="制品生成与追溯">
    <header className="space-y-2">
      <h2 className="text-primary">{definition.title}</h2>
      <p className="text-caption text-ink-3">{scope.workspace} · {definition.kind.toUpperCase()} · {scope.artifactId}</p>
      <p className="text-secondary">已保存定义不代表已生成；生成成功不代表科学验证或允许发布。</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ui-input" onClick={() => onOpenSource(scope.entryPoint)}>编辑原定义</button>
        <button type="button" className="ui-input" onClick={() => onOpenSource(definition.source)}>打开同源内容</button>
        <button type="button" className="ui-input" disabled={!actions?.available || actions.busy || requesting} onClick={() => actions && void invoke(actions.generate)}>从保存稿生成</button>
        {actions?.cancel && <button type="button" className="ui-input" disabled={requesting} onClick={() => actions.cancel && void invoke(actions.cancel)}>请求取消构建</button>}
        <button type="button" className="ui-input" disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新账本</button>
      </div>
      <p role="status" className="text-caption text-ink-3">{requesting ? '正在等待公共构建入口回执；未宣称生成成功。' : actions?.detail || '公共非 LaTeX 构建入口尚未接入；只读查看真实历史产物。'}</p>
    </header>
    {error && <p role="alert">{error}</p>}
    {operationError && <p role="alert">{operationError}</p>}
    {data?.rejected.map(message => <p key={message} role="alert">{message}</p>)}
    {loading && <p role="status">正在核对构建账本；已有历史预览仍保留。</p>}
    {!loading && !error && data?.builds.length === 0 && <p>只有定义，尚无实际构建回执。</p>}
    {latest && <p>最近请求：{latest.status === 'succeeded' ? '生成成功' : latest.status === 'cancelled' ? '已取消' : '生成失败'} · {latest.buildId} · {latest.currentInputs ? '当前保存稿输入' : '历史输入'}</p>}
    {latest?.status !== 'succeeded' && latest?.diagnostics.map((message, index) => <p role="alert" key={index}>{message}</p>)}
    {data && data.builds.length > 0 && <label className="block text-secondary">产物版本<select className="ui-input ml-2 max-w-full" value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">跟随当前输入的成功版本；没有时保留最近成功版本</option>
      {data.builds.map(item => <option key={item.buildId} value={item.buildId}>{item.buildId} · {item.status} · {item.completedAt}</option>)}
    </select></label>}
    {selected && !build && <p role="alert">所选历史版本缺失，没有静默替换成另一版。</p>}
    {build && <div className="space-y-3 rounded-lg border border-line p-3">
      <h3 className="text-secondary">查看 {build.buildId}</h3>
      {!build.currentInputs && <p role="status">这是历史输入生成的产物，不代表当前修改已生成。</p>}
      {build.status !== 'succeeded' && <p role="status">失败或取消构建的已验证部分产物；不是完整成功回执。</p>}
      {build.diagnostics.map((message, index) => <p key={index}>{message}</p>)}
      <details><summary>本构建的固定输入、环境与日志</summary>
        <p className="break-all text-caption">请求者 {build.requestedBy} · {build.requestedAt}</p>
        <p className="break-all text-caption">工具链 {JSON.stringify(build.toolchain)}</p>
        <p className="break-all text-caption">日志引用 {build.logArtifactRef}</p>
        {Object.entries(build.inputDigests).map(([path, digest]) => <p className="break-all text-caption" key={path}>{path} · {digest}</p>)}
        <p className="text-caption text-ink-3">这些是所选构建的原始引用；打开当前源文件不会被冒充为打开历史输入快照。</p>
      </details>
      {build.files.map(file => <VerifiedArtifact key={`${file.buildId}:${file.digest}`} file={file} onOpenPDF={onOpenPDF}/>)}
    </div>}
    <details><summary>当前保存稿的输入、证据与权利（不是历史产物的元数据）</summary>
      <p>{definition.rights}</p><p>{definition.attribution}</p>
      {Object.entries(scope.inputDigests).map(([path, digest]) => <p className="break-all text-caption" key={path}><button type="button" onClick={() => onOpenSource(path)}>{path}</button> · {digest}</p>)}
      {definition.dependencies.map(dep => <p className="break-all text-caption" key={`${dep.kind}:${dep.objectId}`}>{dep.kind} · {dep.objectId} · {dep.path} · {dep.digest}</p>)}
    </details>
  </section>
}
function VerifiedArtifact({file, onOpenPDF}: {file: ArtifactFileView; onOpenPDF: (file: ArtifactFileView) => void}) {
  const [url, setURL] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0)
  const [previewReady, setPreviewReady] = useState(false)
  useEffect(() => {
    if (!revision) return
    const controller = new AbortController(); let localURL = ''
    setLoading(true); setError('')
    void fetch(file.url, {signal: controller.signal}).then(response => verifyArtifactBytes(file, response)).then(blob => {
      if (!controller.signal.aborted) { localURL = URL.createObjectURL(blob); setURL(localURL) }
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); if (localURL) URL.revokeObjectURL(localURL) }
  }, [revision])
  const extension = file.mediaType === 'application/pdf' ? 'pdf' : file.mediaType === 'image/png' ? 'png' : file.mediaType === 'video/mp4' ? 'mp4' : file.mediaType.includes('wordprocessingml') ? 'docx' : 'pptx'
  return <article className="space-y-2">
    <p className="break-all text-caption">{extension.toUpperCase()} · {file.sizeBytes} bytes · SHA-256 {file.digest}</p>
    {!url && <button type="button" className="ui-input" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? '正在核对原件字节…' : '读取并核对产物'}</button>}
    {error && <p role="alert">{error}</p>}
    {url && <>
      <p role="status" className="text-caption">原件大小与 SHA-256 已核对。</p>
      <a className="underline" href={url} download={`${file.buildId}.${extension}`}>保存实际 {extension.toUpperCase()} 文件</a>
      {extension === 'pdf' && <button type="button" className="ui-input ml-2" onClick={() => onOpenPDF(file)}>在项目 PDF 阅读器查看</button>}
      {extension === 'png' && <img className="max-w-full" src={url} alt={`构建 ${file.buildId} 的已核对预览`} onLoad={() => setPreviewReady(true)} onError={() => {setPreviewReady(false); setError('原件字节已核对，但浏览器无法加载图片预览。')}}/>}
      {extension === 'mp4' && <video className="w-full" controls preload="metadata" src={url} onLoadedData={() => setPreviewReady(true)} onError={() => {setPreviewReady(false); setError('原件字节已核对，但浏览器无法解码视频。')}}/>}
      {previewReady && <p role="status" className="text-caption">媒体已加载，可预览。</p>}
    </>}
  </article>
}
