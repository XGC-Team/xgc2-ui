import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PRIMARY_OUTLINE, addCanvasEdge, addNodeBinding, addNodeEvidence, applyNodeWriting, arrangeNode, canvasToPrompt,
  emptyCanvasV2, ensureArrangement, flatOutline, getArrangement, indentOutlineItem, moveOutlineItem, newCanvasEvidence,
  newSourceBinding, outdentOutlineItem, parseCanvas, parseEditableCanvas, removeCanvasNode, removeNodeEvidence,
  removeNodeFromArrangement, semanticFingerprint, serializeCanvas, setEdgeRelation, setNodeCollapsed, setNodeWriting,
  unarrangedNodeIds, type ThinkingCanvasV2,
} from '../src/features/projects/canvas-model.ts'
import { attachDraftReference, draftIdFromAnchor } from '../src/features/projects/draft-model.ts'

const sample = (): ThinkingCanvasV2 => ({
  version: 2,
  nodes: [
    { id: 'c2', kind: 'chapter', title: '方法二', x: 500, y: 300 },
    { id: 'c1', kind: 'chapter', title: '引言', x: 0, y: 0, anchor: 'research-drafts.json#intro' },
    { id: 'i1', kind: 'idea', title: '贡献点', x: 40, y: 120, ref: { path: 'papers/foo.md', title: 'Foo' } },
    { id: 'i2', kind: 'idea', title: '早期想法', x: 400, y: 100 },
    { id: 'loose', kind: 'idea', title: '散落想法', x: 0, y: 500 },
  ],
  edges: [{ from: 'c1', to: 'i1' }, { from: 'c1', to: 'i2' }, { from: 'i1', to: 'i2' }],
  outlines: [{ artifact: 'canvas', items: [{ node: 'c1', children: [{ node: 'i2' }, { node: 'i1' }] }, { node: 'c2' }] }],
})

test('v1 and unknown versions fail closed; read-only parse never rewrites them', () => {
  const v1 = JSON.stringify({ version: 1, nodes: sample().nodes, edges: sample().edges })
  assert.throws(() => parseEditableCanvas(v1), /Unsupported/)
  assert.deepEqual(parseCanvas(v1), { nodes: [] })
  assert.throws(() => parseEditableCanvas(JSON.stringify({ version: 3, nodes: [], edges: [], outlines: [] })))
  assert.deepEqual(parseCanvas('not json'), { nodes: [] })
})
test('v2 round trip preserves unknown extension fields at every level', () => {
  const v2 = sample()
  const extended = {
    ...v2, rootExt: 1,
    nodes: v2.nodes.map(n => ({ ...n, nodeExt: [1] })),
    edges: v2.edges.map(e => ({ ...e, edgeExt: 'x' })),
    outlines: v2.outlines.map(o => ({ ...o, outlineExt: { keep: 1 } })),
  }
  assert.deepEqual(JSON.parse(serializeCanvas(parseEditableCanvas(serializeCanvas(extended)))), extended)
})
for (const [name, mutate] of [
  ['unknown version fails closed', (raw: Record<string, unknown>) => ({ ...raw, version: 3 })],
  ['v1 shape with a bumped version is not v2', (raw: Record<string, unknown>) => ({ version: 2, nodes: raw.nodes, edges: raw.edges })],
  ['outline references a missing node', (raw: Record<string, unknown>) => ({ ...raw, outlines: [{ artifact: 'canvas', items: [{ node: 'ghost' }] }] })],
  ['outline repeats a node (cycle impossible, duplicate rejected)', (raw: Record<string, unknown>) => ({ ...raw, outlines: [{ artifact: 'canvas', items: [{ node: 'c1' }, { node: 'c1' }] }] })],
  ['edge with an unknown relation', (raw: Record<string, unknown>) => ({ ...raw, edges: [{ from: 'c1', to: 'i1', relation: 'causes' }] })],
  ['edge references a missing node', (raw: Record<string, unknown>) => ({ ...raw, edges: [{ from: 'c1', to: 'ghost' }] })],
  ['duplicate artifact arrangements', (raw: Record<string, unknown>) => ({ ...raw, outlines: [{ artifact: 'canvas', items: [] }, { artifact: 'canvas', items: [] }] })],
  ['evidence without any source', (raw: Record<string, unknown>) => ({ ...raw, nodes: [...(raw.nodes as unknown[]).slice(1), { id: 'c1', kind: 'chapter', title: 'C', x: 0, y: 0, evidence: [{ id: 'e1' }] }] })],
  ['evidence with an unsafe path', (raw: Record<string, unknown>) => ({ ...raw, nodes: [...(raw.nodes as unknown[]).slice(1), { id: 'c1', kind: 'chapter', title: 'C', x: 0, y: 0, evidence: [{ id: 'e1', path: '../x.md' }] }] })],
  ['binding without digest', (raw: Record<string, unknown>) => ({ ...raw, nodes: [{ id: 'c1', kind: 'chapter', title: 'C', x: 0, y: 0, bindings: [{ id: 'b', workspace: 'p', path: 'main.tex', quote: 'ab', start: 0, end: 2 }] }] })],
] as const) {
  test(`invalid v2 rejected: ${name}`, () => {
    assert.throws(() => parseEditableCanvas(JSON.stringify(mutate(sample() as unknown as Record<string, unknown>))))
  })
}
test('moving a card changes neither the outline order nor the semantic fingerprint', () => {
  const v2 = sample()
  const before = flatOutline(getArrangement(v2, PRIMARY_OUTLINE))
  const moved: ThinkingCanvasV2 = { ...v2, nodes: v2.nodes.map(n => n.id === 'i1' ? { ...n, x: n.x + 500, y: n.y - 220 } : n) }
  assert.deepEqual(flatOutline(getArrangement(moved, PRIMARY_OUTLINE)), before)
  assert.equal(semanticFingerprint(moved), semanticFingerprint(v2))
})
test('collapse state is view state and does not change the semantic fingerprint', () => {
  const v2 = sample()
  assert.equal(semanticFingerprint(setNodeCollapsed(v2, 'c1', true)), semanticFingerprint(v2))
})
test('content, order, writing and bindings change the semantic fingerprint', () => {
  const v2 = sample()
  const base = semanticFingerprint(v2)
  assert.notEqual(semanticFingerprint(moveOutlineItem(v2, PRIMARY_OUTLINE, 'i2', 1)), base)
  assert.notEqual(semanticFingerprint(setEdgeRelation(v2, 2, 'supports')), base)
  assert.notEqual(semanticFingerprint(setNodeWriting(v2, 'i1', 'purpose', 'why')), base)
  assert.notEqual(semanticFingerprint(addNodeBinding(v2, 'i1', newSourceBinding({ workspace: 'p', path: 'main.tex', digest: 'd', quote: 'ab', start: 0, end: 2 }))), base)
})
test('outline reorder, indent and outdent operate on siblings without touching layout', () => {
  let v2 = sample()
  v2 = moveOutlineItem(v2, PRIMARY_OUTLINE, 'i1', -1)
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)).map(r => r.node), ['c1', 'i1', 'i2', 'c2'])
  v2 = outdentOutlineItem(v2, PRIMARY_OUTLINE, 'i1')
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)), [
    { node: 'c1', depth: 0 }, { node: 'i2', depth: 1 }, { node: 'i1', depth: 0 }, { node: 'c2', depth: 0 },
  ])
  v2 = indentOutlineItem(v2, PRIMARY_OUTLINE, 'i1')
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)), [
    { node: 'c1', depth: 0 }, { node: 'i2', depth: 1 }, { node: 'i1', depth: 1 }, { node: 'c2', depth: 0 },
  ])
  assert.deepEqual(v2.nodes.find(n => n.id === 'i1'), sample().nodes.find(n => n.id === 'i1'))
})
test('unarranged ideas join and leave the outline without losing content', () => {
  let v2 = sample()
  v2 = arrangeNode(v2, PRIMARY_OUTLINE, 'loose')
  assert.deepEqual(unarrangedNodeIds(v2, PRIMARY_OUTLINE), [])
  v2 = removeNodeFromArrangement(v2, PRIMARY_OUTLINE, 'loose')
  assert.deepEqual(unarrangedNodeIds(v2, PRIMARY_OUTLINE), ['loose'])
  assert.ok(v2.nodes.some(n => n.id === 'loose'))
})
test('two artifacts share a card but keep their own order', () => {
  let v2 = sample()
  v2 = ensureArrangement(v2, 'draft-slides')
  v2 = arrangeNode(v2, 'draft-slides', 'i1')
  v2 = arrangeNode(v2, 'draft-slides', 'i2')
  assert.deepEqual(flatOutline(getArrangement(v2, 'draft-slides')).map(r => r.node), ['i1', 'i2'])
  v2 = moveOutlineItem(v2, 'draft-slides', 'i2', -1)
  assert.deepEqual(flatOutline(getArrangement(v2, 'draft-slides')).map(r => r.node), ['i2', 'i1'])
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)).map(r => r.node), ['c1', 'i2', 'i1', 'c2'])
  assert.equal(arrangeNode(v2, 'draft-slides', 'i1'), v2)
})
test('deleting a node cascades to edges and every arrangement', () => {
  let v2 = sample()
  v2 = arrangeNode(ensureArrangement(v2, 'draft-slides'), 'draft-slides', 'i1')
  v2 = removeCanvasNode(v2, 'i1')
  assert.ok(!v2.nodes.some(n => n.id === 'i1'))
  assert.ok(!v2.edges.some(e => e.from === 'i1' || e.to === 'i1'))
  assert.ok(!flatOutline(getArrangement(v2, PRIMARY_OUTLINE)).some(r => r.node === 'i1'))
  assert.ok(!flatOutline(getArrangement(v2, 'draft-slides')).some(r => r.node === 'i1'))
})
test('edge relations are explicit; adding duplicate or self links is a no-op', () => {
  let v2 = sample()
  assert.equal(addCanvasEdge(v2, 'c1', 'c1'), v2)
  assert.equal(addCanvasEdge(v2, 'c1', 'i1'), v2)
  v2 = setEdgeRelation(v2, 2, 'contradicts')
  assert.equal(v2.edges[2].relation, 'contradicts')
  const cleared = setEdgeRelation(v2, 2, undefined)
  assert.deepEqual(cleared.edges[2], { from: 'i1', to: 'i2' })
})
test('evidence keeps excerpt, observed digest and source note; unverifiable stays explicit', () => {
  let v2 = sample()
  const pinned = newCanvasEvidence({ path: 'papers/a.md', digest: 'rev-1', excerpt: 'quoted', note: '核对第二页' })
  const unpinned = newCanvasEvidence({ path: 'papers/b.md' })
  v2 = addNodeEvidence(v2, 'i1', pinned)
  v2 = addNodeEvidence(v2, 'i1', unpinned)
  const reopened = parseEditableCanvas(serializeCanvas(v2))
  assert.deepEqual(reopened.nodes.find(n => n.id === 'i1')?.evidence, [pinned, unpinned])
  v2 = removeNodeEvidence(v2, 'i1', pinned.id)
  assert.equal(v2.nodes.find(n => n.id === 'i1')?.evidence?.length, 1)
  assert.throws(() => newCanvasEvidence({ path: '/abs.md' }))
  assert.throws(() => newCanvasEvidence({}))
})
test('writing constraints round-trip, including omission/aside, and disappear when emptied', () => {
  let v2 = sample()
  v2 = setNodeWriting(v2, 'i1', 'purpose', '引出缺口')
  v2 = setNodeWriting(v2, 'i1', 'omission', '推导不进正文')
  v2 = applyNodeWriting(v2, 'i1', { purpose: '引出缺口', omission: '推导不进正文', aside: '内部记号' })
  const reopened = parseEditableCanvas(serializeCanvas(v2))
  assert.deepEqual(reopened.nodes.find(n => n.id === 'i1')?.writing, { purpose: '引出缺口', omission: '推导不进正文', aside: '内部记号' })
  v2 = applyNodeWriting(v2, 'i1', undefined)
  assert.equal(v2.nodes.find(n => n.id === 'i1')?.writing, undefined)
})
test('source bindings require digest, quote and UTF-16 range equality', () => {
  assert.throws(() => newSourceBinding({ workspace: 'p', path: 'main.tex', digest: 'd', quote: 'ab', start: 0, end: 3 }))
  const binding = newSourceBinding({ id: 'b1', workspace: 'p', path: 'main.tex', digest: 'd', quote: 'ab', start: 0, end: 2 })
  const v2 = addNodeBinding(sample(), 'i1', binding)
  assert.deepEqual(parseEditableCanvas(serializeCanvas(v2)).nodes.find(n => n.id === 'i1')?.bindings, [binding])
})
test('v2 prompt uses the explicit outline and marks omission/aside as not manuscript text', () => {
  let v2 = sample()
  v2 = setEdgeRelation(v2, 2, 'supports')
  v2 = addNodeEvidence(v2, 'i1', newCanvasEvidence({ path: 'papers/a.md', digest: 'rev-1', excerpt: 'quoted' }))
  v2 = setNodeWriting(v2, 'i1', 'purpose', '引出缺口')
  v2 = setNodeWriting(v2, 'i1', 'omission', '推导细节')
  v2 = addNodeBinding(v2, 'i1', newSourceBinding({ id: 'b1', workspace: 'p', path: 'main.tex', digest: 'd1', quote: 'claim', start: 0, end: 5 }))
  const shuffled: ThinkingCanvasV2 = { ...v2, nodes: v2.nodes.map(n => ({ ...n, x: -n.x, y: -n.y })) }
  const prompt = canvasToPrompt(shuffled, '论文')
  assert.equal(prompt, canvasToPrompt(v2, '论文'))
  assert.ok(prompt.indexOf('1. 引言') < prompt.indexOf('2. 方法二'))
  assert.match(prompt, /- 早期想法\n/)
  assert.match(prompt, /- 贡献点 \[\[papers\/foo\.md\]\]/)
  assert.match(prompt, /## 语义关系\n- 贡献点 支持 早期想法/)
  assert.match(prompt, /证据： papers\/a\.md@rev-1 — quoted/)
  assert.match(prompt, /写作目的： 引出缺口/)
  assert.match(prompt, /详略（不得写入正文）： 推导细节/)
  assert.match(prompt, /对应正文： main\.tex@d1 「claim」/)
  assert.match(prompt, /## 待归档想法\n- 散落想法/)
})
test('v2 prompt marks unpinned evidence as unverifiable instead of inventing a version', () => {
  let v2 = emptyCanvasV2()
  v2 = { ...v2, nodes: [{ id: 'i', kind: 'idea', title: 'I', x: 0, y: 0, evidence: [newCanvasEvidence({ path: 'a.md' })] }] }
  v2 = arrangeNode(v2, PRIMARY_OUTLINE, 'i')
  assert.match(canvasToPrompt(v2, 'P'), /证据： a\.md（版本无法自动校验）/)
})
test('canvas reference nodes keep the draft-object anchor and do not enter outlines', () => {
  const v2 = sample()
  const linked = attachDraftReference(v2, 'note-1', 'A note')
  assert.equal(linked.version, 2)
  assert.equal(linked.outlines, v2.outlines)
  const node = linked.nodes.find(n => n.anchor === 'research-drafts.json#note-1')!
  assert.equal(draftIdFromAnchor(node.anchor!), 'note-1')
  assert.deepEqual(unarrangedNodeIds(linked, PRIMARY_OUTLINE), ['loose', node.id])
  assert.deepEqual(parseEditableCanvas(serializeCanvas(linked)), linked)
  assert.equal(attachDraftReference(linked, 'note-1', 'renamed'), linked)
})
test('source guards: no v1 migration layer remains', () => {
  const model = readFileSync(new URL('../src/features/projects/canvas-model.ts', import.meta.url), 'utf8')
  const hook = readFileSync(new URL('../src/features/projects/useCanvasDocument.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(model, /migrateCanvasV1toV2|CANVAS_V1|wrapMigratingPort/)
  assert.doesNotMatch(hook, /wrapMigratingPort|canvas-migration|migrateCanvasV1toV2/)
  assert.match(hook, /sessionOwners\.get\(project\)\?\.session\.dispose\(\)/)
  assert.equal((hook.match(/method: 'PUT'/g) || []).length, 1)
})
