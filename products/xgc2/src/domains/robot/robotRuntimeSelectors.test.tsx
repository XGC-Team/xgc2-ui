// @vitest-environment jsdom

import { act,cleanup,renderHook } from '@testing-library/react';
import { StrictMode,useLayoutEffect,type PropsWithChildren } from 'react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { RobotChannelProjection,RunRobotProjection } from './robotRuntimeModel';
import {
  useLiveConnectedRobotIds,
  useRobotChannelBundle,
  useRunRobots,
  type RobotChannelBundleRefresh,
} from './robotRuntimeSelectors';
import * as runtime from './robotRuntimeState';
import { resetRobotVisualInvalidationForTests } from './robotVisualInvalidation';

// Only the network/retention boundary is mocked. React, the runtime snapshot
// store, identity functions, and the 200 ms visual coalescer are production code.
// Connection ownership and snapshot/SSE integration remain covered by
// robotRuntime.test.tsx; these tests isolate selector scheduling and ownership.
vi.mock('./robotConnectionStore', () => ({
  retainRobotRun: vi.fn(() => () => undefined),
}));

type Selection = {
  target: string;
  run: string;
  robot: string;
  refresh: RobotChannelBundleRefresh;
};

const selection: Selection = {
  target: 'local',run: 'run-1',robot: 'robot-1',refresh: 'interactive',
};
const poseChannels = ['state.pose'];
const noPatch = () => undefined;

function StrictWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

function useBundleWithCommitPatch(selected: Selection, onCommit: () => void = noPatch) {
  const bundle = useRobotChannelBundle(
    selected.target, selected.run, selected.robot, poseChannels, selected.refresh,
  );
  useLayoutEffect(onCommit, [onCommit]);
  return bundle;
}

function writeChannel(sequence: number, selected = selection, channelId = 'state.pose') {
  const channel: RobotChannelProjection = {
    channelId,sequence,messageId: sequence,
    observedAt: '2026-09-06T00:00:00.000Z',sourceAgeMs: 0,
    staleAt: '2026-09-06T00:01:00.000Z',stale: false,
    value: { position: { x: sequence,y: 0,z: 0 } },
  };
  runtime.setRobotChannelRuntime(selected.target, selected.run, selected.robot, channel);
  runtime.notifyRobotChannelRuntime(selected.target, selected.run, selected.robot, channelId);
  return channel;
}

function seedRun(target: string, run: string, ids = ['robot-1']) {
  const projection: RunRobotProjection = {
    targetId: target,runId: run,streamId: 'stream',projectionRevision: 1,pending: false,
    experimentResourceId: 'experiment',experimentCommitId: 'commit',
    robotSelectionDigest: 'digest',operations: [],updatedAt: '2026-09-06T00:00:00.000Z',
    robots: ids.map((id) => ({
      id,robotAssetId: `asset-${id}`,robotAssetCommitId: 'asset-commit',
      robotAssetDigest: 'asset-digest',name: id,kind: 'fixture',hybridSource: 'simulation',
      profileId: 'fixture',namespace: `/${id}`,operationContracts: [],
      adapterDefinitionId: 'fixture',connectionEpoch: 1,connectionState: 'live',
      connectionRevision: 1,online: true,operationalReady: true,status: 'online',channels: {},
    })),
  };
  runtime.updateRunRuntimeState(target, run, { projection,loaded: true,loading: false });
}

beforeEach(() => {
  vi.useFakeTimers();
  runtime.resetRobotRuntimeState();
  resetRobotVisualInvalidationForTests();
});

afterEach(() => {
  cleanup();
  resetRobotVisualInvalidationForTests();
  runtime.resetRobotRuntimeState();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Robot channel bundle snapshot consistency', () => {
  it.each([
    ['interactive',false],['compact',false],['interactive',true],['compact',true],
  ] as const)('catches the only render-to-subscribe patch (%s, strict=%s)', (refresh, strict) => {
    const selected = { ...selection,refresh };
    writeChannel(1, selected);
    let committed = false;
    const patchOnce = () => {
      if (committed) return;
      committed = true;
      writeChannel(2, selected);
    };
    const hook = renderHook(() => useBundleWithCommitPatch(selected, patchOnce), {
      wrapper: strict ? StrictWrapper : undefined,
    });
    expect(committed).toBe(true);
    // No second notification is sent, including during StrictMode's replay.
    act(() => vi.advanceTimersByTime(1_000));
    expect(hook.result.current['state.pose']?.sequence).toBe(2);
  });

  it('catches the first value of a previously missing channel during commit', () => {
    const patch = () => { writeChannel(1); };
    const hook = renderHook(() => useBundleWithCommitPatch(selection, patch));
    expect(hook.result.current['state.pose']?.sequence).toBe(1);
  });

  it('catches channel removal during commit', () => {
    writeChannel(1);
    const remove = () => {
      runtime.removeRobotChannelRuntime('local', 'run-1', 'robot-1', 'state.pose');
      runtime.notifyRobotChannelRuntime('local', 'run-1', 'robot-1', 'state.pose');
    };
    const hook = renderHook(() => useBundleWithCommitPatch(selection, remove));
    expect(hook.result.current['state.pose']).toBeUndefined();
  });

  it('catches a patch while target, run and robot subscriptions are rebuilt', () => {
    writeChannel(1);
    const next = { ...selection,target: 'other',run: 'run-2',robot: 'robot-2' };
    writeChannel(10, next);
    const hook = renderHook(
      ({ selected,onCommit }) => useBundleWithCommitPatch(selected, onCommit),
      { initialProps: { selected: selection,onCommit: noPatch as () => void } },
    );
    hook.rerender({ selected: next,onCommit: () => { writeChannel(11, next); } });
    expect(hook.result.current['state.pose']?.sequence).toBe(11);
    act(() => { writeChannel(99); vi.advanceTimersByTime(200); });
    expect(hook.result.current['state.pose']?.sequence).toBe(11);
  });

  it('catches a patch when only the refresh policy changes', () => {
    writeChannel(1);
    const hook = renderHook(
      ({ selected,onCommit }) => useBundleWithCommitPatch(selected, onCommit),
      { initialProps: { selected: selection,onCommit: noPatch as () => void } },
    );
    hook.rerender({
      selected: { ...selection,refresh: 'compact' },
      onCommit: () => { writeChannel(2); },
    });
    expect(hook.result.current['state.pose']?.sequence).toBe(2);
  });

  it.each(['interactive','compact'] as const)('keeps steady-state %s updates at 5 Hz', (refresh) => {
    const selected = { ...selection,refresh };
    writeChannel(0, selected);
    let renders = 0;
    const hook = renderHook(() => {
      renders += 1;
      return useBundleWithCommitPatch(selected);
    });
    const initialRenders = renders;
    const initialSnapshot = hook.result.current;
    act(() => { writeChannel(1, selected); vi.advanceTimersByTime(199); });
    expect(hook.result.current).toBe(initialSnapshot);
    act(() => vi.advanceTimersByTime(1));
    expect(hook.result.current['state.pose']?.sequence).toBe(1);
    for (let sequence = 2; sequence <= 81; sequence += 1) {
      act(() => { writeChannel(sequence, selected); vi.advanceTimersByTime(10); });
    }
    expect(hook.result.current['state.pose']?.sequence).toBe(81);
    expect(renders - initialRenders).toBe(5);
  });

  it('keeps snapshots stable and ignores unrelated channels, robots, runs and targets', () => {
    writeChannel(1);
    let renders = 0;
    const hook = renderHook(() => {
      renders += 1;
      return useBundleWithCommitPatch(selection);
    });
    const initial = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(initial);
    const before = renders;
    act(() => {
      writeChannel(2, selection, 'state.power');
      writeChannel(2, { ...selection,robot: 'other' });
      writeChannel(2, { ...selection,run: 'other' });
      writeChannel(2, { ...selection,target: 'other' });
      vi.advanceTimersByTime(1_000);
    });
    expect(renders).toBe(before);
    expect(hook.result.current).toBe(initial);
  });

  it('does not spread pure channel updates to run subscribers', () => {
    seedRun('local', 'run-1');
    writeChannel(1);
    let runRenders = 0;
    renderHook(() => {
      runRenders += 1;
      return useRunRobots('local', 'run-1');
    });
    const bundle = renderHook(() => useBundleWithCommitPatch(selection));
    const before = runRenders;
    act(() => { writeChannel(2); vi.advanceTimersByTime(200); });
    expect(bundle.result.current['state.pose']?.sequence).toBe(2);
    expect(runRenders).toBe(before);
  });

  it('queues while hidden and catches up once visible without another patch', () => {
    writeChannel(1);
    const hook = renderHook(() => useBundleWithCommitPatch(selection));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { writeChannel(2); vi.advanceTimersByTime(1_000); });
    expect(hook.result.current['state.pose']?.sequence).toBe(1);
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(200);
    });
    expect(hook.result.current['state.pose']?.sequence).toBe(2);
  });

  it('releases queued work and channel listeners on unmount', () => {
    writeChannel(1);
    const reads = vi.spyOn(runtime, 'getRobotChannelRuntime');
    const hook = renderHook(() => useBundleWithCommitPatch(selection));
    act(() => { writeChannel(2); });
    hook.unmount();
    const before = reads.mock.calls.length;
    act(() => { writeChannel(3); vi.advanceTimersByTime(1_000); });
    expect(reads.mock.calls.length).toBe(before);
  });
});

describe('Live robot ID snapshot ownership', () => {
  it('does not retain derived snapshots for released target/run sets', () => {
    const maps = new Set<Map<unknown,unknown>>();
    const originalSet = Map.prototype.set;
    // Observe the real cache's entries, not a model of its ownership. Retaining
    // these Map instances also makes a historical global cache measurable after
    // unmount, without GC timing or a production test-only cache API.
    vi.spyOn(Map.prototype, 'set').mockImplementation(function (
      this: Map<unknown,unknown>, key: unknown, value: unknown,
    ) {
      if (value && typeof value === 'object' && 'liveIds' in value
        && 'loaded' in value && 'pending' in value && 'hasRoster' in value) maps.add(this);
      return originalSet.call(this, key, value);
    });
    for (let index = 0; index < 200; index += 1) {
      const target = `target-${index}`;
      const run = `run-${index}`;
      seedRun(target, run);
      const hook = renderHook(() => useLiveConnectedRobotIds(target, [run]));
      expect(hook.result.current.liveIds).toEqual(['robot-1']);
      hook.unmount();
      cleanup();
      runtime.releaseRunRuntimeState(target, run);
    }
    const retainedEntries = [...maps].reduce((total, map) => total + map.size, 0);
    expect(retainedEntries).toBe(0);
  });

  it('keeps identical data stable across normalized run-set rerenders', () => {
    seedRun('local', 'run-1');
    seedRun('local', 'run-2', ['robot-2']);
    const hook = renderHook(({ ids }) => useLiveConnectedRobotIds('local', ids), {
      initialProps: { ids: ['run-1','run-2'] },
    });
    const initial = hook.result.current;
    hook.rerender({ ids: [' run-2 ','run-1','run-1'] });
    expect(hook.result.current).toBe(initial);
    expect(initial.liveIds).toEqual(['robot-1','robot-2']);
  });

  it('keeps a same-key subscriber live when its sibling unmounts', () => {
    seedRun('local', 'run-1');
    const first = renderHook(() => useLiveConnectedRobotIds('local', ['run-1']));
    const second = renderHook(() => useLiveConnectedRobotIds('local', ['run-1']));
    first.unmount();
    act(() => { seedRun('local', 'run-1', ['robot-2']); });
    expect(second.result.current.liveIds).toEqual(['robot-2']);
    const stable = second.result.current;
    second.rerender();
    expect(second.result.current).toBe(stable);
  });
});
