import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  adoptContextVersion, assessContextItem, checkContextForSend, contextManifest, keepStaleSnapshot, newContextItem,
} from '../src/features/projects/context-model.ts'
import { contextCopy } from '../src/features/projects/context-copy.ts'

const item = (over: Partial<Parameters<typeof newContextItem>[0]> = {}) => newContextItem({
  project: 'paper-a', kind: 'canvas-node', label: '主张', ref: 'thinking.canvas.json#n1',
  source: { id: 's1', workspace: 'paper-a', path: 'thinking.canvas.json' }, digest: 'rev-1', excerpt: '摘录', ...over,
})

test('a pinned observation is current; a missing digest is unverifiable, never invented', () => {
  assert.equal(item().state, 'current')
  const unpinned = item({ digest: undefined })
  assert.equal(unpinned.state, 'unverifiable')
  assert.equal(unpinned.digest, undefined)
})
test('refresh compares against the observed revision only', () => {
  assert.equal(assessContextItem(item(), { digest: 'rev-1' }).state, 'current')
  const changed = assessContextItem(item(), { digest: 'rev-2' })
  assert.equal(changed.state, 'update-available')
  assert.equal(changed.latestDigest, 'rev-2')
  assert.equal(changed.digest, 'rev-1')
  assert.equal(assessContextItem(item(), null).state, 'missing')
  assert.equal(assessContextItem(item(), {}).state, 'unverifiable')
  assert.equal(assessContextItem(item({ digest: undefined }), { digest: 'rev-9' }).state, 'unverifiable')
})
test('after a change the user adopts the new revision or keeps a labeled old snapshot', () => {
  const changed = assessContextItem(item(), { digest: 'rev-2' })
  const adopted = adoptContextVersion(changed)
  assert.equal(adopted.digest, 'rev-2')
  assert.equal(adopted.state, 'current')
  const stale = keepStaleSnapshot(changed)
  assert.equal(stale.state, 'stale-snapshot')
  assert.equal(stale.digest, 'rev-1')
  assert.equal(stale.latestDigest, undefined)
  assert.throws(() => keepStaleSnapshot(item()))
  assert.throws(() => adoptContextVersion(item()))
})
test('a stale snapshot is not silently repinned by a later refresh', () => {
  const stale = keepStaleSnapshot(assessContextItem(item(), { digest: 'rev-2' }))
  const reassessed = assessContextItem(stale, { digest: 'rev-2' })
  assert.equal(reassessed.state, 'update-available')
  assert.equal(reassessed.digest, 'rev-1')
})
test('pre-send checks scope and validity: foreign projects and missing sources are excluded', () => {
  const foreign = item({ project: 'paper-b' })
  const missing = assessContextItem(item(), null)
  const stale = keepStaleSnapshot(assessContextItem(item({ ref: 'thinking.canvas.json#n2', label: 'B' }), { digest: 'rev-2' }))
  const unpinned = item({ digest: undefined, ref: 'research-drafts.json#d1', kind: 'draft', label: 'D' })
  const { include, issues } = checkContextForSend([item(), foreign, missing, stale, unpinned], 'paper-a')
  assert.deepEqual(include.map(i => i.ref), ['thinking.canvas.json#n1', 'thinking.canvas.json#n2', 'research-drafts.json#d1'])
  assert.deepEqual(issues.map(i => i.reason), ['foreign-project', 'missing', 'stale-snapshot', 'unverifiable'])
  // Switching the UI project does not reroute items: they belong to their recorded project.
  const switched = checkContextForSend([item()], 'paper-b')
  assert.equal(switched.include.length, 0)
  assert.equal(switched.issues[0].reason, 'foreign-project')
})
test('the manifest names project, references and versions, and states it is not sent', () => {
  const manifest = contextManifest([item(), item({ digest: undefined, ref: 'research-drafts.json#d1', kind: 'draft', label: 'D' })], 'paper-a')
  assert.match(manifest, /不等于已发送/)
  assert.match(manifest, /paper-a/)
  assert.match(manifest, /thinking\.canvas\.json#n1/)
  assert.match(manifest, /版本： rev-1/)
  assert.match(manifest, /版本无法自动校验/)
  assert.match(manifest, /历史消息使用的仍是当时的内容/)
})
test('adding to context performs no send and no session writes (model is pure)', () => {
  const created = item()
  assert.ok(!('sent' in created) && !('sessionId' in created))
})
test('context copy has complete locale parity', () => {
  const shape = (value: unknown): unknown => Array.isArray(value) ? value.map(shape)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(k => [k, shape((value as Record<string, unknown>)[k])])) : 'str'
  assert.deepEqual(shape(contextCopy.zh), shape(contextCopy.en))
  const flat = (value: unknown): string[] => value && typeof value === 'object' ? Object.values(value as Record<string, unknown>).flatMap(flat) : [String(value)]
  for (const text of [...flat(contextCopy.zh), ...flat(contextCopy.en)]) assert.ok(text.trim())
})
test('source guards: Chat keeps F1 intake and only gains the panel; no auto-send path exists', () => {
  const chat = readFileSync(new URL('../src/features/chat/ChatPage.tsx', import.meta.url), 'utf8')
  assert.ok(chat.includes('submitIntake'))
  assert.ok(chat.includes('<ContextPanel/>'))
  const panel = readFileSync(new URL('../src/features/projects/ContextPanel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(panel, /\.send\(|startAndSend|sendNativePrompt/)
  assert.match(panel, /appendDraft\(contextManifest/)
})
