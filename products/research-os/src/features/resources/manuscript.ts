import { request } from '../../lib/api'

export type ManuscriptPDF = {
  workspace: string
  path: string
  buildId: string
  digest: string
  url: string
  sourceRevision?: string
  completedAt?: string
}

export type BuildRecord = {
  task: {
    workspaceRef: string
    entryPoint: string
    sourceRevision?: string
    gitCommit?: string
    inputs?: { path: string; digest: string }[]
  }
  manifest: {
    buildId: string
    completedAt?: string
    status: string
    diagnostics?: { message: string }[]
    outputs?: { digest: string; mediaType: string }[]
  }
}

export class CompileFailure extends Error {
  record?: BuildRecord
  constructor(message: string, record?: BuildRecord) {
    super(message)
    this.name = 'CompileFailure'
    this.record = record
  }
}

type LatexCapabilities = { latex: { available: boolean; detail: string }; toolchain: unknown }

export function isManuscriptSource(path: string): boolean {
  return /\.(tex|ltx|sty|cls|clo|bib|bst)$/i.test(path)
}

export function pdfFromRecord(workspace: string, record: BuildRecord | undefined): ManuscriptPDF | null {
  if (!record || record.manifest.status !== 'succeeded') return null
  const output = record.manifest.outputs?.find(item => item.mediaType === 'application/pdf')
  if (!output) return null
  return {
    workspace,
    path: record.task.entryPoint,
    buildId: record.manifest.buildId,
    digest: output.digest,
    url: `/api/v1/manuscripts/build-records/${encodeURIComponent(record.manifest.buildId)}/artifacts/${output.digest}`,
    sourceRevision: record.task.sourceRevision,
    completedAt: record.manifest.completedAt,
  }
}

export async function listPDFVersions(workspace: string, path: string | undefined, signal?: AbortSignal): Promise<(ManuscriptPDF & { completedAt: string })[]> {
  const records = await request<BuildRecord[]>(`/manuscripts/build-records?manuscriptId=${encodeURIComponent(workspace)}`, { signal })
  return records
    .filter(record => record.task.workspaceRef === workspace && (!path || record.task.entryPoint === path) && record.manifest.status === 'succeeded')
    .sort((a, b) => (b.manifest.completedAt || '').localeCompare(a.manifest.completedAt || ''))
    .flatMap(record => {
      const pdf = pdfFromRecord(workspace, record)
      return pdf && record.manifest.completedAt ? [{ ...pdf, completedAt: record.manifest.completedAt }] : []
    })
}

export async function latestPDF(workspace: string, path: string): Promise<ManuscriptPDF | null> {
  return (await listPDFVersions(workspace, path))[0] || null
}

function failureMessage(record: BuildRecord | undefined, fallback: string): string {
  const diagnostics = record?.manifest.diagnostics?.map(item => item.message).filter(Boolean).join('\n')
  return diagnostics || fallback
}

export async function compilePDF(workspace: string, path: string, signal?: AbortSignal): Promise<ManuscriptPDF> {
  const capabilities = await request<LatexCapabilities>('/capabilities', { signal })
  if (!capabilities.latex.available) {
    throw new Error(capabilities.latex.detail || 'LaTeX 编译器尚未就绪。')
  }
  const response = await fetch('/api/v1/manuscripts/builds', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceRef: workspace, entryPoint: path }),
    signal,
  })
  const body = await response.json().catch(() => null) as {
    data?: BuildRecord
    error?: { message?: string; details?: { record?: BuildRecord } }
  } | null
  const record = response.status === 201 ? body?.data : body?.error?.details?.record
  if (response.status === 201) {
    const pdf = pdfFromRecord(workspace, record)
    if (!pdf) throw new CompileFailure('构建没有生成 PDF。', record)
    return pdf
  }
  throw new CompileFailure(
    failureMessage(record, body?.error?.message || `请求失败（${response.status}）`),
    record,
  )
}
