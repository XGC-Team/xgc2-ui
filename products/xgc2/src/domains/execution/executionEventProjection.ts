import type { ExecutionEvent,ExecutionJob,ExecutionSnapshot,ProcessInstance } from './executionModel';
import { scheduleExecutionCursorWrite } from './executionCursorStorage';
import { getExecutionJob,normalizeExecutionTargetId } from './executionActions';
import {
  advanceExecutionOffset,
  executionSnapshot,
  mergeExecutionRevision,
  patchExecutionJob,
  patchExecutionSnapshot,
  publishExecutionEvent,
} from './executionSnapshotStore';

export function applyExecutionEvent(targetId: string, event: ExecutionEvent, includeJobs = false) {
  const key = normalizeExecutionTargetId(targetId);
  const current = executionSnapshot(key);
  if (!Number.isFinite(event.offset) || event.offset <= current.lastOffset) return;
  const next: Partial<ExecutionSnapshot> = { lastOffset:event.offset };
  let changesSnapshotFacts=false;
  if (event.entityType === 'process-instance' && event.type === 'process.instance.deleted') {
    const processInstances=current.processInstances.filter((instance) => instance.id!==event.entityId);
    if (processInstances.length!==current.processInstances.length) {
      next.processInstances=processInstances;
      changesSnapshotFacts=true;
    }
  } else if (event.entityType === 'process-instance' && isProcessInstance(event.payload)) {
    const processInstances=mergeExecutionRevision(current.processInstances,event.payload);
    if (processInstances!==current.processInstances) {
      next.processInstances=processInstances;
      changesSnapshotFacts=true;
    }
  }
  if (includeJobs && event.entityType === 'job' && isExecutionJob(event.payload)) {
    const jobs=mergeExecutionRevision(current.jobs,event.payload);
    if (jobs!==current.jobs) {
      next.jobs=jobs;
      changesSnapshotFacts=true;
    }
  } else if (includeJobs && event.entityType === 'job') {
    void getExecutionJob(key, event.entityId)
      .then((job) => patchExecutionJob(key, job))
      .catch((error) => patchExecutionSnapshot(key, { error: error instanceof Error ? error.message : String(error) }));
  }
  if (changesSnapshotFacts) patchExecutionSnapshot(key,next);
  else advanceExecutionOffset(key,event.offset);
  scheduleExecutionCursorWrite(key,{ streamId:current.streamId,offset:event.offset });
  publishExecutionEvent(key, event);
}

function isProcessInstance(value: unknown): value is ProcessInstance {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string,unknown>;
  return typeof item.id === 'string' && typeof item.definitionId === 'string' && Number.isFinite(item.revision);
}

function isExecutionJob(value: unknown): value is ExecutionJob {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string,unknown>;
  return typeof item.id === 'string' && typeof item.kind === 'string' && Number.isFinite(item.revision);
}
