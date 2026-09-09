// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ExecutionEvent,ExecutionJob,ProcessInstance } from './executionModel';
import {
  controlExecutionJob,
  createExecutionProcess,
  deleteExecutionProcess,
  operateExecutionProcess,
  reconfigureExecutionProcess,
  refreshExecutionTarget,
} from './executionActions';
import { applyExecutionEvent } from './executionEventProjection';
import {
  executionSnapshot,
  EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT,
  subscribeExecutionEvents,
  subscribeExecutionSnapshot,
} from './executionSnapshotStore';
import { resetExecutionRuntimeForTests } from './executionTargetRuntime';
import {
  useExecutionEventChannel,
  useExecutionProcessCatalog,
  useExecutionTarget,
  useExecutionTargets,
} from './useExecutionTarget';
import { actOnProcessInstance,cancelExecutionJob,createProcessInstance,deleteProcessInstance,getExecutionJob,getProcessInstance,listExecutionEvents,listExecutionJobs,listProcessDefinitions,listProcessInstances } from './executionService';
import { openExecutionEventStream } from './executionStreamService';

vi.mock('./executionService', () => ({
  actOnProcessInstance: vi.fn(),
  cancelExecutionJob: vi.fn(),
  createProcessInstance: vi.fn(),
  deleteProcessInstance: vi.fn(),
  getExecutionJob: vi.fn(),
  getProcessInstance: vi.fn(),
  listExecutionEvents: vi.fn(),
  listExecutionJobs: vi.fn(),
  listProcessDefinitions: vi.fn(),
  listProcessInstances: vi.fn(),
  normalizeExecutionTargetId: (value?: string) => value?.trim() || 'local',
  retryExecutionJob: vi.fn(),
  updateProcessInstance: vi.fn(),
}));

vi.mock('./executionStreamService', () => ({
  openExecutionEventStream: vi.fn(() => ({ close: vi.fn() })),
}));

describe('execution target runtime', () => {
  beforeEach(() => {
    resetExecutionRuntimeForTests();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(listProcessDefinitions).mockResolvedValue([]);
    vi.mocked(listProcessInstances).mockResolvedValue([processInstance()]);
    vi.mocked(listExecutionJobs).mockResolvedValue([job()]);
    vi.mocked(listExecutionEvents).mockResolvedValue([]);
  });

  it('patches process action responses immediately, then lets a newer SSE revision correct them', async () => {
    await refreshExecutionTarget('local');
    vi.mocked(actOnProcessInstance).mockResolvedValue(processActionResponse(processInstance({ revision: 2,desiredState: 'running',observedState: 'starting' })));

    await operateExecutionProcess('local', processInstance(), 'start', 'test');
    expect(executionSnapshot('local').processInstances[0]).toMatchObject({ revision: 2,observedState: 'starting' });

    applyExecutionEvent('local', event(10, processInstance({ revision: 3,desiredState: 'running',observedState: 'running' })));
    expect(executionSnapshot('local').processInstances[0]).toMatchObject({ revision: 3,observedState: 'running' });
    expect(executionSnapshot('local').lastOffset).toBe(10);
    expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local')).toBeNull();
    await vi.waitFor(() => expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local'))
      .toBe('{"streamId":"","offset":10}'));

    applyExecutionEvent('local', event(10, processInstance({ revision: 4,observedState: 'failed' })));
    expect(executionSnapshot('local').processInstances[0].revision).toBe(3);
  });

  it('does not let an in-flight Process refresh erase newer SSE truth', async () => {
    const baseline = processInstance({ revision:2,desiredState:'running',observedState:'starting' });
    vi.mocked(listProcessInstances).mockResolvedValueOnce([baseline]);
    await refreshExecutionTarget('local');

    let resolveRefresh:((value:ProcessInstance[]) => void)|undefined;
    vi.mocked(listProcessInstances).mockReturnValueOnce(new Promise((resolve) => {
      resolveRefresh=resolve;
    }));
    const refresh = refreshExecutionTarget('local');
    const ready = processInstance({
      revision:3,desiredState:'running',observedState:'running',
      readiness:{ status:'passing' },
    });
    applyExecutionEvent('local',event(10,ready));
    resolveRefresh?.([baseline]);
    await refresh;

    expect(executionSnapshot('local').processInstances).toEqual([ready]);
  });

  it('does not let an in-flight Job refresh erase newer SSE truth', async () => {
    const baseline = job({ revision:2,status:'running' });
    vi.mocked(listExecutionJobs).mockResolvedValueOnce([baseline]);
    await refreshExecutionTarget('local',true);

    let resolveRefresh:((value:ExecutionJob[]) => void)|undefined;
    vi.mocked(listExecutionJobs).mockReturnValueOnce(new Promise((resolve) => {
      resolveRefresh=resolve;
    }));
    const refresh = refreshExecutionTarget('local',true);
    const succeeded = job({ revision:3,status:'succeeded' });
    applyExecutionEvent('local',{
      offset:10,entityType:'job',entityId:succeeded.id,seq:10,
      type:'job.succeeded',level:'info',payload:succeeded as unknown as Record<string,unknown>,
      createdAt:'2026-07-12T00:00:00Z',
    },true);
    resolveRefresh?.([baseline]);
    await refresh;

    expect(executionSnapshot('local').jobs).toEqual([succeeded]);
  });

  it('keeps a Process deletion that arrives while an older refresh is in flight', async () => {
    const baseline = processInstance({ revision:2,desiredState:'running',observedState:'running' });
    vi.mocked(listProcessInstances).mockResolvedValueOnce([baseline]);
    await refreshExecutionTarget('local');

    let resolveRefresh:((value:ProcessInstance[]) => void)|undefined;
    vi.mocked(listProcessInstances).mockReturnValueOnce(new Promise((resolve) => {
      resolveRefresh=resolve;
    }));
    const refresh = refreshExecutionTarget('local');
    applyExecutionEvent('local',{
      offset:11,entityType:'process-instance',entityId:baseline.id,seq:11,
      type:'process.instance.deleted',level:'info',payload:{ revision:3 },createdAt:'2026-07-12T00:00:00Z',
    });
    resolveRefresh?.([baseline]);
    await refresh;

    expect(executionSnapshot('local').processInstances).toEqual([]);
  });

  it('persists a freshly adopted live cursor without replaying historical events', async () => {
    sessionStorage.setItem('xgc.execution.lastOffset.execution-v8.local', '1031');
    expect(executionSnapshot('local')).toMatchObject({ streamId: '',lastOffset: 0 });

    const view = renderHook(() => useExecutionTarget('local'));
    await waitFor(() => expect(openExecutionEventStream).toHaveBeenCalledTimes(1));
    const options = vi.mocked(openExecutionEventStream).mock.calls[0][0];
    expect(options).toMatchObject({ targetId: 'local',streamId: '',afterOffset: 0 });

    await act(async () => {
      options.onCursorReset?.({ streamId: 'stream-current',latestOffset: 620 }, 620);
      await Promise.resolve();
    });
    expect(executionSnapshot('local')).toMatchObject({
      streamId: 'stream-current',
      lastOffset: 620,
      events: [],
      streamState: 'connecting',
    });
    expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local')).toBe('{"streamId":"stream-current","offset":620}');
    expect(listExecutionJobs).not.toHaveBeenCalled();

    act(() => options.onEvent(event(621, processInstance({ revision: 4,observedState: 'running' }))));
    expect(executionSnapshot('local')).toMatchObject({ streamId: 'stream-current',lastOffset: 621 });
    expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local')).toBe('{"streamId":"stream-current","offset":620}');
    view.unmount();
    expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local')).toBe('{"streamId":"stream-current","offset":621}');
  });

  it('projects thousands of orchestration events without Snapshot churn and persists only the latest cursor', async () => {
    const snapshotListener=vi.fn();
    const eventListener=vi.fn();
    const unsubscribeSnapshot=subscribeExecutionSnapshot('local',snapshotListener);
    const unsubscribeEvents=subscribeExecutionEvents('local',eventListener);
    const cursorWrites=vi.spyOn(Storage.prototype,'setItem');

    vi.useFakeTimers();
    try {
      for (let offset=1;offset<=7_000;offset+=1) {
        applyExecutionEvent('local',{
          offset,entityType:'orchestration',entityId:`run-${offset}`,seq:1,
          type:'workflowruntime.invocation-succeeded',level:'info',payload:{ nodeId:'work' },
          createdAt:'2026-07-12T00:00:00Z',
        });
      }

      expect(executionSnapshot('local')).toMatchObject({ lastOffset:7_000,events:[] });
      expect(snapshotListener).not.toHaveBeenCalled();
      expect(eventListener).toHaveBeenCalledTimes(7_000);
      expect(cursorWrites).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(16);
      expect(cursorWrites).toHaveBeenCalledOnce();
      expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local'))
        .toBe('{"streamId":"","offset":7000}');

      applyExecutionEvent('local',event(7_001,processInstance({ revision:2,observedState:'running' })));
      expect(snapshotListener).toHaveBeenCalledOnce();
      expect(eventListener).toHaveBeenCalledTimes(7_001);
      expect(executionSnapshot('local').events).toEqual([]);
      applyExecutionEvent('local',{
        offset:7_002,entityType:'job',entityId:'job-1',seq:1,type:'job.succeeded',level:'info',
        payload:job({ revision:2,status:'succeeded' }) as unknown as Record<string,unknown>,
        createdAt:'2026-07-12T00:00:00Z',
      },true);
      expect(snapshotListener).toHaveBeenCalledTimes(2);
      expect(eventListener).toHaveBeenCalledTimes(7_002);
      await vi.advanceTimersByTimeAsync(16);
      expect(cursorWrites).toHaveBeenCalledTimes(2);
      expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local'))
        .toBe('{"streamId":"","offset":7002}');
    } finally {
      unsubscribeEvents();
      unsubscribeSnapshot();
      cursorWrites.mockRestore();
      vi.useRealTimers();
    }
  });

  it('flushes a coalesced cursor when the stream disconnects', async () => {
    const view=renderHook(() => useExecutionEventChannel('local',vi.fn()));
    await waitFor(() => expect(openExecutionEventStream).toHaveBeenCalledOnce());
    const options=vi.mocked(openExecutionEventStream).mock.calls[0][0];

    act(() => options.onEvent({
      offset:44,entityType:'orchestration',entityId:'run-44',seq:1,
      type:'workflowruntime.run-running',level:'info',payload:{},
      createdAt:'2026-07-12T00:00:00Z',
    }));
    expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local')).toBeNull();

    act(() => options.onState?.('disconnected'));
    expect(sessionStorage.getItem('xgc.execution.lastOffset.execution-v8.local'))
      .toBe('{"streamId":"","offset":44}');
    view.unmount();
  });

  it('does not block the resource snapshot on duplicate REST event replay', async () => {
    await refreshExecutionTarget('local');

    expect(executionSnapshot('local')).toMatchObject({ loading: false });
    expect(executionSnapshot('local').processInstances).toHaveLength(1);
    expect(listExecutionEvents).not.toHaveBeenCalled();
  });

  it('loads the Operations process projection without querying internal jobs', async () => {
    await refreshExecutionTarget('local', false);

    expect(listProcessDefinitions).toHaveBeenCalledWith('local');
    expect(listProcessInstances).toHaveBeenCalledWith('local');
    expect(listExecutionJobs).not.toHaveBeenCalled();
    expect(executionSnapshot('local')).toMatchObject({ loading: false,jobs: [] });
  });

  it('bounds an authoritative refresh without dropping live or actionable Process facts', async () => {
    const completed = Array.from(
      { length:EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT + 8 },
      (_,index) => processInstance({
        id:`completed-${String(index).padStart(3,'0')}`,
        stoppedAt:new Date(Date.UTC(2026,7,24,0,index)).toISOString(),
        updatedAt:new Date(Date.UTC(2026,7,24,0,index)).toISOString(),
      }),
    );
    const running = processInstance({
      id:'running',desiredState:'running',observedState:'running',handle:{ pid:42 },stoppedAt:undefined,
    });
    const failed = processInstance({ id:'failed',observedState:'failed',stoppedAt:undefined });
    vi.mocked(listProcessInstances).mockResolvedValue([...completed,running,failed].reverse());

    await refreshExecutionTarget('local',false);

    const instances = executionSnapshot('local').processInstances;
    expect(instances).toHaveLength(EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT + 2);
    expect(executionSnapshot('local').processInstancesTruncated).toBe(true);
    expect(instances).toContain(running);
    expect(instances).toContain(failed);
    expect(instances.some((instance) => instance.id === 'completed-000')).toBe(false);
    expect(instances.some((instance) => instance.id === `completed-${String(completed.length - 1).padStart(3,'0')}`)).toBe(true);

    vi.mocked(listProcessInstances).mockResolvedValue([running,failed]);
    await refreshExecutionTarget('local',false);
    expect(executionSnapshot('local').processInstancesTruncated).toBe(false);
  });

  it('keeps a newly stopped current owner through SSE compaction and advances stale event cursors without catalog churn', async () => {
    const completed = Array.from(
      { length:EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT },
      (_,index) => processInstance({
        id:`history-${String(index).padStart(3,'0')}`,
        revision:2,
        stoppedAt:new Date(Date.UTC(2026,7,23,0,index)).toISOString(),
        updatedAt:new Date(Date.UTC(2026,7,23,0,index)).toISOString(),
      }),
    );
    vi.mocked(listProcessInstances).mockResolvedValue(completed);
    await refreshExecutionTarget('local',false);

    const currentOwnerStop = processInstance({
      id:'current-owner-stop',ownerId:'current-run',revision:5,
      stoppedAt:'2026-08-24T03:00:00Z',updatedAt:'2026-08-24T03:00:00Z',
    });
    applyExecutionEvent('local',event(20,currentOwnerStop));

    const afterStop = executionSnapshot('local').processInstances;
    expect(afterStop).toHaveLength(EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT);
    expect(executionSnapshot('local').processInstancesTruncated).toBe(true);
    expect(afterStop).toContain(currentOwnerStop);
    expect(afterStop.some((instance) => instance.id === 'history-000')).toBe(false);

    applyExecutionEvent('local',event(21,{
      ...currentOwnerStop,transitionReason:'same revision must not replace current truth',
    }));
    expect(executionSnapshot('local').processInstances).toBe(afterStop);
    expect(executionSnapshot('local')).toMatchObject({ lastOffset:21 });
    expect(executionSnapshot('local').processInstancesTruncated).toBe(true);
    expect(executionSnapshot('local').processInstances.find(
      (instance) => instance.id === currentOwnerStop.id,
    )?.transitionReason).not.toBe('same revision must not replace current truth');
  });

  it('registers an event-only listener before opening the shared stream without loading Processes', async () => {
    const listener = vi.fn();
    const close = vi.fn();
    vi.mocked(openExecutionEventStream).mockImplementationOnce((options) => {
      options.onEvent(event(1, processInstance({ revision: 2,observedState: 'starting' })));
      return { close };
    });

    const view = renderHook(() => useExecutionEventChannel('local', listener));

    await waitFor(() => expect(listener).toHaveBeenCalledWith(expect.objectContaining({ offset: 1 })));
    expect(listProcessDefinitions).not.toHaveBeenCalled();
    expect(listProcessInstances).not.toHaveBeenCalled();
    expect(listExecutionJobs).not.toHaveBeenCalled();
    expect(Object.keys(view.result.current).sort()).toEqual(['error','streamId','streamState']);
    view.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not rerender event-only consumers for ordinary execution events', async () => {
    const listener = vi.fn();
    const view = renderHook(() => useExecutionEventChannel('local', listener));
    await waitFor(() => expect(openExecutionEventStream).toHaveBeenCalledTimes(1));
    const before = view.result.current;
    const options = vi.mocked(openExecutionEventStream).mock.calls[0][0];

    act(() => options.onEvent(event(1, processInstance({ revision: 2,observedState: 'starting' }))));

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ offset: 1 }));
    expect(view.result.current).toBe(before);
    view.unmount();
  });

  it('shares one target stream between event-only and Operations consumers', async () => {
    const close = vi.fn();
    vi.mocked(openExecutionEventStream).mockReturnValueOnce({ close });
    const events = renderHook(() => useExecutionEventChannel('local', vi.fn()));
    await waitFor(() => expect(openExecutionEventStream).toHaveBeenCalledTimes(1));
    expect(listProcessDefinitions).not.toHaveBeenCalled();

    const operations = renderHook(() => useExecutionTarget('local'));
    await waitFor(() => expect(listProcessDefinitions).toHaveBeenCalledTimes(1));
    expect(openExecutionEventStream).toHaveBeenCalledTimes(1);

    events.unmount();
    expect(close).not.toHaveBeenCalled();
    operations.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('subscribes to every unique authored execution target',async () => {
    vi.mocked(listProcessInstances).mockImplementation(async (targetId) => [
      processInstance({ id:`process-${targetId}`,targetId }),
    ]);
    const view = renderHook(() => useExecutionTargets([
      'agent-scout-01',
      'local',
      'agent-scout-01',
    ]));

    await waitFor(() => expect(listProcessInstances).toHaveBeenCalledWith('local'));
    await waitFor(() => expect(listProcessInstances).toHaveBeenCalledWith('agent-scout-01'));
    await waitFor(() => expect(view.result.current.every(
      (snapshot) => snapshot.processInstances.length === 1,
    )).toBe(true));
    expect(view.result.current.map((snapshot) => snapshot.targetId)).toEqual([
      'agent-scout-01',
      'local',
    ]);
    expect(openExecutionEventStream).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('does not rerender process-only consumers for unrelated execution events', async () => {
    const view = renderHook(() => useExecutionProcessCatalog('local'));
    await waitFor(() => expect(listProcessDefinitions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.processInstances).toHaveLength(1));
    const before = view.result.current;
    const options = vi.mocked(openExecutionEventStream).mock.calls[0][0];

    act(() => options.onEvent({
      ...event(1, processInstance()),
      entityType: 'orchestration',
      entityId: 'run-1',
      type: 'workflowruntime.run-running',
      payload: {},
    }));

    expect(view.result.current).toBe(before);
    view.unmount();
  });

  it('exposes cursor resets to event-only consumers without refreshing Processes', async () => {
    const view = renderHook(() => useExecutionEventChannel('local', vi.fn()));
    await waitFor(() => expect(openExecutionEventStream).toHaveBeenCalledTimes(1));
    const options = vi.mocked(openExecutionEventStream).mock.calls[0][0];

    act(() => options.onCursorReset?.({ streamId: 'stream-replaced',latestOffset: 18 }, 0));

    expect(view.result.current).toMatchObject({ streamId: 'stream-replaced',streamState: 'replaying' });
    expect(listProcessDefinitions).not.toHaveBeenCalled();
    expect(listProcessInstances).not.toHaveBeenCalled();
    expect(listExecutionJobs).not.toHaveBeenCalled();
    view.unmount();
  });

  it('refreshes the process revision and retries an operator action after a 409', async () => {
    await refreshExecutionTarget('local');
    const latest = processInstance({ revision: 9,desiredState: 'running',observedState: 'running' });
    const killed = processInstance({ revision: 10,desiredState: 'stopped',observedState: 'stopping' });
    vi.mocked(getProcessInstance).mockResolvedValue(latest);
    vi.mocked(actOnProcessInstance)
      .mockRejectedValueOnce(new Error('409 Conflict: process instance revision conflict'))
      .mockResolvedValueOnce(processActionResponse(killed));

    await operateExecutionProcess('local', processInstance({ desiredState: 'running',observedState: 'running' }), 'kill', 'operator request');

    expect(getProcessInstance).toHaveBeenCalledWith('local', 'roscore-1');
    expect(actOnProcessInstance).toHaveBeenNthCalledWith(1, 'local', 'roscore-1', expect.objectContaining({ action: 'kill',expectedRevision: 1 }));
    expect(actOnProcessInstance).toHaveBeenNthCalledWith(2, 'local', 'roscore-1', expect.objectContaining({ action: 'kill',expectedRevision: 9 }));
    expect(executionSnapshot('local').processInstances[0]).toMatchObject({ revision: 10,observedState: 'stopping' });
  });

  it('submits running configuration as one idempotent restart command', async () => {
    await refreshExecutionTarget('local');
    const running = processInstance({ revision: 4,desiredState: 'running',observedState: 'running' });
    vi.mocked(actOnProcessInstance).mockResolvedValue(processActionResponse(processInstance({ revision: 5,desiredState: 'running',observedState: 'stopping' })));

    await reconfigureExecutionProcess('local', running, {
      expectedRevision: 4,parameters: { port: 11312 },driver: 'docker',targetConfig: { containerId: 'sim' },
    });

    expect(actOnProcessInstance).toHaveBeenCalledWith('local', running.id, expect.objectContaining({
      action: 'restart',expectedRevision: 4,
      configuration: { parameters: { port: 11312 },driver: 'docker',targetConfig: { containerId: 'sim' } },
    }));
    expect(executionSnapshot('local').processInstances[0]).toMatchObject({ revision: 5,observedState: 'stopping' });
  });

  it('patches unified job control responses immediately', async () => {
    await refreshExecutionTarget('local', true);
    vi.mocked(cancelExecutionJob).mockResolvedValue(jobActionResponse(job({ revision: 2,status: 'cancel_requested' })));

    await controlExecutionJob('local', job(), 'cancel', 'test');

    expect(executionSnapshot('local').jobs[0]).toMatchObject({ revision: 2,status: 'cancel_requested' });
  });

  it('patches process create/delete immediately and removes instances from deletion events', async () => {
    await refreshExecutionTarget('local');
    const created = processInstance({ id: 'daemon-2' });
    vi.mocked(createProcessInstance).mockResolvedValue(created);
    vi.mocked(deleteProcessInstance).mockResolvedValue(undefined);

    await createExecutionProcess('local', {
      id: created.id,definitionId: created.definitionId,ownerType: created.ownerType,ownerId: created.ownerId,
      scope: created.scope,parameters: {},driver: created.driver,targetConfig: {},
    });
    expect(executionSnapshot('local').processInstances.map((item) => item.id)).toContain(created.id);

    await deleteExecutionProcess('local', created);
    expect(executionSnapshot('local').processInstances.map((item) => item.id)).not.toContain(created.id);

    applyExecutionEvent('local', {
      offset: 12,entityType: 'process-instance',entityId: 'roscore-1',seq: 2,
      type: 'process.instance.deleted',level: 'info',payload: { revision: 1 },createdAt: '2026-07-12T00:00:00Z',
    });
    expect(executionSnapshot('local').processInstances).toHaveLength(0);
  });

  it('refreshes a job when SSE carries the backend partial event payload', async () => {
    await refreshExecutionTarget('local', true);
    vi.mocked(getExecutionJob).mockResolvedValue(job({ revision: 3,status: 'succeeded' }));

    applyExecutionEvent('local', {
      offset: 11,entityType: 'job',entityId: 'job-1',seq: 11,type: 'job.succeeded',level: 'info',
      payload: { attempt: 1 },createdAt: '2026-07-12T00:00:00Z',
    }, true);

    await vi.waitFor(() => expect(executionSnapshot('local').jobs[0]).toMatchObject({ revision: 3,status: 'succeeded' }));
  });

  it('does not hydrate internal jobs from the event stream for process-only consumers', async () => {
    await refreshExecutionTarget('local', false);
    vi.mocked(getExecutionJob).mockResolvedValue(job({ revision: 3,status: 'succeeded' }));

    applyExecutionEvent('local', {
      offset: 13,entityType: 'job',entityId: 'job-1',seq: 13,type: 'job.succeeded',level: 'info',
      payload: { attempt: 1 },createdAt: '2026-07-12T00:00:00Z',
    }, false);

    await Promise.resolve();
    expect(getExecutionJob).not.toHaveBeenCalled();
    expect(executionSnapshot('local').jobs).toEqual([]);
    expect(executionSnapshot('local').events).toEqual([]);
    expect(executionSnapshot('local').lastOffset).toBe(13);
  });
});

function processInstance(overrides: Partial<ProcessInstance> = {}): ProcessInstance {
  return {
    id: 'roscore-1',
    targetId: 'local',
    definitionId: 'roscore',
    definitionVersion: '1',
    definitionDigest: 'sha256:test',
    ownerType: 'operator',
    ownerId: 'operator',
    scope: 'experiment:test',
    parameters: {},
    driver: 'exec',
    desiredState: 'stopped',
    observedState: 'stopped',
    readiness: { status: 'unknown' },
    liveness: { status: 'unknown' },
    handle: null,
    revision: 1,
    restartCount: 0,
    transitionReason: '',
    createdAt: '2026-07-12T00:00:00Z',
    updatedAt: '2026-07-12T00:00:00Z',
    ...overrides,
  };
}

function job(overrides: Partial<ExecutionJob> = {}): ExecutionJob {
  return {
    id: 'job-1',
    targetId: 'local',
    kind: 'app.update',
    status: 'running',
    revision: 1,
    parameters: {},
    result: null,
    currentAttempt: 1,
    maxAttempts: 3,
    recovery: 'retry',
    createdAt: '2026-07-12T00:00:00Z',
    queuedAt: '2026-07-12T00:00:00Z',
    updatedAt: '2026-07-12T00:00:00Z',
    ...overrides,
  };
}

function event(offset: number, payload: ProcessInstance): ExecutionEvent {
  return {
    offset,
    entityType: 'process-instance',
    entityId: payload.id,
    seq: offset,
    type: 'process.observed',
    level: 'info',
    payload: payload as unknown as Record<string, unknown>,
    createdAt: '2026-07-12T00:00:00Z',
  };
}

function processActionResponse(instance: ProcessInstance) {
  return {
    instance,
    receipt: {
      commandId: 'command-1',
      requestId: 'request-1',
      idempotencyKey: 'request-1',
      actor: 'operator',
      risk: 'low',
      target: instance.id,
      action: 'start',
      status: 'accepted',
      createdAt: '2026-07-12T00:00:00Z',
    },
  };
}

function jobActionResponse(value: ExecutionJob) {
  return { job: value,receipt: processActionResponse(processInstance()).receipt };
}
