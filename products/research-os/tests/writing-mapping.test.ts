import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentPort } from '../src/features/content/content-client'
import { CONTENT_PATH, emptyContent, projectCanvas, type ContentDocument, type ContentSnapshot } from '../src/features/content/content-model'
import type { ContentSession } from '../src/features/content/content-session'
import { sharedContentSession } from '../src/features/content/useContentDocument'
import { applyLiveMapping, awaitSaveLiveCanvas } from '../src/features/projects/useCanvasDocument'
import { updateBindingsFromReceipts, type MappingSavedReceipt } from '../src/features/projects/design-context'
import { fileKey } from '../src/features/review/review-model'
import type { ReviewBatchReceipt, WritingSelection } from '../src/features/review/writing-contract'
import { mapSavedWriting } from '../src/features/workbench/writing-integration'

vi.mock('../src/features/content/content-client', async importOriginal => ({ ...await importOriginal<typeof import('../src/features/content/content-client')>(), contentPort: vi.fn() }))
const sessions: ContentSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()); vi.useRealTimers() })
let serial = 0
function reorderKeys<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().reverse().map(key => [key, item[key]])) : item)) as T
}
async function fixture(refuseSave = false) {
  vi.useFakeTimers()
  const scope = { projectId: 'research-project', workspace: `manuscript-${++serial}` }
  const before: ContentDocument = { ...emptyContent(scope),
    objects: [
      { id: 'claim', kind: 'claim', title: 'Claim', body: 'Limit the scope', sources: [{ kind: 'knowledge', workspace: 'academic', path: 'review.txt', selector: { quote: 'Original review' }, custom: { preserve: true } }], custom: { preserve: true },
        bindings: [{ id: 'binding', workspace: scope.workspace, path: 'main.tex', digest: 'source-before', quote: 'old', start: 0, end: 3 }] },
      { id: 'later', kind: 'design', title: 'Later paragraph', sources: [], bindings: [{ id: 'later-binding', workspace: scope.workspace, path: 'main.tex', digest: 'source-before', quote: 'tail', start: 4, end: 8 }] },
    ],
    artifacts: [{ id: 'paper', kind: 'paper', title: 'Keep artifact', status: 'draft', createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z', blocks: [], sources: [] }],
    views: { canvas: { placements: [{ objectId: 'claim', x: 0, y: 0 }, { objectId: 'later', x: 80, y: 20, collapsed: true }] }, outlines: [{ artifact: 'canvas', items: [{ node: 'claim' }, { node: 'later' }] }], table: { filter: 'claims' } },
    extension: { preserve: ['all', 'fields'] },
  }
  const writes: { document: ContentDocument; expectedDigest: string }[] = []
  const snapshot = (document: ContentDocument, digest: string): ContentSnapshot => ({ document, digest, migrationState: 'migrated', legacySources: [] })
  const write = vi.fn(async (document: ContentDocument, expectedDigest: string) => {
    writes.push({ document, expectedDigest })
    if (refuseSave) throw Object.assign(new Error('Content CAS conflict'), { status: 409 })
    // Go responses need not preserve JSON object insertion order.
    return snapshot(reorderKeys(document), `design-${writes.length + 1}`)
  })
  vi.mocked(contentPort).mockReturnValue({ read: async () => snapshot(before, 'design-1'), write, migrate: async () => { throw new Error('Unexpected migration') } })
  const session = sharedContentSession(scope); sessions.push(session); await session.load()
  const saved: MappingSavedReceipt = {
    attempt: { id: 'real-save', proposalId: 'writing', operationIds: ['edit'], mode: 'apply', at: '2026-09-23T00:00:00Z', actor: 'author', workspace: scope.workspace, path: 'main.tex', beforeDigest: 'source-before', beforeHash: 'before', afterHash: 'after', outcome: 'applied', afterDigest: 'source-after' },
    operations: [{ id: 'edit', target: { kind: 'text', workspace: scope.workspace, path: 'main.tex', start: 0, end: 3 }, baseDigest: 'source-before', before: 'old', after: 'revised', reason: 'Qualify claim', evidence: [], dependsOn: [], impacts: [] }],
  }
  const source = { workspace: scope.workspace, path: 'main.tex', content: 'revised tail', digest: 'source-after' }
  const files = new Map([[fileKey(source), source]])
  const receipt: ReviewBatchReceipt = { version: 1, batchId: 'batch', scope, proposalId: 'writing', mode: 'apply', files: [], status: 'applied', auditConfirmed: true, saved: [saved] }
  const selection: WritingSelection = { design: { path: CONTENT_PATH, digest: 'design-1', cardIds: ['claim'] }, sources: [], evidence: [], context: 'Captured design' }
  const read = vi.fn(async () => ({ content: source.content, digest: source.digest }))
  const mapping = () => mapSavedWriting(scope, receipt, selection, { read, apply: applyLiveMapping, save: awaitSaveLiveCanvas })
  return { scope, before, session, writes, write, saved, files, mapping, read }
}

describe('writing mappings through the canonical shared writer', () => {
  it('saves only bindings, preserves absent layout defaults, and accepts reordered server keys', async () => {
    const f = await fixture()
    await f.mapping()
    expect(f.read).toHaveBeenCalledWith(f.scope.workspace, 'main.tex', f.scope.projectId)
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0].expectedDigest).toBe('design-1')
    const saved = f.session.snapshot().value!
    expect(saved).toEqual({ ...f.before, objects: f.before.objects.map((object, i) => ({ ...object,
      bindings: [{ ...object.bindings![0], digest: 'source-after', quote: i === 0 ? 'revised' : 'tail', start: i === 0 ? 0 : 8, end: i === 0 ? 7 : 12 }],
    })) })
    expect(saved.views.canvas.placements[0]).not.toHaveProperty('collapsed')
    expect(f.session.snapshot()).toMatchObject({ status: 'saved', dirty: false, digest: 'design-2' })
  })

  it('retries an acknowledged mapping without moving ranges again or writing the manuscript', async () => {
    const f = await fixture()
    await f.mapping()
    const saved = f.session.snapshot().value
    await f.mapping()
    expect(f.writes).toHaveLength(1)
    expect(f.session.snapshot().value).toBe(saved)
    expect(f.read).toHaveBeenCalledTimes(2)
    expect(f.session.snapshot()).toMatchObject({ dirty: false, digest: 'design-2' })
  })

  it('does not trust an already-current digest when its stored quote and range disagree', async () => {
    const f = await fixture(); await f.mapping()
    const canvas = projectCanvas(f.session.snapshot().value!)
    canvas.nodes[0] = { ...canvas.nodes[0], bindings: [{ ...canvas.nodes[0].bindings![0], start: 1 }] }
    const result = updateBindingsFromReceipts(canvas, [f.saved], f.files)
    expect(result.status).toBe('failed')
    expect(result.unresolved.map(item => item.bindingId)).toEqual(['binding'])
    expect(f.writes).toHaveLength(1)
  })

  it('still rejects a real design edit between mapping and save', async () => {
    const f = await fixture(), update = applyLiveMapping(f.scope.workspace, [f.saved], f.files)
    expect(update.status).toBe('updated')
    f.session.edit(document => ({ ...document, objects: document.objects.map(object => ({ ...object, title: 'Concurrent edit' })) }))
    await expect(awaitSaveLiveCanvas(f.scope.workspace, update.canvas)).rejects.toThrow('design changed')
    expect(f.writes).toHaveLength(0)
  })

  it('does not acknowledge the old mapping snapshot when the design changes during its save', async () => {
    const f = await fixture()
    let release!: () => void, saving!: () => void
    const started = new Promise<void>(resolve => { saving = resolve })
    f.write.mockImplementationOnce((document, expectedDigest) => {
      f.writes.push({ document, expectedDigest })
      return new Promise(resolve => {
        release = () => resolve({ document: reorderKeys(document), digest: 'design-2', migrationState: 'migrated', legacySources: [] })
        saving()
      })
    })
    const mapping = f.mapping()
    await started
    f.session.edit(document => ({ ...document, objects: document.objects.map(object => ({ ...object, title: 'Concurrent edit' })) }))
    release()
    await expect(mapping).rejects.toThrow('no acknowledged save')
    expect(f.writes.map(write => write.expectedDigest)).toEqual(['design-1', 'design-2'])
    expect(f.session.snapshot().value!.objects[0].title).toBe('Concurrent edit')
  })

  it('retains local mappings on a refused CAS and never retries a manuscript write', async () => {
    const f = await fixture(true)
    await expect(f.mapping()).rejects.toThrow('Content CAS conflict')
    expect(f.writes).toHaveLength(1)
    expect(f.session.snapshot()).toMatchObject({ status: 'conflict', dirty: true, digest: 'design-1' })
    expect(f.session.snapshot().value!.objects[0].bindings![0].digest).toBe('source-after')
    await expect(f.mapping()).rejects.toThrow('Unsaved or conflicted')
    expect(f.writes).toHaveLength(1)
  })
})
