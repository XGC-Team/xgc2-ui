import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  emptyDraftBook, captureIntoBook, archiveDraft, parseDraftBook, serializeDraftBook, newDraft, appendDraft,
  changeDraft, linkSource, researchStructure, editBlock, linkProjectObject, archiveProjectObject,
  attachDraftReference, draftIdFromAnchor, sourceKey, validWebSource, type DraftBook, type DraftIntent,
} from '../src/features/projects/draft-model.ts'
import { emptyCanvas, parseEditableCanvas, serializeCanvas } from '../src/features/projects/canvas-model.ts'
import { createFileSession } from '../src/features/projects/file-session.ts'
const scope = { projectId: 'paper-e2e-a', workspace: 'paper-e2e-a' }
const at = '2026-09-16T00:00:00.000Z'
const intent = (id = 'note-1'): DraftIntent => ({ id, scope, kind: 'note', source: { id: `source-${id}`, workspace: 'academic', path: 'now/evidence.md', digest: 'revision-1', excerpt: 'An observed statement.' } })
const noteBook = () => captureIntoBook(emptyDraftBook(scope), intent(), at)

test('selection capture is idempotent and bound to the explicit project', () => {
  const book = noteBook()
  assert.equal(captureIntoBook(book, intent()), book)
  assert.throws(() => captureIntoBook(book, { ...intent(), scope: { ...scope, projectId: 'other' } }))
  assert.deepEqual(book.drafts[0].sources[0], intent().source)
})
test('source observations retain revision, excerpt and workspace through reopen', () => {
  const book = noteBook(), reopened = parseDraftBook(serializeDraftBook(book), scope)
  assert.equal(reopened.drafts[0].sources[0].workspace, 'academic')
  assert.equal(reopened.drafts[0].sources[0].digest, 'revision-1')
  assert.equal(reopened.drafts[0].sources[0].excerpt, 'An observed statement.')
})
test('a different revision or excerpt is not silently deduplicated over an old reference', () => {
  let draft = noteBook().drafts[0]
  draft = linkSource(draft, { ...draft.sources[0], id: 'source-new', digest: 'revision-2' }, scope.workspace)
  assert.equal(draft.sources.length, 2)
  assert.equal(draft.sources[0].digest, 'revision-1')
  assert.notEqual(sourceKey(draft.sources[0], scope.workspace), sourceKey(draft.sources[1], scope.workspace))
})
test('same source reached through another object deduplicates without copying its body', () => {
  const draft = noteBook().drafts[0]
  assert.equal(linkSource(draft, { ...draft.sources[0], id: 'different-reference-id' }, scope.workspace), draft)
})
for (const kind of ['paper', 'slides', 'storyboard', 'workflow', 'rule', 'experiment', 'note', 'material'] as const) {
  test(`${kind}: archive, persist, restore keeps source and stable object/block IDs`, () => {
    let book = appendDraft(emptyDraftBook(scope), { ...newDraft(kind, kind, at, `id-${kind}`), sources: [intent().source] })
    const original = book.drafts[0]
    book = parseDraftBook(serializeDraftBook(archiveDraft(book, original.id, true, at)), scope)
    assert.equal(book.drafts[0].archivedAt, at)
    book = archiveDraft(book, original.id, false, at)
    assert.deepEqual(book.drafts[0], original)
  })
}
test('paper list and card views expose the same block objects, never a second outline', () => {
  const draft = newDraft('paper', 'paper', at)
  assert.equal(researchStructure(draft), draft.blocks)
  const next = editBlock(draft, draft.blocks[0].id, 'argument', 'paragraph intention')
  assert.equal(researchStructure(next)[0].fields.argument, 'paragraph intention')
  assert.equal(next.blocks[0].id, draft.blocks[0].id)
})
test('paper goal, template, citation requirements and paragraph roles survive round trip', () => {
  const draft = newDraft('paper', 'paper', at)
  draft.settings = { goal: 'question', template: 'journal', citationRequirements: 'traceable evidence' }
  draft.blocks[0].role = 'paragraph'
  const book = parseDraftBook(serializeDraftBook(appendDraft(emptyDraftBook(scope), draft)), scope)
  assert.deepEqual(book.drafts[0].settings, draft.settings)
  assert.equal(book.drafts[0].blocks[0].role, 'paragraph')
})
test('per-page/shot source references are validated and dangling references rejected', () => {
  const draft = { ...newDraft('slides', 'slides', at), sources: [intent().source] }
  draft.blocks[0].sourceIds = [intent().source.id]
  const book = appendDraft(emptyDraftBook(scope), draft)
  assert.doesNotThrow(() => serializeDraftBook(book))
  draft.blocks[0].sourceIds.push('missing')
  assert.throws(() => serializeDraftBook(book))
})
test('knowledge promotion stays an auditable suggestion, not an accepted fact', () => {
  let book = noteBook()
  book = changeDraft(book, 'note-1', draft => ({ ...draft, knowledgeSuggestion: { status: 'suggested', rationale: 'Verify first.' } }), at)
  assert.equal(parseDraftBook(serializeDraftBook(book), scope).drafts[0].knowledgeSuggestion?.status, 'suggested')
  const raw = JSON.parse(serializeDraftBook(book)); raw.drafts[0].knowledgeSuggestion.status = 'accepted'
  assert.throws(() => parseDraftBook(JSON.stringify(raw), scope))
})
for (const kind of ['canvas', 'workflow'] as const) {
  test(`${kind} reference archive/restore is idempotent and has no execution state`, () => {
    const book = linkProjectObject(emptyDraftBook(scope), kind)
    assert.equal(linkProjectObject(book, kind), book)
    const archived = archiveProjectObject(book, kind, true, at)
    const restored = linkProjectObject(archived, kind)
    assert.equal(restored.links?.length, 1); assert.equal(restored.links?.[0].archivedAt, undefined)
    assert.equal('running' in restored.links![0], false)
  })
}
test('canvas association is a single reference to the canonical object and can be removed independently', () => {
  const canvas = { ...emptyCanvas(), extension: { keep: true } }
  const linked = attachDraftReference(canvas, 'note-1', 'A label')
  assert.equal(linked.nodes.length, 1); assert.equal(attachDraftReference(linked, 'note-1', 'New label'), linked)
  assert.equal(draftIdFromAnchor(linked.nodes[0].anchor!), 'note-1')
  assert.ok(!linked.nodes[0].body?.includes(intent().source.excerpt!))
  assert.deepEqual((linked as typeof canvas).extension, canvas.extension)
  assert.deepEqual(parseEditableCanvas(serializeCanvas(linked)), linked)
  assert.equal(noteBook().drafts.length, 1)
})
test('occupied canvas node IDs are preserved and the new reference gets a distinct ID', () => {
  const canvas = emptyCanvas(); canvas.nodes.push({ id: 'draft-note-1', kind: 'idea', title: 'Unrelated', x: 0, y: 0 })
  const next = attachDraftReference(canvas, 'note-1', 'A label')
  assert.equal(next.nodes.length, 2); assert.notEqual(next.nodes[0].id, next.nodes[1].id)
  assert.equal(next.nodes[0], canvas.nodes[0])
})
for (const value of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.org', 'data:text/plain,hello']) {
  test(`unsafe/non-web source rejected: ${value.split(':')[0]}`, () => assert.equal(validWebSource(value), false))
}
test('web references are durable references, not fetched-content claims', () => {
  const value = { ...intent('web-1'), kind: 'material' as const, source: { id: 'web-source', path: '', url: 'https://example.org/paper' } }
  const book = captureIntoBook(emptyDraftBook(scope), value, at)
  assert.doesNotThrow(() => parseDraftBook(serializeDraftBook(book), scope))
  assert.equal(book.drafts[0].sources[0].digest, undefined)
})
test('a complete F1 model path writes, closes and reopens all persistent objects', async () => {
  let content: string | undefined, digest = 0
  const port = {
    read: async () => { if (content === undefined) throw Object.assign(new Error('Missing'), { status: 404 }); return { content, digest: String(digest) } },
    write: async (input: { content: string; expectedDigest?: string; createOnly?: true }) => {
      assert.equal(input.createOnly, digest === 0 ? true : undefined)
      if (digest) assert.equal(input.expectedDigest, String(digest))
      content = input.content; return { digest: String(++digest) }
    },
  }
  const options = { port, empty: () => emptyDraftBook(scope), decode: (text: string) => parseDraftBook(text, scope), encode: serializeDraftBook, changed: (_book: unknown) => {}, schedule: (_run: () => void) => () => {} }
  const session = createFileSession<DraftBook>(options); await session.load()
  session.edit(book => captureIntoBook(book, intent(), at))
  for (const kind of ['paper', 'slides', 'storyboard', 'workflow', 'rule', 'experiment'] as const) session.edit(book => appendDraft(book, { ...newDraft(kind, kind, at), sources: [intent().source] }))
  session.edit(book => linkProjectObject(book, 'workflow')); await session.save(); session.dispose()
  const reopened = createFileSession<DraftBook>(options); await reopened.load()
  assert.equal(reopened.snapshot().status, 'saved'); assert.equal(reopened.snapshot().value?.drafts.length, 7)
  assert.ok(reopened.snapshot().value?.drafts.every(draft => draft.status === 'draft'))
  reopened.dispose()
})
test('source guards: existing canvas writer consumes references; no competing PUT is added', () => {
  const hook = readFileSync(new URL('../src/features/projects/useCanvasDocument.ts', import.meta.url), 'utf8')
  assert.ok(hook.includes('session.current.edit(canvas => attachDraftReference'))
  assert.equal((hook.match(/method: 'PUT'/g) || []).length, 1)
  const page = readFileSync(new URL('../src/features/projects/DraftsPage.tsx', import.meta.url), 'utf8')
  assert.ok(page.includes('researchStructure(current)')); assert.ok(page.includes('archiveDraft'))
  assert.ok(page.includes('knowledgeSuggestion')); assert.ok(!page.includes('/knowledge/items'))
})

test('selection notes reject missing provenance instead of claiming a recorded version', () => {
  for (const source of [{...intent().source, digest: undefined}, {...intent().source, excerpt: ''}]) assert.throws(() => captureIntoBook(emptyDraftBook(scope), {...intent(), source}))
})
