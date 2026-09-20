/** H-owned rendering source and ephemeral presentation projections.
 * BuildTask/BuildRecord persistence and execution remain the common build owner's.
 */
export const ARTIFACT_SCHEMA = 'xgc.research.artifact/v1'
export const ARTIFACT_KINDS = ['docx', 'pptx', 'video', 'remotion'] as const
export type ArtifactKind = typeof ARTIFACT_KINDS[number]
export type ArtifactDependency = {kind: 'design' | 'evidence' | 'body' | 'artifact'; objectId: string; path: string; digest: string}
export type ArtifactDefinition = {
  schemaVersion: typeof ARTIFACT_SCHEMA; artifactId: string; kind: ArtifactKind
  title: string; source: string; template?: string; secondsPerSlide?: number
  composition?: string; props?: string; rights: string; attribution: string
  dependencies: ArtifactDependency[]
}
export type ArtifactScope = {
  projectId: string; workspace: string; artifactId: string; entryPoint: string
  /** Complete saved input observations from the common snapshot owner, not author-entered hashes. */
  inputDigests: Readonly<Record<string, string>>
}
export type ArtifactFileView = {buildId: string; digest: string; sizeBytes: number; mediaType: string; url: string}
export type ArtifactBuildView = {
  buildId: string; taskId: string; requestedAt: string; completedAt: string
  status: 'succeeded' | 'failed' | 'cancelled'; currentInputs: boolean
  files: ArtifactFileView[]; diagnostics: string[]
  inputDigests: Readonly<Record<string, string>>; toolchain: Readonly<Record<string, unknown>>
  requestedBy: string; logArtifactRef: string
}
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export function demand(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
export const hashOK = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export const textOK = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const dateOK = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
export function artifactPath(value: unknown): value is string {
  return textOK(value) && value === value.trim() && !/[\\\u0000-\u001f\u007f]/.test(value) && !value.startsWith('/') && value.split('/').every(part => part && !['.', '..', '.git', '.research-build'].includes(part))
}
export function parseArtifactDefinition(text: string, artifactId: string): ArtifactDefinition {
  const raw: unknown = JSON.parse(text)
  demand(object(raw), '制品定义必须是对象。')
  const keys = ['schemaVersion','artifactId','kind','title','source','template','secondsPerSlide','composition','props','rights','attribution','dependencies']
  demand(Object.keys(raw).every(key => keys.includes(key)), '制品定义含未知字段，不进行旧格式修复。')
  demand(raw.schemaVersion === ARTIFACT_SCHEMA && raw.artifactId === artifactId && textOK(artifactId), '制品版本或身份不匹配。')
  demand(ARTIFACT_KINDS.includes(raw.kind as ArtifactKind) && textOK(raw.title) && textOK(raw.rights) && textOK(raw.attribution) && artifactPath(raw.source), '制品缺少类型、来源、权利或署名。')
  demand(raw.template === undefined || artifactPath(raw.template), '模板路径无效。')
  const seconds = raw.secondsPerSlide
  if (raw.kind === 'video') demand(typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0.25 && seconds <= 60, '每页时长必须为 0.25–60 秒。')
  else demand(seconds === undefined || seconds === 0, '此类型不接受每页时长。')
  if (raw.kind === 'remotion') {
    demand(textOK(raw.composition) && !raw.composition.startsWith('-') && !/[\r\n]/.test(raw.composition) && raw.template === undefined, 'Remotion 需要明确的 composition，不能使用 Office 模板。')
    demand(raw.props === undefined || artifactPath(raw.props), 'Remotion props 路径无效。')
  } else demand(raw.composition === undefined && raw.props === undefined, 'Office/分镜视频不接受 Remotion 设置。')
  demand(Array.isArray(raw.dependencies), '依赖必须显式列出。')
  const seen = new Set<string>()
  for (const dep of raw.dependencies) {
    demand(object(dep) && Object.keys(dep).every(key => ['kind','objectId','path','digest'].includes(key)), '依赖格式无效。')
    demand(['design','evidence','body','artifact'].includes(String(dep.kind)) && textOK(dep.objectId) && artifactPath(dep.path) && hashOK(dep.digest), '依赖必须固定对象、路径和 SHA-256。')
    const key = JSON.stringify([dep.kind, dep.objectId]); demand(!seen.has(key), '重复依赖。'); seen.add(key)
  }
  return raw as ArtifactDefinition
}
export function serializeArtifactDefinition(definition: ArtifactDefinition): string {
  const text = JSON.stringify(definition, null, 2) + '\n'
  parseArtifactDefinition(text, definition.artifactId)
  return text
}
export function artifactScopeKey(scope: ArtifactScope): string {
  demand(textOK(scope.projectId) && textOK(scope.workspace) && textOK(scope.artifactId) && artifactPath(scope.entryPoint), '缺少项目或制品范围。')
  demand(hashOK(scope.inputDigests[scope.entryPoint]) && Object.entries(scope.inputDigests).every(([path, digest]) => artifactPath(path) && hashOK(digest)), '缺少完整保存稿输入观察。')
  return JSON.stringify([scope.projectId, scope.workspace, scope.artifactId, scope.entryPoint, Object.entries(scope.inputDigests).sort(([a], [b]) => a.localeCompare(b))])
}
export function validateSavedArtifact(definition: ArtifactDefinition, scope: ArtifactScope): void {
  artifactScopeKey(scope)
  parseArtifactDefinition(JSON.stringify(definition), scope.artifactId)
  demand(definition.source !== scope.entryPoint, '来源不能指向定义本身。')
  for (const path of [definition.source, definition.template, definition.props].filter((value): value is string => Boolean(value))) demand(hashOK(scope.inputDigests[path]), `尚未观察到已保存输入：${path}`)
  for (const dependency of definition.dependencies) demand(scope.inputDigests[dependency.path] === dependency.digest, `依赖版本冲突：${dependency.objectId}`)
}
const knownMedia = new Set(['application/pdf', 'image/png', 'video/mp4', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
/** Read only the fields this view consumes. Do not redefine or persist a common BuildRecord DTO. */
export function projectArtifactBuilds(records: unknown, scope: ArtifactScope): {builds: ArtifactBuildView[]; rejected: string[]} {
  artifactScopeKey(scope)
  demand(Array.isArray(records), '构建账本不是列表。')
  const builds: ArtifactBuildView[] = [], rejected: string[] = [], seen = new Set<string>(), duplicates = new Set<string>()
  for (const [index, raw] of records.entries()) {
    try {
      demand(object(raw) && object(raw.task), '构建任务无法读取。')
      const task = raw.task
      if (task.workspaceRef !== scope.workspace || task.manuscriptId !== scope.artifactId || task.entryPoint !== scope.entryPoint) continue
      const manifest = raw.manifest
      demand(task.schemaVersion === 'xgc.research.manuscript/v1' && textOK(task.taskId) && dateOK(task.requestedAt) && Array.isArray(task.inputs), '构建任务缺少真实来源。')
      demand(object(manifest) && manifest.schemaVersion === task.schemaVersion && manifest.taskId === task.taskId && textOK(manifest.buildId), '构建回执与任务不匹配。')
      const buildId = manifest.buildId
      if (seen.has(buildId)) { duplicates.add(buildId); throw new Error('重复构建身份，未选择其中任何一份。') }
      seen.add(buildId)
      demand(['succeeded','failed','cancelled'].includes(String(manifest.status)) && dateOK(manifest.startedAt) && dateOK(manifest.completedAt) && Date.parse(manifest.completedAt) >= Date.parse(manifest.startedAt), '构建状态或时序无效。')
      const inputs = new Map<string, string>()
      for (const input of task.inputs) {
        demand(object(input) && artifactPath(input.path) && hashOK(input.digest) && !inputs.has(input.path), '构建输入不完整或重复。')
        inputs.set(input.path, input.digest)
      }
      demand(inputs.has(scope.entryPoint), '回执没有包含制品定义的固定版本。')
      demand(object(task.toolchain) && hashOK(task.toolchain.imageDigest) && textOK(task.toolchain.imageRef) && textOK(task.toolchain.engine) && textOK(task.toolchain.engineVersion) && textOK(task.toolchain.pinKind) && textOK(task.requestedBy) && textOK(manifest.logArtifactRef), '构建环境、请求者或日志来源缺失。')
      const currentInputs = inputs.size === Object.keys(scope.inputDigests).length && [...inputs].every(([path, digest]) => scope.inputDigests[path] === digest)
      const outputs = manifest.outputs === undefined ? [] : manifest.outputs
      const diagnostics = manifest.diagnostics === undefined ? [] : manifest.diagnostics
      demand(Array.isArray(outputs) && Array.isArray(diagnostics), '构建输出或诊断格式无效。')
      const files: ArtifactFileView[] = [], outputIDs = new Set<string>()
      for (const output of outputs) {
        demand(object(output) && hashOK(output.digest) && output.artifactRef === `sha256:${output.digest}` && Number.isSafeInteger(output.sizeBytes) && Number(output.sizeBytes) > 0 && textOK(output.mediaType), '输出缺少实际字节身份。')
        demand(!outputIDs.has(output.digest), '重复输出身份。'); outputIDs.add(output.digest)
        // Common records may also contain log/source-map outputs; they are not substituted for previews.
        if (!knownMedia.has(output.mediaType)) continue
        files.push({buildId, digest: output.digest, sizeBytes: Number(output.sizeBytes), mediaType: output.mediaType, url: `/api/v1/manuscripts/build-records/${encodeURIComponent(buildId)}/artifacts/${output.digest}`})
      }
      demand(manifest.status !== 'succeeded' || files.length > 0, '成功回执没有可读取的实际制品。')
      const messages = diagnostics.map(item => { demand(object(item) && typeof item.message === 'string', '诊断格式无效。'); return item.message })
      builds.push({buildId, taskId: task.taskId, requestedAt: task.requestedAt, completedAt: manifest.completedAt, status: manifest.status as ArtifactBuildView['status'], currentInputs, files, diagnostics: messages, inputDigests: Object.fromEntries(inputs), toolchain: task.toolchain, requestedBy: task.requestedBy, logArtifactRef: manifest.logArtifactRef})
    } catch (error) { rejected.push(`记录 ${index + 1}：${error instanceof Error ? error.message : String(error)}`) }
  }
  return {builds: builds.filter(build => !duplicates.has(build.buildId)).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt) || b.taskId.localeCompare(a.taskId)), rejected}
}
/** An explicit history selection is never replaced by a newly completed build. */
export function selectArtifactBuild(builds: readonly ArtifactBuildView[], selectedId: string): ArtifactBuildView | null {
  if (selectedId) return builds.find(build => build.buildId === selectedId) || null
  return builds.find(build => build.status === 'succeeded' && build.currentInputs) || builds.find(build => build.status === 'succeeded') || builds[0] || null
}
export async function bytesDigest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
}
/** Metadata is not a preview: retrieve exact bounded bytes before enabling download/media rendering. */
export async function verifyArtifactBytes(file: ArtifactFileView, response: Response): Promise<Blob> {
  demand(response.ok, `制品读取失败（${response.status}）。`)
  demand(hashOK(file.digest) && Number.isSafeInteger(file.sizeBytes) && file.sizeBytes > 0 && file.sizeBytes <= 100 * 1024 * 1024 && knownMedia.has(file.mediaType), '制品超出验证范围。')
  demand(response.body, '没有收到制品字节。')
  const reader = response.body.getReader(), bytes = new Uint8Array(file.sizeBytes)
  let offset = 0
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      demand(offset + value.length <= bytes.length, '制品大小与回执不符。')
      bytes.set(value, offset); offset += value.length
    }
    demand(offset === bytes.length && await bytesDigest(bytes) === file.digest, '制品 SHA-256 或大小与回执不符。')
    return new Blob([bytes], {type: file.mediaType})
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
