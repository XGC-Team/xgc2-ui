import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import {
  actOnProcessInstance,
  cancelExecutionJob,
  createProcessInstance,
  deleteProcessInstance,
  executionEventStreamPath,
  executionJobLogStreamPath,
  executionTargetPath,
  getExecutionEventCursor,
  getExecutionJobLogs,
  getOrchestrationRunLogs,
  getProcessDefinitionByDigest,
  getProcessInstanceLogs,
  listExecutionEvents,
  listExecutionJobArtifacts,
  listExecutionJobAttempts,
  listExecutionJobs,
  listProcessDefinitions,
  listProcessInstances,
  orchestrationRunLogStreamPath,
  processInstanceLogStreamPath,
  retryExecutionJob,
  updateProcessInstance,
} from './executionService';

vi.mock('../../api/http', () => ({ request: vi.fn(() => Promise.resolve({})) }));

describe('executionService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the target-scoped execution paths without targetCore proxy options', async () => {
    await listProcessDefinitions('agent/a');
    await listProcessInstances('agent/a');
    await listExecutionJobs('agent/a');
    await listExecutionEvents('agent/a', 42);
    await getExecutionEventCursor('agent/a');

    expect(executionTargetPath('agent/a')).toBe('/execution-targets/agent%2Fa');
    expect(request).toHaveBeenNthCalledWith(1, '/execution-targets/agent%2Fa/process-definitions');
    expect(request).toHaveBeenNthCalledWith(2, '/execution-targets/agent%2Fa/process-instances');
    expect(request).toHaveBeenNthCalledWith(3, '/execution-targets/agent%2Fa/jobs');
    expect(request).toHaveBeenNthCalledWith(4, '/execution-targets/agent%2Fa/events?afterOffset=42');
    expect(request).toHaveBeenNthCalledWith(5, '/execution-targets/agent%2Fa/events/cursor');
    expect(executionEventStreamPath('agent/a', 42)).toBe('/execution-targets/agent%2Fa/events?afterOffset=42');
  });

  it('routes a remote Core key through the Core proxy while keeping its execution resource local', async () => {
    await listProcessInstances('core:edge/core');
    await listExecutionEvents('core:edge/core', 9);

    expect(executionTargetPath('core:edge/core')).toBe('/cores/edge%2Fcore/proxy/execution-targets/local');
    expect(request).toHaveBeenNthCalledWith(1, '/cores/edge%2Fcore/proxy/execution-targets/local/process-instances');
    expect(request).toHaveBeenNthCalledWith(2, '/cores/edge%2Fcore/proxy/execution-targets/local/events?afterOffset=9');
  });

  it('sends revision guarded and idempotent process actions', async () => {
    const body = {
      action: 'restart' as const,
      expectedRevision: 7,
      requestId: 'request-7',
      idempotencyKey: 'request-7',
      reason: 'operator request',
    };
    await actOnProcessInstance('local', 'ros/core', body);

    expect(request).toHaveBeenCalledWith('/execution-targets/local/process-instances/ros%2Fcore/actions', {
      method: 'POST',
      headers: { 'X-Request-ID': 'request-7','Idempotency-Key': 'request-7' },
      body: JSON.stringify(body),
    });
  });

  it('creates, updates, and revision-guards deletion of trusted process instances', async () => {
    const create = {
      id: 'roscore-1',definitionId: 'roscore',ownerType: 'operator',ownerId: 'station-1',scope: 'experiment:one',
      parameters: { port: 11311 },driver: 'docker',targetConfig: { containerId: 'sim' },
    };
    const update = { expectedRevision: 3,parameters: { port: 11312 },driver: 'host',targetConfig: {} };
    await createProcessInstance('agent/a', create);
    await updateProcessInstance('agent/a', 'ros/core', update);
    await deleteProcessInstance('agent/a', 'ros/core', 4);

    expect(request).toHaveBeenNthCalledWith(1, '/execution-targets/agent%2Fa/process-instances', { method: 'POST',body: JSON.stringify(create) });
    expect(request).toHaveBeenNthCalledWith(2, '/execution-targets/agent%2Fa/process-instances/ros%2Fcore', { method: 'PUT',body: JSON.stringify(update) });
    expect(request).toHaveBeenNthCalledWith(3, '/execution-targets/agent%2Fa/process-instances/ros%2Fcore?expectedRevision=4', { method: 'DELETE' });
  });

  it('reads an immutable process definition by digest', async () => {
    await getProcessDefinitionByDigest('agent/a', 'sha256:v1/current');
    expect(request).toHaveBeenCalledWith('/execution-targets/agent%2Fa/process-definitions/sha256%3Av1%2Fcurrent');
  });

  it('uses one job contract for cancel, retry, and byte-offset logs', async () => {
    const body = { expectedRevision: 3,requestId: 'job-3',idempotencyKey: 'job-3',reason: 'operator request' };
    await cancelExecutionJob('local', 'job/id', body);
    await retryExecutionJob('local', 'job/id', body);
    await getExecutionJobLogs('local', 'job/id', 12, 4096);
    await getProcessInstanceLogs('local', 'process/id', 5, 2048, 'stderr');
    await getOrchestrationRunLogs('local', 'run/id', 9, 1024, 'stderr');
    await listExecutionJobAttempts('local', 'job/id');
    await listExecutionJobArtifacts('local', 'job/id');

    expect(request).toHaveBeenNthCalledWith(1, '/execution-targets/local/jobs/job%2Fid/cancel', expect.objectContaining({ method: 'POST' }));
    expect(request).toHaveBeenNthCalledWith(2, '/execution-targets/local/jobs/job%2Fid/retry', expect.objectContaining({ method: 'POST' }));
    expect(request).toHaveBeenNthCalledWith(3, '/execution-targets/local/jobs/job%2Fid/logs?offset=12&limitBytes=4096&stream=stdout');
    expect(request).toHaveBeenNthCalledWith(4, '/execution-targets/local/process-instances/process%2Fid/logs?offset=5&limitBytes=2048&stream=stderr');
    expect(request).toHaveBeenNthCalledWith(5, '/execution-targets/local/orchestration-runs/run%2Fid/logs?offset=9&limitBytes=1024&stream=stderr');
    expect(request).toHaveBeenNthCalledWith(6, '/execution-targets/local/jobs/job%2Fid/attempts');
    expect(request).toHaveBeenNthCalledWith(7, '/execution-targets/local/jobs/job%2Fid/artifacts');
    expect(executionJobLogStreamPath('local', 'job/id')).toBe('/execution-targets/local/jobs/job%2Fid/logs/events?stream=stdout');
    expect(processInstanceLogStreamPath('local', 'process/id', 'stderr')).toBe('/execution-targets/local/process-instances/process%2Fid/logs/events?stream=stderr');
    expect(orchestrationRunLogStreamPath('local', 'run/id', 'stderr')).toBe('/execution-targets/local/orchestration-runs/run%2Fid/logs/events?stream=stderr');
  });
});
