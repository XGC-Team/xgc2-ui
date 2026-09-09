/**
 * The pure message and refusal helpers behind the dashboard actions hook.
 *
 * They are state-free: every one of them turns already-resolved facts into the
 * sentence an operator reads, or into the typed refusal a caller catches. The
 * hook keeps the state machine; this keeps what that machine says.
 */
import type { DashboardActionState } from './useExperimentDashboardActions';

export function emptyActionState(epoch: number): DashboardActionState {
  return { epoch,lifecycle:undefined,error:'',pendingRun:undefined };
}

export function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
