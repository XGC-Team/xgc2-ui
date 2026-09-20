import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  adoptContextVersion, assessContextItem, canvasContextNodeId, checkContextForSend, contextManifest,
  contextRecordExists, keepStaleSnapshot, newContextItem,
} from '../src/features/projects/context-model.ts'
import { contextCopy } from '../src/features/projects/context-copy.ts'
import { emptyCanvasV2, serializeCanvas } from '../src/features/projects/canvas-model.ts'
import { emptyDraftBook, appendDraft, newDraft, serializeDraftBook } from '../src/features/projects/draft-model.ts'

const item = (over: Partial<Parameters<typeof newContextItem>[0]> = {}) => newContextItem({
  project: 'paper-a', kind: 'canvas-node', label: '主张', ref: 'thinking.canvas.json#n1',
  source: { id: 's1', workspace: 'paper-a', path: 'thinking.canvas.json' }, digest: 'rev-1', excerpt: '旧摘录', ...over,
})
const observed = {
  digest: 'rev-2',
  content: serializeCanvas({ ...emptyCanvasV2(), nodes: [{ id: 'n1', kind: 'idea', title: '新版主张', x: 0, y: 0, body: '真实新内容', writing: { argument: '论证安排', unwritten: `${'详细推导'.repeat(80)}；不进入正文`, conditions: '仅在测量条件内成立' } }] }),
}

test('a pinned observation is current; a missing digest is unverifiable, never invented', () => {
  assert.equal(item().state, 'current')
  const unpinned = item({ digest: undefined })
  assert.equal(unpinned.state, 'unverifiable'); assert.equal(unpinned.digest, undefined)
  assert.throws(() => item({ digest: 'one', source: { id: 's', path: 'thinking.canvas.json', digest: 'two' } }), /disagree/)
})
test('refresh compares against observed revisions without relabeling an old excerpt', () => {
  assert.equal(assessContextItem(item(), { digest: 'rev-1' }).state, 'current')
  const changed = assessContextItem(item(), observed)
  assert.equal(changed.state, 'update-available'); assert.equal(changed.latestDigest, 'rev-2')
  assert.equal(changed.digest, 'rev-1'); assert.equal(changed.excerpt, '旧摘录')
  assert.equal(assessContextItem(item(), null).state, 'missing')
  assert.equal(assessContextItem(item(), {}).state, 'unverifiable')
  assert.equal(assessContextItem(item({ digest: undefined }), { digest: 'rev-9' }).state, 'unverifiable')
})
test('explicit adoption recaptures the same saved card, full intent, source digest and label', () => {
  const changed = assessContextItem(item(), observed), adopted = adoptContextVersion(changed, observed)
  assert.equal(adopted.digest, 'rev-2'); assert.equal(adopted.source?.digest, 'rev-2'); assert.equal(adopted.state, 'current')
  assert.equal(adopted.label, '新版主张'); assert.match(adopted.excerpt!, /真实新内容/)
  assert.match(adopted.excerpt!, /论证安排/); assert.match(adopted.excerpt!, /不进入正文/); assert.match(adopted.excerpt!, /仅在测量条件内成立/)
  assert.doesNotMatch(adopted.excerpt!, /旧摘录/)
  assert.equal(adopted.source?.excerpt, adopted.excerpt); assert.equal(adopted.latestDigest, undefined)
  assert.equal(changed.digest, 'rev-1'); assert.equal(changed.excerpt, '旧摘录')
})
test('a digest alone, another offered revision, missing card or invalid canvas cannot be adopted', () => {
  const changed = assessContextItem(item(), observed)
  assert.throws(() => adoptContextVersion(changed, { digest: 'rev-2', content: '' }))
  assert.throws(() => adoptContextVersion(changed, { ...observed, digest: 'rev-3' }), /offered revision changed/)
  assert.throws(() => adoptContextVersion(changed, { ...observed, content: serializeCanvas(emptyCanvasV2()) }), /no longer exists/)
  assert.throws(() => adoptContextVersion(item(), observed))
})
test('object existence is checked inside a current canvas and cannot cross projects', () => {
  assert.equal(contextRecordExists(item(), observed), true)
  assert.equal(contextRecordExists(item(), { ...observed, content: serializeCanvas(emptyCanvasV2()) }), false)
  assert.throws(() => canvasContextNodeId(item({ source: { id: 's', workspace: 'other', path: 'thinking.canvas.json' } })))
  assert.throws(() => canvasContextNodeId(item({ ref: 'elsewhere#n1' })))
})
test('draft adoption recaptures current object fields instead of just changing the revision', () => {
  const draft = newDraft('paper', 'Current paper', '2026-09-20T00:00:00Z', 'd1')
  draft.blocks[0].fields.argument = 'Current argument'
  const book = appendDraft(emptyDraftBook({ projectId: 'paper-a', workspace: 'paper-a' }), draft)
  const ref = item({ kind: 'draft', ref: 'research-drafts.json#d1', source: { id: 'draft', workspace: 'paper-a', path: 'research-drafts.json' } })
  const fresh = { digest: 'rev-2', content: serializeDraftBook(book) }
  const adopted = adoptContextVersion(assessContextItem(ref, fresh), fresh)
  assert.equal(adopted.label, 'Current paper'); assert.match(adopted.excerpt!, /Current argument/)
  assert.doesNotMatch(adopted.excerpt!, /旧摘录/)
})
test('changed source excerpts require recapture; surviving quotes lose obsolete PDF coordinates', () => {
  const ref = item({ kind: 'source', ref: 'source.md', excerpt: 'selected quote', source: { id: 's', path: 'source.md', digest: 'rev-1', buildId: 'old-build', page: 3 } })
  const fresh = { digest: 'rev-2', content: 'prefix selected quote suffix' }
  const changed = assessContextItem(ref, fresh), adopted = adoptContextVersion(changed, fresh)
  assert.equal(adopted.source?.buildId, undefined); assert.equal(adopted.source?.page, undefined)
  assert.throws(() => adoptContextVersion(changed, { ...fresh, content: 'unrelated replacement' }), /excerpt changed/)
})
test('a changed user choice can keep a labeled old snapshot but is never silently repinned', () => {
  const changed = assessContextItem(item(), observed), stale = keepStaleSnapshot(changed)
  assert.equal(stale.state, 'stale-snapshot'); assert.equal(stale.digest, 'rev-1'); assert.equal(stale.latestDigest, undefined)
  const reassessed = assessContextItem(stale, observed)
  assert.equal(reassessed.state, 'update-available'); assert.equal(reassessed.digest, 'rev-1')
  assert.throws(() => keepStaleSnapshot(item()))
})
test('pre-send scope checks exclude foreign projects and missing references', () => {
  const foreign = item({ project: 'paper-b' }), missing = assessContextItem(item(), null)
  const stale = keepStaleSnapshot(assessContextItem(item({ ref: 'thinking.canvas.json#n2', label: 'B' }), observed))
  const unpinned = item({ digest: undefined, ref: 'research-drafts.json#d1', kind: 'draft', label: 'D' })
  const checked = checkContextForSend([item(), foreign, missing, stale, unpinned], 'paper-a')
  assert.deepEqual(checked.include.map(value => value.ref), ['thinking.canvas.json#n1', 'thinking.canvas.json#n2', 'research-drafts.json#d1'])
  assert.deepEqual(checked.issues.map(value => value.reason), ['foreign-project', 'missing', 'stale-snapshot', 'unverifiable'])
  assert.equal(checkContextForSend([item()], 'paper-b').include.length, 0)
  assert.equal(checkContextForSend([item()], '').include.length, 0)
})
test('manifest keeps complete intent and explicitly labels stale, unverified and changed versions', () => {
  const adopted = adoptContextVersion(assessContextItem(item(), observed), observed)
  const manifest = contextManifest([adopted, item({ digest: undefined }), assessContextItem(item(), observed)], 'paper-a')
  assert.match(manifest, /不等于已发送或批准修改/); assert.match(manifest, /paper-a/)
  assert.match(manifest, /thinking\.canvas\.json#n1/); assert.match(manifest, /版本： rev-2/)
  assert.match(manifest, /版本无法自动校验/); assert.match(manifest, /摘录仍属 rev-1/)
  assert.match(manifest, /不进入正文/); assert.match(manifest, /仅在测量条件内成立/)
  assert.match(manifest, /历史消息使用的仍是当时的内容/)
  assert.throws(() => contextManifest([item({ excerpt: 'x'.repeat(65000) })], 'paper-a'), /too large/)
})
test('adding to context performs no send and no session writes (model is pure)', () => {
  const created = item(); assert.ok(!('sent' in created) && !('sessionId' in created))
})
test('context copy has complete locale parity', () => {
  const shape = (value: unknown): unknown => Array.isArray(value) ? value.map(shape)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, shape((value as Record<string, unknown>)[key])])) : 'str'
  assert.deepEqual(shape(contextCopy.zh), shape(contextCopy.en))
  const flat = (value: unknown): string[] => value && typeof value === 'object' ? Object.values(value as Record<string, unknown>).flatMap(flat) : [String(value)]
  for (const text of [...flat(contextCopy.zh), ...flat(contextCopy.en)]) assert.ok(text.trim())
})
test('source guards: scoped insertion reads revisions; C panels do not send or own another writer', () => {
  const panel = readFileSync(new URL('../src/features/projects/ContextPanel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(panel, /\.send\(|startAndSend|sendNativePrompt/)
  assert.match(panel, /readWritingContext\(/); assert.match(panel, /adoptContextVersion\(item, record\)/)
  const source = readFileSync(new URL('../src/features/projects/DesignSourceEditor.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /method:\s*['"]PUT['"]|createFileSession|useCanvasDocument\(/)
  assert.match(source, /fresh\.digest !== displayed\.digest/)
})
