// Run without the app's dependencies: node --experimental-strip-types --test scripts/check-literature.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseArchiveIdentity, archivedDocumentURL, sameArchive } from '../src/features/literature/archive.ts'
import { citationAnchor, excerptOnPage, readingSelection, selectionToContextItem } from '../src/features/literature/selection.ts'
import { submitIntake, retryIntake, intakeSnapshot, intakePort, type IntakePort } from '../src/features/projects/intake-queue.ts'
import type { ArchiveIdentity, PageProjection } from '../src/features/literature/types.ts'

const digest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const scope = { projectId: 'paper-e2e-a', workspace: 'paper-e2e-a' }
const archive = (over: Partial<ArchiveIdentity> = {}): ArchiveIdentity => ({
  manifestId: 'manifest-1', workId: 'work-1', manifestationId: 'manifestation-1', documentVersionId: 'document-1',
  acquisitionId: 'acquisition-1', sourceSha256: digest, extractionJobId: 'job-1', extractionState: 'queued',
  extractionAvailability: 'available', replayed: false, ...over,
})
const receipt = {
  manifest: { id: 'manifest-1', workId: 'work-1', manifestationId: 'manifestation-1', documentVersionId: 'document-1', acquisitionId: 'acquisition-1', extractionJobId: 'job-1', sourceSha256: digest },
  work: { id: 'work-1' }, manifestation: { id: 'manifestation-1' }, document: { id: 'document-1', sha256: digest },
  extractionJob: { id: 'job-1', state: 'queued', adapterAvailability: 'available' }, replayed: false,
}
const projection = (over: Partial<PageProjection> = {}): PageProjection => ({
  schemaVersion: 'xgc.research.reading-page/v1', sessionId: 'session-1', workId: 'work-1', acquisitionId: 'acquisition-1',
  documentVersionId: 'document-1', sourceSha256: digest, snapshotSha256: 'b'.repeat(64), evidenceArtifactId: 'ev-1',
  evidenceArtifactSha256: 'c'.repeat(64), page: 1, unitCount: 2,
  unit: { locator: 1, text: 'Traceable evidence paragraph.', textSha256: 'd'.repeat(64), charCount: 29 },
  blocks: [{ kind: 'text', text: 'Traceable evidence paragraph.', textSha256: 'd'.repeat(64) }], ...over,
})
const port: IntakePort = {
  pdf: async () => archive(),
  text: async (_file, target, id) => ({ id, workspace: target.workspace, path: `${id}.md`, digest: 'saved-revision' }),
}

test('PDF archive receipts require durable work/document/acquisition identity', () => {
  const parsed = parseArchiveIdentity(receipt)
  assert.equal(parsed.workId, 'work-1')
  assert.equal(parsed.acquisitionId, 'acquisition-1')
  assert.equal(parsed.sourceSha256, digest)
  assert.equal(parsed.replayed, false)
  assert.throws(() => parseArchiveIdentity({ ...receipt, document: { id: 'document-1' }, manifest: { ...receipt.manifest, sourceSha256: '' } }))
  assert.throws(() => parseArchiveIdentity({ ...receipt, work: {}, manifest: { ...receipt.manifest, workId: '' } }))
  assert.throws(() => parseArchiveIdentity({ ...receipt, manifest: { ...receipt.manifest, acquisitionId: '' } }))
})

test('archived original URL is the CAS document, never a manuscript build', () => {
  assert.equal(archivedDocumentURL(digest), `/api/v1/documents/${digest}/content`)
  assert.throws(() => archivedDocumentURL('not-a-digest'))
  assert.equal(sameArchive(archive(), archive({ extractionState: 'succeeded' })), true)
  assert.equal(sameArchive(archive(), archive({ sourceSha256: 'e'.repeat(64) })), false)
})

test('reading selections keep page/excerpt identity and never invent a buildId', () => {
  const selection = readingSelection({ scope, archive: archive(), projection: projection(), page: 1, excerpt: 'Traceable evidence paragraph.' })
  assert.equal(selection.schema, 'xgc.research.reading-selection/v1')
  assert.equal(selection.page, 1)
  assert.equal(selection.verification.verified, false)
  assert.ok(!('buildId' in selection))
  assert.throws(() => readingSelection({ scope: { projectId: '', workspace: '' }, archive: archive(), page: 1, excerpt: 'Traceable evidence paragraph.' }))
  assert.throws(() => readingSelection({ scope, archive: archive(), page: 0, excerpt: 'Traceable evidence paragraph.' }))
  assert.throws(() => readingSelection({ scope, archive: archive(), page: 1, excerpt: '   ' }))
})

test('literal page match is not treated as a scientific claim', () => {
  const page = projection()
  assert.equal(excerptOnPage(page, 'Traceable evidence paragraph.'), true)
  assert.equal(excerptOnPage(page, 'not on this page'), false)
  const selection = readingSelection({ scope, archive: archive(), projection: page, page: 1, excerpt: 'not on this page' })
  assert.equal(selection.verification.verified, false)
  const item = selectionToContextItem(selection)
  assert.equal(item.kind, 'source')
  assert.match(item.ref, /^archived-document:/)
  assert.ok(!item.ref.includes('ManuscriptPDF'))
  assert.equal(citationAnchor(selection).pageStart, 1)
})

test('intake is shared, captured-scope, and PDF acceptance keeps archive identity', async () => {
  const mutable = { ...scope }
  const waiting = submitIntake(new File(['text'], 'input.md'), mutable, port)
  mutable.projectId = 'other'
  const receipt = await waiting
  assert.equal(receipt.scope.projectId, scope.projectId)
  assert.equal(receipt.state, 'accepted')
  assert.equal(receipt.source?.digest, 'saved-revision')
  assert.ok(intakeSnapshot().some(item => item.id === receipt.id))
})

test('global PDF intake remains available without creating a project or native session', async () => {
  const result = await submitIntake(new File(['pdf'], 'paper.pdf'), { projectId: '', workspace: 'academic' }, port)
  assert.equal(result.state, 'accepted')
  assert.equal(result.source, undefined)
  assert.equal(result.archive?.acquisitionId, 'acquisition-1')
  assert.equal(result.archive?.sourceSha256, digest)
})

test('unsupported formats never call an upload port', async () => {
  let called = false
  const result = await submitIntake(new File(['x'], 'unsupported.exe'), scope, {
    pdf: async () => { called = true; return archive() },
    text: async () => { called = true; throw Error('unexpected') },
  })
  assert.equal(result.state, 'unsupported')
  assert.equal(called, false)
})

test('failed PDF retry reuses the intake idempotency key and does not retry automatically', async () => {
  const ids: string[] = []
  const flaky: IntakePort = {
    ...port,
    pdf: async (_file, id) => { ids.push(id); if (ids.length === 1) throw Error('network'); return archive() },
  }
  const result = await submitIntake(new File(['x'], 'paper.pdf'), scope, flaky)
  assert.equal(result.state, 'failed')
  assert.equal(ids.length, 1)
  await retryIntake(result.id, flaky)
  assert.equal(result.state, 'accepted')
  assert.equal(result.archive?.workId, 'work-1')
  assert.deepEqual(ids, [result.id, result.id])
  await assert.rejects(retryIntake(result.id, flaky))
})

test('text intake without target project and oversized files are not uploaded', async () => {
  await assert.rejects(submitIntake(new File(['x'], 'a.txt'), { projectId: '', workspace: '' }, port))
  const result = await submitIntake(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.txt'), scope, port)
  assert.equal(result.state, 'failed')
  assert.equal(result.source, undefined)
})

test('missing archive identity cannot produce accepted PDF intake', async () => {
  const result = await submitIntake(new File(['pdf'], 'paper.pdf'), scope, {
    ...port,
    pdf: async () => ({ ...archive(), acquisitionId: '' }),
  })
  assert.equal(result.state, 'failed')
  assert.equal(result.archive, undefined)
})

test('missing saved digest or wrong source scope cannot produce accepted intake', async () => {
  const result = await submitIntake(new File(['text'], 'x.md'), scope, { ...port, text: async () => ({ id: 'bad', workspace: 'other', path: 'x.md' }) })
  assert.equal(result.state, 'failed')
  assert.equal(result.source, undefined)
})

test('default text transport creates a new file, never overwrites a daily research file', async () => {
  const original = globalThis.fetch
  let body: { createOnly?: boolean; expectedDigest?: string; content?: string } | undefined
  let endpoint = ''
  globalThis.fetch = (async (url, init) => {
    endpoint = String(url)
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ data: { digest: 'sha256:observed' } }), { status: 200 })
  }) as typeof fetch
  try {
    const result = await intakePort.text(new File(['content'], '../source.md'), scope, 'stable-id')
    assert.equal(body?.createOnly, true)
    assert.equal(body?.expectedDigest, undefined)
    assert.equal(body?.content, 'content')
    assert.ok(endpoint.includes('material-stable-id-'))
    assert.equal(result.digest, 'sha256:observed')
  } finally { globalThis.fetch = original }
})

test('default PDF transport forwards the idempotency key and parsed archive identity', async () => {
  const original = globalThis.fetch
  let key = ''
  globalThis.fetch = (async (_url, init) => {
    key = new Headers(init?.headers).get('Idempotency-Key') || ''
    return new Response(JSON.stringify({ data: receipt }), { status: 200 })
  }) as typeof fetch
  try {
    const result = await intakePort.pdf(new File(['%PDF'], 'paper.pdf'), 'stable-pdf')
    assert.equal(key, 'stable-pdf')
    assert.equal(result.acquisitionId, 'acquisition-1')
    assert.equal(result.sourceSha256, digest)
  } finally { globalThis.fetch = original }
})

test('source guards: void PDF port, intakePDF and manuscript build claims are gone', () => {
  const queue = readFileSync(new URL('../src/features/projects/intake-queue.ts', import.meta.url), 'utf8')
  assert.match(queue, /Promise<ArchiveIdentity>/)
  assert.doesNotMatch(queue, /pdf: \(file: File, id: string\) => Promise<void>/)
  const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(api, /export async function intakePDF/)
  const workbench = readFileSync(new URL('../src/features/literature/LiteratureWorkbench.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(workbench, /from ['"][^'"]*PDFReader['"]/)
  assert.doesNotMatch(workbench, /ManuscriptPDF|\bbuildId\b/)
  assert.match(workbench, /sendLiteratureStudy/)
  const panel = readFileSync(new URL('../src/features/projects/IntakePanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /LiteratureWorkbench/)
  assert.match(panel, /!compact/)
  const chat = readFileSync(new URL('../src/features/chat/ChatPage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(chat, /LiteratureWorkbench|archivePDF/)
})
