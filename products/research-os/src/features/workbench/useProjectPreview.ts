import { useEffect, useState } from 'react'
import { APIError, request } from '../../lib/api'
import { listPDFVersions, type ManuscriptPDF } from '../resources/manuscript'
import { matchReadingPdf, readReadingPlace } from './writing-session'

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading'; projectId: string }
  | { status: 'ready'; projectId: string; pdf: ManuscriptPDF; page: number; followCurrent: boolean }
  | { status: 'empty'; projectId: string; detail: string }
  | { status: 'unavailable'; projectId: string; detail: string }
  | { status: 'failed'; projectId: string; detail: string }

type LatexCapabilities = { latex: { available: boolean; detail: string }; toolchain: unknown }

export async function loadProjectPreview(projectId: string, signal?: AbortSignal): Promise<PreviewState> {
  if (!projectId.trim()) return { status: 'idle' }
  let versions: Awaited<ReturnType<typeof listPDFVersions>> = []
  try {
    versions = await listPDFVersions(projectId, undefined, signal)
  } catch (error) {
    if (signal?.aborted) return { status: 'idle' }
    const detail = error instanceof Error ? error.message : String(error)
    return { status: 'failed', projectId, detail }
  }
  if (signal?.aborted) return { status: 'idle' }
  const place = readReadingPlace(projectId)
  const pdf = matchReadingPdf(versions, place)
  if (pdf) return { status: 'ready', projectId, pdf, page: place?.page ?? 1, followCurrent: pdf.buildId === versions[0]?.buildId && pdf.digest === versions[0]?.digest }
  let capabilities: LatexCapabilities | null = null
  try {
    capabilities = await request<LatexCapabilities>('/capabilities', { signal })
  } catch (error) {
    if (signal?.aborted) return { status: 'idle' }
    if (error instanceof APIError && error.status === 404) capabilities = null
  }
  if (capabilities && (!capabilities.latex.available || capabilities.toolchain == null)) {
    return { status: 'unavailable', projectId, detail: capabilities.latex.detail || 'LaTeX unavailable' }
  }
  return { status: 'empty', projectId, detail: 'no-pdf' }
}

export function useProjectPreview(projectId: string): PreviewState & { reload: () => void } {
  const [state, setState] = useState<PreviewState>(projectId ? { status: 'loading', projectId } : { status: 'idle' })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!projectId) { setState({ status: 'idle' }); return }
    const controller = new AbortController()
    setState({ status: 'loading', projectId })
    void loadProjectPreview(projectId, controller.signal).then(next => {
      if (!controller.signal.aborted) setState(next)
    })
    return () => controller.abort()
  }, [projectId, nonce])
  const visible: PreviewState = !projectId ? { status: 'idle' } : 'projectId' in state && state.projectId === projectId ? state : { status: 'loading', projectId }
  return { ...visible, reload: () => setNonce(n => n + 1) }
}
