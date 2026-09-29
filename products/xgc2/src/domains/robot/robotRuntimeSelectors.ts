import { useLayoutEffect,useMemo,useSyncExternalStore } from 'react';
import { retainRobotRun } from './robotConnectionStore';
import { normalizeRobotTargetId } from './robotRuntimeIdentity';
import type { RobotChannelProjection,RunRobot,RunRobotStatus } from './robotRuntimeModel';
import {
  getRobotChannelRuntime,
  getRobotRuntime,
  getRobotStatusRuntime,
  getRunRuntimeState,
  offlineRobotStatus,
  subscribeRobotChannelRuntime,
  subscribeRobotRuntime,
  subscribeRobotStatusRuntime,
  subscribeRunRuntime,
  type RobotRuntimeListener,
} from './robotRuntimeState';
import {
  releaseRobotVisualInvalidation,
  scheduleRobotVisualInvalidation,
  type RobotChannelBundleRefresh,
} from './robotVisualInvalidation';

export type { RobotChannelBundleRefresh } from './robotVisualInvalidation';

export function useRunRobots(targetId: string, runId?: string) {
  const target = normalizeRobotTargetId(targetId);
  const run = runId?.trim() ?? '';
  const subscribe = useMemo(() => (
    (listener: RobotRuntimeListener) => subscribeRunRuntime(target, run, listener)
  ), [run,target]);
  useRetainedRobotRun(target, run);
  return useSyncExternalStore(
    subscribe,
    () => getRunRuntimeState(target, run),
    () => getRunRuntimeState(target, run),
  );
}

type RobotRunsSnapshot = {
  projection: { robots: RunRobot[] };
  runIdsByRobotId: Readonly<Record<string,string>>;
};

export function useRobotRuns(targetId: string, runIds: readonly string[]) {
  const target = normalizeRobotTargetId(targetId);
  const identity = [...new Set(runIds.map(id => id.trim()).filter(Boolean))].sort().join('\u0000');
  const ids = useMemo(() => identity ? identity.split('\u0000') : [], [identity]);
  useLayoutEffect(() => {
    const releases = ids.map(id => retainRobotRun(target, id));
    return () => releases.forEach(release => release());
  }, [ids,target]);
  const subscription = useMemo(() => {
    let previous: RobotRunsSnapshot | undefined;
    return {
      subscribe(listener: RobotRuntimeListener) {
        const releases = ids.map(id => subscribeRunRuntime(target, id, listener));
        return () => releases.forEach(release => release());
      },
      snapshot() {
        const owners = new Map<string,{ robot: RunRobot;runId: string }>();
        ids.forEach(runId => {
          getRunRuntimeState(target, runId).projection?.robots.forEach(robot => {
            const current = owners.get(robot.id)?.robot;
            if (!current || robot.connectionEpoch > current.connectionEpoch
              || (robot.connectionEpoch === current.connectionEpoch
                && robot.connectionState === 'live' && current.connectionState !== 'live')) {
              owners.set(robot.id, { robot,runId });
            }
          });
        });
        const entries = [...owners.values()].sort((a,b) => a.robot.id.localeCompare(b.robot.id));
        if (previous && previous.projection.robots.length === entries.length
          && entries.every(({ robot,runId },index) => previous!.projection.robots[index] === robot
            && previous!.runIdsByRobotId[robot.id] === runId)) return previous;
        previous = {
          projection: { robots: entries.map(entry => entry.robot) },
          runIdsByRobotId: Object.fromEntries(entries.map(({ robot,runId }) => [robot.id,runId])),
        };
        return previous;
      },
    };
  }, [ids,target]);
  return useSyncExternalStore(subscription.subscribe, subscription.snapshot, subscription.snapshot);
}

export function useRunRobot(
  targetId: string,
  runId: string | undefined,
  robotId: string,
) {
  const target = normalizeRobotTargetId(targetId);
  const run = runId?.trim() ?? '';
  const robot = robotId.trim();
  const subscribe = useMemo(() => (
    (listener: RobotRuntimeListener) => subscribeRobotRuntime(target, run, robot, listener)
  ), [robot,run,target]);
  useRetainedRobotRun(target, run);
  return useSyncExternalStore(
    subscribe,
    () => getRobotRuntime(target, run, robot),
    () => getRobotRuntime(target, run, robot),
  );
}

export function useRobotChannel(
  targetId: string,
  runId: string | undefined,
  robotId: string,
  channelId: string,
) {
  const target = normalizeRobotTargetId(targetId);
  const run = runId?.trim() ?? '';
  const robot = robotId.trim();
  const channel = channelId.trim();
  const subscribe = useMemo(() => (
    (listener: RobotRuntimeListener) => (
      subscribeRobotChannelRuntime(target, run, robot, channel, listener)
    )
  ), [channel,robot,run,target]);
  useRetainedRobotRun(target, run);
  return useSyncExternalStore(
    subscribe,
    () => getRobotChannelRuntime(target, run, robot, channel),
    () => getRobotChannelRuntime(target, run, robot, channel),
  );
}

/**
 * Coalesced channel values for one robot. `parked` is for a mounted surface
 * the operator cannot see (a parked route or hidden dashboard tab): it keeps
 * the run retained and its DOM, stops drawing channel updates, and reads the
 * latest values again in the same render it becomes visible.
 */
export function useRobotChannelBundle(
  targetId: string,
  runId: string | undefined,
  robotId: string,
  channelIds: readonly string[],
  refresh: RobotChannelBundleRefresh = 'interactive',
  parked = false,
): Readonly<Record<string,RobotChannelProjection | undefined>> {
  const target = normalizeRobotTargetId(targetId);
  const run = runId?.trim() ?? '';
  const robot = robotId.trim();
  const identity = [...new Set(channelIds.map((channel) => channel.trim()).filter(Boolean))]
    .sort()
    .join('\u0000');
  const channels = useMemo(() => identity ? identity.split('\u0000') : [], [identity]);
  const visualSubscription = useMemo(() => {
    const read = () => Object.fromEntries(channels.map((channel) => [
      channel,
      getRobotChannelRuntime(target, run, robot, channel),
    ]));
    let snapshot = read();
    const refreshSnapshot = () => {
      const next = read();
      if (channels.every((channel) => next[channel] === snapshot[channel])) return false;
      snapshot = next;
      return true;
    };
    return {
      subscribe(listener: RobotRuntimeListener) {
        // Parked: nothing is drawn, so nothing is scheduled. The store stays
        // authoritative (the run is still retained) and the visible
        // subscription built on return starts from a fresh read.
        if (parked) return () => undefined;
        const invalidate = () => {
          if (refreshSnapshot()) listener();
        };
        const releases = channels.map((channel) => subscribeRobotChannelRuntime(
          target,
          run,
          robot,
          channel,
          () => scheduleRobotVisualInvalidation(invalidate, refresh),
        ));
        // A patch can arrive after render but before these listeners exist.
        // Reconcile after subscribing so React's post-subscribe snapshot check
        // sees it, even when no second patch arrives. Steady-state updates
        // still go through the shared visual coalescer.
        refreshSnapshot();
        return () => {
          releaseRobotVisualInvalidation(invalidate);
          releases.forEach((release) => release());
        };
      },
      snapshot: () => snapshot,
    };
  }, [channels,parked,refresh,robot,run,target]);
  useRetainedRobotRun(target, run);
  return useSyncExternalStore(
    visualSubscription.subscribe,
    visualSubscription.snapshot,
    visualSubscription.snapshot,
  );
}

export function useRunRobotStatus(
  targetId: string,
  runId: string | undefined,
  robotId: string,
) {
  const target = normalizeRobotTargetId(targetId);
  const run = runId?.trim() ?? '';
  const robot = robotId.trim();
  const subscribe = useMemo(() => (
    (listener: RobotRuntimeListener) => subscribeRobotStatusRuntime(target, run, robot, listener)
  ), [robot,run,target]);
  useRetainedRobotRun(target, run);
  return useSyncExternalStore(
    subscribe,
    () => getRobotStatusRuntime(target, run, robot) ?? offlineRobotStatus,
    () => getRobotStatusRuntime(target, run, robot) ?? offlineRobotStatus,
  );
}

export function useRobotChannelSelection(
  targetId: string,
  runId: string | undefined,
  robotIds: string[],
  channelId: string,
  predicate: (
    status: RunRobotStatus | undefined,
    channel: RobotChannelProjection | undefined,
  ) => boolean,
) {
  const target = normalizeRobotTargetId(targetId);
  const run = runId?.trim() ?? '';
  const channel = channelId.trim();
  const identity = [...new Set(robotIds.map((id) => id.trim()).filter(Boolean))]
    .sort()
    .join('\u0000');
  const robots = useMemo(() => identity ? identity.split('\u0000') : [], [identity]);
  const subscribe = useMemo(() => (
    (listener: RobotRuntimeListener) => {
      const releases = robots.flatMap((robotId) => [
        subscribeRobotStatusRuntime(target, run, robotId, listener),
        subscribeRobotChannelRuntime(target, run, robotId, channel, listener),
      ]);
      return () => releases.forEach((release) => release());
    }
  ), [channel,robots,run,target]);
  useRetainedRobotRun(target, run);
  return useSyncExternalStore(
    subscribe,
    () => robots.length > 0 && robots.every((robotId) => predicate(
      getRobotStatusRuntime(target, run, robotId),
      getRobotChannelRuntime(target, run, robotId, channel),
    )),
    () => false,
  );
}

export function useLiveConnectedRobotIds(targetId: string, runIds: readonly string[]) {
  const target = normalizeRobotTargetId(targetId);
  const identity = [...new Set(runIds.map((runId) => runId.trim()).filter(Boolean))].sort().join('\u0000');
  const ids = useMemo(() => identity ? identity.split('\u0000') : [], [identity]);
  useLayoutEffect(() => {
    const releases = ids.map((runId) => retainRobotRun(target, runId));
    return () => releases.forEach((release) => release());
  }, [ids,target]);
  const subscribe = useMemo(() => (
    (listener: RobotRuntimeListener) => {
      const releases = ids.map((runId) => subscribeRunRuntime(target, runId, listener));
      return () => releases.forEach((release) => release());
    }
  ), [ids,target]);
  const getSnapshot = useMemo(() => {
    // Keep one stable snapshot per hook, not one entry per historical run set.
    let previous: LiveConnectedRobotSnapshot | undefined;
    return () => {
      previous = liveConnectedRobotSnapshot(target, ids, previous);
      return previous;
    };
  }, [ids,target]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

type LiveConnectedRobotSnapshot = {
  liveIds: readonly string[];
  knownIds: readonly string[];
  disconnectedIds: readonly string[];
  loaded: boolean;
  pending: boolean;
  hasRoster: boolean;
};

function liveConnectedRobotSnapshot(
  targetId: string,
  runIds: readonly string[],
  previous: LiveConnectedRobotSnapshot | undefined,
): LiveConnectedRobotSnapshot {
  // Sets: a fleet roster would make per-robot includes() O(robots^2) on
  // every run-level notification. The sorted arrays are the snapshot.
  const live = new Set<string>();
  const known = new Set<string>();
  const disconnected = new Set<string>();
  let loaded = false;
  let pending = false;
  let hasRoster = false;
  runIds.forEach((runId) => {
    const state = getRunRuntimeState(targetId, runId);
    if (state.loading || state.projection?.pending) pending = true;
    const robots = state.projection?.robots;
    if (Array.isArray(robots)) {
      loaded = true;
      hasRoster = true;
      robots.forEach((robot) => {
        if (!state.projection?.pending) known.add(robot.id);
        if (!state.projection?.pending && ['closed','revoked'].includes(robot.connectionState)) disconnected.add(robot.id);
        if (robot.connectionState === 'live' && robot.online) live.add(robot.id);
      });
      return;
    }
    if (state.loaded && !state.error) loaded = true;
  });
  const liveIds = [...live].sort();
  const knownIds = [...known].sort();
  const disconnectedIds = [...disconnected].sort();
  if (previous
    && previous.loaded === loaded
    && previous.pending === pending
    && previous.hasRoster === hasRoster
    && previous.disconnectedIds.length === disconnectedIds.length
    && previous.disconnectedIds.every((id,index) => id === disconnectedIds[index])
    && previous.knownIds.length === knownIds.length
    && previous.knownIds.every((id,index) => id === knownIds[index])
    && previous.liveIds.length === liveIds.length
    && previous.liveIds.every((id, index) => id === liveIds[index])) {
    return previous;
  }
  return { liveIds,knownIds,disconnectedIds,loaded,pending,hasRoster };
}

function useRetainedRobotRun(targetId: string, runId: string) {
  useLayoutEffect(() => runId ? retainRobotRun(targetId, runId) : undefined, [runId,targetId]);
}
