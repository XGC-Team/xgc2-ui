import { describe, expect, it } from 'vitest'
import { applyCanvasProjection, applyDraftProjection, emptyContent, parseContentDocument, projectCanvas, projectDraftBook, type ContentDocument, type ContentSnapshot } from '../src/features/content/content-model'
import { createContentSession, type ContentRecovery } from '../src/features/content/content-session'
import { definitionDraftKey, hasDefinitionDrafts } from '../src/features/content/definition-recovery'
const scope = { projectId: 'project', workspace: 'workspace' }
function document(): ContentDocument {
  return { ...emptyContent(scope), objects: [{ id: 'claim', kind: 'claim', title: 'Original', body: 'Theory still to verify', status: 'unverified', sources: [{ kind: 'file', workspace: 'academic', path: 'review.pdf', digest: 'original', selector: { page: 3 }, custom: 'keep' }], custom: { keep: true } }, { id: 'question', kind: 'question', title: 'Objection', sources: [] }],
    relations: [{ id: 'review-question', from: { kind: 'content', workspace: 'workspace', id: 'question', revision: 'revision-1', custom: { keep: true } }, to: { kind: 'content', workspace: 'workspace', path: 'research-content.json', id: 'claim', digest: 'source-digest', selector: { objectId: 'claim', blockId: 'proof', quote: 'Original evidence' } }, relation: 'questions', status: 'unverified' }],
    views: { canvas: { placements: [{ objectId: 'claim', x: 2, y: 3 }], connections: [{ from: 'claim', to: 'question' }] }, outlines: [{ artifact: 'canvas', items: [{ node: 'claim' }, { node: 'question' }] }], table: { filter: 'question' } }, metadata: 'preserve' }
}
function snap(d = document(), digest = 'v1'): ContentSnapshot { return { document: d, digest, migrationState: digest ? 'migrated' : 'legacy', legacySources: [] } }
function recoveryStore() {
  let value: ContentRecovery | null = null
  return { read: () => value, write: (draft: ContentRecovery) => { value = structuredClone(draft) }, clear: () => { value = null } }
}
const noAutoSave = () => () => {}

describe('one research content authority', () => {
  it('refuses unknown numeric extensions that JSON would silently round before editing', () => {
    const bytes = JSON.stringify(document()).replace('"metadata":"preserve"', '"metadata":{"externalId":9007199254740993}')
    expect(() => parseContentDocument(bytes, scope)).toThrow(/cannot preserve exactly/)
  })
  it('roundtrips semantic and visual edges without inventing a relation or dropping source identity', () => {
    const before = document(), view = projectCanvas(before)
    expect(view.edges.map(e => e.relation)).toEqual(['questions', undefined])
    const after = applyCanvasProjection(before, { ...view, nodes: view.nodes.map(n => n.id === 'claim' ? { ...n, title: 'Edited', x: 99 } : n) })
    expect(after.objects[0]).toMatchObject({ kind: 'claim', title: 'Edited', status: 'unverified', custom: { keep: true }, sources: before.objects[0].sources })
    expect(after.relations).toEqual(before.relations)
    expect(after.views.canvas.connections).toEqual([{ from: 'claim', to: 'question' }])
    expect(after.views.table).toEqual({ filter: 'question' })
    expect(after.metadata).toBe('preserve')
  })
  it('source removal in the canvas changes canonical sources while preserving non-file references', () => {
    const before = document(); before.objects[0].sources.push({ kind: 'artifact', id: 'paper', workspace: 'workspace' })
    const view = projectCanvas(before); view.nodes[0] = { ...view.nodes[0], evidence: [] }
    const after = applyCanvasProjection(before, view)
    expect(after.objects[0].sources).toEqual([{ kind: 'artifact', id: 'paper', workspace: 'workspace' }])
    expect(after.objects[0].evidence).toBeUndefined()
  })
  it('updates evidence excerpts and notes without dropping the source page or extensions', () => {
    const before = document(), view = projectCanvas(before)
    view.nodes[0].evidence![0] = { ...view.nodes[0].evidence![0], excerpt: 'Edited quotation', note: 'Needs verification' }
    const source = applyCanvasProjection(before, view).objects[0].sources[0]
    expect(source).toMatchObject({ kind: 'file', path: 'review.pdf', digest: 'original', custom: 'keep', note: 'Needs verification', selector: { page: 3, quote: 'Edited quotation' } })
    expect(source.contentSource).toBeUndefined()
  })
  it('guards recovered definition forms even after their editor has been hidden', () => {
    const entries = new Map([[definitionDraftKey('other-workspace', 'tool'), JSON.stringify({ text: '{', base: '{}' })]])
    const storage = { get length() { return entries.size }, key: (index: number) => [...entries.keys()][index] ?? null, getItem: (key: string) => entries.get(key) ?? null }
    expect(hasDefinitionDrafts('workspace', storage)).toBe(false)
    entries.set(definitionDraftKey('workspace', 'method'), JSON.stringify({ text: '{"unfinished":', base: '{}' }))
    expect(hasDefinitionDrafts('workspace', storage)).toBe(true)
    entries.delete(definitionDraftKey('workspace', 'method'))
    expect(hasDefinitionDrafts('workspace', storage)).toBe(false)
  })
  it('edits artifact blocks while preserving the concurrent canvas/table and unrelated metadata', () => {
    const before = document(), book = projectDraftBook(before)
    const draft = { id: 'paper', kind: 'paper' as const, status: 'draft' as const, title: 'Paper', createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z', blocks: [], sources: [] }
    const next = applyDraftProjection(before, { ...book, drafts: [draft] })
    expect(next.objects).toBe(before.objects); expect(next.relations).toEqual(before.relations)
    expect(next.artifacts).toEqual([draft]); expect(next.views).toBe(before.views)
  })
  it('serializes edits from table, canvas and artifacts across a delayed save with successive CAS digests', async () => {
    let release!: (s: ContentSnapshot) => void
    const writes: { d: ContentDocument; digest: string }[] = []
    const session = createContentSession({ scope, schedule: noAutoSave, port: { read: async () => snap(), migrate: async () => snap(), write: async (d, digest) => {
      writes.push({ d: structuredClone(d), digest }); return writes.length === 1 ? new Promise(resolve => { release = resolve }) : snap(d, 'v3')
    } } })
    await session.load()
    session.edit(d => ({ ...d, objects: d.objects.map(o => o.id === 'claim' ? { ...o, title: 'Table edit' } : o) }))
    const first = session.save(); await Promise.resolve()
    session.edit(d => { const view = projectCanvas(d); return applyCanvasProjection(d, { ...view, nodes: view.nodes.map(n => n.id === 'claim' ? { ...n, x: 200 } : n) }) })
    session.edit(d => applyDraftProjection(d, { ...projectDraftBook(d), links: [{ id: 'workflow', kind: 'workflow' }] }))
    release(snap(writes[0].d, 'v2')); await first; await session.flush()
    expect(writes.map(w => w.digest)).toEqual(['v1', 'v2'])
    expect(writes[1].d.objects[0].title).toBe('Table edit')
    expect(writes[1].d.views.canvas.placements[0].x).toBe(200)
    expect(writes[1].d.links).toEqual([{ id: 'workflow', kind: 'workflow' }])
    expect(session.snapshot().dirty).toBe(false)
  })
  it('does not permit an edit before explicit legacy migration', async () => {
    let migrations = 0, writes = 0
    const session = createContentSession({ scope, schedule: noAutoSave, port: { read: async () => snap(document(), ''), migrate: async () => { migrations++; return snap() }, write: async d => { writes++; return snap(d) } } })
    await session.load()
    expect(session.edit(d => ({ ...d, metadata: 'bad' }))).toBe(false)
    expect(migrations).toBe(0); expect(writes).toBe(0)
    await session.migrate(); expect(migrations).toBe(1)
    expect(session.edit(d => ({ ...d, metadata: 'allowed' }))).toBe(true)
  })
  it('recovers a local draft after restart and saves only against its matching base version', async () => {
    const recovery = recoveryStore(), saved: string[] = []
    const port = { read: async () => snap(), migrate: async () => snap(), write: async (d: ContentDocument, digest: string) => { saved.push(digest); return snap(d, 'v2') } }
    const first = createContentSession({ scope, port, recovery, schedule: noAutoSave }); await first.load()
    first.edit(d => ({ ...d, objects: d.objects.map(o => ({ ...o, title: 'Local edit' })) })); first.dispose()
    const next = createContentSession({ scope, port, recovery, schedule: noAutoSave }); await next.load()
    expect(next.snapshot()).toMatchObject({ recovered: true, dirty: true, digest: 'v1' })
    expect(next.snapshot().value!.objects[0].title).toBe('Local edit')
    await next.flush(); expect(saved).toEqual(['v1']); expect(recovery.read()).toBeNull()
  })
  it('retains recovered local changes when another writer changed the external version', async () => {
    const recovery = recoveryStore(); recovery.write({ version: 1, ...scope, baseDigest: 'v1', document: { ...document(), metadata: 'local' }, updatedAt: 'now' })
    let writes = 0
    const session = createContentSession({ scope, recovery, schedule: noAutoSave, port: { read: async () => snap({ ...document(), metadata: 'external' }, 'v2'), migrate: async () => snap(), write: async d => { writes++; return snap(d) } } })
    await session.load(); await session.save()
    expect(session.snapshot()).toMatchObject({ status: 'conflict', dirty: true, digest: 'v1', externalDigest: 'v2' })
    expect(session.snapshot().value!.metadata).toBe('local'); expect(writes).toBe(0)
    expect(await session.load()).toBe(false)
    await session.load(true)
    expect(session.snapshot().value!.metadata).toBe('external'); expect(session.snapshot().dirty).toBe(false)
    expect(recovery.read()).toBeNull()
  })
  it('retains local source changes and recovery after CAS conflict, without retrying into newer bytes', async () => {
    const recovery = recoveryStore(); let writes = 0
    const session = createContentSession({ scope, recovery, schedule: noAutoSave, port: { read: async () => snap(), migrate: async () => snap(), write: async () => { writes++; throw Object.assign(new Error('stale'), { status: 409 }) } } })
    await session.load(); session.edit(d => ({ ...d, metadata: 'local' })); await session.save(); await session.save()
    expect(session.snapshot().status).toBe('conflict'); expect(recovery.read()?.document.metadata).toBe('local'); expect(writes).toBe(1)
  })
})
