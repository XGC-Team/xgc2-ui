import { request } from '../../api/http';
import { queryString,segment } from '../../shared/url';
import type {
  ExecutionEvent,
  ExecutionEventCursor,
  ExecutionJob,
  ExecutionJobArtifact,
  ExecutionJobAttempt,
  ExecutionLogChunk,
  JobControlRequest,
  JobActionResponse,
  ProcessActionRequest,
  ProcessActionResponse,
  ProcessDefinition,
  ProcessInstance,
  ProcessInstanceCreateInput,
  ProcessInstanceUpdateInput,
} from './executionModel';

export function executionTargetPath(targetId: string) {
  const target = parseExecutionTargetKey(targetId);
  const path = `/execution-targets/${segment(target.resourceId)}`;
  return target.coreId ? `/cores/${segment(target.coreId)}/proxy${path}` : path;
}

export function normalizeExecutionTargetId(targetId?: string) {
  return targetId?.trim() || 'local';
}

export function executionTargetResourceId(targetId?: string) {
  return parseExecutionTargetKey(targetId).resourceId;
}

function parseExecutionTargetKey(targetId?: string) {
  const key = normalizeExecutionTargetId(targetId);
  if (!key.startsWith('core:')) return { resourceId: key };
  const coreId = key.slice('core:'.length).trim();
  return coreId ? { coreId,resourceId: 'local' } : { resourceId: 'local' };
}

export function listProcessDefinitions(targetId: string): Promise<ProcessDefinition[]> {
  return request<ProcessDefinition[]>(`${executionTargetPath(targetId)}/process-definitions`);
}

export function getProcessDefinitionByDigest(targetId: string, digest: string): Promise<ProcessDefinition> {
  return request<ProcessDefinition>(`${executionTargetPath(targetId)}/process-definitions/${segment(digest)}`);
}

export function listProcessInstances(targetId: string): Promise<ProcessInstance[]> {
  return request<ProcessInstance[]>(`${executionTargetPath(targetId)}/process-instances`);
}

export function getProcessInstance(targetId: string, id: string): Promise<ProcessInstance> {
  return request<ProcessInstance>(`${executionTargetPath(targetId)}/process-instances/${segment(id)}`);
}

export function createProcessInstance(targetId: string, body: ProcessInstanceCreateInput): Promise<ProcessInstance> {
  return request<ProcessInstance>(`${executionTargetPath(targetId)}/process-instances`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateProcessInstance(targetId: string, id: string, body: ProcessInstanceUpdateInput): Promise<ProcessInstance> {
  return request<ProcessInstance>(`${executionTargetPath(targetId)}/process-instances/${segment(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteProcessInstance(targetId: string, id: string, expectedRevision: number): Promise<void> {
  return request<void>(`${executionTargetPath(targetId)}/process-instances/${segment(id)}${queryString({ expectedRevision })}`, {
    method: 'DELETE',
  });
}

export function actOnProcessInstance(targetId: string, id: string, body: ProcessActionRequest): Promise<ProcessActionResponse> {
  return request<ProcessActionResponse>(`${executionTargetPath(targetId)}/process-instances/${segment(id)}/actions`, {
    method: 'POST',
    headers: operationHeaders(body),
    body: JSON.stringify(body),
  });
}

export function listExecutionJobs(targetId: string): Promise<ExecutionJob[]> {
  return request<ExecutionJob[]>(`${executionTargetPath(targetId)}/jobs`);
}

export function getExecutionJob(targetId: string, id: string): Promise<ExecutionJob> {
  return request<ExecutionJob>(`${executionTargetPath(targetId)}/jobs/${segment(id)}`);
}

export function listExecutionJobAttempts(targetId: string, id: string): Promise<ExecutionJobAttempt[]> {
  return request<ExecutionJobAttempt[]>(`${executionTargetPath(targetId)}/jobs/${segment(id)}/attempts`);
}

export function listExecutionJobArtifacts(targetId: string, id: string): Promise<ExecutionJobArtifact[]> {
  return request<ExecutionJobArtifact[]>(`${executionTargetPath(targetId)}/jobs/${segment(id)}/artifacts`);
}

export function cancelExecutionJob(targetId: string, id: string, body: JobControlRequest): Promise<JobActionResponse> {
  return request<JobActionResponse>(`${executionTargetPath(targetId)}/jobs/${segment(id)}/cancel`, {
    method: 'POST',
    headers: operationHeaders(body),
    body: JSON.stringify(body),
  });
}

export function retryExecutionJob(targetId: string, id: string, body: JobControlRequest): Promise<JobActionResponse> {
  return request<JobActionResponse>(`${executionTargetPath(targetId)}/jobs/${segment(id)}/retry`, {
    method: 'POST',
    headers: operationHeaders(body),
    body: JSON.stringify(body),
  });
}

export function listExecutionEvents(targetId: string, afterOffset = 0): Promise<ExecutionEvent[]> {
  return request<ExecutionEvent[]>(`${executionTargetPath(targetId)}/events${queryString({ afterOffset: Math.max(0, afterOffset) })}`);
}

export function getExecutionEventCursor(targetId: string): Promise<ExecutionEventCursor> {
  return request<ExecutionEventCursor>(`${executionTargetPath(targetId)}/events/cursor`);
}

export function executionEventStreamPath(targetId: string, afterOffset = 0) {
  return `${executionTargetPath(targetId)}/events${queryString({ afterOffset: Math.max(0, afterOffset) })}`;
}

export function getProcessInstanceLogs(targetId: string, id: string, offset = 0, limitBytes = 64 * 1024, stream: ExecutionLogStream = 'stdout'): Promise<ExecutionLogChunk> {
  return request<ExecutionLogChunk>(`${executionTargetPath(targetId)}/process-instances/${segment(id)}/logs${logQuery(offset, limitBytes, stream)}`);
}

export function processInstanceLogStreamPath(targetId: string, id: string, stream: ExecutionLogStream = 'stdout') {
  return `${executionTargetPath(targetId)}/process-instances/${segment(id)}/logs/events${queryString({ stream })}`;
}

export function getExecutionJobLogs(targetId: string, id: string, offset = 0, limitBytes = 64 * 1024, stream: ExecutionLogStream = 'stdout'): Promise<ExecutionLogChunk> {
  return request<ExecutionLogChunk>(`${executionTargetPath(targetId)}/jobs/${segment(id)}/logs${logQuery(offset, limitBytes, stream)}`);
}

export function executionJobLogStreamPath(targetId: string, id: string, stream: ExecutionLogStream = 'stdout') {
  return `${executionTargetPath(targetId)}/jobs/${segment(id)}/logs/events${queryString({ stream })}`;
}

export function getOrchestrationRunLogs(targetId: string, id: string, offset = 0, limitBytes = 64 * 1024, stream: ExecutionLogStream = 'stdout'): Promise<ExecutionLogChunk> {
  return request<ExecutionLogChunk>(`${executionTargetPath(targetId)}/orchestration-runs/${segment(id)}/logs${logQuery(offset, limitBytes, stream)}`);
}

export function orchestrationRunLogStreamPath(targetId: string, id: string, stream: ExecutionLogStream = 'stdout') {
  return `${executionTargetPath(targetId)}/orchestration-runs/${segment(id)}/logs/events${queryString({ stream })}`;
}

function operationHeaders(body: Pick<ProcessActionRequest, 'requestId' | 'idempotencyKey'>) {
  return {
    'X-Request-ID': body.requestId,
    'Idempotency-Key': body.idempotencyKey,
  };
}

export type ExecutionLogStream = 'stdout' | 'stderr';

function logQuery(offset: number, limitBytes: number, stream: ExecutionLogStream) {
  return queryString({
    offset: Math.max(0, Math.trunc(offset)),
    limitBytes: Math.max(1, Math.trunc(limitBytes)),
    stream,
  });
}
