import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFileSession, type FilePort, type FileWrite } from '../src/features/projects/file-session.ts'
import { emptyCanvasV2, migrateCanvasV1toV2, parseEditableCanvas, serializeCanvas, type ThinkingCanvasV2 } from '../src/features/projects/canvas-model.ts'
import { backupCanvasV1, detectCanvasVersion, wrapMigratingPort } from '../src/features/projects/canvas-migration.ts'

function http(status: number) { return Object.assign(new Error(`HTTP ${status}`), { status }) }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const v1Text = JSON.stringify({ version: 1, nodes: [{ id: 'c1', kind: 'chapter', title: 'C', x: 0, y: 0 }, { id: 'i1', kind: 'idea', title: 'I', x: 5, y: 9 }], edges: [{ from: 'c1', to: 'i1' }] }, null, 2) + '\n'

function fixture(files: Map<string, { content: string; digest: string }>, backup?: (content: string) => Promise<void>) {
  const writes: FileWrite[] = [], backups: string[] = []
  let revision = 0
  const base: FilePort = {
    read: async () => {
      const record = files.get('thinking.canvas.json')
      if (!record) throw http(404)
      return record
    },
    write: async input => {
      writes.push(input)
      const existing = files.get('thinking.canvas.json')
      if (input.createOnly ? Boolean(existing) : input.expectedDigest !== existing?.digest) throw http(409)
      const saved = { content: input.content, digest: `v${++revision}` }
      files.set('thinking.canvas.json', saved)
      return { digest: saved.digest }
    },
  }
  const port = wrapMigratingPort(base, async content => {
    backups.push(content)
    if (backup) await backup(content)
    else if (!files.has('thinking.canvas.v1.backup.json')) files.set('thinking.canvas.v1.backup.json', { content, digest: 'backup-1' })
    // An existing backup is the safety copy already (createOnly 409), exactly what backupCanvasV1 accepts.
  })
  const session = createFileSession<ThinkingCanvasV2>({
    port,
    decode: text => { const parsed = parseEditableCanvas(text); return parsed.version === 1 ? migrateCanvasV1toV2(parsed) : parsed },
    encode: serializeCanvas, empty: emptyCanvasV2, changed: () => {}, schedule: () => () => {},
  })
  return { session, writes, backups, files }
}

test('detectCanvasVersion reads only the version marker', () => {
  assert.equal(detectCanvasVersion(v1Text), 1)
  assert.equal(detectCanvasVersion(serializeCanvas(emptyCanvasV2())), 2)
  assert.equal(detectCanvasVersion('{bad'), undefined)
  assert.equal(detectCanvasVersion('{"version":3,"nodes":[],"edges":[],"outlines":[]}'), undefined)
})
test('first v2 write after a v1 load backs up the original bytes first', async () => {
  const f = fixture(new Map([['thinking.canvas.json', { content: v1Text, digest: 'v0' }]]))
  await f.session.load()
  assert.equal(f.session.snapshot().status, 'saved')
  assert.equal(f.session.snapshot().value?.version, 2)
  f.session.edit(canvas => ({ ...canvas, nodes: canvas.nodes.map(n => n.id === 'i1' ? { ...n, title: 'I2' } : n) }))
  await f.session.save()
  assert.deepEqual(f.backups, [v1Text])
  assert.equal(f.files.get('thinking.canvas.v1.backup.json')?.content, v1Text)
  assert.equal(JSON.parse(f.writes[0].content).version, 2)
  assert.equal(f.writes[0].expectedDigest, 'v0')
  assert.equal(f.session.snapshot().status, 'saved')
  // Later saves never repeat the backup.
  f.session.edit(canvas => ({ ...canvas, nodes: canvas.nodes.map(n => n.id === 'i1' ? { ...n, title: 'I3' } : n) }))
  await f.session.save()
  assert.equal(f.backups.length, 1)
})
test('backup failure blocks the v2 write and preserves the dirty local state', async () => {
  const f = fixture(new Map([['thinking.canvas.json', { content: v1Text, digest: 'v0' }]]), async () => { throw http(503) })
  await f.session.load()
  f.session.edit(canvas => ({ ...canvas, nodes: [...canvas.nodes, { id: 'n2', kind: 'idea', title: 'N', x: 1, y: 1 }] }))
  await f.session.save()
  assert.equal(f.session.snapshot().status, 'save-error')
  assert.equal(f.writes.length, 0)
  assert.equal(f.session.snapshot().value?.nodes.length, 3)
  assert.equal(f.files.get('thinking.canvas.json')?.content, v1Text)
})
test('an existing backup (409) counts as the safety copy and v2 proceeds', async () => {
  const files = new Map([
    ['thinking.canvas.json', { content: v1Text, digest: 'v0' }],
    ['thinking.canvas.v1.backup.json', { content: v1Text, digest: 'backup-1' }],
  ])
  const f = fixture(files)
  await f.session.load()
  f.session.edit(canvas => ({ ...canvas, nodes: [...canvas.nodes, { id: 'n2', kind: 'idea', title: 'N', x: 1, y: 1 }] }))
  await f.session.save()
  assert.equal(f.session.snapshot().status, 'saved')
  assert.equal(f.writes.length, 1)
})
test('v2 files and new canvases never trigger a backup', async () => {
  const f = fixture(new Map([['thinking.canvas.json', { content: serializeCanvas(emptyCanvasV2()), digest: 'v0' }]]))
  await f.session.load()
  f.session.edit(canvas => ({ ...canvas, nodes: [{ id: 'n', kind: 'idea', title: 'N', x: 0, y: 0 }] }))
  await f.session.save()
  assert.equal(f.backups.length, 0)
  const fresh = fixture(new Map())
  await fresh.session.load()
  assert.equal(fresh.session.snapshot().status, 'new')
  fresh.session.edit(canvas => ({ ...canvas, nodes: [{ id: 'n', kind: 'idea', title: 'N', x: 0, y: 0 }] }))
  await fresh.session.save()
  assert.equal(fresh.backups.length, 0)
  assert.equal(fresh.writes[0].createOnly, true)
})
test('unknown future versions fail closed instead of loading as an editable canvas', async () => {
  const f = fixture(new Map([['thinking.canvas.json', { content: '{"version":3,"nodes":[],"edges":[],"outlines":[]}', digest: 'v0' }]]))
  await f.session.load()
  assert.equal(f.session.snapshot().status, 'invalid')
  f.session.edit(canvas => canvas)
  await f.session.save()
  assert.equal(f.writes.length, 0)
  assert.equal(f.backups.length, 0)
})
test('a conflicting v2 write after a successful backup keeps both sides', async () => {
  const f = fixture(new Map([['thinking.canvas.json', { content: v1Text, digest: 'v0' }]]))
  await f.session.load()
  f.session.edit(canvas => ({ ...canvas, nodes: [...canvas.nodes, { id: 'mine', kind: 'idea', title: 'Mine', x: 0, y: 0 }] }))
  // Another writer lands between load and save.
  f.files.set('thinking.canvas.json', { content: serializeCanvas(emptyCanvasV2()), digest: 'other' })
  await f.session.save()
  assert.equal(f.session.snapshot().status, 'conflict')
  assert.equal(f.session.snapshot().value?.nodes.some(n => n.id === 'mine'), true)
  assert.equal(f.backups.length, 1)
  assert.equal(f.files.get('thinking.canvas.json')?.digest, 'other')
})
test('an older save resolving late never marks newer edits saved', async () => {
  const gate = deferred<{ digest: string }>()
  let calls = 0
  const files = new Map([['thinking.canvas.json', { content: serializeCanvas(emptyCanvasV2()), digest: 'v0' }]])
  const writes: string[] = []
  const gated = createFileSession<ThinkingCanvasV2>({
    port: {
      read: async () => files.get('thinking.canvas.json')!,
      write: async input => { writes.push(input.content); return calls++ === 0 ? gate.promise : { digest: 'v2' } },
    },
    decode: text => parseEditableCanvas(text) as ThinkingCanvasV2, encode: serializeCanvas, empty: emptyCanvasV2,
    changed: () => {}, schedule: () => () => {},
  })
  await gated.load()
  gated.edit(canvas => ({ ...canvas, nodes: [{ id: 'a', kind: 'idea', title: 'A', x: 0, y: 0 }] }))
  const saving = gated.save()
  await Promise.resolve()
  gated.edit(canvas => ({ ...canvas, nodes: [...canvas.nodes, { id: 'b', kind: 'idea', title: 'B', x: 1, y: 1 }] }))
  gate.resolve({ digest: 'v1' })
  await saving
  assert.equal(gated.snapshot().status, 'unsaved')
  assert.equal(gated.snapshot().dirty, true)
  await gated.save()
  assert.equal(gated.snapshot().status, 'saved')
  assert.equal(JSON.parse(writes[1]).nodes.length, 2)
})
test('backupCanvasV1 swallows only the createOnly conflict, never other failures', async () => {
  const original = globalThis.fetch
  const seen: { url: string; body: { createOnly?: boolean } }[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ error: { message: 'exists' } }), { status: 409 })
  }) as typeof fetch
  try {
    await backupCanvasV1('proj', 'bytes')
    assert.equal(seen[0].body.createOnly, true)
    assert.match(seen[0].url, /thinking\.canvas\.v1\.backup\.json$/)
  } finally { globalThis.fetch = original }
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'down' } }), { status: 503 })) as typeof fetch
  try {
    await assert.rejects(backupCanvasV1('proj', 'bytes'), /backup failed/i)
  } finally { globalThis.fetch = original }
})
test('source guards: the hook keeps the single PUT, the reference queue and the owner registry', () => {
  const hook = readFileSync(new URL('../src/features/projects/useCanvasDocument.ts', import.meta.url), 'utf8')
  assert.ok(hook.includes('session.current.edit(canvas => attachDraftReference'))
  assert.equal((hook.match(/method: 'PUT'/g) || []).length, 1)
  assert.match(hook, /sessionOwners\.get\(project\)\?\.dispose\(\)/)
  assert.match(hook, /wrapMigratingPort\(/)
  const migration = readFileSync(new URL('../src/features/projects/canvas-migration.ts', import.meta.url), 'utf8')
  assert.equal((migration.match(/method: 'PUT'/g) || []).length, 1)
})
