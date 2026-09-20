import { validSourcePath, type DraftScope, type ResearchDraft } from '../projects/draft-model'

export const ARTIFACT_SCHEMA = 'xgc.research.artifact/v1'
export const ARTIFACT_KINDS = ['docx', 'pptx', 'video', 'remotion'] as const
export type ArtifactKind = typeof ARTIFACT_KINDS[number]
export type ArtifactDependencyKind = 'design' | 'evidence' | 'body' | 'artifact'
export type ArtifactDependency = { kind: ArtifactDependencyKind; objectId: string; path: string; digest: string }
export type ArtifactDefinition = {
  schemaVersion: typeof ARTIFACT_SCHEMA
  artifactId: string
  kind: ArtifactKind
  title: string
  source: string
  template?: string
  secondsPerSlide?: number
  composition?: string
  props?: string
  rights: string
  attribution: string
  dependencies: ArtifactDependency[]
}

const DEFINITION_KEYS = new Set(['schemaVersion', 'artifactId', 'kind', 'title', 'source', 'template', 'secondsPerSlide', 'composition', 'props', 'rights', 'attribution', 'dependencies'])
const DEPENDENCY_KEYS = new Set(['kind', 'objectId', 'path', 'digest'])
const DEPENDENCY_KINDS = new Set<ArtifactDependencyKind>(['design', 'evidence', 'body', 'artifact'])
const SHA256 = /^[a-f0-9]{64}$/
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
export function rawDigest(value: string): string { return value.replace(/^sha256:/, '') }
export function digestOK(value: string): boolean { return SHA256.test(rawDigest(value)) }
function rejectUnknown(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  for (const key of Object.keys(value)) requireThat(allowed.has(key), `${label} has unknown field ${key}`)
}

export function artifactPaths(artifactId: string) {
  requireThat(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(artifactId), 'Invalid artifact identity.')
  return { definition: `artifacts/${artifactId}.artifact.json`, source: `artifacts/${artifactId}.md` }
}

export function parseSecondsPerSlide(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*s?$/i.exec(value.trim())
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) && seconds >= 0.25 && seconds <= 60 ? seconds : null
}

export function parseArtifactDefinition(text: string): ArtifactDefinition {
  const raw: unknown = JSON.parse(text)
  requireThat(object(raw), 'Artifact definition is not an object.')
  rejectUnknown(raw, DEFINITION_KEYS, 'Artifact definition')
  requireThat(raw.schemaVersion === ARTIFACT_SCHEMA && typeof raw.artifactId === 'string' && typeof raw.title === 'string' && raw.title.trim() && typeof raw.source === 'string' && validSourcePath(raw.source) && typeof raw.rights === 'string' && raw.rights.trim() && typeof raw.attribution === 'string' && raw.attribution.trim(), 'Artifact definition lacks identity, title, rights or attribution.')
  requireThat(typeof raw.kind === 'string' && ARTIFACT_KINDS.includes(raw.kind as ArtifactKind), 'Unsupported artifact kind.')
  requireThat(raw.source !== artifactPaths(raw.artifactId).definition, 'Artifact source must be distinct from the definition.')
  const definition: ArtifactDefinition = {
    schemaVersion: ARTIFACT_SCHEMA, artifactId: raw.artifactId, kind: raw.kind as ArtifactKind,
    title: raw.title, source: raw.source, rights: raw.rights, attribution: raw.attribution, dependencies: [],
  }
  if (raw.template !== undefined) {
    requireThat(typeof raw.template === 'string' && validSourcePath(raw.template), 'Template is not a pinned relative path.')
    definition.template = raw.template
  }
  if (raw.secondsPerSlide !== undefined) {
    requireThat(typeof raw.secondsPerSlide === 'number' && Number.isFinite(raw.secondsPerSlide) && raw.secondsPerSlide >= 0.25 && raw.secondsPerSlide <= 60, 'Video requires a finite 0.25 to 60 seconds per slide.')
    definition.secondsPerSlide = raw.secondsPerSlide
  }
  if (raw.composition !== undefined) {
    requireThat(typeof raw.composition === 'string' && raw.composition.trim() && !raw.composition.startsWith('-') && !/[\r\n]/.test(raw.composition), 'Remotion composition is invalid.')
    definition.composition = raw.composition
  }
  if (raw.props !== undefined) {
    requireThat(typeof raw.props === 'string' && validSourcePath(raw.props), 'Remotion props must be a pinned relative path.')
    definition.props = raw.props
  }
  requireThat(Array.isArray(raw.dependencies), 'Artifact dependencies must be an array.')
  const seen = new Set<string>()
  for (const item of raw.dependencies) {
    requireThat(object(item), 'Invalid artifact dependency.')
    rejectUnknown(item, DEPENDENCY_KEYS, 'Artifact dependency')
    requireThat(typeof item.kind === 'string' && DEPENDENCY_KINDS.has(item.kind as ArtifactDependencyKind) && typeof item.objectId === 'string' && item.objectId && typeof item.path === 'string' && validSourcePath(item.path) && typeof item.digest === 'string' && digestOK(item.digest), 'Unresolved artifact dependency.')
    const key = `${item.kind}\0${item.objectId}`
    requireThat(!seen.has(key), 'Duplicate artifact dependency.')
    seen.add(key)
    definition.dependencies.push({ kind: item.kind as ArtifactDependencyKind, objectId: item.objectId, path: item.path, digest: rawDigest(item.digest) })
  }
  switch (definition.kind) {
    case 'docx':
    case 'pptx':
      requireThat(definition.secondsPerSlide === undefined && !definition.composition && !definition.props, 'Office artifact contains video-only settings.')
      break
    case 'video':
      requireThat(definition.secondsPerSlide !== undefined && !definition.composition && !definition.props, 'video requires a finite 0.25 to 60 seconds per slide.')
      break
    case 'remotion':
      requireThat(definition.composition && !definition.template && definition.secondsPerSlide === undefined, 'Remotion requires an exact composition and no Office settings.')
      break
  }
  return definition
}

export function serializeArtifactDefinition(definition: ArtifactDefinition): string {
  const text = `${JSON.stringify(definition, null, 2)}\n`
  parseArtifactDefinition(text)
  return text
}

export function markdownFromDraft(draft: ResearchDraft): string {
  requireThat(draft.kind === 'slides' || draft.kind === 'storyboard', 'Only slides and storyboard drafts convert to artifact Markdown.')
  const lines = [`# ${draft.title.trim() || draft.id}`, '']
  for (const block of draft.blocks) {
    lines.push(`## ${block.title.trim() || 'Untitled'}`, '')
    if (draft.kind === 'slides') {
      if (block.fields.message?.trim()) lines.push(block.fields.message.trim(), '')
      if (block.fields.visual?.trim()) lines.push(block.fields.visual.trim(), '')
      if (block.fields.speakerNotes?.trim()) lines.push(`Notes: ${block.fields.speakerNotes.trim()}`, '')
    } else {
      if (block.fields.visual?.trim()) lines.push(block.fields.visual.trim(), '')
      if (block.fields.narration?.trim()) lines.push(block.fields.narration.trim(), '')
    }
  }
  lines.push('This converted source is a research draft. It is not a scientific result or a publication approval.', '')
  return lines.join('\n')
}

export function secondsFromStoryboard(draft: ResearchDraft): number {
  const values = draft.blocks.map(block => parseSecondsPerSlide(block.fields.duration || ''))
  requireThat(values.length > 0 && values.every(value => value !== null), 'Every storyboard shot needs a duration between 0.25 and 60 seconds.')
  requireThat(values.every(value => value === values[0]), 'Storyboard shots disagree on duration; the video renderer uses one secondsPerSlide value.')
  return values[0]!
}

export function kindFromDraft(draft: ResearchDraft): ArtifactKind {
  if (draft.kind === 'slides') return 'pptx'
  if (draft.kind === 'storyboard') return 'video'
  throw new Error('This draft kind has no non-LaTeX artifact renderer.')
}

export function definitionFromDraft(draft: ResearchDraft, options: { rights: string; attribution: string; kind?: ArtifactKind; template?: string; composition?: string; props?: string; source?: string }): ArtifactDefinition {
  const kind = options.kind ?? kindFromDraft(draft)
  const paths = artifactPaths(draft.id)
  const dependencies: ArtifactDependency[] = []
  const seen = new Set<string>()
  for (const source of draft.sources) {
    if (!source.digest || !validSourcePath(source.path) || !digestOK(source.digest)) continue
    const key = `evidence\0${source.id}`
    if (seen.has(key)) continue
    seen.add(key)
    dependencies.push({ kind: 'evidence', objectId: source.id, path: source.path, digest: rawDigest(source.digest) })
  }
  const definition: ArtifactDefinition = {
    schemaVersion: ARTIFACT_SCHEMA, artifactId: draft.id, kind, title: draft.title.trim() || draft.id,
    source: options.source?.trim() || (kind === 'remotion' ? '' : paths.source),
    rights: options.rights.trim(), attribution: options.attribution.trim(), dependencies,
  }
  if (kind === 'video') definition.secondsPerSlide = secondsFromStoryboard(draft)
  if (options.template?.trim()) definition.template = options.template.trim()
  if (options.composition?.trim()) definition.composition = options.composition.trim()
  if (options.props?.trim()) definition.props = options.props.trim()
  if (kind === 'remotion') {
    requireThat(definition.source && definition.source !== paths.definition, 'Remotion needs a pinned project entry distinct from the definition.')
  }
  return parseArtifactDefinition(JSON.stringify(definition))
}

export type BuildOutput = { digest: string; mediaType: string; artifactRef?: string; sizeBytes?: number }
export type BuildManifest = { buildId: string; status: string; completedAt?: string; diagnostics?: { message: string }[]; outputs?: BuildOutput[] }
export type BuildRecord = {
  task: { workspaceRef: string; entryPoint: string; manuscriptId?: string; gitCommit?: string; toolchain?: { engine?: string; pinKind?: string }; inputs?: { path: string; digest: string }[] }
  manifest: BuildManifest
}

const OFFICE = /officedocument|presentationml|wordprocessingml|application\/vnd\.openxmlformats/i
export function isNonLatexArtifact(record: BuildRecord): boolean {
  const engine = record.task.toolchain?.engine || ''
  if (engine.startsWith('research-artifact/')) return true
  if (/\.artifact\.json$/i.test(record.task.entryPoint)) return true
  return (record.manifest.outputs || []).some(output => OFFICE.test(output.mediaType) || output.mediaType === 'video/mp4' || output.mediaType === 'image/png')
    && !/\.tex$/i.test(record.task.entryPoint)
}

export type ArtifactPreview = { kind: 'image' | 'video' | 'pdf' | 'file'; mediaType: string; digest: string; url: string }
export function previewFromRecord(record: BuildRecord): ArtifactPreview | null {
  if (record.manifest.status !== 'succeeded') return null
  const outputs = record.manifest.outputs || []
  const pick = (media: string, kind: ArtifactPreview['kind']) => {
    const output = outputs.find(item => item.mediaType === media)
    return output ? { kind, mediaType: output.mediaType, digest: rawDigest(output.digest), url: `/api/v1/manuscripts/build-records/${encodeURIComponent(record.manifest.buildId)}/artifacts/${rawDigest(output.digest)}` } : null
  }
  return pick('image/png', 'image') || pick('video/mp4', 'video') || pick('application/pdf', 'pdf')
    || (outputs[0] ? { kind: 'file', mediaType: outputs[0].mediaType, digest: rawDigest(outputs[0].digest), url: `/api/v1/manuscripts/build-records/${encodeURIComponent(record.manifest.buildId)}/artifacts/${rawDigest(outputs[0].digest)}` } : null)
}

export type ArtifactView = {
  phase: 'definition' | 'generated' | 'failed'
  latest?: BuildRecord
  successful?: BuildRecord
  preview?: ArtifactPreview
  laterFailure: boolean
  scientific: 'not-claimed'
}
export function artifactView(records: BuildRecord[], scope: DraftScope, entryPoint: string): ArtifactView {
  const relevant = records.filter(record => record.task.workspaceRef === scope.workspace && record.task.entryPoint === entryPoint && isNonLatexArtifact(record))
    .sort((a, b) => (b.manifest.completedAt || '').localeCompare(a.manifest.completedAt || ''))
  const latest = relevant[0]
  const successful = relevant.find(record => record.manifest.status === 'succeeded' && previewFromRecord(record))
  const laterFailure = Boolean(latest && successful && latest.manifest.buildId !== successful.manifest.buildId && latest.manifest.status !== 'succeeded')
  if (!latest) return { phase: 'definition', laterFailure: false, scientific: 'not-claimed' }
  if (latest.manifest.status === 'succeeded') return { phase: 'generated', latest, successful: latest, preview: previewFromRecord(latest) || undefined, laterFailure: false, scientific: 'not-claimed' }
  return { phase: 'failed', latest, successful, preview: successful ? previewFromRecord(successful) || undefined : undefined, laterFailure, scientific: 'not-claimed' }
}

export function uniquePinnedInputs(items: { path: string; digest: string }[]): { path: string; digest: string }[] {
  const seen = new Map<string, string>()
  for (const item of items) {
    const digest = rawDigest(item.digest)
    const previous = seen.get(item.path)
    if (previous && previous !== digest) throw new Error(`input path ${item.path} has conflicting SHA-256 digests`)
    seen.set(item.path, digest)
  }
  return [...seen.entries()].map(([path, digest]) => ({ path, digest }))
}

export function unpinnedSources(draft: ResearchDraft): string[] {
  return draft.sources.filter(source => !source.digest || !digestOK(source.digest) || !validSourcePath(source.path)).map(source => source.path || source.url || source.id)
}
