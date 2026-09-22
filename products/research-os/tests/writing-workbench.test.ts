import { beforeEach, describe, expect, it, vi } from 'vitest'
import { annotationDiscussion, bypassesDesignConfirmation, pdfFeedbackAnchor } from '../src/features/workbench/annotation-discussion'
import { isIdleWebTab, matchReadingPdf, researchProjects } from '../src/features/workbench/writing-session'
import { loadProjectPreview } from '../src/features/workbench/useProjectPreview'
import { APIError } from '../src/lib/api'

vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
vi.stubGlobal('document', { documentElement: { lang: 'zh' } })

const { listPDFVersions } = vi.hoisted(() => ({ listPDFVersions: vi.fn() }))
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../src/features/resources/manuscript', () => ({ listPDFVersions }))
vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api')
  return { ...actual, request }
})

const { useWorkbench } = await import('../src/store')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(localStorage.getItem).mockReturnValue(null)
  listPDFVersions.mockReset()
  request.mockReset()
  useWorkbench.setState({
    projectId: '', rightTabs: [], activeRightTab: '', sourceView: null, canvasProject: null,
    activeNav: 'chat', reviewIntents: [], reviewDockOpen: false, chatSurface: 'home', reviewFocus: null,
  })
})

describe('writing project discovery', () => {
  it('opens only the homogeneous and heterogeneous manuscripts', () => {
    expect(researchProjects(
      [
        { workspaceId: 'paper-homo-dmpc' },
        { workspaceId: 'paper-hetero-dmpc' },
        { workspaceId: 'paper-comm-dmpc' },
        { workspaceId: 'academic' },
      ],
      [{ projectId: 'paper-fifo-dmpc', title: 'fifo' }, { id: 'notes-extra', title: 'Field notes' }],
    )).toEqual([
      { id: 'paper-homo-dmpc', title: '同构' },
      { id: 'paper-hetero-dmpc', title: '异构' },
    ])
  })
})

describe('PDF annotation discussion', () => {
  it('starts a versioned design discussion and is not a write grant', () => {
    const text = annotationDiscussion({
      workspace: 'paper-lab', path: 'manuscript/main.tex', buildId: 'build-1', digest: 'sha256:abc',
      page: 3, kind: 'text', quote: 'original claim', comment: 'soften this sentence',
    })
    expect(text).toContain('项目：paper-lab')
    expect(text).toContain('PDF 版本：sha256:abc')
    expect(text).toContain('批注：soften this sentence')
    expect(bypassesDesignConfirmation(text)).toBe(false)
    expect(bypassesDesignConfirmation('请根据以下 PDF 批注修改稿件 manuscript/main.tex。')).toBe(true)
  })
  it('keeps the PDF feedback anchor bound to the annotated build', () => {
    const pdf = { workspace: 'paper-lab', path: 'manuscript/main.tex', buildId: 'build-1', digest: 'sha256:abc', url: '/pdf' }
    const anchor = { schema: 'research.pdf-anchor/v1' as const, kind: 'region' as const, page: 2, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }], quote: 'figure', context: '' }
    expect(pdfFeedbackAnchor(pdf, anchor)).toMatchObject({ kind: 'pdf', buildId: 'build-1', digest: 'sha256:abc', page: 2, origin: 'project-build' })
  })
})

describe('writing workbench store', () => {
  it('starts without an idle web tab occupying the preview', () => {
    expect(useWorkbench.getState().rightTabs).toEqual([])
  })
  it('enters a writing project, remembers it, and drops the idle browser tab', () => {
    useWorkbench.setState({ rightTabs: [{ id: 'rt-idle', kind: 'web', title: '新网页' }], activeRightTab: 'rt-idle', canvasProject: 'other' })
    useWorkbench.getState().enterWritingProject('paper-lab')
    const state = useWorkbench.getState()
    expect(state).toMatchObject({ projectId: 'paper-lab', activeNav: 'chat', chatSurface: 'writing', canvasProject: null, sourceView: null, rightTabs: [], reviewDockOpen: false })
    expect(localStorage.setItem).toHaveBeenCalledWith('research-ui-project', 'paper-lab')
    expect(localStorage.setItem).toHaveBeenCalledWith('research-ui-recent-projects', JSON.stringify(['paper-lab']))
  })
  it('generic chat leaves a writing project; Chat navigation does not', () => {
    useWorkbench.getState().enterWritingProject('paper-lab')
    useWorkbench.getState().setActiveNav('knowledge')
    useWorkbench.getState().setActiveNav('chat')
    expect(useWorkbench.getState().projectId).toBe('paper-lab')
    useWorkbench.getState().openChat()
    expect(useWorkbench.getState()).toMatchObject({ projectId: '', chatSurface: 'generic', canvasProject: null, reviewDockOpen: false })
  })
  it('routes review feedback into the writing dock instead of a competing right tab', () => {
    const intent = {
      id: 'feedback', scope: { projectId: 'paper-lab', workspace: 'paper-lab' },
      anchor: { kind: 'pdf' as const, workspace: 'paper-lab', path: 'manuscript/main.tex', digest: 'sha256:abc', quote: 'claim', buildId: 'build-1', page: 1, origin: 'project-build' as const },
      body: 'discuss first', at: '2026-09-20T12:00:00Z',
    }
    useWorkbench.getState().requestReviewFeedback(intent)
    const state = useWorkbench.getState()
    expect(state.reviewDockOpen).toBe(true)
    expect(state.activeNav).toBe('chat')
    expect(state.rightTabs).toHaveLength(0)
    expect(state.reviewIntents[0].anchor.quote).toBe('claim')
  })
  it('treats a web tab with no URL as idle', () => {
    expect(isIdleWebTab({ kind: 'web' })).toBe(true)
    expect(isIdleWebTab({ kind: 'web', url: 'https://example.com' })).toBe(false)
    expect(isIdleWebTab({ kind: 'pdf' })).toBe(false)
  })
})

describe('project preview from existing PDFs', () => {
  it('restores the page and shows the latest successful PDF without compiling', async () => {
    const versions = [
      { workspace: 'paper-lab', path: 'manuscript/main.tex', buildId: 'new', digest: 'sha256:new', url: '/new', completedAt: '2026-09-20T12:00:00Z' },
      { workspace: 'paper-lab', path: 'manuscript/main.tex', buildId: 'old', digest: 'sha256:old', url: '/old', completedAt: '2026-09-19T12:00:00Z' },
    ]
    listPDFVersions.mockResolvedValue(versions)
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => key === 'research-ui-reading:paper-lab'
      ? JSON.stringify({ path: 'manuscript/main.tex', buildId: 'old', digest: 'sha256:old', page: 4 })
      : null)
    const preview = await loadProjectPreview('paper-lab')
    expect(preview).toEqual({ status: 'ready', projectId: 'paper-lab', pdf: versions[0], page: 4, followCurrent: true })
    expect(matchReadingPdf(versions, { path: 'manuscript/main.tex', buildId: 'old', digest: 'sha256:old', page: 4 })).toBe(versions[0])
    expect(request).not.toHaveBeenCalled()
  })
  it('reports a missing compiler instead of showing a fake build button', async () => {
    listPDFVersions.mockResolvedValue([])
    request.mockResolvedValue({ latex: { available: false, detail: 'trusted local LaTeX is off' }, toolchain: null })
    expect(await loadProjectPreview('paper-lab')).toEqual({ status: 'unavailable', projectId: 'paper-lab', detail: 'trusted local LaTeX is off' })
  })
  it('keeps an empty project distinct from a failed listing', async () => {
    listPDFVersions.mockResolvedValue([])
    request.mockRejectedValue(new APIError('missing', 404))
    expect(await loadProjectPreview('paper-lab')).toEqual({ status: 'empty', projectId: 'paper-lab', detail: 'no-pdf' })
    listPDFVersions.mockRejectedValue(new Error('offline'))
    expect(await loadProjectPreview('paper-lab')).toEqual({ status: 'failed', projectId: 'paper-lab', detail: 'offline' })
  })
})
