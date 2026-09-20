import type { DraftScope, DraftSource } from './draft-model.ts'
import { archivePDF } from '../literature/api.ts'
import type { ArchiveIdentity } from '../literature/types.ts'
export type IntakeRecord = {
  id: string; scope: DraftScope; name: string; state: 'uploading' | 'accepted' | 'failed' | 'unsupported'
  kind: 'text' | 'pdf'; error: string; source?: DraftSource; archive?: ArchiveIdentity
}
export type IntakePort = {
  text: (file: File, scope: DraftScope, id: string) => Promise<DraftSource>
  pdf: (file: File, id: string) => Promise<ArchiveIdentity>
}
const records: IntakeRecord[] = [], files = new Map<string, File>(), listeners = new Set<() => void>()
let snapshot: readonly IntakeRecord[] = []
function emit() { snapshot = [...records]; listeners.forEach(listener => listener()) }
export const intakeSnapshot = () => snapshot
export const subscribeIntake = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
async function responseData(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`)
  return body?.data
}
export const intakePort: IntakePort = {
  async text(file, scope, id) {
    const content = await file.text()
    const name = file.name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-120)
    const path = `material-${id}-${name}`
    const endpoint = `/api/v1/workspaces/${encodeURIComponent(scope.workspace)}/files/${encodeURIComponent(path)}`
    const result = await responseData(await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, createOnly: true }) }))
    if (!result || typeof result !== 'object' || !('digest' in result) || typeof result.digest !== 'string' || !result.digest) throw new Error('Missing saved file revision.')
    return { id: crypto.randomUUID(), workspace: scope.workspace, path, digest: result.digest }
  },
  pdf(file, id) {
    return archivePDF(file, id)
  },
}
export async function submitIntake(file: File, scope: DraftScope, port: IntakePort = intakePort, id = crypto.randomUUID()): Promise<IntakeRecord> {
  if (records.some(record => record.id === id)) throw new Error('Duplicate intake identity.')
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!pdf && (!scope.projectId || !scope.workspace)) throw new Error('Select a project before importing text.')
  const supported = pdf || /\.(md|mdx|txt|tex|bib|csv|tsv)$/i.test(file.name)
  const record: IntakeRecord = { id, scope: { ...scope }, name: file.name, kind: pdf ? 'pdf' : 'text', state: supported ? 'uploading' : 'unsupported', error: '' }
  records.push(record); files.set(id, file); emit()
  if (!supported) { files.delete(id); return record }
  if (file.size > (pdf ? 50 : 5) * 1024 * 1024) { record.state = 'failed'; record.error = pdf ? 'PDF exceeds 50 MB.' : 'Text file exceeds 5 MB.'; emit(); return record }
  return run(record, port)
}
async function run(record: IntakeRecord, port: IntakePort): Promise<IntakeRecord> {
  const file = files.get(record.id)
  if (!file) throw new Error('Reselect the original file.')
  record.state = 'uploading'; record.error = ''; record.archive = undefined; emit()
  try {
    if (record.kind === 'pdf') {
      const archive = await port.pdf(file, record.id)
      if (!archive?.workId || !archive.manifestationId || !archive.documentVersionId || !archive.acquisitionId || !archive.sourceSha256) {
        throw new Error('PDF archive receipt is missing reading identity.')
      }
      record.archive = archive
    } else {
      const source = await port.text(file, record.scope, record.id)
      if (!source?.digest || source.workspace !== record.scope.workspace || !source.path) throw new Error('Invalid saved material reference.')
      record.source = source
    }
    record.state = 'accepted'; files.delete(record.id)
  } catch (error) { record.state = 'failed'; record.error = error instanceof Error ? error.message : String(error) }
  emit(); return record
}
export async function retryIntake(id: string, port: IntakePort = intakePort): Promise<IntakeRecord> {
  const record = records.find(item => item.id === id)
  if (!record || record.state !== 'failed') throw new Error('Only a failed intake can be retried.')
  const file = files.get(id)!
  if (file.size > (record.kind === 'pdf' ? 50 : 5) * 1024 * 1024) return record
  return run(record, port)
}
