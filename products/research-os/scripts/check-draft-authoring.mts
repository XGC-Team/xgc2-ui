import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DRAFT_KINDS, DRAFT_FIELDS, DRAFTS_PATH, emptyDraftBook, parseDraftBook, serializeDraftBook,
  newDraft, newBlock, appendDraft, changeDraft, removeDraft, editBlock, moveBlock,
  addSource, validSourcePath, draftScopeKey, draftContext, type DraftBook,
} from '../src/features/projects/draft-model.ts'
import { draftCopy } from '../src/features/projects/draft-copy.ts'
import { createFileSession, type FilePort } from '../src/features/projects/file-session.ts'
import { canCloseTab, registerTabCloseGuard, confirmFileTabClose } from '../src/features/projects/tab-close-guards.ts'

const scope = { projectId: 'project-a', workspace: 'paper-a' }
const at = '2026-09-16T00:00:00.000Z'
const bookWith = (kind: typeof DRAFT_KINDS[number] = 'paper') => appendDraft(emptyDraftBook(scope), newDraft(kind, 'Test draft', at, 'draft-1'))
for (const kind of DRAFT_KINDS) {
  test(`${kind}: create, edit kind-specific fields, serialize and reopen`, () => {
    let book = bookWith(kind)
    const draft = book.drafts[0], block = draft.blocks[0]
    assert.equal(draft.status, 'draft')
    assert.deepEqual(Object.keys(block.fields), [...DRAFT_FIELDS[kind]])
    for (const field of DRAFT_FIELDS[kind]) book = changeDraft(book, draft.id, item => editBlock(item, block.id, field, `${field}\n用户内容`), at)
    const reopened = parseDraftBook(serializeDraftBook(book), scope)
    assert.deepEqual(reopened, book)
    assert.equal(reopened.drafts[0].blocks[0].id, block.id)
    assert.equal(reopened.drafts[0].status, 'draft')
  })
}
test('creation is explicit: empty book has no demo objects or writes', () => {
  assert.deepEqual(emptyDraftBook(scope), { version: 1, ...scope, drafts: [] })
  assert.throws(() => emptyDraftBook({ ...scope, projectId: '' }))
  assert.throws(() => newDraft('paper', '  ', at))
})
test('rename changes only its object and keeps createdAt and ID', () => {
  const one = bookWith(), two = appendDraft(one, newDraft('slides', 'Other', at, 'draft-2'))
  const changed = changeDraft(two, 'draft-1', draft => ({ ...draft, title: 'Renamed' }), '2026-09-16T01:00:00.000Z')
  assert.equal(changed.drafts[0].title, 'Renamed')
  assert.equal(changed.drafts[0].createdAt, at)
  assert.equal(changed.drafts[1], two.drafts[1])
  assert.equal(two.drafts[0].title, 'Test draft')
})
test('draft identity, kind, creation time and draft-only state are immutable', () => {
  const book = bookWith()
  for (const patch of [{ id: 'other' }, { kind: 'slides' }, { status: 'running' }, { createdAt: 'changed' }]) {
    assert.throws(() => changeDraft(book, 'draft-1', draft => ({ ...draft, ...patch }) as typeof draft))
  }
  assert.throws(() => appendDraft(book, book.drafts[0]))
  assert.throws(() => changeDraft(book, 'missing', draft => draft))
})
test('block order is explicit and stable; moves do not regenerate IDs', () => {
  let draft = bookWith('slides').drafts[0]
  draft = { ...draft, blocks: [...draft.blocks, newBlock('slides', 'block-2'), newBlock('slides', 'block-3')] }
  const old = draft.blocks.map(block => block.id)
  const moved = moveBlock(draft, 'block-3', -1)
  assert.deepEqual(moved.blocks.map(block => block.id), [old[0], old[2], old[1]])
  assert.deepEqual(draft.blocks.map(block => block.id), old)
  assert.equal(moveBlock(draft, old[0], -1), draft)
  assert.equal(moveBlock(draft, 'missing', 1), draft)
})
test('kind-specific fields cannot leak from a different editor', () => {
  const draft = bookWith('slides').drafts[0]
  assert.throws(() => editBlock(draft, draft.blocks[0].id, 'parameters', 'bad'))
  assert.equal(editBlock(draft, draft.blocks[0].id, 'message', ''), draft)
})
test('delete affects only the selected draft, never sources', () => {
  let book = bookWith()
  book = changeDraft(book, 'draft-1', draft => addSource(draft, 'notes/source.md'), at)
  book = appendDraft(book, newDraft('rule', 'Keep', at, 'draft-2'))
  assert.deepEqual(removeDraft(book, 'draft-1').drafts.map(draft => draft.id), ['draft-2'])
  assert.equal(book.drafts[0].sources[0].path, 'notes/source.md')
  assert.equal(removeDraft(book, 'not-found'), book)
})
test('same source is deduplicated; literal Unicode and percent paths survive', () => {
  const draft = addSource(bookWith().drafts[0], '资料/a%20b 笔记.md', 'source-1')
  assert.equal(addSource(draft, '资料/a%20b 笔记.md'), draft)
  assert.equal(draft.sources[0].path, '资料/a%20b 笔记.md')
  assert.throws(() => addSource(draft, 'other.md', 'source-1'))
})
for (const path of ['', ' ', '/etc/file', '../file', 'a/../file', './file', 'a//file', 'a\\file', 'a\u0000b', 'a/']) {
  test(`reject unsafe or ambiguous source path ${JSON.stringify(path)}`, () => {
    assert.equal(validSourcePath(path), false)
    assert.throws(() => addSource(bookWith().drafts[0], path))
  })
}
test('scope identities cannot collide and mismatched books fail closed', () => {
  assert.notEqual(draftScopeKey({ projectId: 'a/b', workspace: 'c' }), draftScopeKey({ projectId: 'a', workspace: 'b/c' }))
  const raw = serializeDraftBook(bookWith())
  assert.throws(() => parseDraftBook(raw, { ...scope, projectId: 'b' }))
  assert.throws(() => parseDraftBook(raw, { ...scope, workspace: 'b' }))
})
test('malformed JSON and future schema/state are never rewritten as empty', () => {
  assert.throws(() => parseDraftBook('{bad', scope))
  for (const patch of [{ version: 2 }, { drafts: null }, { drafts: {} }]) assert.throws(() => parseDraftBook(JSON.stringify({ ...bookWith(), ...patch }), scope))
  const book = bookWith()
  assert.throws(() => parseDraftBook(JSON.stringify({ ...book, drafts: [{ ...book.drafts[0], status: 'completed' }] }), scope))
})
test('duplicate draft, block and source IDs fail validation', () => {
  const book = bookWith(), draft = book.drafts[0], block = draft.blocks[0]
  assert.throws(() => parseDraftBook(JSON.stringify({ ...book, drafts: [draft, draft] }), scope))
  assert.throws(() => parseDraftBook(JSON.stringify({ ...book, drafts: [{ ...draft, blocks: [block, block] }] }), scope))
  assert.throws(() => parseDraftBook(JSON.stringify({ ...book, drafts: [{ ...draft, sources: [{ id: 's', path: 'a.md' }, { id: 's', path: 'b.md' }] }] }), scope))
})
test('missing and non-string fields are rejected rather than dropped', () => {
  for (const fields of [{}, { purpose: 1 }, { purpose: '', argument: '', evidence: '', constraints: '', future: {} }]) {
    const book = bookWith(), draft = book.drafts[0]
    assert.throws(() => parseDraftBook(JSON.stringify({ ...book, drafts: [{ ...draft, blocks: [{ ...draft.blocks[0], fields }] }] }), scope))
  }
})
test('unknown extension data survives parsing and editing at every level', () => {
  const book = bookWith(), draft = addSource(book.drafts[0], 'source.md', 's')
  const extended = { ...book, extension: { keep: true }, drafts: [{ ...draft, custom: 1, sources: [{ ...draft.sources[0], citation: 'preserve' }], blocks: [{ ...draft.blocks[0], future: [1, 2], fields: { ...draft.blocks[0].fields, annotation: 'keep' } }] }] }
  const parsed = parseDraftBook(JSON.stringify(extended), scope)
  const edited = changeDraft(parsed, draft.id, item => editBlock(item, item.blocks[0].id, 'purpose', 'Updated'), at)
  const actual = JSON.parse(serializeDraftBook(edited))
  assert.deepEqual(actual.extension, { keep: true })
  assert.equal(actual.drafts[0].custom, 1)
  assert.deepEqual(actual.drafts[0].blocks[0].future, [1, 2])
  assert.equal(actual.drafts[0].blocks[0].fields.annotation, 'keep')
  assert.equal(actual.drafts[0].sources[0].citation, 'preserve')
})
test('Chat snapshot explicitly names project, workspace, object and draft state', () => {
  const book = bookWith(), context = JSON.parse(draftContext(book, book.drafts[0]))
  assert.equal(context.state, 'editable-draft-snapshot')
  assert.deepEqual(context.scope, { ...scope, path: DRAFTS_PATH })
  assert.equal(context.draft.id, 'draft-1')
  assert.equal(context.draft.status, 'draft')
})
test('both locales cover every kind, block and semantic field', () => {
  for (const locale of ['zh', 'en'] as const) for (const kind of DRAFT_KINDS) {
    assert.ok(draftCopy[locale].kinds[kind]); assert.ok(draftCopy[locale].blocks[kind])
    for (const field of DRAFT_FIELDS[kind]) assert.ok(draftCopy[locale].fields[field])
  }
})

// A CAS test port, not a production backend or browser. Uses the actual production file session.
function storage() {
  let content: string | undefined, revision = 0
  const writes: Parameters<FilePort['write']>[0][] = []
  const port: FilePort = {
    read: async () => { if (content === undefined) throw Object.assign(new Error('missing'), { status: 404 }); return { content, digest: `v${revision}` } },
    write: async input => {
      writes.push(input)
      if (input.createOnly ? content !== undefined : input.expectedDigest !== `v${revision}`) throw Object.assign(new Error('conflict'), { status: 409 })
      content = input.content; return { digest: `v${++revision}` }
    },
  }
  const session = (target = scope, override: Partial<FilePort> = {}) => createFileSession<DraftBook>({
    port: { ...port, ...override }, decode: text => parseDraftBook(text, target), encode: serializeDraftBook,
    empty: () => emptyDraftBook(target), changed: () => {}, schedule: () => () => {},
  })
  return { session, writes, content: () => content }
}
test('all object kinds persist and reopen through CAS with no implicit empty file creation', async () => {
  const disk = storage(), session = disk.session()
  await session.load(); assert.equal(session.snapshot().status, 'new'); assert.equal(disk.writes.length, 0)
  for (const kind of DRAFT_KINDS) session.edit(book => appendDraft(book, newDraft(kind, kind)))
  await session.save(); assert.equal(disk.writes[0].createOnly, true)
  const expected = session.snapshot().value
  session.dispose()
  const reopened = disk.session(); await reopened.load()
  assert.deepEqual(reopened.snapshot().value, expected)
  assert.equal(reopened.snapshot().status, 'saved')
  reopened.dispose()
})
test('second writer conflicts and retains exportable edits until explicit discard', async () => {
  const disk = storage(), a = disk.session(), b = disk.session()
  await a.load(); a.edit(() => bookWith()); await a.save(); await b.load()
  a.edit(book => changeDraft(book, 'draft-1', draft => ({ ...draft, title: 'A' }))); await a.save()
  b.edit(book => changeDraft(book, 'draft-1', draft => ({ ...draft, title: 'B' }))); await b.save()
  assert.equal(b.snapshot().status, 'conflict')
  assert.equal(parseDraftBook(serializeDraftBook(b.snapshot().value!), scope).drafts[0].title, 'B')
  const writes = disk.writes.length; await b.save(); assert.equal(disk.writes.length, writes)
  assert.equal(await b.load(), false)
  await b.load(true); assert.equal(b.snapshot().value?.drafts[0].title, 'A')
  a.dispose(); b.dispose()
})
test('save failures preserve a new draft and retry uses createOnly', async () => {
  const disk = storage(); let broken = true
  const session = disk.session(scope, { write: async () => { if (broken) throw Object.assign(new Error('offline'), { status: 503 }); return { digest: 'v1' } } })
  await session.load(); session.edit(() => bookWith('experiment')); await session.save()
  assert.equal(session.snapshot().status, 'save-error')
  assert.equal(session.snapshot().value?.drafts[0].kind, 'experiment')
  broken = false; await session.save(); assert.equal(session.snapshot().status, 'saved'); session.dispose()
})
test('wrong project cannot edit or overwrite an existing draft file', async () => {
  const disk = storage(), first = disk.session(); await first.load(); first.edit(() => bookWith()); await first.save()
  const wrong = disk.session({ ...scope, projectId: 'other' }); await wrong.load()
  assert.equal(wrong.snapshot().status, 'invalid')
  wrong.edit(() => bookWith()); await wrong.save(); assert.equal(disk.writes.length, 1)
  first.dispose(); wrong.dispose()
})
test('read authorization errors are not treated as a new book', async () => {
  const disk = storage(), session = disk.session(scope, { read: async () => { throw Object.assign(new Error('forbidden'), { status: 403 }) } })
  await session.load(); assert.equal(session.snapshot().status, 'load-error')
  session.edit(() => bookWith()); await session.save(); assert.equal(disk.writes.length, 0); session.dispose()
})
test('close guard respects refusal and cancels queued writes on confirmed discard', async () => {
  const disk = storage(), session = disk.session(); await session.load(); session.edit(() => bookWith())
  assert.equal(confirmFileTabClose(session, { confirmDiscard: () => false, notifySaving: () => assert.fail() }), false)
  assert.equal(session.snapshot().dirty, true)
  assert.equal(confirmFileTabClose(session, { confirmDiscard: () => true, notifySaving: () => assert.fail() }), true)
  await session.save(); assert.equal(disk.writes.length, 0)
})
test('close guard blocks an in-flight save, then allows a clean close', async () => {
  let resolve!: (value: { digest: string }) => void
  const disk = storage(), session = disk.session(scope, { write: () => new Promise(yes => { resolve = yes }) })
  await session.load(); session.edit(() => bookWith()); const pending = session.save(); await Promise.resolve()
  let notified = 0
  const dialogs = { confirmDiscard: () => assert.fail(), notifySaving: () => { notified++ } }
  assert.equal(confirmFileTabClose(session, dialogs), false); assert.equal(notified, 1)
  resolve({ digest: 'v1' }); await pending
  assert.equal(confirmFileTabClose(session, dialogs), true)
})
test('registered close guards isolate tabs and obsolete cleanup cannot remove replacements', () => {
  const old = registerTabCloseGuard('a', () => true)
  const current = registerTabCloseGuard('a', () => false)
  old(); assert.equal(canCloseTab('a'), false); assert.equal(canCloseTab('b'), true)
  current(); assert.equal(canCloseTab('a'), true)
})
