import type { StreamState } from '@xgc2/agent-runtime/state'
import { check } from './review-model.ts'
import type { NativeWritingCompletion } from './writing-contract.ts'

/** Consume the existing native reducer's per-turn end facts. Do not use the
 * latest chat message, activeTurnId or global lastTurnStatus as proof of a result.
 * Missing/ambiguous/truncated output is a failure to admit, never a body write.
 */
export function completedWritingTurn(state: StreamState, sessionId: string, turnId: string): NativeWritingCompletion | null {
  if (state.sessionId !== sessionId) return null
  const items = state.items.filter(item => item.turnId === turnId)
  const terminals = new Set(items.flatMap(item => item.turnStatus ? [item.turnStatus] : []))
  if (!terminals.size) return null
  check(terminals.size === 1, 'Native turn has conflicting terminal facts. Reload the event record, not the write.')
  const status = [...terminals][0]
  if (status !== 'completed') return { sessionId, turnId, status, text: '', truncated: false }
  const assistants = items.filter(item => item.role === 'assistant' && item.text.trim() && !(item.details?.type === 'agentMessage' && item.details.phase === 'commentary'))
  check(assistants.length === 1, 'The native turn must contain one complete structured final answer.')
  const answer = assistants[0]
  return { sessionId, turnId, status, text: answer.text, truncated: answer.truncated || answer.details?.truncated === true }
}
