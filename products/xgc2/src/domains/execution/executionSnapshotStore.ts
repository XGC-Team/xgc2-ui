import type { ExecutionEvent,ExecutionJob,ExecutionSnapshot,ProcessInstance } from './executionModel';
import { emptyExecutionSnapshot } from './executionModel';
import { readExecutionCursor } from './executionCursorStorage';
import { normalizeExecutionTargetId } from './executionService';

const snapshots = new Map<string,ExecutionSnapshot>();
const eventChannelSnapshots = new Map<string,ExecutionEventChannelSnapshot>();
const processCatalogSnapshots = new Map<string,ExecutionProcessCatalogSnapshot>();
const snapshotListeners = new Map<string,Set<() => void>>();
const eventListeners = new Map<string,Set<(event: ExecutionEvent) => void>>();

/**
 * Browser-side audit window for completed Process instances. The largest
 * fleet Stop fits comfortably inside one window, while live/in-flight truth is
 * never subject to this limit.
 */
export const EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT = 256;

export type ExecutionEventChannelSnapshot = Pick<
  ExecutionSnapshot,
  'streamId' | 'streamState' | 'error'
>;
export type ExecutionProcessCatalogSnapshot = Pick<
  ExecutionSnapshot,
  'processDefinitions' | 'processInstances' | 'processInstancesTruncated'
>;

export function executionSnapshot(targetId = 'local') {
  const key = normalizeExecutionTargetId(targetId);
  let snapshot = snapshots.get(key);
  if (!snapshot) {
    const cursor = readExecutionCursor(key);
    snapshot = { ...emptyExecutionSnapshot(key),streamId: cursor.streamId,lastOffset: cursor.offset };
    snapshots.set(key, snapshot);
  }
  return snapshot;
}

export function executionEventChannelSnapshot(targetId = 'local') {
  const snapshot = executionSnapshot(targetId);
  const current = eventChannelSnapshots.get(targetId);
  if (current
    && current.streamId === snapshot.streamId
    && current.streamState === snapshot.streamState
    && current.error === snapshot.error) return current;
  const next: ExecutionEventChannelSnapshot = {
    streamId: snapshot.streamId,
    streamState: snapshot.streamState,
    error: snapshot.error,
  };
  eventChannelSnapshots.set(targetId, next);
  return next;
}

export function executionProcessCatalogSnapshot(targetId = 'local') {
  const snapshot = executionSnapshot(targetId);
  const current = processCatalogSnapshots.get(targetId);
  if (current
    && current.processDefinitions === snapshot.processDefinitions
    && current.processInstances === snapshot.processInstances
    && current.processInstancesTruncated === snapshot.processInstancesTruncated) return current;
  const next: ExecutionProcessCatalogSnapshot = {
    processDefinitions: snapshot.processDefinitions,
    processInstances: snapshot.processInstances,
    processInstancesTruncated: snapshot.processInstancesTruncated,
  };
  processCatalogSnapshots.set(targetId, next);
  return next;
}

export function subscribeExecutionSnapshot(targetId: string, listener: () => void) {
  let listeners = snapshotListeners.get(targetId);
  if (!listeners) {
    listeners = new Set();
    snapshotListeners.set(targetId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) snapshotListeners.delete(targetId);
  };
}

export function subscribeExecutionEvents(targetId: string, listener: (event: ExecutionEvent) => void) {
  const key = normalizeExecutionTargetId(targetId);
  let listeners = eventListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) eventListeners.delete(key);
  };
}

export function publishExecutionEvent(targetId: string, event: ExecutionEvent) {
  eventListeners.get(targetId)?.forEach((listener) => listener(event));
}

export function patchExecutionSnapshot(targetId: string, patch: Partial<ExecutionSnapshot>) {
  const current = executionSnapshot(targetId);
  const processInstances = patch.processInstances === undefined
    ? undefined
    : boundExecutionProcessInstances(patch.processInstances);
  const processInstancesTruncated = processInstances === undefined
    ? patch.processInstancesTruncated
    : processInstances.length < patch.processInstances!.length
      || (patch.processInstancesTruncated ?? current.processInstancesTruncated);
  snapshots.set(targetId, {
    ...current,
    ...patch,
    ...(processInstances === undefined ? {} : { processInstances }),
    ...(processInstancesTruncated === undefined ? {} : { processInstancesTruncated }),
    targetId,
    events:[],
  });
  snapshotListeners.get(targetId)?.forEach((listener) => listener());
}

/** Advances replay truth without invalidating Snapshot consumers. */
export function advanceExecutionOffset(targetId:string,offset:number) {
  const current=executionSnapshot(targetId);
  if (offset<=current.lastOffset) return false;
  snapshots.set(targetId,{ ...current,lastOffset:offset,events:[] });
  return true;
}

export function patchProcessInstance(targetId: string, instance: ProcessInstance) {
  const current = executionSnapshot(targetId);
  const processInstances = mergeExecutionRevision(current.processInstances, instance);
  if (processInstances === current.processInstances) return;
  patchExecutionSnapshot(targetId, {
    processInstances,
  });
}

export function removeProcessInstance(targetId: string, id: string) {
  const current = executionSnapshot(targetId);
  patchExecutionSnapshot(targetId, {
    processInstances: current.processInstances.filter((instance) => instance.id !== id),
  });
}

export function patchExecutionJob(targetId: string, job: ExecutionJob) {
  const current = executionSnapshot(targetId);
  patchExecutionSnapshot(targetId, { jobs: mergeExecutionRevision(current.jobs, job) });
}

export function mergeExecutionRevision<T extends { id: string;revision: number }>(items: T[], patch: T) {
  const existing = items.find((item) => item.id === patch.id);
  if (existing && existing.revision >= patch.revision) return items;
  return [...items.filter((item) => item.id !== patch.id),patch]
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function boundExecutionProcessInstances(items: ProcessInstance[]) {
  let completedCount = 0;
  let orderedById = true;
  for (let index = 0; index < items.length; index += 1) {
    if (isCompletedProcessInstance(items[index])) completedCount += 1;
    if (index > 0 && items[index - 1].id.localeCompare(items[index].id) > 0) orderedById = false;
  }
  if (completedCount <= EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT) {
    if (orderedById) return items;
    return [...items].sort((left,right) => left.id.localeCompare(right.id));
  }

  const retainedLive = items.filter((instance) => !isCompletedProcessInstance(instance));
  const completed = items.filter(isCompletedProcessInstance)
    .sort(compareCompletedProcessRecency)
    .slice(0,EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT);
  const retained = [...retainedLive,...completed]
    .sort((left,right) => left.id.localeCompare(right.id));
  return retained;
}

function isCompletedProcessInstance(instance: ProcessInstance) {
  return instance.handle == null
    && instance.desiredState === 'stopped'
    && instance.observedState === 'stopped'
    && instance.nextRestartAt == null
    && Number.isFinite(Date.parse(instance.stoppedAt ?? ''));
}

function compareCompletedProcessRecency(left: ProcessInstance, right: ProcessInstance) {
  const leftUpdatedAt = sortableTimestamp(left.updatedAt);
  const rightUpdatedAt = sortableTimestamp(right.updatedAt);
  if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt > rightUpdatedAt ? -1 : 1;
  if (left.revision !== right.revision) return right.revision - left.revision;
  return left.id.localeCompare(right.id);
}

function sortableTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function resetExecutionSnapshotsForTests() {
  snapshots.clear();
  eventChannelSnapshots.clear();
  processCatalogSnapshots.clear();
  snapshotListeners.clear();
  eventListeners.clear();
}
