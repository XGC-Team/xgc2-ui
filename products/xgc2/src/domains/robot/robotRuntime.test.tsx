// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { RobotPatchEvent,RunRobotProjection } from './robotRuntimeModel';
import {
  useRobotChannel,
  useRobotChannelBundle,
  useRobotChannelSelection,
  useLiveConnectedRobotIds,
  useRunRobots,
  useRunRobotStatus,
} from './robotRuntimeSelectors';
import { getRunRobots } from './robotProjectionService';
import { openRobotEventStream } from './robotEventStreamService';
import { resetRobotRuntimeForTests } from './robotRuntimeTestSupport';

const stream = vi.hoisted(() => ({
  close: vi.fn(),
  options: undefined as Parameters<typeof openRobotEventStream>[0] | undefined,
}));

vi.mock('./robotProjectionService', () => ({
  getRunRobots: vi.fn(),
}));

vi.mock('./robotEventStreamService', () => ({
  openRobotEventStream: vi.fn((options: Parameters<typeof openRobotEventStream>[0]) => {
    stream.options = options;
    return { close: stream.close };
  }),
}));

describe('Robot runtime', () => {
  beforeEach(() => {
    resetRobotRuntimeForTests();
    vi.clearAllMocks();
    stream.options = undefined;
    vi.mocked(getRunRobots).mockResolvedValue(projection());
  });

  afterEach(() => {
    resetRobotRuntimeForTests();
    vi.useRealTimers();
  });

  it('unions live robot ids across retained instrument owner runs', async () => {
    const disconnected = projection();
    disconnected.runId = 'full-child';
    disconnected.robots = [
      { ...disconnected.robots[0]!,id:'scout-01',connectionState:'closed' },
      { ...disconnected.robots[0]!,id:'scout-02',connectionState:'live' },
    ];
    vi.mocked(getRunRobots).mockImplementation(async (_target, runId) => {
      if (runId === 'full-child') return disconnected;
      return projection();
    });
    const hook = renderHook(() => useLiveConnectedRobotIds('local', ['full-child']));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.hasRoster).toBe(true);
    expect(hook.result.current.liveIds).toEqual(['scout-02']);
    hook.unmount();
  });

  it('loads one snapshot and applies exact-channel patches without REST refresh or run-level renders', async () => {
    let runRenders = 0;
    const run = renderHook(() => {
      runRenders += 1;
      return useRunRobots('local', 'run-1');
    });
    await waitFor(() => expect(run.result.current.loaded).toBe(true));
    const localPose = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.pose'));
    const mocapPose = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.mocap.pose'));

    expect(getRunRobots).toHaveBeenCalledTimes(1);
    expect(openRobotEventStream).toHaveBeenCalledTimes(1);
    expect(stream.options).toMatchObject({
      targetId: 'local',runId: 'run-1',streamId: 'robot-stream-1',afterRevision: 7,
    });
    expect(run.result.current.projection?.robots[0]?.profileId).toBe('fixture.aerial.v1');
    expect(localPose.result.current?.value.position).toMatchObject({ x: 1 });
    expect(mocapPose.result.current?.value.position).toMatchObject({ x: 99 });
    const rendersBeforePatch = runRenders;

    act(() => stream.options?.onEvent(patchEvent({
      robotId: 'px4-01',
      connectionEpoch: 3,
      channelId: 'state.pose',
      sequence: 1,
      messageId: 2001,
      observedAt: new Date(Date.now() + 1).toISOString(),
      sourceAgeMs: 0,
      staleAt: deadline(60_000),
      stale: false,
      online: true,
      operationalReady: true,
      status: 'online',
      onlineUntil: deadline(60_000),
      operationalReadyUntil: deadline(60_000),
      value: { position: { x: 2,y: 3,z: 4 } },
    })));

    // A newer observation is accepted even when a native source restarts its
    // sequence inside the same fenced connection epoch.
    expect(localPose.result.current?.sequence).toBe(1);
    expect(localPose.result.current?.value.position).toMatchObject({ x: 2 });
    expect(mocapPose.result.current?.value.position).toMatchObject({ x: 99 });
    expect(getRunRobots).toHaveBeenCalledTimes(1);
    expect(runRenders).toBe(rendersBeforePatch);

    localPose.unmount();
    mocapPose.unmount();
    run.unmount();
    expect(stream.close).toHaveBeenCalledTimes(1);
  });

  it('bounds both interactive and compact robot telemetry views to 5 Hz', async () => {
    const initial = projection();
    const template = initial.robots[0]!;
    initial.robots = Array.from({ length: 10 }, (_unused,index) => index < 6 ? ({
      ...template,id: `px4-${index + 1}`,name: `PX4 multirotor ${index + 1}`,
      channels: { ...template.channels },px4: { ...template.px4!,mavSystemId: index + 1 },
    }) : ({
      ...template,id: `scout-${index - 5}`,name: `Scout Mini ${index - 5}`,kind: 'scout_mini',
      profileId: 'fixture.ground.v1',namespace: `/scout${index - 5}`,px4: undefined,
      scout: { managementAddress: `192.0.2.${100 + index}` },adapterDefinitionId: 'scout-mini-ros1-adapter',
      channels: { ...template.channels },
    }));
    vi.mocked(getRunRobots).mockResolvedValue(initial);
    const robotIds = initial.robots.map((robot) => robot.id);
    const renders = Array.from({ length: 10 }, () => 0);
    const hooks = renders.map((_count,index) => renderHook(() => {
      renders[index] += 1;
      return useRobotChannelBundle(
        'local','run-1',robotIds[index]!,
        ['state.pose','state.imu','state.velocity','state.power'],
      );
    }));
    let compactRenders = 0;
    const compact = renderHook(() => {
      compactRenders += 1;
      return useRobotChannelBundle(
        'local','run-1','px4-1',['state.pose','state.power'],'compact',
      );
    });
    let exactRenders = 0;
    const exact = renderHook(() => {
      exactRenders += 1;
      return useRobotChannel('local','run-1','px4-1','state.pose');
    });
    await waitFor(() => {
      expect(hooks.every((hook) => hook.result.current['state.pose']?.sequence === 99)).toBe(true);
      expect(compact.result.current['state.pose']?.sequence).toBe(99);
    });
    vi.useFakeTimers();
    const before = [...renders];
    const compactBefore = compactRenders;
    const exactBefore = exactRenders;
    const observedAt = new Date(Date.now() + 10).toISOString();

    for (let changeIndex = 0; changeIndex < 130; changeIndex += 1) {
      const robotIndex = changeIndex % robotIds.length;
      const sequence = 100 + Math.floor(changeIndex / robotIds.length);
      act(() => {
        stream.options?.onEvent(patchEvent({
          robotId: robotIds[robotIndex]!,connectionEpoch: 3,channelId: 'state.pose',
          sequence,messageId: 2001,observedAt,sourceAgeMs: 0,staleAt: deadline(60_000),stale: false,
          value: { position: { x: sequence } },online: true,operationalReady: true,status: 'online',
          onlineUntil: deadline(60_000),operationalReadyUntil: deadline(60_000),
        }));
      });
    }
    expect(renders).toEqual(before);
    expect(exactRenders).toBe(exactBefore + 13);

    act(() => { vi.advanceTimersByTime(199); });
    expect(renders).toEqual(before);
    expect(compactRenders).toBe(compactBefore);
    act(() => { vi.advanceTimersByTime(1); });
    expect(renders).toEqual(before.map((count) => count + 1));
    expect(hooks.every((hook) => hook.result.current['state.pose']?.sequence === 112)).toBe(true);
    expect(compactRenders).toBe(compactBefore + 1);
    expect(compact.result.current['state.pose']?.sequence).toBe(112);

    exact.unmount();
    compact.unmount();
    hooks.forEach((hook) => hook.unmount());
  });

  it('rebuilds the snapshot only when the server rejects the stream cursor', async () => {
    const hook = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    const firstStream = stream.options;

    act(() => firstStream?.onCursorInvalid());
    expect(hook.result.current.streamState).toBe('replaying');
    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(2));

    expect(stream.close).toHaveBeenCalled();
    expect(openRobotEventStream).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('recovers when the first cursor-invalid snapshot reload fails', async () => {
    const hook = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    const firstStream = stream.options;
    const replacement = projection();
    replacement.streamId = 'robot-stream-cursor-recovered';
    vi.mocked(getRunRobots)
      .mockRejectedValueOnce(new Error('cursor reload failed'))
      .mockResolvedValueOnce(replacement);

    act(() => firstStream?.onCursorInvalid());
    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(hook.result.current.projection?.streamId).toBe('robot-stream-cursor-recovered'));
    expect(openRobotEventStream).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('does not regress a snapshot channel or status when replay contains an older observed sequence', async () => {
    const run = renderHook(() => useRunRobots('local', 'run-1'));
    const status = renderHook(() => useRunRobotStatus('local', 'run-1', 'px4-01'));
    const pose = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.pose'));
    await waitFor(() => expect(pose.result.current?.sequence).toBe(99));
    const currentObservedAt = pose.result.current!.observedAt;

    act(() => stream.options?.onEvent(patchEvent({
      robotId: 'px4-01',connectionEpoch: 3,channelId: 'state.pose',sequence: 98,messageId: 2001,
      observedAt: new Date(Date.parse(currentObservedAt) - 1).toISOString(),sourceAgeMs: 1,
      staleAt: deadline(60_000),stale: false,value: { position: { x: -1 } },
      online: false,operationalReady: false,status: 'offline',
    })));

    expect(pose.result.current?.sequence).toBe(99);
    expect(pose.result.current?.value.position).toMatchObject({ x: 1 });
    expect(status.result.current).toEqual({ online: true,operationalReady: true,status: 'online' });
    expect(run.result.current.projection?.robots[0]).toMatchObject({ online: true,status: 'online' });
    pose.unmount();
    status.unmount();
    run.unmount();
  });

  it('restores durable operations from the initial snapshot before applying live phases', async () => {
    const initial = projection();
    initial.operations = [operation('accepted', 1)];
    vi.mocked(getRunRobots).mockResolvedValue(initial);
    const hook = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(hook.result.current.operations).toHaveLength(1));
    expect(hook.result.current.operations[0]).toMatchObject({ id: 'operation-1',phase: 'accepted' });

    act(() => stream.options?.onEvent({
      revision: 8,targetId: 'local',runId: 'run-1',changes: [],resets: [],
      operations: [operation('succeeded', 2)],emittedAt: new Date().toISOString(),
    }));
    expect(hook.result.current.operations[0]).toMatchObject({ id: 'operation-1',phase: 'succeeded',revision: 2 });
    expect(hook.result.current.projection?.operations[0]).toMatchObject({ id: 'operation-1',phase: 'succeeded',revision: 2 });
    hook.unmount();
  });

  it('applies a newer connection reset and clears all state from the old epoch', async () => {
    const run = renderHook(() => useRunRobots('local', 'run-1'));
    const status = renderHook(() => useRunRobotStatus('local', 'run-1', 'px4-01'));
    const pose = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.pose'));
    await waitFor(() => expect(pose.result.current?.sequence).toBe(99));

    act(() => stream.options?.onEvent({
      revision: 8,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 3,state: 'closed',revision: 3,detail: 'stream ended' }],
      emittedAt: new Date().toISOString(),
    }));

    expect(pose.result.current).toBeUndefined();
    expect(status.result.current).toEqual({ online: false,operationalReady: false,status: 'offline' });
    expect(run.result.current.projection?.robots[0]).toMatchObject({
      connectionEpoch: 3,connectionState: 'closed',connectionRevision: 3,
      connectionDetail: 'stream ended',online: false,operationalReady: false,status: 'offline',channels: {},
    });
    pose.unmount();
    status.unmount();
    run.unmount();
  });

  it('keeps Core authoritative Scout offline state even when every channel is fresh', async () => {
    const initial = projection();
    initial.robots = [{
      id: 'scout-01',name: 'Scout Mini 1',kind: 'scout_mini',namespace: '/scout1',
      robotAssetId: 'scout-asset-1',robotAssetCommitId: 'scout-commit-1',robotAssetDigest: 'b'.repeat(64),
      hybridSource: 'physical',
      profileId: 'fixture.ground.v1',
      operationContracts: [],
      scout: { managementAddress: '192.0.2.20' },adapterDefinitionId: 'scout-mini-ros1-adapter',
      connectionEpoch: 2,connectionState: 'live',connectionRevision: 2,
      online: false,operationalReady: false,status: 'offline',
      channels: {
        'state.pose': channel('state.pose', 2001, 1, { position: { x: 0 } }, new Date().toISOString()),
        'state.health': channel('state.health', 2004, 1, { online: false,summary: 'disconnected' }, new Date().toISOString()),
        'state.power': channel('state.power', 2005, 1, { percentage: 0.8 }, new Date().toISOString()),
      },
    }];
    vi.mocked(getRunRobots).mockResolvedValue(initial);
    const status = renderHook(() => useRunRobotStatus('local', 'run-1', 'scout-01'));

    await waitFor(() => expect(status.result.current.status).toBe('offline'));
    expect(status.result.current).toEqual({ online: false,operationalReady: false,status: 'offline' });
    status.unmount();
  });

  it('expires Core online deadlines into run, status, and control selectors', async () => {
    const initial = projection();
    const expires = deadline(250);
    initial.robots[0]!.onlineUntil = expires;
    initial.robots[0]!.operationalReadyUntil = expires;
    initial.robots[0]!.channels['state.flight']!.value.armed = false;
    vi.mocked(getRunRobots).mockResolvedValue(initial);
    const run = renderHook(() => useRunRobots('local', 'run-1'));
    const status = renderHook(() => useRunRobotStatus('local', 'run-1', 'px4-01'));
    const reboot = renderHook(() => useRobotChannelSelection(
      'local',
      'run-1',
      ['px4-01'],
      'state.flight',
      (robot, flight) => robot?.online === true && flight?.stale === false && flight.value.armed === false,
    ));

    await waitFor(() => expect(reboot.result.current).toBe(true));
    await waitFor(() => expect(status.result.current.online).toBe(false));
    expect(status.result.current).toEqual({ online: false,operationalReady: false,status: 'offline' });
    expect(run.result.current.projection?.robots[0]).toMatchObject({
      online: false,operationalReady: false,status: 'offline',
    });
    expect(reboot.result.current).toBe(false);
    reboot.unmount();
    status.unmount();
    run.unmount();
  });

  it('expires an already-old replay backlog patch immediately without reading payload semantics', async () => {
    const run = renderHook(() => useRunRobots('local', 'run-1'));
    const status = renderHook(() => useRunRobotStatus('local', 'run-1', 'px4-01'));
    const flight = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.flight'));
    await waitFor(() => expect(run.result.current.loaded).toBe(true));

    act(() => stream.options?.onEvent(patchEvent({
      robotId: 'px4-01',connectionEpoch: 3,channelId: 'state.flight',sequence: 6,messageId: 3001,
      observedAt: new Date(Date.now() - 10_000).toISOString(),sourceAgeMs: 10_000,
      staleAt: deadline(-1),stale: false,value: { connected: true,armed: false },
      online: true,operationalReady: true,status: 'online',
      onlineUntil: deadline(-1),operationalReadyUntil: deadline(-1),
    })));

    expect(flight.result.current?.stale).toBe(true);
    expect(status.result.current).toEqual({ online: false,operationalReady: false,status: 'offline' });
    expect(run.result.current.projection?.robots[0]).toMatchObject({ online: false,operationalReady: false,status: 'offline' });
    flight.unmount();
    status.unmount();
    run.unmount();
  });

  it('does not regress a snapshot with older or duplicate connection resets', async () => {
    const run = renderHook(() => useRunRobots('local', 'run-1'));
    const pose = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.pose'));
    await waitFor(() => expect(pose.result.current?.sequence).toBe(99));

    act(() => stream.options?.onEvent({
      revision: 8,targetId: 'local',runId: 'run-1',changes: [],resets: [
        { robotId: 'px4-01',connectionEpoch: 2,state: 'revoked',revision: 99 },
        { robotId: 'px4-01',connectionEpoch: 3,state: 'opening',revision: 2 },
      ],
      emittedAt: new Date().toISOString(),
    }));

    expect(run.result.current.projection?.robots[0]).toMatchObject({
      connectionEpoch: 3,connectionState: 'live',connectionRevision: 2,online: true,
    });
    expect(pose.result.current?.sequence).toBe(99);
    pose.unmount();
    run.unmount();
  });

  it('fences telemetry until the new connection epoch becomes live', async () => {
    const run = renderHook(() => useRunRobots('local', 'run-1'));
    const pose = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.pose'));
    await waitFor(() => expect(pose.result.current?.sequence).toBe(99));

    act(() => stream.options?.onEvent({
      revision: 8,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 4,state: 'opening',revision: 1 }],
      emittedAt: new Date().toISOString(),
    }));
    expect(pose.result.current).toBeUndefined();

    act(() => stream.options?.onEvent(patchEvent({
      robotId: 'px4-01',connectionEpoch: 4,channelId: 'state.pose',sequence: 1,messageId: 2001,
      observedAt: new Date().toISOString(),sourceAgeMs: 0,staleAt: deadline(60_000),stale: false,
      value: { position: { x: 4 } },online: true,operationalReady: true,status: 'online',
      onlineUntil: deadline(60_000),operationalReadyUntil: deadline(60_000),
    })));
    expect(pose.result.current).toBeUndefined();

    act(() => stream.options?.onEvent({
      revision: 9,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 4,state: 'live',revision: 2 }],
      emittedAt: new Date().toISOString(),
    }));
    act(() => stream.options?.onEvent(patchEvent({
      robotId: 'px4-01',connectionEpoch: 4,channelId: 'state.pose',sequence: 1,messageId: 2001,
      observedAt: new Date().toISOString(),sourceAgeMs: 0,staleAt: deadline(60_000),stale: false,
      value: { position: { x: 4 } },online: true,operationalReady: true,status: 'online',
      onlineUntil: deadline(60_000),operationalReadyUntil: deadline(60_000),
    })));
    expect(pose.result.current?.value.position).toMatchObject({ x: 4 });
    expect(run.result.current.projection?.robots[0]).toMatchObject({ connectionEpoch: 4,connectionState: 'live' });
    pose.unmount();
    run.unmount();
  });

  it('stages the whole patch before rejecting telemetry from a future epoch', async () => {
    const run = renderHook(() => useRunRobots('local', 'run-1'));
    const status = renderHook(() => useRunRobotStatus('local', 'run-1', 'px4-01'));
    const pose = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.pose'));
    await waitFor(() => expect(pose.result.current?.sequence).toBe(99));
    expect(() => stream.options?.onEvent({
      revision: 8,targetId: 'local',runId: 'run-1',resets: [],
      changes: [{
        robotId: 'px4-01',connectionEpoch: 3,channelId: 'state.pose',sequence: 100,messageId: 2001,
        observedAt: new Date(Date.now() + 1).toISOString(),sourceAgeMs: 0,staleAt: deadline(60_000),
        stale: false,value: { position: { x: 100 } },online: true,operationalReady: true,status: 'online',
        onlineUntil: deadline(60_000),operationalReadyUntil: deadline(60_000),
      }, {
        robotId: 'px4-01',connectionEpoch: 4,channelId: 'state.flight',sequence: 1,messageId: 3001,
        observedAt: new Date(Date.now() + 2).toISOString(),sourceAgeMs: 0,staleAt: deadline(60_000),
        stale: false,value: { connected: true },online: true,operationalReady: true,status: 'online',
        onlineUntil: deadline(60_000),operationalReadyUntil: deadline(60_000),
      }],
      emittedAt: new Date().toISOString(),
    })).toThrow('future connection epoch');

    expect(pose.result.current?.sequence).toBe(99);
    expect(pose.result.current?.value.position).toMatchObject({ x: 1 });
    expect(status.result.current).toEqual({ online: true,operationalReady: true,status: 'online' });
    expect(run.result.current.projection?.robots[0]).toMatchObject({ online: true,status: 'online' });
    pose.unmount();
    status.unmount();
    run.unmount();
  });

  it('reattaches and reloads the immutable run projection after a cold remount', async () => {
    const first = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    first.unmount();

    const second = renderHook(() => useRobotChannel('local', 'run-1', 'px4-01', 'state.pose'));
    expect(second.result.current).toBeUndefined();
    await waitFor(() => expect(second.result.current?.sequence).toBe(99));

    expect(getRunRobots).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  it('opens the pending stream and refreshes once on its first connection event without REST polling', async () => {
    vi.mocked(getRunRobots).mockResolvedValueOnce(pendingProjection());

    const first = renderHook(() => useRunRobots('local', 'run-1'));
    const second = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(first.result.current.loaded).toBe(true));

    expect(first.result.current).toMatchObject({
      projection: { pending: true,robots: [] },
      loaded: true,
      loading: false,
      error: '',
    });
    expect(getRunRobots).toHaveBeenCalledTimes(1);
    expect(openRobotEventStream).toHaveBeenCalledTimes(1);

    // Promise turns and unrelated renders do not schedule another REST read.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getRunRobots).toHaveBeenCalledTimes(1);

    vi.mocked(getRunRobots).mockResolvedValueOnce(projection());
    act(() => stream.options?.onEvent({
      revision: 1,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 1,state: 'opening',revision: 1 }],
      emittedAt: new Date().toISOString(),
    }));
    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(first.result.current.projection?.pending).toBe(false));

    expect(stream.close).toHaveBeenCalledTimes(1);
    expect(openRobotEventStream).toHaveBeenCalledTimes(2);
    expect(first.result.current.error).toBe('');
    first.unmount();
    second.unmount();
    expect(stream.close).toHaveBeenCalledTimes(2);
  });

  it('closes the exact stream and clears its readout when Session demand removes the owner Run',async () => {
    const view = renderHook(
      ({ runId }) => useRunRobots('local',runId),
      { initialProps:{ runId:'run-1' as string|undefined } },
    );
    await waitFor(() => expect(view.result.current.loaded).toBe(true));
    expect(view.result.current.projection?.runId).toBe('run-1');

    view.rerender({ runId:undefined });

    await waitFor(() => expect(stream.close).toHaveBeenCalledTimes(1));
    expect(view.result.current.projection).toBeUndefined();
    expect(view.result.current.operations).toEqual([]);
    expect(view.result.current.error).toBe('');
    view.unmount();
  });

  it('aborts an in-flight topology snapshot when Session demand removes the owner Run',async () => {
    const view = renderHook(
      ({ runId }) => useRunRobots('local',runId),
      { initialProps:{ runId:'run-1' as string|undefined } },
    );
    await waitFor(() => expect(view.result.current.loaded).toBe(true));
    const parentStream = stream.options;
    let refreshSignal:AbortSignal|undefined;
    vi.mocked(getRunRobots).mockImplementationOnce((_targetId,_runId,signal) => (
      new Promise((_resolve,reject) => {
        refreshSignal=signal;
        signal?.addEventListener('abort',() => reject(new DOMException('aborted','AbortError')),{ once:true });
      })
    ));

    act(() => parentStream?.onEvent({
      revision:8,targetId:'local',runId:'run-1',refresh:true,
      changes:[],resets:[],emittedAt:new Date().toISOString(),
    }));
    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(2));
    expect(refreshSignal?.aborted).toBe(false);

    view.rerender({ runId:undefined });

    expect(refreshSignal?.aborted).toBe(true);
    expect(view.result.current.projection).toBeUndefined();
    expect(view.result.current.operations).toEqual([]);
    expect(view.result.current.error).toBe('');
    expect(openRobotEventStream).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('refreshes the same retained parent once for an aggregate topology event', async () => {
    const hook = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    const parentStream = stream.options;
    const replacement = projection();
    replacement.streamId = 'robot-stream-parent-next';
    replacement.projectionRevision = 9;
    vi.mocked(getRunRobots).mockResolvedValueOnce(replacement);

    act(() => {
      parentStream?.onEvent({
        revision: 8,targetId: 'local',runId: 'run-1',refresh: true,
        changes: [],resets: [],emittedAt: new Date().toISOString(),
      });
      // A reset that raced behind the refresh is covered by the replacement
      // snapshot/cursor and must not be applied as a synthetic parent patch.
      parentStream?.onEvent({
        revision: 9,targetId: 'local',runId: 'run-1',changes: [],
        resets: [{ robotId: 'new-slot',connectionEpoch: 1,state: 'opening',revision: 1 }],
        emittedAt: new Date().toISOString(),
      });
      parentStream?.onCursorInvalid();
    });
    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.projection?.streamId).toBe('robot-stream-parent-next'));

    expect(openRobotEventStream).toHaveBeenCalledTimes(2);
    expect(stream.options).toMatchObject({
      targetId: 'local',runId: 'run-1',streamId: 'robot-stream-parent-next',afterRevision: 9,
    });
    expect(getRunRobots).toHaveBeenNthCalledWith(2, 'local', 'run-1',expect.any(AbortSignal));
    hook.unmount();
  });

  it('applies terminal reset and exposes a retained parent refresh 404', async () => {
    const hook = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    const parentStream = stream.options;
    vi.mocked(getRunRobots).mockRejectedValueOnce(new Error('404 Not Found: robot binding not found'));

    act(() => parentStream?.onEvent({
      revision: 8,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 3,state: 'closed',revision: 3 }],
      emittedAt: new Date().toISOString(),
    }));
    expect(hook.result.current.projection?.robots[0]).toMatchObject({
      connectionState: 'closed',online: false,operationalReady: false,status: 'offline',
    });
    act(() => parentStream?.onEvent({
      revision: 9,targetId: 'local',runId: 'run-1',refresh: true,
      changes: [],resets: [],emittedAt: new Date().toISOString(),
    }));
    await waitFor(() => expect(hook.result.current.error).toBe('404 Not Found: robot binding not found'));
    expect(hook.result.current.projection?.robots[0]).toMatchObject({
      connectionState: 'closed',online: false,operationalReady: false,status: 'offline',
    });
    hook.unmount();
  });

  it('retries once when an operation and cursor invalidation race behind a failed aggregate refresh', async () => {
    const hook = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    const parentStream = stream.options;
    const replacement = projection();
    replacement.streamId = 'robot-stream-after-race';
    replacement.projectionRevision = 9;
    vi.mocked(getRunRobots)
      .mockRejectedValueOnce(new Error('aggregate refresh failed'))
      .mockResolvedValueOnce(replacement);

    act(() => {
      parentStream?.onEvent({
        revision: 8,targetId: 'local',runId: 'run-1',refresh: true,
        changes: [],resets: [],emittedAt: new Date().toISOString(),
      });
      parentStream?.onEvent({
        revision: 9,targetId: 'local',runId: 'run-1',changes: [],
        resets: [],operations: [operation('succeeded', 2)],
        emittedAt: new Date().toISOString(),
      });
      parentStream?.onCursorInvalid();
    });

    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(hook.result.current.projection?.streamId).toBe('robot-stream-after-race'));
    expect(getRunRobots).toHaveBeenNthCalledWith(2, 'local', 'run-1',expect.any(AbortSignal));
    expect(getRunRobots).toHaveBeenNthCalledWith(3, 'local', 'run-1',expect.any(AbortSignal));
    expect(openRobotEventStream).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('keeps the pending stream as the retry trigger when an event-driven snapshot refresh fails', async () => {
    vi.mocked(getRunRobots).mockResolvedValueOnce(pendingProjection());
    const hook = renderHook(() => useRunRobots('local', 'run-1'));
    await waitFor(() => expect(hook.result.current.projection?.pending).toBe(true));

    vi.mocked(getRunRobots).mockRejectedValueOnce(new Error('temporary snapshot failure'));
    act(() => stream.options?.onEvent({
      revision: 1,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 1,state: 'opening',revision: 1 }],
      emittedAt: new Date().toISOString(),
    }));
    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.error).toBe('temporary snapshot failure'));
    expect(stream.close).not.toHaveBeenCalled();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getRunRobots).toHaveBeenCalledTimes(2);

    vi.mocked(getRunRobots).mockResolvedValueOnce(projection());
    act(() => stream.options?.onEvent({
      revision: 2,targetId: 'local',runId: 'run-1',changes: [],
      resets: [{ robotId: 'px4-01',connectionEpoch: 1,state: 'live',revision: 2 }],
      emittedAt: new Date().toISOString(),
    }));
    await waitFor(() => expect(getRunRobots).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(hook.result.current.projection?.pending).toBe(false));
    expect(stream.close).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});

function projection(): RunRobotProjection {
  const observedAt = new Date().toISOString();
  return {
    targetId: 'local',
    runId: 'run-1',
    streamId: 'robot-stream-1',
    projectionRevision: 7,
    pending: false,
    experimentResourceId: 'experiment-1',
    experimentCommitId: 'experiment-commit-1',
    robotSelectionDigest: 'c'.repeat(64),
    operations: [],
    updatedAt: observedAt,
    robots: [{
      id: 'px4-01',name: 'PX4 multirotor 1',kind: 'px4_multirotor',namespace: '/uav1',
      robotAssetId: 'px4-asset-1',robotAssetCommitId: 'px4-commit-1',robotAssetDigest: 'b'.repeat(64),
      hybridSource: 'physical',
      profileId: 'fixture.aerial.v1',
      operationContracts: [],
      px4: { modelId:'fs150',mavSystemId: 1,managementIp: '192.0.2.1',mocapRigidBodyName: 'px4_01' },
      adapterDefinitionId: 'px4-multirotor-ros1-adapter',
      connectionEpoch: 3,connectionState: 'live',connectionRevision: 2,
      online: true,operationalReady: true,status: 'online',
      onlineUntil: deadline(60_000),operationalReadyUntil: deadline(60_000),
      channels: {
        'state.flight': channel('state.flight', 3001, 5, { connected: true,mode: 'OFFBOARD' }, observedAt),
        'state.pose': channel('state.pose', 2001, 99, { position: { x: 1,y: 0,z: 0 } }, observedAt),
        'state.mocap.pose': channel('state.mocap.pose', 2001, 101, { position: { x: 99,y: 0,z: 0 } }, observedAt),
      },
    }],
  };
}

function pendingProjection(): RunRobotProjection {
  return {
    targetId: 'local',runId: 'run-1',streamId: 'robot-stream-pending',projectionRevision: 0,
    pending: true,experimentResourceId: '',experimentCommitId: '',robotSelectionDigest: '',
    robots: [],operations: [],updatedAt: new Date().toISOString(),
  };
}

function channel(
  channelId: string,
  messageId: number,
  sequence: number,
  value: Record<string,unknown>,
  observedAt: string,
) {
  return { channelId,messageId,sequence,observedAt,sourceAgeMs: 0,staleAt: deadline(60_000),stale: false,value };
}

function patchEvent(change: RobotPatchEvent['changes'][number]): RobotPatchEvent {
  return {
    revision: 8,
    targetId: 'local',
    runId: 'run-1',
    changes: [change],
    resets: [],
    emittedAt: new Date().toISOString(),
  };
}

function deadline(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function operation(phase: 'accepted' | 'succeeded', revision: number) {
  return {
    id: 'operation-1',targetId: 'local',runId: 'run-1',experimentId: 'experiment-1',robotId: 'px4-01',
    operation: 'arm' as const,parameters: { armed: true },phase,attempt: 1,maxAttempts: 1,connectionEpoch: 3,revision,
    createdAt: '2026-07-14T00:00:00Z',updatedAt: `2026-07-14T00:00:0${revision}Z`,
  };
}
