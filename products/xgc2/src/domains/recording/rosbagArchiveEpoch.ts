import { useCallback,useEffect,useSyncExternalStore } from 'react';
import {
  executionSnapshot,
  normalizeExecutionTargetId,
  retainExecutionTarget,
  subscribeExecutionSnapshot,
  type ProcessInstance,
} from '../execution/executionPublic';

/** Trusted recorder process. Matches Core `SelectedROSBagDefinitionID`. */
export const ROSBAG_RECORD_SELECTED_DEFINITION_ID = 'rosbag-record-selected';

const ACTIVE_RECORDER_STATES = new Set(['starting','running','stopping']);

/**
 * One token for the bag archive implied by live recorder processes.
 *
 * In-flight recorders are ignored so readiness ticks and Record start do not
 * refetch. A recorder becoming terminal (or a terminal recorder leaving the
 * snapshot) changes the token once — that is the cue to reread
 * `GET /recordings/rosbags`. No interval.
 */
export function rosbagArchiveEpoch(processInstances: readonly ProcessInstance[]): string {
  return processInstances
    .filter((instance) => (
      instance.definitionId === ROSBAG_RECORD_SELECTED_DEFINITION_ID
      && !ACTIVE_RECORDER_STATES.has(instance.observedState)
    ))
    .map((instance) => `${instance.id}:${instance.observedState}:${instance.stoppedAt ?? instance.updatedAt}`)
    .sort()
    .join('|');
}

/**
 * Shared execution SSE, selected down to the archive epoch string. Unrelated
 * process revisions still notify the store; `useSyncExternalStore` skips the
 * gallery render when this string is unchanged. Does not open a second stream.
 */
export function useRosbagArchiveEpoch(targetId: string,enabled = true): string {
  const key = normalizeExecutionTargetId(targetId || 'local');
  useEffect(
    () => enabled ? retainExecutionTarget(key,{ processes:true,jobs:false }) : undefined,
    [enabled,key],
  );
  const subscribe = useCallback((onStoreChange: () => void) => (
    enabled ? subscribeExecutionSnapshot(key,onStoreChange) : () => undefined
  ),[enabled,key]);
  const getSnapshot = useCallback(
    () => enabled ? rosbagArchiveEpoch(executionSnapshot(key).processInstances) : '',
    [enabled,key],
  );
  return useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
}
