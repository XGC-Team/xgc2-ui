import { useEffect,useMemo,useRef,useSyncExternalStore } from 'react';
import type {
  ExecutionEvent,
  ExecutionJob,
  ProcessAction,
  ProcessInstance,
  ProcessInstanceCreateInput,
  ProcessInstanceUpdateInput,
} from './executionModel';
import {
  controlExecutionJob,
  createExecutionProcess,
  deleteExecutionProcess,
  operateExecutionProcess,
  reconfigureExecutionProcess,
  refreshExecutionTarget,
  updateExecutionProcess,
} from './executionActions';
import { getProcessDefinitionByDigest,normalizeExecutionTargetId } from './executionService';
import {
  executionEventChannelSnapshot,
  executionProcessCatalogSnapshot,
  executionSnapshot,
  subscribeExecutionEvents,
  subscribeExecutionSnapshot,
} from './executionSnapshotStore';
import { retainExecutionTarget } from './executionTargetRuntime';

export function useExecutionTarget(targetId = 'local', includeJobs = false, enabled = true) {
  const key = normalizeExecutionTargetId(targetId);
  useEffect(() => enabled ? retainExecutionTarget(key, { processes: true,jobs: includeJobs }) : undefined, [enabled,includeJobs,key]);
  return useSyncExternalStore(
    (listener) => subscribeExecutionSnapshot(key, listener),
    () => executionSnapshot(key),
    () => executionSnapshot(key),
  );
}

export function useExecutionTargets(
  targetIds: readonly string[],
  includeJobs = false,
  enabled = true,
) {
  const keyList = [...new Set(targetIds.map(normalizeExecutionTargetId))].sort().join('\0');
  const keys = useMemo(() => keyList ? keyList.split('\0') : [], [keyList]);
  const store = useMemo(() => executionTargetsStore(keys), [keys]);
  useEffect(() => {
    if (!enabled) return;
    const releases = keys.map((key) => retainExecutionTarget(key, {
      processes:true,
      jobs:includeJobs,
    }));
    return () => releases.reverse().forEach((release) => release());
  }, [enabled,includeJobs,keys]);
  return useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot);
}

function executionTargetsStore(keys: readonly string[]) {
  let snapshots = keys.map((key) => executionSnapshot(key));
  return {
    subscribe(listener: () => void) {
      const unsubscribes = keys.map((key) => subscribeExecutionSnapshot(key,listener));
      return () => unsubscribes.reverse().forEach((unsubscribe) => unsubscribe());
    },
    snapshot() {
      const next = keys.map((key) => executionSnapshot(key));
      if (next.length === snapshots.length
        && next.every((value,index) => value === snapshots[index])) {
        return snapshots;
      }
      snapshots = next;
      return snapshots;
    },
  };
}

export function useExecutionProcessCatalog(targetId = 'local') {
  const key = normalizeExecutionTargetId(targetId);
  useEffect(() => retainExecutionTarget(key, { processes: true,jobs: false }), [key]);
  return useSyncExternalStore(
    (listener) => subscribeExecutionSnapshot(key, listener),
    () => executionProcessCatalogSnapshot(key),
    () => executionProcessCatalogSnapshot(key),
  );
}

export function useExecutionEventChannel(targetId: string, listener: (event: ExecutionEvent) => void) {
  const key = normalizeExecutionTargetId(targetId);
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(() => {
    const unsubscribe = subscribeExecutionEvents(key, (event) => listenerRef.current(event));
    const release = retainExecutionTarget(key, { processes: false,jobs: false });
    return () => {
      unsubscribe();
      release();
    };
  }, [key]);
  return useSyncExternalStore(
    (snapshotListener) => subscribeExecutionSnapshot(key, snapshotListener),
    () => executionEventChannelSnapshot(key),
    () => executionEventChannelSnapshot(key),
  );
}

export function useExecutionActions(targetId = 'local', includeJobs = false) {
  const key = normalizeExecutionTargetId(targetId);
  return useMemo(() => ({
    refresh: () => refreshExecutionTarget(key, includeJobs),
    operateProcess: (instance: ProcessInstance, action: ProcessAction, reason = 'operator request') =>
      operateExecutionProcess(key, instance, action, reason),
    createProcess: (input: ProcessInstanceCreateInput) => createExecutionProcess(key, input),
    updateProcess: (instance: ProcessInstance, input: ProcessInstanceUpdateInput) => updateExecutionProcess(key, instance, input),
    reconfigureProcess: (instance: ProcessInstance, input: ProcessInstanceUpdateInput) => reconfigureExecutionProcess(key, instance, input),
    deleteProcess: (instance: ProcessInstance) => deleteExecutionProcess(key, instance),
    getProcessDefinitionByDigest: (digest: string) => getProcessDefinitionByDigest(key, digest),
    cancelJob: (job: ExecutionJob, reason = 'operator request') => controlExecutionJob(key, job, 'cancel', reason),
    retryJob: (job: ExecutionJob, reason = 'operator request') => controlExecutionJob(key, job, 'retry', reason),
  }), [includeJobs,key]);
}
