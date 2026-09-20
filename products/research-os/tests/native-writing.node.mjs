import test from 'node:test'
import assert from 'node:assert/strict'
import { completedWritingTurn } from '../src/features/review/native-writing.ts'
import { acquireReviewWrite, isReviewLocked, registerReviewEditor, subscribeWrites } from '../src/features/review/write-coordinator.ts'

const sessionId = 'session-a', turnId = 'turn-a'
const item = { id: 'message', turnId, role: 'assistant', text: '{}', turnStatus: 'completed', truncated: false, details: { type: 'agentMessage', phase: 'final_answer' } }

test('per-turn terminal facts are required; latest-turn text and unrelated sessions cannot stand in', () => {
  assert.equal(completedWritingTurn({ sessionId, lastTurnStatus: 'completed', items: [{ ...item, turnStatus: undefined }] }, sessionId, turnId), null)
  assert.equal(completedWritingTurn({ sessionId: 'other', items: [item] }, sessionId, turnId), null)
  assert.equal(completedWritingTurn({ sessionId, items: [item] }, sessionId, 'other-turn'), null)
  assert.equal(completedWritingTurn({ sessionId, items: [item] }, sessionId, turnId).text, '{}')
})
test('ambiguous finals fail closed; commentary is not a structured final result', () => {
  assert.throws(() => completedWritingTurn({ sessionId, items: [item, { ...item, id: 'second' }] }, sessionId, turnId), /one complete/)
  const commentary = { ...item, id: 'commentary', text: 'I will change it', details: { type: 'agentMessage', phase: 'commentary' } }
  assert.equal(completedWritingTurn({ sessionId, items: [commentary, item] }, sessionId, turnId).text, '{}')
})
test('failed/refused/unknown terminal and truncation facts are preserved, never promoted to completion', () => {
  for (const status of ['failed', 'refused', 'unknown', 'cancelled']) assert.equal(completedWritingTurn({ sessionId, items: [{ ...item, turnStatus: status }] }, sessionId, turnId).status, status)
  assert.equal(completedWritingTurn({ sessionId, items: [{ ...item, truncated: true }] }, sessionId, turnId).truncated, true)
  assert.throws(() => completedWritingTurn({ sessionId, items: [item, { ...item, id: 'other', turnStatus: 'failed' }] }, sessionId, turnId), /conflicting terminal/)
})
test('observer failure cannot strand a review lease; real dirty editor still blocks', async () => {
  const stop = subscribeWrites(() => { throw Error('UI observer') })
  const original = console.error; console.error = () => {}
  try {
    const release = acquireReviewWrite('workspace', 'file.tex')
    assert.equal(isReviewLocked('workspace', 'file.tex'), true)
    assert.throws(() => acquireReviewWrite('workspace', 'file.tex'), /active write/)
    await release(); assert.equal(isReviewLocked('workspace', 'file.tex'), false)
    const unregister = registerReviewEditor('workspace', 'file.tex', { blocked: () => true, reload: async () => {} })
    try { assert.throws(() => acquireReviewWrite('workspace', 'file.tex'), /unsaved changes/) } finally { unregister() }
  } finally { stop(); console.error = original }
})
