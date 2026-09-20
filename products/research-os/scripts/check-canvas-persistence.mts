import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFileSession, type FilePort, type FileWrite, type FileState } from '../src/features/projects/file-session.ts'
import { emptyCanvas, parseEditableCanvas, serializeCanvas } from '../src/features/projects/canvas-model.ts'

type Doc = { text: string }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function http(status: number) { return Object.assign(new Error(`HTTP ${status}`), { status }) }
function fixture(overrides: Partial<FilePort> = {}) {
  const writes: FileWrite[] = []
  const changes: FileState<Doc>[] = []
  const jobs = new Set<() => void>()
  const session = createFileSession<Doc>({
    port: {
      read: async () => ({ content: '{"text":"old"}', digest: 'd1' }),
      write: async input => { writes.push(input); return { digest: `d${writes.length + 1}` } },
      ...overrides,
    },
    decode: JSON.parse, encode: JSON.stringify, empty: () => ({ text: '' }), changed: state => changes.push(state),
    schedule: run => { jobs.add(run); return () => { jobs.delete(run) } },
  })
  return { session, writes, changes, jobs, runTimer: () => { const queued = [...jobs]; jobs.clear(); queued.forEach(run => run()) } }
}

test('loading does not create a file; existing empty canvas is valid', async () => {
  const f = fixture()
  await f.session.load()
  assert.equal(f.session.snapshot().status, 'saved')
  assert.equal(f.writes.length, 0)
  assert.deepEqual(parseEditableCanvas(serializeCanvas(emptyCanvas())), emptyCanvas())
})
test('only a missing file is editable new state; first save uses createOnly', async () => {
  const f = fixture({ read: async () => { throw http(404) } })
  await f.session.load()
  assert.equal(f.session.snapshot().status, 'new'); assert.equal(f.writes.length, 0)
  f.session.edit(() => ({ text: 'first' })); await f.session.save()
  assert.deepEqual(f.writes, [{ content: '{"text":"first"}', createOnly: true }])
})
for (const status of [401, 403, 500]) {
  test(`read HTTP ${status} cannot enable editing or schedule a write`, async () => {
    const f = fixture({ read: async () => { throw http(status) } })
    await f.session.load(); f.session.edit(() => ({ text: 'new' })); await f.session.save()
    assert.equal(f.session.snapshot().status, 'load-error'); assert.equal(f.session.snapshot().value, null)
    assert.equal(f.writes.length, 0); assert.equal(f.jobs.size, 0)
  })
}
test('bad JSON is invalid, never empty/saved', async () => {
  const f = fixture({ read: async () => ({ content: '{bad', digest: 'd1' }) })
  await f.session.load(); f.session.edit(() => ({ text: 'new' })); await f.session.save()
  assert.equal(f.session.snapshot().status, 'invalid'); assert.equal(f.writes.length, 0)
})
test('missing read digest blocks edits', async () => {
  const f = fixture({ read: async () => ({ content: '{}', digest: '' }) })
  await f.session.load(); assert.equal(f.session.snapshot().status, 'load-error')
})
test('debounced edits coalesce into the latest content', async () => {
  const f = fixture(); await f.session.load()
  f.session.edit(() => ({ text: 'one' })); f.session.edit(() => ({ text: 'two' }))
  assert.equal(f.jobs.size, 1)
  f.runTimer(); await f.session.save()
  assert.deepEqual(f.writes, [{ content: '{"text":"two"}', expectedDigest: 'd1' }])
  assert.equal(f.session.snapshot().dirty, false)
})
test('edits during save are serialized using the returned digest', async () => {
  const first = deferred<{ digest: string }>(); const writes: FileWrite[] = []
  const f = fixture({ write: async input => { writes.push(input); return writes.length === 1 ? first.promise : { digest: 'd3' } } })
  await f.session.load(); f.session.edit(() => ({ text: 'one' })); const saving = f.session.save()
  await Promise.resolve(); f.session.edit(() => ({ text: 'two' })); f.session.edit(() => ({ text: 'three' }))
  assert.equal(f.session.save(), saving); assert.equal(writes.length, 1)
  first.resolve({ digest: 'd2' }); await saving
  assert.equal(f.session.snapshot().dirty, true); assert.equal(f.session.snapshot().status, 'unsaved')
  await f.session.save()
  assert.deepEqual(writes.map(w => w.expectedDigest), ['d1', 'd2'])
  assert.equal(writes[1].content, '{"text":"three"}'); assert.equal(f.session.snapshot().status, 'saved')
})
test('retry retains content and does not run automatically after failure', async () => {
  let attempts = 0
  const f = fixture({ write: async () => { if (++attempts === 1) throw http(503); return { digest: 'd2' } } })
  await f.session.load(); f.session.edit(() => ({ text: 'one' })); await f.session.save()
  f.session.edit(() => ({ text: 'two' }))
  assert.equal(f.jobs.size, 0); assert.equal(f.session.snapshot().value?.text, 'two')
  assert.equal(f.session.snapshot().status, 'save-error'); await f.session.save()
  assert.equal(attempts, 2); assert.equal(f.session.snapshot().status, 'saved')
})
for (const status of [409, 412]) {
  test(`conflict ${status} blocks retries until an explicit reload`, async () => {
    let attempts = 0
    const f = fixture({ write: async () => { ++attempts; throw http(status) } })
    await f.session.load(); f.session.edit(() => ({ text: 'mine' })); await f.session.save()
    f.session.edit(() => ({ text: 'still mine' })); await f.session.save()
    assert.equal(f.session.snapshot().status, 'conflict'); assert.equal(attempts, 1)
    assert.equal(f.jobs.size, 0); assert.equal(await f.session.load(), false)
    assert.equal(f.session.snapshot().value?.text, 'still mine')
    assert.equal(await f.session.load(true), true); assert.equal(f.session.snapshot().value?.text, 'old')
  })
}
test('reload cannot race an in-flight save, even with discard requested', async () => {
  const write = deferred<{ digest: string }>(); const f = fixture({ write: () => write.promise })
  await f.session.load(); f.session.edit(() => ({ text: 'mine' })); const saving = f.session.save()
  assert.equal(await f.session.load(true), false)
  write.resolve({ digest: 'd2' }); await saving
})
test('late old load cannot replace a newer load', async () => {
  const old = deferred<{ content: string; digest: string }>(); let reads = 0
  const f = fixture({ read: () => ++reads === 1 ? old.promise : Promise.resolve({ content: '{"text":"new"}', digest: 'd2' }) })
  const first = f.session.load(); await f.session.load()
  old.resolve({ content: '{"text":"stale"}', digest: 'd1' }); await first
  assert.equal(f.session.snapshot().value?.text, 'new')
})
test('dispose cancels queued autosave and suppresses late load notifications', async () => {
  const f = fixture(); await f.session.load(); f.session.edit(() => ({ text: 'pending' }))
  f.session.dispose(); f.runTimer(); await f.session.save(); assert.equal(f.writes.length, 0)
  const pending = deferred<{ content: string; digest: string }>()
  const g = fixture({ read: () => pending.promise }); const loading = g.session.load(); g.session.dispose()
  const count = g.changes.length; pending.resolve({ content: '{"text":"late"}', digest: 'd1' }); await loading
  assert.equal(g.changes.length, count)
})
test('invalid save response remains dirty, never claims saved', async () => {
  const f = fixture({ write: async () => ({ digest: '' }) })
  await f.session.load(); f.session.edit(() => ({ text: 'mine' })); await f.session.save()
  assert.equal(f.session.snapshot().status, 'save-error'); assert.equal(f.session.snapshot().dirty, true)
})
test('saved content can be reopened through a fresh session', async () => {
  let record = { content: '{"text":"old"}', digest: 'd1' }
  const port: FilePort = { read: async () => record, write: async input => { assert.equal(input.expectedDigest, record.digest); record = { content: input.content, digest: 'd2' }; return record } }
  const a = fixture(port); await a.session.load(); a.session.edit(() => ({ text: 'saved' })); await a.session.save(); a.session.dispose()
  const b = fixture(port); await b.session.load(); assert.equal(b.session.snapshot().value?.text, 'saved')
})

const node = { id: 'one', kind: 'idea', title: 'A', x: 0, y: 0 }
const valid = { version: 2, nodes: [node], edges: [], outlines: [{ artifact: 'canvas', items: [{ node: 'one' }] }] }
test('editable canvas retains unknown fields at all levels', () => {
  const raw = { ...valid, future: { revision: 2 }, nodes: [{ ...node, constraints: ['keep'] }], edges: [{ from: 'one', to: 'one', relation: 'supports' }] }
  assert.deepEqual(JSON.parse(serializeCanvas(parseEditableCanvas(JSON.stringify(raw)))), raw)
})
for (const raw of [null, [], {}, { version: 1, nodes: [node], edges: [] }, { ...valid, version: 3 }, { ...valid, nodes: [node, node] }, { ...valid, nodes: [{ ...node, x: 'NaN' }] },
  { ...valid, nodes: [{ ...node, kind: 'unknown' }] }, { ...valid, nodes: [{ ...node, body: 4 }] }, { ...valid, nodes: [{ ...node, ref: 'source' }] },
  { ...valid, edges: [{ from: 'one', to: 'missing' }] }]) {
  test(`unsafe canvas is rejected: ${JSON.stringify(raw)}`, () => assert.throws(() => parseEditableCanvas(JSON.stringify(raw))))
}
test('delete handlers preserve root extension fields and unload warns on dirty state (source guard)', () => {
  const canvas = readFileSync(new URL('../src/features/projects/ThinkingCanvas.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(canvas, /mutate\(c=>\(\{nodes:/)
  const hook = readFileSync(new URL('../src/features/projects/useCanvasDocument.ts', import.meta.url), 'utf8')
  assert.match(hook, /current.snapshot\(\).dirty/)
  assert.match(hook, /addEventListener\('beforeunload', warn\)/)
  assert.doesNotMatch(hook, /wrapMigratingPort|canvas-migration/)
})
