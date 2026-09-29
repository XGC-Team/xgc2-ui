// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ProcessInstance } from '../execution/executionPublic';
import {
  ROSBAG_RECORD_SELECTED_DEFINITION_ID,
  rosbagArchiveEpoch,
  useRosbagArchiveEpoch,
} from './rosbagArchiveEpoch';

const retainExecutionTarget = vi.fn(() => () => undefined);
const subscribeExecutionSnapshot = vi.fn((_targetId: string,_listener: () => void) => () => undefined);
const executionSnapshot = vi.fn(() => ({ processInstances:[] as ProcessInstance[] }));

vi.mock('../execution/executionPublic',() => ({
  retainExecutionTarget: (...args: unknown[]) => (
    retainExecutionTarget as (...inner: unknown[]) => unknown
  )(...args),
  subscribeExecutionSnapshot: (...args: unknown[]) => (
    subscribeExecutionSnapshot as (...inner: unknown[]) => unknown
  )(...args),
  executionSnapshot: (...args: unknown[]) => (
    executionSnapshot as (...inner: unknown[]) => unknown
  )(...args),
  normalizeExecutionTargetId: (targetId: string) => targetId,
}));

describe('rosbagArchiveEpoch',() => {
  it('ignores host processes that are not the trusted recorder',() => {
    expect(rosbagArchiveEpoch([
      process({ id:'gz',definitionId:'gazebo',observedState:'running',revision:9 }),
      process({ id:'ros',definitionId:'roscore',observedState:'running',revision:3 }),
    ])).toBe('');
  });

  it('ignores in-flight recorders so Record start does not refetch',() => {
    const recorder = process({
      id:'rec-1',
      definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
      observedState:'running',
      revision:1,
    });
    expect(rosbagArchiveEpoch([recorder])).toBe('');
    expect(rosbagArchiveEpoch([{ ...recorder,observedState:'starting',revision:4 }])).toBe('');
    expect(rosbagArchiveEpoch([{ ...recorder,observedState:'stopping',revision:8 }])).toBe('');
  });

  it('changes once when the recorder becomes terminal',() => {
    const running = process({
      id:'rec-1',
      definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
      observedState:'running',
    });
    const stopped = {
      ...running,
      observedState:'stopped' as const,
      stoppedAt:'2026-09-18T08:01:00Z',
      revision:12,
    };
    expect(rosbagArchiveEpoch([running])).toBe('');
    expect(rosbagArchiveEpoch([stopped])).toBe('rec-1:stopped:2026-09-18T08:01:00Z');
  });

  it('treats failed, exited, and lost as terminal',() => {
    expect(rosbagArchiveEpoch([process({
      id:'rec-1',
      definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
      observedState:'failed',
      stoppedAt:'2026-09-18T08:02:00Z',
    })])).toBe('rec-1:failed:2026-09-18T08:02:00Z');
    expect(rosbagArchiveEpoch([process({
      id:'rec-1',
      definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
      observedState:'exited',
      updatedAt:'2026-09-18T08:03:00Z',
    })])).toBe('rec-1:exited:2026-09-18T08:03:00Z');
  });

  it('changes when a terminal recorder leaves the snapshot',() => {
    const stopped = process({
      id:'rec-1',
      definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
      observedState:'stopped',
      stoppedAt:'2026-09-18T08:01:00Z',
    });
    expect(rosbagArchiveEpoch([stopped])).toBe('rec-1:stopped:2026-09-18T08:01:00Z');
    expect(rosbagArchiveEpoch([])).toBe('');
  });
});

describe('useRosbagArchiveEpoch',() => {
  const listeners = new Set<() => void>();

  beforeEach(() => {
    listeners.clear();
    retainExecutionTarget.mockReset().mockReturnValue(() => undefined);
    subscribeExecutionSnapshot.mockReset().mockImplementation((_targetId,listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    });
    executionSnapshot.mockReset().mockReturnValue({ processInstances:[] });
  });

  it('returns the recorder epoch from the execution snapshot',() => {
    executionSnapshot.mockReturnValue({
      processInstances:[process({
        id:'rec-1',
        definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
        observedState:'stopped',
        stoppedAt:'2026-09-18T08:01:00Z',
      })],
    });
    const { result } = renderHook(() => useRosbagArchiveEpoch('local',true));
    expect(result.current).toBe('rec-1:stopped:2026-09-18T08:01:00Z');
    expect(retainExecutionTarget).toHaveBeenCalledWith('local',{ processes:true,jobs:false });
    expect(subscribeExecutionSnapshot).toHaveBeenCalledWith('local',expect.any(Function));
  });

  it('stays empty when the consumer is not watching the archive',() => {
    executionSnapshot.mockReturnValue({
      processInstances:[process({
        id:'rec-1',
        definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
        observedState:'running',
      })],
    });
    const { result } = renderHook(() => useRosbagArchiveEpoch('local',false));
    expect(result.current).toBe('');
    expect(retainExecutionTarget).not.toHaveBeenCalled();
    expect(subscribeExecutionSnapshot).not.toHaveBeenCalled();
  });

  it('does not re-render the consumer when unrelated processes change',() => {
    executionSnapshot.mockReturnValue({
      processInstances:[process({ id:'gz',definitionId:'gazebo',observedState:'running',revision:1 })],
    });
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useRosbagArchiveEpoch('local',true);
    });
    const rendersAfterMount = renders;
    expect(result.current).toBe('');

    executionSnapshot.mockReturnValue({
      processInstances:[
        process({ id:'gz',definitionId:'gazebo',observedState:'running',revision:9 }),
        process({
          id:'rec-1',
          definitionId:ROSBAG_RECORD_SELECTED_DEFINITION_ID,
          observedState:'running',
          revision:4,
        }),
      ],
    });
    listeners.forEach((listener) => listener());
    expect(result.current).toBe('');
    expect(renders).toBe(rendersAfterMount);
  });
});

function process(overrides: Partial<ProcessInstance>): ProcessInstance {
  return {
    id:'process-1',
    targetId:'local',
    definitionId:'process',
    definitionVersion:'1',
    definitionDigest:'sha256:test',
    ownerType:'orchestration-run',
    ownerId:'run-1',
    scope:'automation:auto-1:run:run-1:node:record',
    parameters:{},
    driver:'exec',
    desiredState:'running',
    observedState:'running',
    readiness:{ status:'unknown' },
    liveness:{ status:'unknown' },
    handle:null,
    revision:1,
    restartCount:0,
    createdAt:'2026-09-18T08:00:00Z',
    updatedAt:'2026-09-18T08:00:00Z',
    ...overrides,
  };
}
