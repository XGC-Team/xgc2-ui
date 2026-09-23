import { afterEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '../src/lib/api'
import { buildSourceMatch, compareBuildRequests, isBuildRecord, previewProvenance, type BuildRecord } from '../src/features/review/build-provenance'
import { buildArtifactURL, buildSavedManuscript, normalizeSavedInputs, pdfFromRecord } from '../src/features/resources/manuscript'
import { createManuscriptBuild, notifyManuscriptSourcesSaved, subscribeManuscriptSaves, type BuildPorts } from '../src/features/resources/manuscript-build'
import { reconcileSave, saveFailure, saveSource } from '../src/features/resources/saved-source'
import { defaultManuscriptSourceRoot, manuscriptSourceRoot, setManuscriptSourceRoot, validateManuscriptSourceRoot } from '../src/features/resources/manuscript-build-config'
const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64)
const scope = { workspace: 'paper-a', entryPoint: 'main.tex' }
function receipt(id = 'one', status: BuildRecord['manifest']['status'] = 'succeeded', requestedAt = '2026-09-20T00:00:00Z'): BuildRecord {
  return {
    task: { schemaVersion: 'xgc.research.manuscript/v2', workspaceRef: scope.workspace, entryPoint: scope.entryPoint, sourceDigest: a, requestedAt, inputs: [{ path: 'main.tex', digest: a }, { path: 'section.tex', digest: b }] },
    manifest: { schemaVersion: 'xgc.research.manuscript/v2', buildId: id, status, completedAt: '2026-09-20T00:00:05Z', logArtifactRef: `cas://sha256/${c}`,
      outputs: status === 'succeeded' ? [{ digest: b, mediaType: 'application/pdf' }] : [], diagnostics: status === 'succeeded' ? [] : [{ message: `actual ${status}` }] },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function io(): BuildPorts {
  return { build: vi.fn(async () => receipt()), history: vi.fn(async () => []), capability: vi.fn(async () => ({ available: true, detail: 'real probe passed' })) }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('current saved-source provenance', () => {
  it('orders requested snapshots, not completion timestamps, including nanosecond precision', () => {
    const older = receipt('older', 'succeeded', '2026-09-20T00:00:00Z')
    older.manifest.completedAt = '2026-09-20T00:01:00Z'
    const newer = receipt('newer', 'failed', '2026-09-20T00:00:00.000000001Z')
    expect([older, newer].sort(compareBuildRequests)[0]).toBe(newer)
    const result = previewProvenance([older, newer], pdfFromRecord(older)!)
    expect(result.valid).toBe(true); expect(result.laterFailure).toBe(true)
    expect(result.selected?.manifest.buildId).toBe('older')
  })
  it('requires current receipt schema and exact source/output identity', () => {
    expect(isBuildRecord(receipt())).toBe(true)
    expect(buildArtifactURL('one', receipt().manifest.logArtifactRef)).toBe(`/api/v1/manuscripts/build-records/one/artifacts/${c}`)
    expect(isBuildRecord({ ...receipt(), manifest: { ...receipt().manifest, logArtifactRef: `sha256:${c}` } })).toBe(false)
    expect(isBuildRecord({ ...receipt(), task: { ...receipt().task, schemaVersion: 'xgc.research.manuscript/v1' } })).toBe(false)
    expect(buildSourceMatch(receipt(), scope.workspace, 'section.tex', `sha256:${b}`)).toBe('match')
    expect(buildSourceMatch(receipt(), scope.workspace, 'section.tex', c)).toBe('changed')
    expect(buildSourceMatch(receipt(), 'other', 'section.tex', b)).toBe('unknown')
    expect(previewProvenance([receipt()], { ...pdfFromRecord(receipt())!, digest: c }).valid).toBe(false)
  })
  it('normalizes actual save receipts and rejects alias/conflicting input paths', () => {
    expect(normalizeSavedInputs([{ path: 'new.sty', digest: `sha256:${a}` }])).toEqual([{ path: 'new.sty', digest: a }])
    expect(() => normalizeSavedInputs([{ path: '../other.tex', digest: a }])).toThrow()
    expect(() => normalizeSavedInputs([{ path: 'a.tex', digest: a }, { path: 'a.tex', digest: b }])).toThrow()
  })
})

describe('saved-batch coordinator', () => {
  it('builds only saves inside the selected root and excludes history from a different root', async () => {
    vi.useFakeTimers()
    const ports = io(), nested = { workspace: scope.workspace, entryPoint: 'paper/main.tex', sourceRoot: 'paper' }
    const scoped = receipt('scoped')
    scoped.task = { ...scoped.task, entryPoint: nested.entryPoint, sourceRoot: nested.sourceRoot, inputs: [{ path: nested.entryPoint, digest: a }] }
    vi.mocked(ports.build).mockResolvedValue(scoped)
    vi.mocked(ports.history).mockResolvedValue([{ ...scoped, task: { ...scoped.task, sourceRoot: '.' } }])
    const controller = createManuscriptBuild(nested, ports, 20)
    await controller.refresh()
    expect(controller.getSnapshot().record).toBeNull()
    controller.saved({ workspace: scope.workspace, changes: [{ path: 'source/unrelated.py', digest: b }, { path: 'papers/other.tex', digest: c }] })
    await vi.advanceTimersByTimeAsync(20)
    expect(ports.build).not.toHaveBeenCalled()
    controller.saved({ workspace: scope.workspace, changes: [{ path: 'paper/main.tex', digest: a }, { path: 'source/unrelated.py', digest: b }] })
    await vi.advanceTimersByTimeAsync(20)
    expect(vi.mocked(ports.build).mock.calls[0].slice(0, 2)).toEqual([nested, [{ path: 'paper/main.tex', digest: a }]])
    expect(controller.getSnapshot().pdf?.buildId).toBe('scoped')
  })
  it('coalesces main, include and newly saved dependency into one build', async () => {
    vi.useFakeTimers(); const ports = io(), controller = createManuscriptBuild(scope, ports, 20)
    controller.saved({ workspace: scope.workspace, changes: [{ path: 'main.tex', digest: a }] })
    controller.saved({ workspace: scope.workspace, changes: [{ path: 'section.tex', digest: b }, { path: 'new.sty', digest: c }] })
    expect(controller.getSnapshot().phase).toBe('queued')
    await vi.advanceTimersByTimeAsync(20)
    expect(ports.build).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ports.build).mock.calls[0][1]).toHaveLength(3)
    expect(controller.getSnapshot().phase).toBe('succeeded')
  })
  it('invalidates an older response immediately, before the next debounce expires', async () => {
    vi.useFakeTimers(); const ports = io(), old = deferred<BuildRecord>()
    vi.mocked(ports.build).mockImplementationOnce(() => old.promise).mockResolvedValueOnce(receipt('new'))
    const controller = createManuscriptBuild(scope, ports, 20)
    controller.saved({ workspace: scope.workspace, changes: [{ path: 'main.tex', digest: a }] })
    await vi.advanceTimersByTimeAsync(20)
    const oldSignal = vi.mocked(ports.build).mock.calls[0][2]
    controller.saved({ workspace: scope.workspace, changes: [{ path: 'section.tex', digest: c }] })
    expect(oldSignal.aborted).toBe(true)
    old.resolve(receipt('old')); await Promise.resolve()
    expect(controller.getSnapshot().pdf).toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(controller.getSnapshot().pdf?.buildId).toBe('new')
  })
  it('retains the previous successful PDF through failure, cancellation and retry', async () => {
    const ports = io(), controller = createManuscriptBuild(scope, ports)
    await controller.build(); const pdf = controller.getSnapshot().pdf
    vi.mocked(ports.build).mockResolvedValueOnce(receipt('failed', 'failed'))
    await controller.build()
    expect(controller.getSnapshot().phase).toBe('failed'); expect(controller.getSnapshot().pdf).toBe(pdf)
    controller.cancel(); expect(controller.getSnapshot().pdf).toBe(pdf)
    vi.mocked(ports.build).mockResolvedValueOnce(receipt('retry'))
    await controller.retry(); expect(controller.getSnapshot().pdf?.buildId).toBe('retry')
    expect(vi.mocked(ports.build).mock.calls.at(-1)?.[1]).toEqual([])
  })
  it('never launches for a different workspace or a duplicate saved digest', async () => {
    vi.useFakeTimers(); const ports = io(), controller = createManuscriptBuild(scope, ports, 20)
    controller.saved({ workspace: 'other', changes: [{ path: 'main.tex', digest: a }] })
    await vi.advanceTimersByTimeAsync(20); expect(ports.build).not.toHaveBeenCalled()
    const event = { workspace: scope.workspace, changes: [{ path: 'main.tex', digest: a }] }
    controller.saved(event); controller.saved(event); await vi.advanceTimersByTimeAsync(20)
    controller.saved(event); await vi.advanceTimersByTimeAsync(20)
    expect(ports.build).toHaveBeenCalledTimes(1)
  })
  it('cancels pending work and ignores completion after the last consumer leaves', async () => {
    vi.useFakeTimers(); const ports = io(), pending = deferred<BuildRecord>()
    vi.mocked(ports.build).mockReturnValue(pending.promise)
    const controller = createManuscriptBuild(scope, ports, 20), off = controller.subscribe(() => {})
    await Promise.resolve()
    controller.saved({ workspace: scope.workspace, changes: [{ path: 'main.tex', digest: a }] })
    await vi.advanceTimersByTimeAsync(20); off()
    expect(vi.mocked(ports.build).mock.calls[0][2].aborted).toBe(true)
    pending.resolve(receipt()); await Promise.resolve()
    expect(controller.getSnapshot().pdf).toBeNull()
  })
  it('cannot let a late history load overwrite a newer completed build', async () => {
    const ports = io(), history = deferred<BuildRecord[]>()
    vi.mocked(ports.history).mockReturnValue(history.promise)
    const controller = createManuscriptBuild(scope, ports)
    const refresh = controller.refresh(); await controller.build()
    history.resolve([receipt('historical')]); await refresh
    expect(controller.getSnapshot().pdf?.buildId).toBe('one')
  })
  it('reports unavailable environment and 409 without inventing a successful record', async () => {
    const ports = io(), controller = createManuscriptBuild(scope, ports)
    vi.mocked(ports.capability).mockResolvedValueOnce({ available: false, detail: 'sandbox probe failed' })
    await controller.refresh(); expect(controller.getSnapshot().phase).toBe('unavailable')
    expect(controller.getSnapshot().pdf).toBeNull()
    vi.mocked(ports.build).mockRejectedValueOnce(new APIError('saved source changed', 409))
    await controller.build(); expect(controller.getSnapshot().phase).toBe('source-changed')
    expect(controller.getSnapshot().record).toBeNull()
  })
  it('emits a completed batch once and refuses reused IDs with different receipts', () => {
    const listener = vi.fn(), off = subscribeManuscriptSaves(listener)
    const event = { workspace: scope.workspace, batchId: 'complete-agent-test', changes: [{ path: 'main.tex', digest: a }, { path: 'section.tex', digest: b }] }
    try {
      notifyManuscriptSourcesSaved(event); notifyManuscriptSourcesSaved(event)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(() => notifyManuscriptSourcesSaved({ ...event, changes: [{ path: 'main.tex', digest: c }] })).toThrow()
    } finally { off() }
  })
})

describe('real HTTP adapter contract (transport fixtures, not a compiler substitute)', () => {
  it('requires the returned capture scope to equal the requested root', async () => {
    const record = receipt()
    record.task = { ...record.task, entryPoint: 'paper/main.tex', sourceRoot: '.', inputs: [{ path: 'paper/main.tex', digest: a }] }
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: record }), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    await expect(buildSavedManuscript({ ...scope, entryPoint: 'paper/main.tex', sourceRoot: 'paper' }, [])).rejects.toThrow('does not match')
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).sourceRoot).toBe('paper')
    await expect(buildSavedManuscript({ ...scope, entryPoint: 'paper/main.tex', sourceRoot: 'paper' }, [{ path: 'elsewhere.tex', digest: b }])).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
    record.task.sourceRoot = 'paper'
    record.task.inputs.push({ path: 'outside.tex', digest: b })
    expect(isBuildRecord(record)).toBe(false)
  })
  it('posts only saved intent, carries cancellation, and never requests Git or client toolchain data', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: receipt() }), { status: 201 }))
    vi.stubGlobal('fetch', fetch); const controller = new AbortController()
    await buildSavedManuscript(scope, [{ path: 'main.tex', digest: `sha256:${a}` }], controller.signal)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/manuscripts/builds'); expect(init.signal).toBe(controller.signal)
    expect(JSON.parse(String(init.body))).toEqual({ workspaceRef: scope.workspace, entryPoint: scope.entryPoint, sourceRoot: '.', expectedInputs: [{ path: 'main.tex', digest: a }] })
  })
  it('rejects a returned snapshot that does not contain the saved file receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: receipt() }), { status: 201 })))
    await expect(buildSavedManuscript(scope, [{ path: 'new.tex', digest: c }])).rejects.toThrow('does not match')
  })
  it('uses the exact file CAS baseline and verifies the returned saved bytes', async () => {
    const content = 'saved without a commit\n'
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
    const digest = `sha256:${[...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { digest } })))
    vi.stubGlobal('fetch', fetch)
    expect(await saveSource(scope.workspace, 'section.tex', { before: { content: 'before', digest: `sha256:${a}` }, content })).toEqual({ content, digest })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ content, expectedDigest: `sha256:${a}` })
  })
  it('keeps uncertain and conflicting saves distinct and never writes during reconciliation', () => {
    expect(saveFailure(new APIError('conflict', 412))).toBe('conflict')
    expect(saveFailure(new APIError('service failed', 503))).toBe('uncertain')
    expect(saveFailure(new TypeError('connection lost'))).toBe('uncertain')
    const attempt = { before: { content: 'old', digest: a }, content: 'new' }
    expect(reconcileSave(attempt, { content: 'new', digest: b })).toBe('saved')
    expect(reconcileSave(attempt, attempt.before)).toBe('not-saved')
    expect(reconcileSave(attempt, { content: 'external edit', digest: c })).toBe('conflict')
  })
})

describe('explicit manuscript source settings', () => {
  it('starts from the entry parent and retains a deliberately wider valid root', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
    expect(defaultManuscriptSourceRoot('main.tex')).toBe('.')
    expect(manuscriptSourceRoot('scope-setting-fixture', 'paper/main.tex')).toBe('paper')
    setManuscriptSourceRoot('scope-setting-fixture', 'paper/main.tex', '.')
    expect(manuscriptSourceRoot('scope-setting-fixture', 'paper/main.tex')).toBe('.')
    expect(() => validateManuscriptSourceRoot('paper/main.tex', '../')).toThrow()
    expect(() => validateManuscriptSourceRoot('paper/main.tex', 'papers')).toThrow()
    expect(() => validateManuscriptSourceRoot('paper/main.tex', 'paper/main.tex')).toThrow()
  })
})
