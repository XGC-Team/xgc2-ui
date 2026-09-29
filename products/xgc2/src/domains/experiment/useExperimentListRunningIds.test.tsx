// @vitest-environment jsdom

import type * as ExperimentWorkflowServiceModule from './experimentWorkflowService';
import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ExecutionEvent } from '../execution/executionPublic';
import { workflowRuntimeEvents } from '../../shared/workflowRuntimeProtocol';
import type { ExperimentSessionView } from './experimentWorkflowModel';
import { useStationExperimentOccupancy } from './useExperimentListRunningIds';

const execution=vi.hoisted(() => ({
  listener:undefined as ((event:ExecutionEvent) => void)|undefined,
  streamState:'connected',
  streamId:'test',
}));
vi.mock('../execution/executionPublic',() => ({
  useExecutionEventChannel:(_targetId:string,listener:(event:ExecutionEvent) => void) => {
    execution.listener=listener;
    return { streamId:execution.streamId,streamState:execution.streamState,error:'' };
  },
}));

const leftover=vi.hoisted(() => ({
  load:vi.fn(async () => [] as readonly string[]),
}));
vi.mock('./experimentWorkflowService',async (importOriginal) => {
  const actual=await importOriginal<typeof ExperimentWorkflowServiceModule>();
  return { ...actual,listLeftoverExperimentOccupancyIds:leftover.load };
});

describe('useExperimentListRunningIds',() => {
  beforeEach(() => {
    execution.listener=undefined;execution.streamState='connected';execution.streamId='test';
    leftover.load.mockReset();
    leftover.load.mockResolvedValue([]);
  });

  it('recovers a single dropped snapshot fetch without reporting a persistent Experiment failure',async () => {
    const load=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([sessionView('session-a','exp-user')]);
    const { result }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.error).toBe('');
    expect(result.current.runningExperimentIds).toEqual(new Set(['exp-user']));
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[0]).toEqual(load.mock.calls[1]);
  });

  it('bounds transport retries and recovers failed truth once the execution channel reconnects',async () => {
    const load=vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { result,rerender }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.error).toBe('Failed to fetch'));
    expect(result.current.resolved).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
    rerender();
    expect(load).toHaveBeenCalledTimes(2);
    execution.streamState='reconnecting';rerender();
    load.mockResolvedValue([sessionView('session-a','exp-user')]);
    execution.streamState='connected';rerender();
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.error).toBe('');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not retry programming TypeErrors as network failures',async () => {
    const load=vi.fn().mockRejectedValue(new TypeError('Invalid session payload'));
    const { result }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.error).toBe('Invalid session payload'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads one bounded authoritative live Session snapshot without probing Experiments',async () => {
    const load = vi.fn(async () => [sessionView('session-a','exp-user')]);
    const { result } = renderHook(() => useStationExperimentOccupancy('local',load));

    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('local','',expect.any(AbortSignal));
    expect(result.current.runningExperimentIds).toEqual(new Set(['exp-user']));
    expect(result.current.sessions[0]?.members[0]?.ownerId).toBe('ordinary-user-root');
  });

  it('reconciles Session truth when another client changes workflow state over SSE',async () => {
    let sessions:ExperimentSessionView[] = [sessionView('session-a','exp-user')];
    const load = vi.fn(async () => sessions);
    const { result } = renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));

    sessions = [];
    act(() => { execution.listener?.(workflowEvent(2)); });
    await waitFor(() => expect(result.current.runningExperimentIds.size).toBe(0));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('serializes an imperative read and newer SSE refresh without losing intermediate progress',async () => {
    const staleRefresh=deferred<ExperimentSessionView[]>();
    const currentRefresh=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockResolvedValueOnce([sessionView('session-a','exp-user')])
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockImplementationOnce(() => currentRefresh.promise);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.runningExperimentIds).toEqual(new Set(['exp-user'])));

    vi.useFakeTimers();
    try {
      let olderRequest!:Promise<void>;
      act(() => { olderRequest=result.current.refresh(); });
      expect(load).toHaveBeenCalledTimes(2);
      act(() => { execution.listener?.(workflowEvent(2)); });
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(2);

      await act(async () => {
        staleRefresh.resolve([stoppingSessionView('session-a','exp-user')]);
        await olderRequest;
      });
      expect(load).toHaveBeenCalledTimes(3);
      expect(result.current.sessions[0]?.session.state).toBe('stopping');
      await act(async () => {
        currentRefresh.resolve([]);
        await currentRefresh.promise;
      });
      expect(result.current.sessions).toEqual([]);
      expect(result.current.runningExperimentIds.size).toBe(0);
      expect(result.current.error).toBe('');
      expect(result.current.resolved).toBe(true);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('converges a stopped Experiment from stopping to absent and preserves other Sessions',async () => {
    vi.useFakeTimers();
    const selected=stoppingSessionView('session-selected','exp-selected');
    const other=sessionView('session-other','exp-other');
    const initial=deferred<ExperimentSessionView[]>();
    const stopping=deferred<ExperimentSessionView[]>();
    const complete=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => stopping.promise)
      .mockImplementationOnce(() => complete.promise);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    try {
      await act(async () => {
        initial.resolve([selected,other]);
        await initial.promise;
      });
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-selected','exp-other']));

      let convergence!:Promise<void>;
      act(() => { convergence=result.current.convergeStoppedExperiment('exp-selected'); });
      expect(load).toHaveBeenCalledTimes(2);
      await act(async () => {
        stopping.resolve([selected,other]);
        await stopping.promise;
      });
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-selected','exp-other']));

      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(load).toHaveBeenCalledTimes(3);
      await act(async () => {
        complete.resolve([other]);
        await convergence;
      });

      expect(result.current.sessions).toEqual([other]);
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-other']));
      expect(result.current.error).toBe('');
      expect(result.current.resolved).toBe(true);
      expect(load.mock.calls).toEqual([
        ['local','',expect.any(AbortSignal)],
        ['local','',expect.any(AbortSignal)],
        ['local','',expect.any(AbortSignal)],
      ]);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('gives Stop convergence priority while root revisions keep advancing',async () => {
    vi.useFakeTimers();
    const selected=stoppingSessionView('session-selected','exp-selected');
    const other=sessionView('session-other','exp-other');
    const initial=deferred<ExperimentSessionView[]>();
    const staleGeneric=deferred<ExperimentSessionView[]>();
    const stopping=deferred<ExperimentSessionView[]>();
    const complete=deferred<ExperimentSessionView[]>();
    const resumedGeneric=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => staleGeneric.promise)
      .mockImplementationOnce(() => stopping.promise)
      .mockImplementationOnce(() => complete.promise)
      .mockImplementationOnce(() => resumedGeneric.promise);
    const { result,unmount }=renderHook(() => (
      useStationExperimentOccupancy('local',load)
    ));
    try {
      await act(async () => {
        initial.resolve([selected,other]);
        await initial.promise;
      });
      let genericRefresh!:Promise<void>;
      act(() => { genericRefresh=result.current.refresh(); });
      expect(load).toHaveBeenCalledTimes(2);
      let queuedGeneric!:Promise<void>;
      act(() => { queuedGeneric=result.current.refresh(); });
      expect(load).toHaveBeenCalledTimes(2);
      let convergence!:Promise<void>;
      act(() => { convergence=result.current.convergeStoppedExperiment('exp-selected'); });
      expect(load).toHaveBeenCalledTimes(3);
      expect((load.mock.calls[1]?.[2] as AbortSignal).aborted).toBe(true);
      await act(async () => { await Promise.all([genericRefresh,queuedGeneric]); });

      for (let revision=2;revision<=6;revision+=1) {
        execution.listener?.(workflowEvent(revision));
      }
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(3);
      await act(async () => {
        staleGeneric.resolve([sessionView('session-stale','exp-stale')]);
        await genericRefresh;
      });
      expect(result.current.sessions).toEqual([selected,other]);
      await act(async () => {
        stopping.resolve([selected,other]);
        await stopping.promise;
      });

      for (let revision=7;revision<=10;revision+=1) {
        execution.listener?.(workflowEvent(revision));
      }
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(3);
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(load).toHaveBeenCalledTimes(4);

      execution.listener?.(workflowEvent(11));
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(4);
      await act(async () => {
        complete.resolve([other]);
        await convergence;
      });
      expect(result.current.sessions).toEqual([other]);
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-other']));

      execution.listener?.(workflowEvent(12));
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(5);
      await act(async () => {
        resumedGeneric.resolve([other]);
        await resumedGeneric.promise;
      });
      expect(result.current.sessions).toEqual([other]);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('bounds stopped Experiment convergence and retains stopping truth on timeout',async () => {
    vi.useFakeTimers();
    const selected=stoppingSessionView('session-selected','exp-selected');
    const load=vi.fn(async () => [selected]);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    try {
      await act(async () => { await Promise.resolve(); });
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-selected']));

      const convergence=result.current.convergeStoppedExperiment('exp-selected');
      const outcome=convergence.then(
        () => ({ error:undefined }),
        (error:unknown) => ({ error }),
      );
      await act(async () => { await vi.runAllTimersAsync(); });
      const { error }=await outcome;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('remained active after Stop for 180000 ms');
      expect(result.current.sessions).toEqual([selected]);
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-selected']));
      expect(result.current.error).toBe('');
      expect(result.current.resolved).toBe(true);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('cancels stopped Experiment convergence when the target scope changes',async () => {
    vi.useFakeTimers();
    const localSession=stoppingSessionView('session-local','exp-local');
    const agentSession=sessionView('session-agent','exp-agent','agent-a');
    const load=vi.fn(async (
      targetId:string,_experimentResourceId?:string,_signal?:AbortSignal,
    ) => targetId==='local' ? [localSession] : [agentSession]);
    const { result,rerender,unmount }=renderHook(({ targetId }) => (
      useStationExperimentOccupancy(targetId,load)
    ),{ initialProps:{ targetId:'local' } });
    try {
      await act(async () => { await Promise.resolve(); });
      let convergence!:Promise<void>;
      act(() => { convergence=result.current.convergeStoppedExperiment('exp-local'); });
      await act(async () => { await Promise.resolve(); });
      const convergenceSignal=load.mock.calls[1]?.[2] as AbortSignal;

      rerender({ targetId:'agent-a' });
      await act(async () => {
        await convergence;
        await Promise.resolve();
      });
      expect(convergenceSignal.aborted).toBe(true);
      expect(result.current.sessions).toEqual([agentSession]);
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-agent']));

      const callsAfterTargetChange=load.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(load).toHaveBeenCalledTimes(callsAfterTargetChange);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('does not publish or retry an obsolete failure before its queued fresh snapshot',async () => {
    const staleRefresh=deferred<ExperimentSessionView[]>();
    const currentRefresh=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockResolvedValueOnce([sessionView('session-a','exp-user')])
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockImplementationOnce(() => currentRefresh.promise);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.runningExperimentIds).toEqual(new Set(['exp-user'])));

    vi.useFakeTimers();
    try {
      let olderRequest!:Promise<void>;
      act(() => { olderRequest=result.current.refresh(); });
      expect(load).toHaveBeenCalledTimes(2);
      act(() => { execution.listener?.(workflowEvent(2)); });
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(2);

      await act(async () => {
        staleRefresh.reject(new TypeError('Failed to fetch'));
        await olderRequest;
      });
      expect(load).toHaveBeenCalledTimes(3);
      expect(load.mock.calls[2]?.[2]).not.toBe(load.mock.calls[1]?.[2]);
      expect(result.current.error).toBe('');
      expect(result.current.resolved).toBe(true);
      await act(async () => {
        currentRefresh.resolve([]);
        await currentRefresh.promise;
      });
      expect(result.current.sessions).toEqual([]);
      expect(result.current.error).toBe('');
      expect(result.current.resolved).toBe(true);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('fails closed and rejects when the current imperative refresh fails',async () => {
    const failedRefresh=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockResolvedValueOnce([sessionView('session-a','exp-user')])
      .mockImplementationOnce(() => failedRefresh.promise);
    const { result }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.runningExperimentIds).toEqual(new Set(['exp-user'])));

    let request!:Promise<void>;
    act(() => { request=result.current.refresh(); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => {
      failedRefresh.reject(new Error('sessions unavailable'));
      await expect(request).rejects.toThrow('sessions unavailable');
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.runningExperimentIds.size).toBe(0);
    expect(result.current.error).toBe('sessions unavailable');
    expect(result.current.resolved).toBe(false);
  });

  it('aborts an ordinary refresh when the execution target changes',async () => {
    const staleLocalRefresh=deferred<ExperimentSessionView[]>();
    const agentRefresh=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => staleLocalRefresh.promise)
      .mockImplementationOnce(() => agentRefresh.promise);
    const { result,rerender }=renderHook(({ targetId }) => (
      useStationExperimentOccupancy(targetId,load)
    ),{ initialProps:{ targetId:'local' } });
    await waitFor(() => expect(result.current.resolved).toBe(true));

    let localRequest!:Promise<void>;
    act(() => { localRequest=result.current.refresh(); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    const localSignal=load.mock.calls[1]?.[2] as AbortSignal;
    rerender({ targetId:'agent-a' });
    expect(localSignal.aborted).toBe(true);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));

    await act(async () => {
      agentRefresh.resolve([sessionView('session-agent','exp-agent','agent-a')]);
      await agentRefresh.promise;
    });
    await waitFor(() => expect(result.current.runningExperimentIds).toEqual(new Set(['exp-agent'])));

    await act(async () => {
      staleLocalRefresh.resolve([sessionView('session-local','exp-local')]);
      await localRequest;
    });
    expect(result.current.sessions).toEqual([sessionView('session-agent','exp-agent','agent-a')]);
    expect(result.current.runningExperimentIds).toEqual(new Set(['exp-agent']));
    expect(result.current.error).toBe('');
    expect(result.current.resolved).toBe(true);
  });

  it('aborts stopped Experiment convergence when the occupancy owner unmounts',async () => {
    const staleRefresh=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => staleRefresh.promise);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));

    let request!:Promise<void>;
    act(() => { request=result.current.convergeStoppedExperiment('exp-user'); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    const signal=load.mock.calls[1]?.[2] as AbortSignal;
    unmount();
    await act(async () => {
      staleRefresh.reject(new Error('unmounted sessions unavailable'));
      await expect(request).resolves.toBeUndefined();
    });
    expect(signal.aborted).toBe(true);
  });

  it('keeps the provider value and derived IDs stable for an identical snapshot or unrelated rerender',async () => {
    const load=vi.fn(async () => [sessionView('session-a','exp-user')]);
    const { result,rerender }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    const previous=result.current;
    rerender();
    expect(result.current).toBe(previous);
    await act(async () => { await result.current.refresh(); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(previous);
    expect(result.current.sessions).toBe(previous.sessions);
    expect(result.current.runningExperimentIds).toBe(previous.runningExperimentIds);
  });

  it('publishes a changed member without requiring an aggregate Session revision change',async () => {
    const initial=sessionView('session-a','exp-user');
    const changed={ ...initial,members:initial.members.map((member) => ({ ...member,revision:2 })) };
    const load=vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([changed]);
    const { result }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    const previous=result.current;
    await act(async () => { await result.current.refresh(); });
    expect(result.current).not.toBe(previous);
    expect(result.current.sessions[0]?.session.revision).toBe(initial.session.revision);
    expect(result.current.sessions[0]?.members[0]?.revision).toBe(2);
  });

  it('refreshes successful pre-disconnect truth after reconnect without waiting for another lifecycle event',async () => {
    const load=vi.fn().mockResolvedValueOnce([sessionView('session-a','exp-user')]).mockResolvedValue([]);
    const { result,rerender }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.error).toBe('');
    execution.streamState='reconnecting';rerender();
    execution.streamState='connected';rerender();
    await waitFor(() => expect(result.current.sessions).toEqual([]));
    expect(load).toHaveBeenCalledTimes(2);
    rerender();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refreshes when a replacement stream ID is already connected',async () => {
    const load=vi.fn().mockResolvedValueOnce([sessionView('session-a','exp-user')]).mockResolvedValue([]);
    const { result,rerender }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    execution.streamId='replacement';rerender();
    await waitFor(() => expect(result.current.sessions).toEqual([]));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares initial, imperative and SSE reads without starving callers or intermediate progress',async () => {
    vi.useFakeTimers();
    const initial=deferred<ExperimentSessionView[]>();
    const second=deferred<ExperimentSessionView[]>();
    const third=deferred<ExperimentSessionView[]>();
    const load=vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    try {
      const waiting:Promise<void>[]=[];
      act(() => {
        for (let index=0;index<20;index+=1) waiting.push(result.current.refresh());
        execution.listener?.(workflowEvent(2));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(1);
      await act(async () => {
        initial.resolve([sessionView('session-a','exp-user')]);
        await initial.promise;
      });
      expect(load).toHaveBeenCalledTimes(2);
      expect(result.current.resolved).toBe(true);
      expect(result.current.sessions[0]?.session.state).toBe('active');

      act(() => { execution.listener?.(workflowEvent(3)); });
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
      expect(load).toHaveBeenCalledTimes(2);
      await act(async () => {
        second.resolve([stoppingSessionView('session-a','exp-user')]);
        await Promise.all(waiting);
      });
      expect(load).toHaveBeenCalledTimes(3);
      expect(result.current.sessions[0]?.session.state).toBe('stopping');
      await act(async () => {
        third.resolve([]);
        await third.promise;
      });
      expect(result.current.sessions).toEqual([]);
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(load).toHaveBeenCalledTimes(3);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('aborts ordinary reads and settles pending callers on unmount even if the transport ignores cancellation',async () => {
    const stalled=deferred<ExperimentSessionView[]>();
    const load=vi.fn().mockResolvedValueOnce([]).mockImplementationOnce(() => stalled.promise);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    let current!:Promise<void>;
    let pending!:Promise<void>;
    act(() => {
      current=result.current.refresh();
      pending=result.current.refresh();
    });
    expect(load).toHaveBeenCalledTimes(2);
    const signal=load.mock.calls[1]?.[2] as AbortSignal;
    unmount();
    await act(async () => { await Promise.all([current,pending]); });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      stalled.reject(new Error('late unmounted failure'));
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('recreates the reader for StrictMode effect replay without retaining canceled work',async () => {
    const load=vi.fn(async (_targetId:string,_experimentId?:string,_signal?:AbortSignal) => (
      [sessionView('session-a','exp-user')]
    ));
    const { result,rerender }=renderHook(() => useStationExperimentOccupancy('local',load),{ reactStrictMode:true });
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[0]?.[2]?.aborted).toBe(true);
    expect(load.mock.calls[1]?.[2]?.aborted).toBe(false);
    rerender();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not refresh on visibility changes',async () => {
    const load = vi.fn(async () => []);
    const { result } = renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the initial Session snapshot is unavailable',async () => {
    const load = vi.fn(async () => { throw new Error('sessions unavailable'); });
    const { result } = renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.error).toBe('sessions unavailable'));
    expect(result.current.resolved).toBe(false);
    expect(result.current.runningExperimentIds.size).toBe(0);
  });

  it('occupies an Experiment from leftover System Runner roots without a live Session',async () => {
    leftover.load.mockResolvedValue(['exp-orphan']);
    const load=vi.fn(async () => []);
    const { result }=renderHook(() => useStationExperimentOccupancy('local',load));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.sessions).toEqual([]);
    expect(result.current.runningExperimentIds).toEqual(new Set(['exp-orphan']));
  });

  it('converges leftover occupancy after Sessions are already absent',async () => {
    vi.useFakeTimers();
    leftover.load.mockResolvedValue(['exp-orphan']);
    const load=vi.fn(async () => []);
    const { result,unmount }=renderHook(() => useStationExperimentOccupancy('local',load));
    try {
      await act(async () => { await Promise.resolve(); });
      expect(result.current.runningExperimentIds).toEqual(new Set(['exp-orphan']));
      leftover.load.mockResolvedValue([]);
      let convergence!:Promise<void>;
      act(() => { convergence=result.current.convergeStoppedExperiment('exp-orphan'); });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await convergence; });
      expect(result.current.runningExperimentIds.size).toBe(0);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
});

function sessionView(id:string,experimentResourceId:string,targetId='local'):ExperimentSessionView {
  return {
    session:{ id,targetId,experimentResourceId,state:'active',mode:'partial',runMode:'night-field',revision:2 },
    members:[{
      id:`member-${id}`,targetId,sessionId:id,bindingId:'system-runner',
      kind:'workflow_command',ownerId:'ordinary-user-root',status:'running',revision:1,
    }],
  };
}

function stoppingSessionView(id:string,experimentResourceId:string):ExperimentSessionView {
  const active=sessionView(id,experimentResourceId);
  return {
    session:{ ...active.session,state:'stopping',revision:3 },
    members:active.members.map((member) => ({ ...member,status:'stopping',revision:2 })),
  };
}

function deferred<T>() {
  let resolve!:(value:T) => void;
  let reject!:(cause:unknown) => void;
  const promise=new Promise<T>((resolvePromise,rejectPromise) => {
    resolve=resolvePromise;
    reject=rejectPromise;
  });
  return { promise,resolve,reject };
}

function workflowEvent(revision:number):ExecutionEvent {
  return {
    offset:revision,entityType:'orchestration',entityId:'external-system-root',
    type:workflowRuntimeEvents.runAccepted,seq:revision,
    level:'info',payload:{},createdAt:'2026-01-01T00:00:00Z',
  };
}
