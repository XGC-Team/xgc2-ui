import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONTENT_PATH, emptyContent, serializeContent } from '../src/features/content/content-model'
import { connectReview } from '../src/features/review/review-api'
import { publishReviewBatch } from '../src/features/review/review-batches'
import { REVIEW_PATH, type Anchor, type FileRecord, type Operation, type Proposal } from '../src/features/review/review-model'
import type { BuildRecord } from '../src/features/review/build-provenance'
import { createManuscriptBuild, subscribeManuscriptSaves, type ManuscriptSourcesSaved } from '../src/features/resources/manuscript-build'
import type { SavedInput } from '../src/features/resources/manuscript'
import { subscribeProjectReviewBuilds } from '../src/features/workbench/review-build-followup'

const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals() })
const digest = (content: string) => `sha256:${createHash('sha256').update(content).digest('hex')}`
const record = (content: string): FileRecord => ({ content, digest: digest(content) })
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
let serial = 0
type BuildRequest = { workspaceRef: string; entryPoint: string; sourceRoot: string; expectedInputs: SavedInput[] }
type Options = {
  paths?: string[]; currentWorkspace?: string
  sourceFailure?: { path: string; mode: 'conflict' | 'lost-ack' }
  loseFinalJournalAck?: boolean
  beforeSourceWrite?: (path: string) => Promise<void>
}

/** Real HTTP adapters, domain engine, follow-up bus and coordinator; only the
 * network is an in-memory CAS/compiler fixture. No station or paper is mutated.
 */
async function fixture(options: Options = {}) {
  vi.useFakeTimers()
  const scope = { projectId: `project-${++serial}`, workspace: `source-workspace-${serial}` }
  const document = { ...emptyContent(scope), objects: [{ id: 'claim', kind: 'claim' as const, title: 'Claim', body: 'old', sources: [] }] }
  const paths = options.paths ?? ['main.tex']
  const files = new Map<string, FileRecord>([['main.tex', record('KEEP old END')], [CONTENT_PATH, record(serializeContent(document))],
    ...paths.filter(path => path !== CONTENT_PATH).map(path => [path, record('KEEP old END')] as [string, FileRecord])])
  const buildRequests: BuildRequest[] = [], sourceWrites: string[] = [], events: ManuscriptSourcesSaved[] = []
  const response = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })
  const failure = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status })
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://fixture.invalid'), method = init?.method ?? 'GET'
    if (url.pathname === '/api/v1/capabilities') return response({ latex: { available: true, detail: 'Transport fixture' } })
    if (url.pathname === '/api/v1/manuscripts/build-records') return response([])
    if (url.pathname === '/api/v1/manuscripts/builds' && method === 'POST') {
      const request = JSON.parse(String(init?.body)) as BuildRequest
      buildRequests.push(request)
      const inputs = new Map(request.expectedInputs.map(item => [item.path, item.digest]))
      if (!inputs.has(request.entryPoint)) inputs.set(request.entryPoint, files.get(request.entryPoint)!.digest.replace('sha256:', ''))
      const build: BuildRecord = {
        task: { schemaVersion: 'xgc.research.manuscript/v2', workspaceRef: request.workspaceRef, entryPoint: request.entryPoint, sourceRoot: request.sourceRoot,
          sourceDigest: digest(JSON.stringify([...inputs])).replace('sha256:', ''), requestedAt: '2026-09-23T00:00:00Z', inputs: [...inputs].map(([path, digest]) => ({ path, digest })) },
        manifest: { schemaVersion: 'xgc.research.manuscript/v2', buildId: `transport-build-${serial}`, status: 'succeeded', completedAt: '2026-09-23T00:00:01Z',
          logArtifactRef: `cas://sha256/${'a'.repeat(64)}`, outputs: [{ mediaType: 'application/pdf', digest: 'b'.repeat(64) }] },
      }
      return response(build)
    }
    const prefix = `/api/v1/workspaces/${scope.workspace}/`
    if (!url.pathname.startsWith(prefix)) throw new Error(`Unexpected transport request: ${method} ${url.pathname}`)
    const relative = url.pathname.slice(prefix.length), path = relative === 'research-content' ? CONTENT_PATH : decodeURIComponent(relative.replace(/^files\//, ''))
    if (method === 'GET') {
      const file = files.get(path)
      return file ? response(path === CONTENT_PATH ? { ...file, document: JSON.parse(file.content) } : file) : failure(404, 'Missing fixture file')
    }
    if (method !== 'PUT') throw new Error(`Unexpected transport mutation: ${method}`)
    const body = JSON.parse(String(init?.body)) as { content: string; expectedDigest?: string; createOnly?: boolean }
    const previous = files.get(path)
    if (body.createOnly ? !!previous : previous?.digest !== body.expectedDigest) return failure(409, 'Fixture CAS conflict')
    if (path !== REVIEW_PATH) {
      await options.beforeSourceWrite?.(path)
      if (options.sourceFailure?.path === path && options.sourceFailure.mode === 'conflict') return failure(409, 'External source changed')
      sourceWrites.push(path)
    }
    const saved = record(body.content); files.set(path, saved)
    if (options.sourceFailure?.path === path && options.sourceFailure.mode === 'lost-ack') throw new TypeError('Source acknowledgement lost')
    if (path === REVIEW_PATH && options.loseFinalJournalAck && JSON.parse(body.content).attempts.some((attempt: { outcome: string }) => attempt.outcome === 'applied')) throw new TypeError('Journal acknowledgement lost')
    return response({ digest: saved.digest })
  })
  vi.stubGlobal('fetch', fetch)
  const controller = createManuscriptBuild({ workspace: scope.workspace, entryPoint: 'main.tex' }, undefined, 20)
  cleanups.push(controller.subscribe(() => {}))
  const stopFollowup = subscribeProjectReviewBuilds(options.currentWorkspace ?? scope.workspace)
  cleanups.push(stopFollowup)
  cleanups.push(subscribeManuscriptSaves(event => { if (event.workspace === scope.workspace) events.push(event) }))
  const engine = connectReview(scope, () => {}); cleanups.push(() => engine.dispose())
  await engine.load()
  const operations: Operation[] = paths.map((path, i) => {
    const target = path === CONTENT_PATH ? { kind: 'canvas' as const, workspace: scope.workspace, path, objectId: 'claim', field: 'body' as const }
      : { kind: 'text' as const, workspace: scope.workspace, path, start: 5, end: 8 }
    const anchor: Anchor = { kind: target.kind, workspace: scope.workspace, path, target, quote: 'old', digest: files.get(path)!.digest }
    return { id: `change-${i}`, target, baseDigest: anchor.digest, before: 'old', after: 'revised', reason: 'Local clarification', evidence: [anchor], dependsOn: [], impacts: [] }
  })
  const proposal: Proposal = { id: 'local-review', title: 'Reviewed local changes', author: 'author', at: '2026-09-23T00:00:00Z',
    feedback: { id: 'feedback', author: 'reviewer', at: '2026-09-23T00:00:00Z', body: 'Clarify', anchor: operations[0].evidence[0] }, operations }
  await engine.add(proposal)
  const apply = () => engine.run(proposal.id, operations.map(operation => operation.id), 'author', 'apply')
  return { scope, engine, controller, apply, files, sourceWrites, buildRequests, events, stopFollowup }
}

describe('completed review batches trigger manuscript builds', () => {
  it('waits for the completed domain batch, then requests one build of exact saved TeX/Bib revisions', async () => {
    const paused = deferred(), release = deferred()
    const f = await fixture({ paths: ['main.tex', 'notes.md', 'references.bib'], beforeSourceWrite: async path => { if (path === 'references.bib') { paused.resolve(); await release.promise } } })
    await vi.advanceTimersByTimeAsync(100)
    expect(f.buildRequests).toEqual([])
    const applying = f.apply(); await paused.promise
    expect(f.sourceWrites).toEqual(['main.tex', 'notes.md'])
    await vi.advanceTimersByTimeAsync(100)
    expect(f.events).toEqual([]); expect(f.buildRequests).toEqual([])
    release.resolve(); await applying
    expect(f.engine.snapshot().lastBatch?.status).toBe('applied')
    expect(f.events).toHaveLength(1); expect(f.buildRequests).toEqual([])
    await vi.advanceTimersByTimeAsync(20)
    expect(f.buildRequests).toEqual([{ workspaceRef: f.scope.workspace, entryPoint: 'main.tex', sourceRoot: '.', expectedInputs: ['main.tex', 'references.bib'].map(path => ({ path, digest: f.files.get(path)!.digest.replace('sha256:', '') })) }])
    expect(f.controller.getSnapshot()).toMatchObject({ phase: 'succeeded', freshness: 'saved-snapshot' })
  })

  it('does not build saved canonical canvas JSON or research notes', async () => {
    const f = await fixture({ paths: [CONTENT_PATH, 'notes.md'] })
    await f.apply(); await vi.advanceTimersByTimeAsync(100)
    expect(f.engine.snapshot().lastBatch?.saved).toHaveLength(2)
    expect(f.sourceWrites).toEqual([CONTENT_PATH, 'notes.md'])
    expect(f.events).toEqual([]); expect(f.buildRequests).toEqual([])
  })

  it('ignores completed batches for a workspace that is no longer observed', async () => {
    const f = await fixture()
    f.stopFollowup(); cleanups.push(subscribeProjectReviewBuilds('another-workspace'))
    await f.apply(); await vi.advanceTimersByTimeAsync(100)
    expect(f.engine.snapshot().lastBatch?.saved).toHaveLength(1)
    expect(f.events).toEqual([]); expect(f.buildRequests).toEqual([])
  })

  it('deduplicates completed receipts and rejects conflicting reuse of the same batch identity', async () => {
    const f = await fixture(); await f.apply()
    const receipt = f.engine.snapshot().lastBatch!
    expect(publishReviewBatch(receipt)).toEqual([])
    await vi.advanceTimersByTimeAsync(20)
    expect(publishReviewBatch(receipt)).toEqual([])
    await vi.advanceTimersByTimeAsync(20)
    expect(f.events).toHaveLength(1); expect(f.buildRequests).toHaveLength(1)
    const changed = structuredClone(receipt); changed.saved[0].attempt.afterDigest = digest('different source')
    expect(publishReviewBatch(changed)[0]).toContain('reused with different receipts')
    await vi.advanceTimersByTimeAsync(20)
    expect(f.buildRequests).toHaveLength(1)
  })

  it('never compiles an uncertain source acknowledgement or promotes later observed bytes to a saved fact', async () => {
    const f = await fixture({ sourceFailure: { path: 'main.tex', mode: 'lost-ack' } })
    await f.apply(); await vi.advanceTimersByTimeAsync(100)
    expect(f.engine.snapshot().lastBatch).toMatchObject({ status: 'uncertain', saved: [] })
    expect(f.files.get('main.tex')!.content).toBe('KEEP revised END')
    const attempt = f.engine.snapshot().book!.attempts[0], inspected = await f.engine.inspect(attempt.id)
    expect(inspected.match).toBe('after')
    await f.engine.confirmObservation(attempt.id, inspected.digest, 'author')
    await vi.advanceTimersByTimeAsync(100)
    expect(f.engine.snapshot().book!.attempts[0].outcome).toBe('observed-applied')
    expect(f.events).toEqual([]); expect(f.buildRequests).toEqual([])
  })

  it.each(['conflict', 'lost-ack'] as const)('retains an acknowledged save when another file has %s, without inventing its revision', async mode => {
    const f = await fixture({ paths: ['main.tex', 'part.tex'], sourceFailure: { path: 'part.tex', mode } })
    await f.apply(); await vi.advanceTimersByTimeAsync(20)
    expect(f.engine.snapshot().lastBatch?.status).toBe(mode === 'conflict' ? 'partial' : 'uncertain')
    expect(f.buildRequests).toHaveLength(1)
    expect(f.buildRequests[0].expectedInputs).toEqual([{ path: 'main.tex', digest: f.files.get('main.tex')!.digest.replace('sha256:', '') }])
  })

  it('keeps a genuine target acknowledgement buildable when final audit persistence is uncertain', async () => {
    const f = await fixture({ loseFinalJournalAck: true })
    await expect(f.apply()).rejects.toThrow('Journal not confirmed')
    expect(f.engine.snapshot().lastBatch).toMatchObject({ status: 'uncertain', auditConfirmed: false })
    expect(f.engine.snapshot().lastBatch?.saved).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(20)
    expect(f.events).toHaveLength(1); expect(f.buildRequests).toHaveLength(1)
    expect(f.sourceWrites).toEqual(['main.tex'])
  })
})
