import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/features/chat/client', () => ({
  sendNativePrompt: vi.fn(async () => undefined),
}))

import { sendNativePrompt } from '../src/features/chat/client'
import { archivedDocumentURL, parseArchiveIdentity, sameArchive } from '../src/features/literature/archive'
import { citationAnchor, excerptOnPage, readingSelection, selectionToContextItem } from '../src/features/literature/selection'
import { formatStudyPrompt, sendLiteratureStudy, type StudyPort } from '../src/features/literature/study'
import { submitIntake, type IntakePort } from '../src/features/projects/intake-queue'
import type { ArchiveIdentity, PageProjection, ReadingSelection } from '../src/features/literature/types'

const digest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const scope = { projectId: 'paper-e2e-a', workspace: 'paper-e2e-a' }
const archive = (over: Partial<ArchiveIdentity> = {}): ArchiveIdentity => ({
  manifestId: 'manifest-1', workId: 'work-1', manifestationId: 'manifestation-1', documentVersionId: 'document-1',
  acquisitionId: 'acquisition-1', sourceSha256: digest, extractionJobId: 'job-1', extractionState: 'queued',
  extractionAvailability: 'available', replayed: false, ...over,
})
const projection = (): PageProjection => ({
  schemaVersion: 'xgc.research.reading-page/v1', sessionId: 'session-1', workId: 'work-1', acquisitionId: 'acquisition-1',
  documentVersionId: 'document-1', sourceSha256: digest, snapshotSha256: 'b'.repeat(64), evidenceArtifactId: 'ev-1',
  evidenceArtifactSha256: 'c'.repeat(64), page: 1, unitCount: 2,
  unit: { locator: 1, text: 'Traceable evidence paragraph.', textSha256: 'd'.repeat(64), charCount: 29 },
  blocks: [{ kind: 'text', text: 'Traceable evidence paragraph.', textSha256: 'd'.repeat(64) }],
})
const selection = (over: Partial<ReadingSelection> = {}): ReadingSelection => readingSelection({
  scope, archive: archive(), projection: projection(), page: 1, excerpt: 'Traceable evidence paragraph.',
  ...over,
})
const readyPort = (): StudyPort => ({
  projectId: 'paper-e2e-a',
  requireCurrentSession: () => ({
    busy: false,
    session: { id: 'native-1', archived: false },
    state: { worker: 'ready' },
    turnSelection: { profileId: 'p1', model: 'model-a', effort: 'low', permission: 'read-only' },
  }),
})

describe('literature archive identity', () => {
  it('accepts intake receipts with work/document/acquisition identity', () => {
    const parsed = parseArchiveIdentity({
      manifest: { id: 'manifest-1', workId: 'work-1', manifestationId: 'manifestation-1', documentVersionId: 'document-1', acquisitionId: 'acquisition-1', extractionJobId: 'job-1' },
      work: { id: 'work-1' }, manifestation: { id: 'manifestation-1' }, document: { id: 'document-1', sha256: digest },
      extractionJob: { id: 'job-1', state: 'queued', adapterAvailability: 'unavailable' }, replayed: true,
    })
    expect(parsed.sourceSha256).toBe(digest)
    expect(parsed.replayed).toBe(true)
    expect(parsed.extractionAvailability).toBe('unavailable')
    expect(archivedDocumentURL(digest)).toBe(`/api/v1/documents/${digest}/content`)
    expect(sameArchive(archive(), archive({ replayed: true }))).toBe(true)
  })
  it('rejects a receipt that dropped the archived digest', () => {
    expect(() => parseArchiveIdentity({
      manifest: { id: 'manifest-1', acquisitionId: 'acquisition-1' },
      work: { id: 'work-1' }, manifestation: { id: 'manifestation-1' }, document: { id: 'document-1' },
      extractionJob: { id: 'job-1' },
    })).toThrow(/digest/)
  })
})

describe('reading selections and citations', () => {
  it('keeps archived identity and refuses a manuscript buildId', () => {
    const current = selection()
    expect(current.workId).toBe('work-1')
    expect(current.readingSessionId).toBe('session-1')
    expect('buildId' in current).toBe(false)
    const item = selectionToContextItem(current)
    expect(item.kind).toBe('source')
    expect(item.ref).toContain(`archived-document:${digest}`)
    expect(item.source?.page).toBe(1)
    expect(citationAnchor(current).documentVersionId).toBe('document-1')
  })
  it('does not mark an off-page excerpt as verified', () => {
    expect(excerptOnPage(projection(), 'missing quote')).toBe(false)
    expect(readingSelection({ scope, archive: archive(), projection: projection(), page: 1, excerpt: 'missing quote' }).verification.verified).toBe(false)
  })
})

describe('guided study send', () => {
  it('labels untrusted source text separately from the question', () => {
    const prompt = formatStudyPrompt({ selection: selection(), question: 'Explain the claim.' })
    expect(prompt).toContain('BEGIN_UNTRUSTED_SOURCE')
    expect(prompt).toContain('Traceable evidence paragraph.')
    expect(prompt).toContain('BEGIN_USER_QUESTION')
    expect(prompt).toContain('Explain the claim.')
    expect(prompt).toContain('unverified-excerpt')
  })
  it('refuses empty questions, foreign projects and missing sessions without sending', async () => {
    expect(await sendLiteratureStudy(readyPort(), { selection: selection(), question: '  ' })).toEqual({ outcome: 'refused', reason: 'empty-question' })
    expect(await sendLiteratureStudy(readyPort(), { selection: { ...selection(), projectId: 'other' }, question: 'Why?' })).toEqual({ outcome: 'refused', reason: 'project-mismatch' })
    expect(await sendLiteratureStudy({
      projectId: 'paper-e2e-a',
      requireCurrentSession: () => { throw new Error('no current session') },
    }, { selection: selection(), question: 'Why?' })).toEqual({ outcome: 'refused', reason: 'no current session' })
    expect(sendNativePrompt).not.toHaveBeenCalled()
  })
  it('reuses the current native session instead of creating another chat engine', async () => {
    const receipt = await sendLiteratureStudy(readyPort(), { selection: selection(), question: 'Why this paragraph?' })
    expect(receipt.outcome).toBe('sent')
    if (receipt.outcome === 'sent') expect(receipt.providerSessionId).toBe('native-1')
    expect(sendNativePrompt).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendNativePrompt).mock.calls[0][0]).toBe('native-1')
    expect(String(vi.mocked(sendNativePrompt).mock.calls[0][1])).toContain('BEGIN_UNTRUSTED_SOURCE')
  })
})

describe('PDF intake identity', () => {
  it('does not accept a PDF that returns no reading identity', async () => {
    const port: IntakePort = {
      pdf: async () => ({ ...archive(), sourceSha256: '' }),
      text: async () => ({ id: 't', workspace: scope.workspace, path: 't.md', digest: 'd' }),
    }
    const receipt = await submitIntake(new File(['pdf'], 'paper.pdf'), scope, port)
    expect(receipt.state).toBe('failed')
    expect(receipt.archive).toBeUndefined()
  })
})
