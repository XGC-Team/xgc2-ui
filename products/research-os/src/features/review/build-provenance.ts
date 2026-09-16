export type BuildRecord = {
  task: { workspaceRef: string; entryPoint: string; gitCommit?: string; inputs?: { path: string; digest: string }[] }
  manifest: { buildId: string; completedAt?: string; status: string; diagnostics?: { message: string }[]; outputs?: { digest: string; mediaType: string }[] }
}
const digestKey = (value: string) => value.replace(/^sha256:/, '')
export function buildSourceMatch(record: BuildRecord | undefined, workspace: string, path: string, digest: string): 'match' | 'changed' | 'unknown' {
  if (!record || record.manifest.status !== 'succeeded' || record.task.workspaceRef !== workspace || !digest) return 'unknown'
  const input = record.task.inputs?.find(i => i.path === path)
  return !input?.digest ? 'unknown' : digestKey(input.digest) === digestKey(digest) ? 'match' : 'changed'
}
export function previewProvenance(records: BuildRecord[], pdf: { workspace: string; path: string; buildId: string; digest: string }) {
  const selected = records.find(r => r.manifest.buildId === pdf.buildId && r.task.workspaceRef === pdf.workspace && r.task.entryPoint === pdf.path)
  const valid = selected?.manifest.status === 'succeeded' && !!selected.manifest.outputs?.some(o => o.mediaType === 'application/pdf' && digestKey(o.digest) === digestKey(pdf.digest))
  const relevant = records.filter(r => r.task.workspaceRef === pdf.workspace && r.task.entryPoint === pdf.path).sort((a, b) => (b.manifest.completedAt || '').localeCompare(a.manifest.completedAt || ''))
  const latest = relevant[0]
  return { selected, valid, latest, oldPreview: !!latest && latest.manifest.buildId !== pdf.buildId,
    laterFailure: !!latest && latest.manifest.buildId !== pdf.buildId && latest.manifest.status === 'failed' }
}
