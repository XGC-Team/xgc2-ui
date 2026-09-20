import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginManuscriptBuild,
  completeManuscriptBuild,
  emptyManuscriptPreview,
  previewTabPatch,
} from '../src/features/resources/manuscript-build'
import { compilePDF, CompileFailure, isManuscriptSource, pdfFromRecord, type BuildRecord } from '../src/features/resources/manuscript'

const pdf = {
  workspace: 'paper-a', path: 'main.tex', buildId: 'build-1', digest: 'aaa', url: '/pdf-1', sourceRevision: 'rev-1',
}

function record(status: string, extra?: Partial<BuildRecord>): BuildRecord {
  return {
    task: { workspaceRef: 'paper-a', entryPoint: 'main.tex', sourceRevision: 'rev-1', inputs: [{ path: 'main.tex', digest: 'src' }] },
    manifest: {
      buildId: 'build-1', status, completedAt: '2026-09-20T00:00:00Z',
      diagnostics: status === 'failed' ? [{ message: 'undefined control sequence' }] : [],
      outputs: status === 'succeeded' ? [{ digest: 'aaa', mediaType: 'application/pdf' }] : [],
    },
    ...extra,
  }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('working-draft compile contract', () => {
  it('treats tex and bibliography files as compile inputs and ignores canvas drafts', () => {
    expect(isManuscriptSource('paper/main.tex')).toBe(true)
    expect(isManuscriptSource('paper/refs.bib')).toBe(true)
    expect(isManuscriptSource('thinking.canvas.json')).toBe(false)
  })

  it('does not send git commits, input digests or toolchain pins', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/capabilities')) {
        return { ok: true, json: async () => ({ data: { latex: { available: true, detail: 'ok' }, toolchain: { imageRef: 'hidden' } } }) }
      }
      expect(JSON.parse(String(init?.body))).toEqual({ workspaceRef: 'paper-a', entryPoint: 'main.tex' })
      expect(String(init?.body)).not.toContain('gitCommit')
      expect(String(init?.body)).not.toContain('inputs')
      expect(String(init?.body)).not.toContain('toolchain')
      return { ok: true, status: 201, json: async () => ({ data: record('succeeded') }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await compilePDF('paper-a', 'main.tex')
    expect(result.buildId).toBe('build-1')
    expect(result.sourceRevision).toBe('rev-1')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('surfaces a failed working-draft record without requiring a Git commit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/capabilities')) {
        return { ok: true, json: async () => ({ data: { latex: { available: true, detail: 'ok' }, toolchain: null } }) }
      }
      return {
        ok: false, status: 422,
        json: async () => ({ error: { message: 'LaTeX build completed without a publishable PDF', details: { record: record('failed') } } }),
      }
    }))
    await expect(compilePDF('paper-a', 'main.tex')).rejects.toBeInstanceOf(CompileFailure)
    try {
      await compilePDF('paper-a', 'main.tex')
    } catch (error) {
      expect(error).toBeInstanceOf(CompileFailure)
      expect((error as CompileFailure).message).toBe('undefined control sequence')
      expect((error as CompileFailure).record?.manifest.buildId).toBe('build-1')
    }
  })

  it('keeps a failed record out of the successful PDF list', () => {
    expect(pdfFromRecord('paper-a', record('failed'))).toBeNull()
    expect(pdfFromRecord('paper-a', record('succeeded'))?.digest).toBe('aaa')
  })
})

describe('preview generation', () => {
  it('ignores a late success after a newer compile has started', () => {
    let state = emptyManuscriptPreview()
    state = beginManuscriptBuild(state)
    const first = state.generation
    state = beginManuscriptBuild(state)
    const second = state.generation
    state = completeManuscriptBuild(state, first, { pdf })
    expect(state.pdf).toBeNull()
    expect(state.compiling).toBe(true)
    state = completeManuscriptBuild(state, second, { pdf: { ...pdf, buildId: 'build-2' } })
    expect(state.pdf?.buildId).toBe('build-2')
    expect(state.compiling).toBe(false)
  })

  it('retains the last successful preview when a later compile fails', () => {
    let state = completeManuscriptBuild(beginManuscriptBuild(emptyManuscriptPreview()), 1, { pdf })
    state = beginManuscriptBuild(state)
    state = completeManuscriptBuild(state, 2, { error: 'undefined control sequence' })
    expect(state.pdf?.buildId).toBe('build-1')
    expect(state.stale).toBe(true)
    expect(state.error).toContain('undefined control sequence')
  })

  it('refreshes the live preview tab instead of opening a second copy', () => {
    const patch = previewTabPatch(
      [{ id: 'tab-old', kind: 'pdf', pdf }],
      pdf,
      { ...pdf, buildId: 'build-2', digest: 'bbb', url: '/pdf-2' },
    )
    expect(patch).toEqual({ id: 'tab-old', pdf: expect.objectContaining({ buildId: 'build-2' }) })
  })
})
