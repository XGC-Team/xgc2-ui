import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRIMARY_OUTLINE, addCanvasEdge, addNodeEvidence, arrangeNode, canvasToPrompt, emptyCanvasV2, ensureArrangement,
  flatOutline, getArrangement, indentOutlineItem, moveOutlineItem, newCanvasEvidence,
  outdentOutlineItem, parseEditableCanvas, removeCanvasNode, removeNodeEvidence, removeNodeFromArrangement,
  semanticFingerprint, serializeCanvas, setEdgeRelation, setNodeCollapsed, setNodeWriting, unarrangedNodeIds,
  type ThinkingCanvasV2,
} from '../src/features/projects/canvas-model.ts'
import { attachDraftReference, draftIdFromAnchor } from '../src/features/projects/draft-model.ts'

// An explicit current-format arrangement. No geometry/edge inference or v1 fixture conversion.
const current: ThinkingCanvasV2 = {
  version: 2,
  nodes: [
    { id: 'c2', kind: 'chapter', title: '方法二', x: 500, y: 300 },
    { id: 'c1', kind: 'chapter', title: '引言', x: 0, y: 0, anchor: 'main.tex' },
    { id: 'i1', kind: 'idea', title: '贡献点', x: 40, y: 120, ref: { path: 'papers/foo.md', title: 'Foo' } },
    { id: 'i2', kind: 'idea', title: '早期想法', x: 400, y: 100 },
    { id: 'loose', kind: 'idea', title: '散落想法', x: 0, y: 500 },
  ],
  edges: [{ from: 'c1', to: 'i1' }, { from: 'c1', to: 'i2' }, { from: 'i1', to: 'i2' }],
  outlines: [{ artifact: PRIMARY_OUTLINE, items: [{ node: 'c1', children: [{ node: 'i2' }, { node: 'i1' }] }, { node: 'c2' }] }],
}
const fixture = () => structuredClone(current)

test('current format retains IDs, refs, anchors, explicit order and unarranged ideas', () => {
  const v2 = parseEditableCanvas(serializeCanvas(current))
  assert.deepEqual(v2, current)
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)), [
    { node: 'c1', depth: 0 }, { node: 'i2', depth: 1 }, { node: 'i1', depth: 1 }, { node: 'c2', depth: 0 },
  ])
  assert.deepEqual(unarrangedNodeIds(v2, PRIMARY_OUTLINE), ['loose'])
  assert.ok(v2.edges.every(edge => edge.relation === undefined))
})
test('v2 round trip preserves unknown extension fields at every level', () => {
  const v2 = fixture()
  const extended = {
    ...v2, rootExt: 1,
    nodes: v2.nodes.map(n => ({ ...n, nodeExt: [1] })),
    edges: v2.edges.map(e => ({ ...e, edgeExt: 'x' })),
    outlines: v2.outlines.map(o => ({ ...o, outlineExt: { keep: 1 } })),
  }
  assert.deepEqual(JSON.parse(serializeCanvas(parseEditableCanvas(serializeCanvas(extended)))), extended)
})
for (const [name, mutate] of [
  ['old version fails closed', (raw: Record<string, unknown>) => ({ ...raw, version: 1 })],
  ['unknown version fails closed', (raw: Record<string, unknown>) => ({ ...raw, version: 3 })],
  ['a version bump cannot substitute for an explicit outline', (raw: Record<string, unknown>) => ({ version: 2, nodes: raw.nodes, edges: raw.edges })],
  ['outline references a missing node', (raw: Record<string, unknown>) => ({ ...raw, outlines: [{ artifact: 'canvas', items: [{ node: 'ghost' }] }] })],
  ['outline repeats a node', (raw: Record<string, unknown>) => ({ ...raw, outlines: [{ artifact: 'canvas', items: [{ node: 'c1' }, { node: 'c1' }] }] })],
  ['edge with an unknown relation', (raw: Record<string, unknown>) => ({ ...raw, edges: [{ from: 'c1', to: 'i1', relation: 'causes' }] })],
  ['edge references a missing node', (raw: Record<string, unknown>) => ({ ...raw, edges: [{ from: 'c1', to: 'ghost' }] })],
  ['duplicate artifact arrangements', (raw: Record<string, unknown>) => ({ ...raw, outlines: [{ artifact: 'canvas', items: [] }, { artifact: 'canvas', items: [] }] })],
  ['evidence without any source', (raw: Record<string, unknown>) => ({ ...raw, nodes: [...(raw.nodes as unknown[]).slice(1), { id: 'c1', kind: 'chapter', title: 'C', x: 0, y: 0, evidence: [{ id: 'e1' }] }] })],
  ['evidence with an unsafe path', (raw: Record<string, unknown>) => ({ ...raw, nodes: [...(raw.nodes as unknown[]).slice(1), { id: 'c1', kind: 'chapter', title: 'C', x: 0, y: 0, evidence: [{ id: 'e1', path: '../x.md' }] }] })],
] as const) test(`invalid current canvas rejected: ${name}`, () => assert.throws(() => parseEditableCanvas(JSON.stringify(mutate(fixture() as unknown as Record<string, unknown>)))))

test('moving and collapsing cards cannot change explicit writing order or semantic identity', () => {
  const v2 = fixture(), before = flatOutline(getArrangement(v2, PRIMARY_OUTLINE))
  const moved = { ...v2, nodes: v2.nodes.map(n => ({ ...n, x: n.x + 500, y: n.y - 220 })) }
  assert.deepEqual(flatOutline(getArrangement(moved, PRIMARY_OUTLINE)), before)
  assert.equal(semanticFingerprint(moved), semanticFingerprint(v2))
  assert.equal(semanticFingerprint(setNodeCollapsed(v2, 'c1', true)), semanticFingerprint(v2))
})
test('content, order and relation changes do change the semantic fingerprint', () => {
  const v2 = fixture(), base = semanticFingerprint(v2)
  assert.notEqual(semanticFingerprint(moveOutlineItem(v2, PRIMARY_OUTLINE, 'i2', 1)), base)
  assert.notEqual(semanticFingerprint(setEdgeRelation(v2, 2, 'supports')), base)
  assert.notEqual(semanticFingerprint(setNodeWriting(v2, 'i1', 'purpose', 'why')), base)
})
test('outline reorder, indent and outdent operate on siblings without touching layout', () => {
  let v2 = moveOutlineItem(fixture(), PRIMARY_OUTLINE, 'i1', -1)
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)).map(row => row.node), ['c1', 'i1', 'i2', 'c2'])
  v2 = outdentOutlineItem(v2, PRIMARY_OUTLINE, 'i1')
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)), [
    { node: 'c1', depth: 0 }, { node: 'i2', depth: 1 }, { node: 'i1', depth: 0 }, { node: 'c2', depth: 0 },
  ])
  v2 = indentOutlineItem(v2, PRIMARY_OUTLINE, 'i1')
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)), [
    { node: 'c1', depth: 0 }, { node: 'i2', depth: 1 }, { node: 'i1', depth: 1 }, { node: 'c2', depth: 0 },
  ])
  assert.deepEqual(v2.nodes, current.nodes)
})
test('unarranged ideas join and leave the outline without losing content', () => {
  let v2 = arrangeNode(fixture(), PRIMARY_OUTLINE, 'loose')
  assert.deepEqual(unarrangedNodeIds(v2, PRIMARY_OUTLINE), [])
  v2 = removeNodeFromArrangement(v2, PRIMARY_OUTLINE, 'loose')
  assert.deepEqual(unarrangedNodeIds(v2, PRIMARY_OUTLINE), ['loose'])
  assert.ok(v2.nodes.some(node => node.id === 'loose'))
})
test('two artifacts share a card but keep their own order', () => {
  let v2 = ensureArrangement(fixture(), 'draft-slides')
  v2 = arrangeNode(v2, 'draft-slides', 'i1'); v2 = arrangeNode(v2, 'draft-slides', 'i2')
  assert.deepEqual(flatOutline(getArrangement(v2, 'draft-slides')).map(row => row.node), ['i1', 'i2'])
  v2 = moveOutlineItem(v2, 'draft-slides', 'i2', -1)
  assert.deepEqual(flatOutline(getArrangement(v2, 'draft-slides')).map(row => row.node), ['i2', 'i1'])
  assert.deepEqual(flatOutline(getArrangement(v2, PRIMARY_OUTLINE)).map(row => row.node), ['c1', 'i2', 'i1', 'c2'])
  assert.equal(arrangeNode(v2, 'draft-slides', 'i1'), v2)
})
test('deleting a node cascades to edges and every arrangement', () => {
  let v2 = arrangeNode(ensureArrangement(fixture(), 'draft-slides'), 'draft-slides', 'i1')
  v2 = removeCanvasNode(v2, 'i1')
  assert.ok(!v2.nodes.some(node => node.id === 'i1'))
  assert.ok(!v2.edges.some(edge => edge.from === 'i1' || edge.to === 'i1'))
  assert.ok(!flatOutline(getArrangement(v2, PRIMARY_OUTLINE)).some(row => row.node === 'i1'))
  assert.ok(!flatOutline(getArrangement(v2, 'draft-slides')).some(row => row.node === 'i1'))
})
test('edge relations are explicit; adding duplicate or self links is a no-op', () => {
  const v2 = fixture()
  assert.equal(addCanvasEdge(v2, 'c1', 'c1'), v2); assert.equal(addCanvasEdge(v2, 'c1', 'i1'), v2)
  assert.equal(setEdgeRelation(v2, 2, 'contradicts').edges[2].relation, 'contradicts')
  assert.deepEqual(setEdgeRelation(setEdgeRelation(v2, 2, 'contradicts'), 2, undefined).edges[2], { from: 'i1', to: 'i2' })
})
test('evidence keeps excerpt, observed digest and source note; unverifiable stays explicit', () => {
  const pinned = newCanvasEvidence({ path: 'papers/a.md', digest: 'rev-1', excerpt: 'quoted', note: '核对第二页' })
  const unpinned = newCanvasEvidence({ path: 'papers/b.md' })
  let v2 = addNodeEvidence(addNodeEvidence(fixture(), 'i1', pinned), 'i1', unpinned)
  assert.deepEqual(parseEditableCanvas(serializeCanvas(v2)).nodes.find(node => node.id === 'i1')?.evidence, [pinned, unpinned])
  v2 = removeNodeEvidence(v2, 'i1', pinned.id)
  assert.equal(v2.nodes.find(node => node.id === 'i1')?.evidence?.length, 1)
  assert.throws(() => newCanvasEvidence({ path: '/abs.md' })); assert.throws(() => newCanvasEvidence({}))
})
test('writing constraints round-trip and disappear when emptied', () => {
  let v2 = setNodeWriting(setNodeWriting(fixture(), 'i1', 'purpose', '引出缺口'), 'i1', 'template', '会议模板')
  assert.deepEqual(parseEditableCanvas(serializeCanvas(v2)).nodes.find(node => node.id === 'i1')?.writing, { purpose: '引出缺口', template: '会议模板' })
  v2 = setNodeWriting(setNodeWriting(v2, 'i1', 'purpose', ''), 'i1', 'template', '')
  assert.equal(v2.nodes.find(node => node.id === 'i1')?.writing, undefined)
})
test('prompt uses explicit order, stable IDs and labeled relations, never coordinates', () => {
  let v2 = setEdgeRelation(fixture(), 2, 'supports')
  v2 = addNodeEvidence(v2, 'i1', newCanvasEvidence({ path: 'papers/a.md', digest: 'rev-1', excerpt: 'quoted' }))
  v2 = setNodeWriting(v2, 'i1', 'purpose', '引出缺口')
  const prompt = canvasToPrompt({ ...v2, nodes: v2.nodes.map(node => ({ ...node, x: -node.x, y: -node.y })) }, '论文')
  assert.equal(prompt, canvasToPrompt(v2, '论文'))
  assert.ok(prompt.indexOf('1. 引言') < prompt.indexOf('2. 方法二'))
  assert.match(prompt, /- 早期想法 \[i2\]/)
  assert.match(prompt, /- 贡献点 \[i1\] \[\[papers\/foo\.md\]\]/)
  assert.match(prompt, /## 语义关系\n- 贡献点 支持 早期想法/)
  assert.match(prompt, /证据引用（非验证结论）： papers\/a\.md@rev-1 — quoted/)
  assert.match(prompt, /写作目的： 引出缺口/)
  assert.match(prompt, /## 待归档想法\n- 散落想法/)
})
test('prompt marks unpinned evidence as unverifiable instead of inventing a version', () => {
  const v2 = arrangeNode({ ...emptyCanvasV2(), nodes: [{ id: 'i', kind: 'idea', title: 'I', x: 0, y: 0, evidence: [newCanvasEvidence({ path: 'a.md' })] }] }, PRIMARY_OUTLINE, 'i')
  assert.match(canvasToPrompt(v2, 'P'), /a\.md（版本无法自动校验）/)
})
test('canvas reference nodes keep the existing anchor contract and do not enter outlines', () => {
  const v2 = fixture(), linked = attachDraftReference(v2, 'note-1', 'A note')
  assert.equal(linked.outlines, v2.outlines)
  const node = linked.nodes.find(node => node.anchor === 'research-drafts.json#note-1')!
  assert.equal(draftIdFromAnchor(node.anchor!), 'note-1')
  assert.deepEqual(unarrangedNodeIds(linked, PRIMARY_OUTLINE), ['loose', node.id])
  assert.deepEqual(parseEditableCanvas(serializeCanvas(linked)), linked)
  assert.equal(attachDraftReference(linked, 'note-1', 'renamed'), linked)
})
