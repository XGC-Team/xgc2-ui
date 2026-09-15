import test from 'node:test'
import assert from 'node:assert/strict'
import { createFileSession, type FilePort, type FileState, type FileWrite } from '../src/features/projects/file-session.ts'

type Document = { text: string }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(port: Partial<FilePort> = {}) {
  const writes: FileWrite[] = []
  const changes: FileState<Document>[] = []
  const jobs = new Set<() => void>()
  const session = createFileSession<Document>({
    port: {
      read: async () => ({ content: '{"text":"old"}', digest: 'd1' }),
      write: async input => { writes.push(input); return { digest: `d${writes.length + 1}` } },
      ...port,
    },
    decode: JSON.parse,
    encode: JSON.stringify,
    empty: () => ({ text: '' }),
    changed: state => changes.push(state),
    schedule: run => { jobs.add(run); return () => { jobs.delete(run) } },
  })
  return { session, writes, changes, jobs }
}

// These are transport/lifecycle tests of the production session, not React/DOM tests.
test('dispose before the save microtask prevents a not-yet-started write', async () => {
  const f = fixture()
  await f.session.load()
  f.session.edit(() => ({ text: 'unsent' }))
  const saving = f.session.save()
  f.session.dispose()
  const notifications = f.changes.length
  await saving
  assert.equal(f.writes.length, 0, 'a disposed session must not start a new request')
  assert.equal(f.changes.length, notifications)
  assert.equal(f.jobs.size, 0)
})

test('dispose cancels pending debounce; even an already-dequeued callback cannot write', async () => {
  const f = fixture()
  await f.session.load()
  f.session.edit(() => ({ text: 'unsent' }))
  const callback = [...f.jobs][0]
  assert.ok(callback)
  f.session.dispose()
  assert.equal(f.jobs.size, 0)
  callback()
  await f.session.save()
  assert.equal(f.writes.length, 0)
})

test('disposing an in-flight write does not claim cancellation or schedule later edits', async () => {
  const result = deferred<{ digest: string }>()
  const writes: FileWrite[] = []
  const f = fixture({ write: input => { writes.push(input); return result.promise } })
  await f.session.load()
  f.session.edit(() => ({ text: 'sent' }))
  const saving = f.session.save()
  await Promise.resolve()
  assert.equal(writes.length, 1)
  f.session.edit(() => ({ text: 'not sent' }))
  f.session.dispose()
  const notifications = f.changes.length
  result.resolve({ digest: 'd2' })
  await saving
  assert.equal(writes.length, 1)
  assert.equal(JSON.parse(writes[0].content).text, 'sent')
  assert.equal(f.changes.length, notifications)
  assert.equal(f.jobs.size, 0)
})

test('a rejected in-flight write after disposal cannot publish an error or retry', async () => {
  const result = deferred<{ digest: string }>()
  const f = fixture({ write: () => result.promise })
  await f.session.load()
  f.session.edit(() => ({ text: 'sent' }))
  const saving = f.session.save()
  await Promise.resolve()
  f.session.dispose()
  const notifications = f.changes.length
  result.reject(Object.assign(new Error('unavailable'), { status: 503 }))
  await saving
  assert.equal(f.changes.length, notifications)
  assert.equal(f.jobs.size, 0)
})

test('dispose aborts an outstanding read and ignores an adapter returning late', async () => {
  const result = deferred<{ content: string; digest: string }>()
  let signal: AbortSignal | undefined
  const f = fixture({ read: input => { signal = input; return result.promise } })
  const loading = f.session.load()
  f.session.dispose()
  const notifications = f.changes.length
  assert.equal(signal?.aborted, true)
  result.resolve({ content: '{"text":"late"}', digest: 'late' })
  assert.equal(await loading, false)
  assert.equal(f.changes.length, notifications)
  assert.equal(f.session.snapshot().value, null)
})

test('disposed session cannot be revived through edit, retry or discard-and-reload', async () => {
  const f = fixture()
  await f.session.load()
  f.session.dispose()
  const state = f.session.snapshot()
  f.session.edit(() => ({ text: 'changed' }))
  await f.session.save()
  assert.equal(await f.session.load(true), false)
  assert.equal(f.session.snapshot(), state)
  assert.equal(f.writes.length, 0)
})

test('a replacement session saves normally while the old queued write remains cancelled', async () => {
  const previous = fixture()
  const next = fixture()
  await previous.session.load()
  previous.session.edit(() => ({ text: 'old project' }))
  const stale = previous.session.save()
  previous.session.dispose()
  await next.session.load()
  next.session.edit(() => ({ text: 'new project' }))
  await Promise.all([stale, next.session.save()])
  assert.equal(previous.writes.length, 0)
  assert.deepEqual(next.writes, [{ content: '{"text":"new project"}', expectedDigest: 'd1' }])
  assert.equal(next.session.snapshot().status, 'saved')
  next.session.dispose()
})

test('normal concurrent saves still share one request and retain the latest edits', async () => {
  const first = deferred<{ digest: string }>()
  const writes: FileWrite[] = []
  const f = fixture({ write: async input => { writes.push(input); return writes.length === 1 ? first.promise : { digest: 'd3' } } })
  await f.session.load()
  f.session.edit(() => ({ text: 'first' }))
  const saving = f.session.save()
  assert.equal(f.session.save(), saving)
  await Promise.resolve()
  f.session.edit(() => ({ text: 'latest' }))
  first.resolve({ digest: 'd2' })
  await saving
  await f.session.save()
  assert.deepEqual(writes, [
    { content: '{"text":"first"}', expectedDigest: 'd1' },
    { content: '{"text":"latest"}', expectedDigest: 'd2' },
  ])
  assert.equal(f.session.snapshot().dirty, false)
  f.session.dispose()
})
