import type {
  ExecutionJob,
  JobControlRequest,
  ProcessAction,
  ProcessActionRequest,
  ProcessInstance,
  ProcessInstanceCreateInput,
  ProcessInstanceUpdateInput,
} from './executionModel';
import { executionRequestId } from './executionModel';
import {
  actOnProcessInstance,
  cancelExecutionJob,
  createProcessInstance,
  deleteProcessInstance,
  getProcessInstance,
  listExecutionJobs,
  listProcessDefinitions,
  listProcessInstances,
  normalizeExecutionTargetId,
  retryExecutionJob,
  updateProcessInstance,
} from './executionService';
import {
  executionSnapshot,
  patchExecutionJob,
  patchExecutionSnapshot,
  patchProcessInstance,
  removeProcessInstance,
} from './executionSnapshotStore';

export { getExecutionJob,normalizeExecutionTargetId } from './executionService';
export { openExecutionEventStream } from './executionStreamService';

export async function refreshExecutionTarget(targetId = 'local', includeJobs = false) {
  const key = normalizeExecutionTargetId(targetId);
  const baseline = executionSnapshot(key);
  const processBaseline = baseline.processInstances;
  const jobBaseline = baseline.jobs;
  patchExecutionSnapshot(key, { loading: true,error: '' });
  const jobsRequest = includeJobs ? listExecutionJobs(key) : Promise.resolve(undefined);
  const [definitions,instances,jobs] = await Promise.allSettled([
    listProcessDefinitions(key),
    listProcessInstances(key),
    jobsRequest,
  ]);
  const errors = [definitions,instances,...(includeJobs ? [jobs] : [])]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
  const processInstances = instances.status === 'fulfilled'
    ? reconcileExecutionRefresh(
      processBaseline,
      executionSnapshot(key).processInstances,
      instances.value,
    )
    : undefined;
  patchExecutionSnapshot(key, {
    ...(definitions.status === 'fulfilled' ? { processDefinitions: definitions.value } : {}),
    ...(processInstances ? {
      processInstances,
      processInstancesTruncated: false,
    } : {}),
    ...(includeJobs && jobs.status === 'fulfilled' && jobs.value ? {
      jobs: reconcileExecutionRefresh(
        jobBaseline,
        executionSnapshot(key).jobs,
        jobs.value,
      ),
    } : {}),
    loading: false,
    error: errors.join('; '),
  });
  return executionSnapshot(key);
}

/**
 * Execution list requests and the replay stream run concurrently. Preserve
 * revisions (and deletions) that arrived after a request began instead of
 * allowing an older HTTP snapshot to make Process or Job truth disappear until
 * the next event.
 */
function reconcileExecutionRefresh<T extends { id:string;revision:number }>(
  baseline:readonly T[],
  current:readonly T[],
  refreshed:readonly T[],
) {
  const baselineById = new Map(baseline.map((instance) => [instance.id,instance]));
  const currentById = new Map(current.map((instance) => [instance.id,instance]));
  const reconciled = new Map(refreshed.map((instance) => [instance.id,instance]));

  for (const instance of baseline) {
    if (!currentById.has(instance.id)) reconciled.delete(instance.id);
  }
  for (const instance of current) {
    const before = baselineById.get(instance.id);
    if (before && instance.revision <= before.revision) continue;
    const listed = reconciled.get(instance.id);
    if (!listed || instance.revision > listed.revision) reconciled.set(instance.id,instance);
  }
  return [...reconciled.values()].sort((left,right) => left.id.localeCompare(right.id));
}

export async function operateExecutionProcess(
  targetId: string,
  instance: ProcessInstance,
  action: ProcessAction,
  reason: string,
) {
  const key = normalizeExecutionTargetId(targetId);
  let current = instance;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const requestId = executionRequestId(`process.${action}`, current.id);
    const body: ProcessActionRequest = {
      action,
      expectedRevision: current.revision,
      requestId,
      idempotencyKey: requestId,
      reason,
    };
    try {
      const response = await actOnProcessInstance(key, current.id, body);
      patchProcessInstance(key, response.instance);
      return response;
    } catch (error) {
      if (!isProcessRevisionConflict(error) || attempt === 2) throw error;
      current = await getProcessInstance(key, current.id);
      patchProcessInstance(key, current);
    }
  }
  throw new Error('process action retry exhausted');
}

export async function createExecutionProcess(targetId: string, input: ProcessInstanceCreateInput) {
  const key = normalizeExecutionTargetId(targetId);
  const instance = await createProcessInstance(key, input);
  patchProcessInstance(key, instance);
  return instance;
}

export async function updateExecutionProcess(
  targetId: string,
  instance: ProcessInstance,
  input: ProcessInstanceUpdateInput,
) {
  const key = normalizeExecutionTargetId(targetId);
  const updated = await updateProcessInstance(key, instance.id, input);
  patchProcessInstance(key, updated);
  return updated;
}

export async function reconfigureExecutionProcess(
  targetId: string,
  instance: ProcessInstance,
  input: ProcessInstanceUpdateInput,
) {
  const key = normalizeExecutionTargetId(targetId);
  const requestId = executionRequestId('process.reconfigure-restart', instance.id);
  const response = await actOnProcessInstance(key, instance.id, {
    action: 'restart',
    expectedRevision: input.expectedRevision,
    requestId,
    idempotencyKey: requestId,
    reason: 'apply process configuration and restart',
    configuration: {
      parameters: input.parameters,
      driver: input.driver,
      targetConfig: input.targetConfig,
    },
  });
  patchProcessInstance(key, response.instance);
  return response;
}

export async function deleteExecutionProcess(targetId: string, instance: ProcessInstance) {
  const key = normalizeExecutionTargetId(targetId);
  await deleteProcessInstance(key, instance.id, instance.revision);
  removeProcessInstance(key, instance.id);
}

export async function controlExecutionJob(
  targetId: string,
  job: ExecutionJob,
  action: 'cancel' | 'retry',
  reason: string,
) {
  const key = normalizeExecutionTargetId(targetId);
  const requestId = executionRequestId(`job.${action}`, job.id);
  const body: JobControlRequest = {
    expectedRevision: job.revision,
    requestId,
    idempotencyKey: requestId,
    reason,
  };
  const response = action === 'cancel'
    ? await cancelExecutionJob(key, job.id, body)
    : await retryExecutionJob(key, job.id, body);
  patchExecutionJob(key, response.job);
  return response;
}

function isProcessRevisionConflict(error: unknown) {
  return error instanceof Error && /\b409\b.*revision conflict/i.test(error.message);
}
