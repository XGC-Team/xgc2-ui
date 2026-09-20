import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CANVAS_PATH, PRIMARY_OUTLINE, canvasToPrompt, emptyCanvasV2, moveOutlineItem,
  parseEditableCanvas, removeCanvasNode, semanticFingerprint, serializeCanvas, setNodeWriting,
  type ThinkingCanvasV2,
} from '../src/features/projects/canvas-model.ts'
import {
  captureSourceBinding, correctSourceBinding, putSourceBinding, resolveSourceBinding, sourceBindingKey,
  sourceLines, sourceRange, unlinkSourceBinding, updateBindingsAfterWrite, type DesignSourceSnapshot,
} from '../src/features/projects/design-source.ts'
import { buildWritingContext, DesignContextError, writingContextToPrompt } from '../src/features/projects/design-context.ts'
import { readWritingContext, type DesignContextPort } from '../src/features/projects/design-context-api.ts'
import { locateDesignFromBuild } from '../src/features/projects/design-build.ts'
import { consumeDesignFocus, getDesignFocus, requestDesignFocus, subscribeDesignFocus } from '../src/features/projects/design-focus.ts'
import { acquireReviewWrite, assertEditorClean, registerReviewEditor } from '../src/features/review/write-coordinator.ts'

const scope = { projectId: 'p', workspace: 'p' }
const source: DesignSourceSnapshot = { workspace: 'p', path: 'section.tex', digest: 'source-1', content: 'Alpha paragraph.\n\nBeta paragraph.\n' }
const span = (quote: string, ids = ['a'], id = 'block-a') => {
  const start = source.content.indexOf(quote)
  return captureSourceBinding(source, ids, start, start + quote.length, id)
}
const a = span('Alpha paragraph.'), b = span('Beta paragraph.', ['b'], 'block-b')
const fixture = (): ThinkingCanvasV2 => ({
  ...emptyCanvasV2(),
  nodes: [
    { id: 'chapter', kind: 'chapter', title: 'Method', body: 'UNRELATED CHAPTER DETAIL', x: 0, y: 0 },
    { id: 'a', kind: 'idea', title: 'Purpose A', body: 'Explain the premise, not a literal sentence.', x: 40, y: 120,
      writing: { purpose: 'State the contribution', argument: 'Motivation before mechanism', detail: 'One paragraph only', unwritten: 'Extra derivation stays outside prose', conditions: 'Only under the measured assumptions', template: 'Keep notation consistent' },
      evidence: [{ id: 'e1', workspace: 'academic', path: 'paper.md', digest: 'evidence-1', excerpt: 'Observed premise', note: 'Does not establish generality' }] },
    { id: 'b', kind: 'idea', title: 'Private B', body: 'UNRELATED PRIVATE BODY', x: 400, y: 100 },
  ],
  edges: [{ from: 'chapter', to: 'a' }, { from: 'a', to: 'b', relation: 'supports' }],
  outlines: [{ artifact: PRIMARY_OUTLINE, items: [{ node: 'chapter', children: [{ node: 'a' }, { node: 'b' }] }] }],
  sourceBindings: [structuredClone(a), structuredClone(b)],
})
const saved = (canvas = fixture()) => ({ content: serializeCanvas(canvas), digest: 'canvas-1' })
const context = (extra = {}) => buildWritingContext({ scope, record: saved(), selection: { nodeIds: ['a'] }, sources: [source], ...extra })
const build = {
  task: { workspaceRef: 'p', entryPoint: 'main.tex', inputs: [{ path: source.path, digest: source.digest }] },
  manifest: { buildId: 'build-1', status: 'succeeded', outputs: [{ digest: 'pdf-1', mediaType: 'application/pdf' }] },
}
const location = { workspace: 'p', path: source.path, line: 1, pdf: { workspace: 'p', path: 'main.tex', buildId: 'build-1', digest: 'pdf-1' } }

function ioFor(record = saved()): DesignContextPort {
  return {
    assertClean: assertEditorClean,
    read: async (workspace, path) => {
      if (workspace === 'p' && path === CANVAS_PATH) return record
      if (workspace === 'p' && path === source.path) return { content: source.content, digest: source.digest }
      if (workspace === 'academic' && path === 'paper.md') return { content: 'Observed premise', digest: 'evidence-1' }
      throw Object.assign(new Error('Missing'), { status: 404 })
    },
  }
}

test('current-format round trip retains intent, outside-prose detail and the sole binding table', () => {
  const canvas = { ...fixture(), extension: { retained: true } }
  assert.deepEqual(parseEditableCanvas(serializeCanvas(canvas), 'p'), canvas)
  assert.equal(canvas.sourceBindings?.length, 2)
})
for (const bad of [
  { version: 1, nodes: [], edges: [] }, { version: 3, nodes: [], edges: [], outlines: [] }, { version: 2, nodes: [], edges: [] },
]) test(`reject unsupported canvas without migration: ${JSON.stringify(bad)}`, () => assert.throws(() => parseEditableCanvas(JSON.stringify(bad))))

test('many-to-many links consolidate an identical range without duplicating source authority', () => {
  const added = putSourceBinding(fixture(), { ...a, id: 'new-id', nodeIds: ['b'] }, 'p')
  assert.equal(added.sourceBindings?.length, 2)
  assert.deepEqual(added.sourceBindings?.[0].nodeIds, ['a', 'b'])
  assert.equal(added.sourceBindings?.[0].id, a.id)
  assert.deepEqual(unlinkSourceBinding(added, a.id, 'a').sourceBindings?.[0].nodeIds, ['b'])
  const removed = removeCanvasNode(added, 'a')
  assert.ok(removed.sourceBindings?.every(binding => !binding.nodeIds.includes('a')))
  assert.ok(removed.sourceBindings?.some(binding => binding.id === a.id))
})

test('exact mapping requires the same opaque digest and exact original bytes', () => {
  assert.equal(resolveSourceBinding(a, source).state, 'exact')
  assert.equal(resolveSourceBinding(a, { ...source, digest: `sha256:${source.digest}` }).state, 'needs-confirmation')
  assert.equal(resolveSourceBinding(a, { ...source, content: `X${source.content}` }).reason, 'content-mismatch')
})

test('movement and duplicate quotes remain explicit candidates, never automatically rebound', () => {
  const changed = { ...source, digest: 'source-2', content: `Preamble\n${source.content}${a.quote}` }
  const result = resolveSourceBinding(a, changed)
  assert.equal(result.state, 'needs-confirmation')
  assert.equal(result.candidates.length, 2)
  assert.equal(a.start, 0)
  assert.equal(a.digest, 'source-1')
  const corrected = correctSourceBinding(a, changed, result.candidates[1].start, result.candidates[1].end)
  assert.equal(corrected.id, a.id)
  assert.deepEqual(corrected.nodeIds, a.nodeIds)
  assert.equal(corrected.digest, 'source-2')
  assert.equal(resolveSourceBinding(corrected, changed).state, 'exact')
})

test('candidate lists are bounded and disclose truncation', () => {
  const result = resolveSourceBinding(a, { ...source, digest: 'many', content: `${a.quote}\n`.repeat(30) })
  assert.equal(result.candidates.length, 20)
  assert.equal(result.truncated, true)
})

test('missing, unreadable and foreign source identities are distinct from exact mapping', () => {
  assert.equal(resolveSourceBinding(a, null).state, 'missing')
  assert.equal(resolveSourceBinding(a, undefined).state, 'unavailable')
  assert.equal(resolveSourceBinding(a, { ...source, workspace: 'other' }).reason, 'foreign-source')
  assert.equal(resolveSourceBinding(a, { ...source, path: 'elsewhere.tex' }).reason, 'foreign-source')
  assert.throws(() => correctSourceBinding(a, { ...source, path: 'elsewhere.tex' }, 0, a.end))
})

test('UTF-16 selection keeps CRLF and rejects split characters and invalid ranges', () => {
  const unicode = { ...source, content: 'α😀\r\nSecond' }
  assert.equal(sourceLines(unicode, 1, 2).quote, unicode.content)
  assert.throws(() => sourceRange(unicode, 2, 3))
  assert.throws(() => sourceLines(unicode, 0, 1))
  assert.throws(() => sourceRange(source, 0, Infinity))
  assert.throws(() => sourceRange(source, a.end, a.end + 1))
})
for (const patch of [
  { digest: '' }, { workspace: 'foreign' }, { path: '../escape.tex' }, { nodeIds: ['ghost'] },
  { nodeIds: ['a', 'a'] }, { end: 999 }, { quote: '' }, { start: -1 },
]) test(`reject malformed/scoped binding ${JSON.stringify(patch)}`, () => {
  const canvas = { ...fixture(), sourceBindings: [{ ...a, ...patch }] }
  assert.throws(() => parseEditableCanvas(JSON.stringify(canvas), 'p'))
})

test('dragging and collapse never change design order or semantic identity', () => {
  const canvas = fixture(), moved = { ...canvas, nodes: canvas.nodes.map(node => ({ ...node, x: node.x + 500, y: -node.y, collapsed: true })) }
  assert.equal(semanticFingerprint(moved), semanticFingerprint(canvas))
  assert.deepEqual(moved.outlines, canvas.outlines)
  assert.equal(canvasToPrompt(moved, 'P'), canvasToPrompt(canvas, 'P'))
  assert.notEqual(semanticFingerprint(moveOutlineItem(canvas, PRIMARY_OUTLINE, 'a', 1)), semanticFingerprint(canvas))
  assert.notEqual(semanticFingerprint(setNodeWriting(canvas, 'a', 'unwritten', 'A new excluded detail')), semanticFingerprint(canvas))
  assert.notEqual(semanticFingerprint({ ...canvas, sourceBindings: [{ ...a, digest: 'new' }, b] }), semanticFingerprint(canvas))
})

test('scoped context includes intent and exact body, not unrelated cards, layouts or whole source', () => {
  const result = context()
  assert.deepEqual(result.design.nodeIds, ['a'])
  assert.equal(result.design.digest, 'canvas-1')
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].quote, a.quote)
  assert.equal(result.cards[0].writing?.unwritten, 'Extra derivation stays outside prose')
  const json = JSON.stringify(result)
  assert.ok(!json.includes('UNRELATED'))
  assert.ok(!json.includes('Beta paragraph.'))
  assert.ok(!json.includes('"x":'))
  assert.deepEqual(result.outline[0].ancestors.map(item => item.nodeId), ['chapter', 'a'])
  assert.equal(result.relations.length, 0)
  assert.match(writingContextToPrompt(result), /非批准/)
})

test('selected binding scope can narrow a card with several body blocks', () => {
  const canvas = putSourceBinding(fixture(), { ...b, nodeIds: ['a', 'b'] }, 'p')
  const result = context({ record: saved(canvas), selection: { nodeIds: ['a'], bindingIds: [a.id] } })
  assert.deepEqual(result.sources.map(binding => binding.id), [a.id])
  assert.throws(() => context({ selection: { nodeIds: ['a'], bindingIds: [b.id] } }), DesignContextError)
})
for (const selection of [{ nodeIds: [] }, { nodeIds: ['a', 'a'] }, { nodeIds: ['ghost'] }, { nodeIds: ['chapter'] }]) {
  test(`reject missing/unmapped/ambiguous card selection ${JSON.stringify(selection)}`, () => assert.throws(() => context({ selection }), DesignContextError))
}

test('unresolved source mappings cannot become writable context', () => {
  assert.throws(() => context({ sources: [] }), DesignContextError)
  assert.throws(() => context({ sources: [{ ...source, digest: 'changed' }] }), DesignContextError)
  assert.throws(() => context({ sources: [{ ...source, workspace: 'another' }] }), DesignContextError)
  assert.throws(() => context({ sources: [source, source] }), DesignContextError)
})

test('evidence keeps provenance and uncertainty rather than fabricating a verified conclusion', () => {
  assert.equal(context().evidence[0].state, 'unverifiable')
  const key = sourceBindingKey({ workspace: 'academic', path: 'paper.md' })
  const observed = { workspace: 'academic', path: 'paper.md', digest: 'evidence-1', content: 'Observed premise' }
  assert.equal(context({ evidenceSnapshots: new Map([[key, observed]]) }).evidence[0].state, 'current')
  assert.equal(context({ evidenceSnapshots: new Map([[key, { ...observed, content: 'Different claim' }]]) }).evidence[0].state, 'changed')
  assert.equal(context({ evidenceSnapshots: new Map([[key, null]]) }).evidence[0].state, 'missing')
})

test('oversized context is rejected instead of silently truncating intended detail', () => {
  const canvas = setNodeWriting(fixture(), 'a', 'unwritten', 'x'.repeat(50000))
  assert.throws(() => context({ record: saved(canvas) }), error => error instanceof DesignContextError && error.issues[0].code === 'selection-too-large')
})

test('post-write projection uses the exact application map, preserves IDs and moves unaffected blocks', () => {
  const after = { ...source, digest: 'source-2', content: source.content.replace(a.quote, 'New scoped prose.') }
  const result = updateBindingsAfterWrite(fixture(), source, after, [{ start: a.start, end: a.end, before: a.quote, after: 'New scoped prose.' }])
  assert.deepEqual(result.updatedIds, [a.id, b.id])
  assert.deepEqual(result.needsConfirmationIds, [])
  assert.deepEqual(result.canvas.outlines, fixture().outlines)
  for (const binding of result.canvas.sourceBindings!) assert.equal(resolveSourceBinding(binding, after).state, 'exact')
  assert.equal(result.canvas.sourceBindings?.[0].quote, 'New scoped prose.')
  assert.deepEqual(result.canvas.sourceBindings?.[0].nodeIds, ['a'])
})

test('insertion at a block boundary shifts the existing block, not its semantic membership', () => {
  const after = { ...source, digest: 'source-2', content: `Prefix\n${source.content}` }
  const result = updateBindingsAfterWrite(fixture(), source, after, [{ start: 0, end: 0, before: '', after: 'Prefix\n' }])
  assert.equal(result.canvas.sourceBindings?.[0].quote, a.quote)
  assert.equal(result.canvas.sourceBindings?.[0].start, 7)
})

test('cross-boundary rewrite and block deletion retain unresolved old bindings', () => {
  const end = a.end + 3, after = { ...source, digest: 'source-2', content: `Replacement${source.content.slice(end)}` }
  const crossed = updateBindingsAfterWrite(fixture(), source, after, [{ start: 0, end, before: source.content.slice(0, end), after: 'Replacement' }])
  assert.ok(crossed.needsConfirmationIds.includes(a.id))
  assert.equal(crossed.canvas.sourceBindings?.[0].digest, a.digest)
  const deleted = updateBindingsAfterWrite(fixture(), source, { ...source, digest: 'deleted', content: source.content.slice(a.end) }, [{ start: 0, end: a.end, before: a.quote, after: '' }])
  assert.ok(deleted.needsConfirmationIds.includes(a.id))
})

test('proposed/fabricated application content and mismatched edit maps are rejected', () => {
  const edit = { start: a.start, end: a.end, before: a.quote, after: 'New' }
  assert.throws(() => updateBindingsAfterWrite(fixture(), source, { ...source, digest: 'new', content: 'Not the result' }, [edit]))
  assert.throws(() => updateBindingsAfterWrite(fixture(), source, { ...source, workspace: 'other' }, []))
  assert.throws(() => updateBindingsAfterWrite(fixture(), source, source, [{ ...edit, before: 'Wrong' }]))
})

test('verified PDF output and build input permit precise design lookup', () => {
  const result = locateDesignFromBuild(fixture(), source, build, location)
  assert.equal(result.state, 'verified-source')
  assert.deepEqual(result.exact.map(binding => binding.id), [a.id])
})
for (const pdf of [{ ...location.pdf, digest: 'wrong' }, { ...location.pdf, buildId: 'old' }, { ...location.pdf, workspace: 'other' }, { ...location.pdf, path: 'other.tex' }]) {
  test(`unverified PDF identity offers candidates only ${JSON.stringify(pdf)}`, () => {
    const result = locateDesignFromBuild(fixture(), source, build, { ...location, pdf })
    assert.equal(result.state, 'needs-confirmation')
    assert.equal(result.exact.length, 0)
    assert.equal(result.candidates.length, 2)
  })
}

test('changed source and absent build evidence cannot reuse old SyncTeX line coordinates', () => {
  assert.equal(locateDesignFromBuild(fixture(), { ...source, digest: 'changed' }, build, location).exact.length, 0)
  assert.equal(locateDesignFromBuild(fixture(), source, undefined, location).exact.length, 0)
})

test('context reader rechecks saved design, source and existing editor state without writing', async () => {
  const result = await readWritingContext(scope, { nodeIds: ['a'] }, { expectedCanvasDigest: 'canvas-1' }, ioFor())
  assert.equal(result.evidence[0].state, 'current')
  assert.equal(result.sources[0].digest, source.digest)
})

test('dirty editor and review lease prevent context generation through the original coordinator', async () => {
  const unregister = registerReviewEditor('p', CANVAS_PATH, { blocked: () => true, reload: async () => undefined })
  try { await assert.rejects(readWritingContext(scope, { nodeIds: ['a'] }, {}, ioFor()), /unsaved changes/) }
  finally { unregister() }
  const release = acquireReviewWrite('p', source.path)
  try { await assert.rejects(readWritingContext(scope, { nodeIds: ['a'] }, {}, ioFor()), /active write/) }
  finally { await release() }
})

test('late design/source changes invalidate the assembled context', async () => {
  const io = ioFor(), read = io.read
  let sourceReads = 0
  io.read = async (workspace, path, signal) => {
    const result = await read(workspace, path, signal)
    if (path === source.path && ++sourceReads > 1) return { ...result, digest: 'concurrent-change' }
    return result
  }
  await assert.rejects(readWritingContext(scope, { nodeIds: ['a'] }, {}, io), /changed while preparing/)
  await assert.rejects(readWritingContext(scope, { nodeIds: ['a'] }, { expectedCanvasDigest: 'old-design' }, ioFor()), /saved design changed/)
})

test('late cancellation never returns a context for a replaced project request', async () => {
  const controller = new AbortController(), io = ioFor(), read = io.read
  io.read = async (...args) => { const result = await read(...args); controller.abort(); return result }
  await assert.rejects(readWritingContext(scope, { nodeIds: ['a'] }, { signal: controller.signal }, io), { name: 'AbortError' })
})

test('design focus is project-scoped navigation and consuming an old request preserves a new one', () => {
  let notifications = 0
  const stop = subscribeDesignFocus(() => { notifications++ })
  requestDesignFocus({ project: 'p', nodeId: 'a' })
  const old = getDesignFocus('p')!
  assert.equal(getDesignFocus('other'), null)
  requestDesignFocus({ project: 'p', nodeId: 'b' })
  consumeDesignFocus(old)
  assert.equal(getDesignFocus('p')?.nodeId, 'b')
  consumeDesignFocus(getDesignFocus('p')!)
  stop()
  assert.equal(getDesignFocus('p'), null)
  assert.equal(notifications, 3)
})

test('obsolete canvas bytes cannot become an editable or writable session', async () => {
  const { createFileSession } = await import('../src/features/projects/file-session.ts')
  let writes = 0
  const session = createFileSession<ThinkingCanvasV2>({
    port: { read: async () => ({ content: '{"version":1,"nodes":[],"edges":[]}', digest: 'legacy' }), write: async () => { writes++; return { digest: 'unexpected' } } },
    decode: parseEditableCanvas, encode: serializeCanvas, empty: emptyCanvasV2, changed: () => {}, schedule: () => () => {},
  })
  await session.load(); session.edit(canvas => ({ ...canvas, nodes: [] })); await session.save()
  assert.equal(session.snapshot().status, 'invalid'); assert.equal(session.snapshot().value, null); assert.equal(writes, 0)
  session.dispose()
})
