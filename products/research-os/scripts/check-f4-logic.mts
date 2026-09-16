import test from 'node:test'
import assert from 'node:assert/strict'
import { readPreference, writePreference } from '../src/lib/storage.ts'
import { parseEditableCanvas, serializeCanvas, migrateCanvasV1toV2, parseCanvas, type ThinkingCanvasV2 } from '../src/features/projects/canvas-model.ts'
import { parseDraftBook, serializeDraftBook, type DraftBook } from '../src/features/projects/draft-model.ts'
import { confirmFileTabClose } from '../src/features/projects/tab-close-guards.ts'

// Preference storage must never throw into the app, whatever the browser does.
test('preference storage works when the browser cooperates', () => {
  const mem = new Map<string, string>()
  const original = globalThis.localStorage
  ;(globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
  try {
    writePreference('k', 'v')
    assert.equal(readPreference('k'), 'v')
    assert.equal(readPreference('missing'), null)
  } finally { (globalThis as Record<string, unknown>).localStorage = original }
})
test('preference storage failures are swallowed, reads fall back to null', () => {
  const original = globalThis.localStorage
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: () => { throw new DOMException('denied', 'SecurityError') },
    setItem: () => { throw new DOMException('full', 'QuotaExceededError') },
  }
  try {
    writePreference('k', 'v')
    assert.equal(readPreference('k'), null)
  } finally { (globalThis as Record<string, unknown>).localStorage = original }
})
test('preference storage survives localStorage being entirely absent', () => {
  const original = globalThis.localStorage
  ;(globalThis as Record<string, unknown>).localStorage = undefined
  try {
    writePreference('k', 'v')
    assert.equal(readPreference('k'), null)
  } finally { (globalThis as Record<string, unknown>).localStorage = original }
})

// Capacity-scale documents must round-trip without losing identity, relations or order.
const scaleCanvas = (): ThinkingCanvasV2 => ({
  version: 2,
  nodes: [{ id: 'chap', kind: 'chapter', title: 'Spine', x: 0, y: 0 },
    ...Array.from({ length: 39 }, (_, i) => ({ id: `n${i}`, kind: 'idea' as const, title: `Card ${i}`, body: `Body ${i}`, x: i * 260, y: (i % 5) * 190,
      ...(i < 5 ? { evidence: [{ id: `ev${i}`, path: `papers/r${i}.md`, digest: `rev-${i}`, excerpt: 'x' }] } : {}) }))],
  edges: Array.from({ length: 30 }, (_, i) => ({ from: `n${i}`, to: `n${(i + 7) % 39}`, relation: (['supports', 'contradicts', 'depends', 'exemplifies', 'continues', 'cites'] as const)[i % 6] })),
  outlines: [{ artifact: 'canvas', items: [{ node: 'chap', children: Array.from({ length: 39 }, (_, i) => ({ node: `n${i}` })) }] },
    { artifact: 'draft-1', items: [{ node: 'n3' }, { node: 'n1' }] }],
})
test('a 40-card canvas with relations and two arrangements round-trips exactly', () => {
  const canvas = scaleCanvas()
  const reopened = parseEditableCanvas(serializeCanvas(canvas)) as ThinkingCanvasV2
  assert.equal(reopened.nodes.length, 40)
  assert.equal(reopened.edges.length, 30)
  assert.deepEqual(reopened.edges.map(e => e.relation), canvas.edges.map(e => e.relation))
  assert.equal(reopened.nodes[3].evidence?.[0].digest, 'rev-2')
  assert.deepEqual(reopened.outlines.find(o => o.artifact === 'draft-1')?.items.map(i => i.node), ['n3', 'n1'])
})
test('v1 migration at scale preserves node ids and seeds one outline from layout', () => {
  const v1 = { version: 1 as const, nodes: Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, kind: 'idea' as const, title: `M${i}`, x: i * 250, y: i * 100 })), edges: [{ from: 'm0', to: 'm1' }] }
  const migrated = migrateCanvasV1toV2(v1)
  assert.deepEqual(migrated.nodes.map(n => n.id), v1.nodes.map(n => n.id))
  assert.equal(migrated.version, 2)
  assert.equal(migrated.outlines.length, 1)
  // The migrated document still parses as an editable canvas and serializes stably.
  const reopened = parseEditableCanvas(serializeCanvas(migrated))
  assert.deepEqual(serializeCanvas(reopened), serializeCanvas(migrated))
  assert.equal(parseCanvas(JSON.stringify(v1)).nodes.length, 40)
})
test('a 30-draft book across all kinds round-trips with ids, fields and sources intact', () => {
  const scope = { projectId: 'paper-e2e-cap', workspace: 'paper-e2e-cap' }
  const fields: Record<string, string[]> = {
    paper: ['purpose', 'argument', 'evidence', 'constraints'], slides: ['message', 'visual', 'speakerNotes'],
    storyboard: ['visual', 'narration', 'duration'], workflow: ['objective', 'inputs', 'outputs', 'acceptance'],
    rule: ['feed', 'filter', 'action'], experiment: ['question', 'parameters', 'measurement', 'acceptance'],
    note: ['question', 'observation'], material: ['description'],
  }
  const kinds = Object.keys(fields)
  const book: DraftBook = { version: 1, ...scope, drafts: Array.from({ length: 30 }, (_, i) => {
    const kind = kinds[i % kinds.length]
    return { id: `d${i}`, kind, status: 'draft' as const, title: `Draft ${i}`, createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z',
      blocks: [{ id: `b${i}`, title: 'B', fields: Object.fromEntries(fields[kind].map(f => [f, `v${i}`])) }],
      sources: i === 0 ? [{ id: 's0', path: 'paper.md', digest: 'rev-1' }] : [] }
  }) }
  const reopened = parseDraftBook(serializeDraftBook(book), scope)
  assert.equal(reopened.drafts.length, 30)
  assert.deepEqual(reopened.drafts.map(d => d.id), book.drafts.map(d => d.id))
  assert.equal(reopened.drafts[0].sources[0].digest, 'rev-1')
})

// Closing a file tab is never a promise to flush: in-flight saves block, dirty content asks.
const session = (snapshot: { status: string; dirty: boolean }) => {
  const calls: string[] = []
  return { calls, session: { snapshot: () => snapshot, dispose: () => calls.push('dispose') } }
}
test('an in-flight save refuses the close and notifies instead', () => {
  const { calls, session: s } = session({ status: 'saving', dirty: true })
  const allowed = confirmFileTabClose(s, { confirmDiscard: () => { calls.push('confirm'); return true }, notifySaving: () => calls.push('notify') })
  assert.equal(allowed, false)
  assert.deepEqual(calls, ['notify'])
})
test('a dirty editor asks; declining keeps everything, accepting disposes', () => {
  const a = session({ status: 'unsaved', dirty: true })
  assert.equal(confirmFileTabClose(a.session, { confirmDiscard: () => false, notifySaving: () => {} }), false)
  assert.deepEqual(a.calls, [])
  const b = session({ status: 'unsaved', dirty: true })
  assert.equal(confirmFileTabClose(b.session, { confirmDiscard: () => true, notifySaving: () => {} }), true)
  assert.deepEqual(b.calls, ['dispose'])
})
test('a clean saved editor closes without any prompt', () => {
  const { calls, session: s } = session({ status: 'saved', dirty: false })
  assert.equal(confirmFileTabClose(s, { confirmDiscard: () => { calls.push('confirm'); return false }, notifySaving: () => calls.push('notify') }), true)
  assert.deepEqual(calls, ['dispose'])
})
