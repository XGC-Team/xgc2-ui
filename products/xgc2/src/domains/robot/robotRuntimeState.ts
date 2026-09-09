import type {
  RobotChannelProjection,
  RunRobot,
  RunRobotRuntimeState,
  RunRobotStatus,
} from './robotRuntimeModel';
import {
  robotChannelIdentity,
  robotIdentity,
  robotRunIdentity,
} from './robotRuntimeIdentity';

export type RobotRuntimeListener = () => void;

const runSnapshots = new Map<string,RunRobotRuntimeState>();
const robotSnapshots = new Map<string,RunRobot>();
const channelSnapshots = new Map<string,RobotChannelProjection>();
const statusSnapshots = new Map<string,RunRobotStatus>();
const runListeners = new Map<string,Set<RobotRuntimeListener>>();
const robotListeners = new Map<string,Set<RobotRuntimeListener>>();
const channelListeners = new Map<string,Set<RobotRuntimeListener>>();
const statusListeners = new Map<string,Set<RobotRuntimeListener>>();

export const offlineRobotStatus: RunRobotStatus = {
  online: false,
  operationalReady: false,
  status: 'offline',
};

export function getRunRuntimeState(targetId: string, runId: string) {
  const key = robotRunIdentity(targetId, runId);
  let current = runSnapshots.get(key);
  if (!current) {
    current = {
      operations: [],
      streamState: 'idle',
      loaded: !runId,
      loading: false,
      error: '',
    };
    runSnapshots.set(key, current);
  }
  return current;
}

export function updateRunRuntimeState(
  targetId: string,
  runId: string,
  update: Partial<RunRobotRuntimeState>,
) {
  const key = robotRunIdentity(targetId, runId);
  const current = getRunRuntimeState(targetId, runId);
  const entries = Object.entries(update) as [keyof RunRobotRuntimeState,unknown][];
  if (entries.every(([field,value]) => current[field] === value)) return;
  runSnapshots.set(key, { ...current,...update });
  notify(runListeners, key);
}

export function getRobotRuntime(targetId: string, runId: string, robotId: string) {
  return robotSnapshots.get(robotIdentity(targetId, runId, robotId));
}

export function setRobotRuntime(targetId: string, runId: string, robot: RunRobot) {
  robotSnapshots.set(robotIdentity(targetId, runId, robot.id), robot);
}

export function listRunRobotRuntime(targetId: string, runId: string) {
  const prefix = `${robotRunIdentity(targetId, runId)}\u0000`;
  return [...robotSnapshots.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([,robot]) => robot);
}

export function removeRobotRuntime(targetId: string, runId: string, robotId: string) {
  const key = robotIdentity(targetId, runId, robotId);
  const robot = robotSnapshots.get(key);
  robotSnapshots.delete(key);
  statusSnapshots.delete(key);
  notify(robotListeners, key);
  notify(statusListeners, key);
  Object.keys(robot?.channels ?? {}).forEach((channelId) => {
    const channelKey = robotChannelIdentity(targetId, runId, robotId, channelId);
    channelSnapshots.delete(channelKey);
    notify(channelListeners, channelKey);
  });
}

export function getRobotChannelRuntime(
  targetId: string,
  runId: string,
  robotId: string,
  channelId: string,
) {
  return channelSnapshots.get(robotChannelIdentity(targetId, runId, robotId, channelId));
}

export function setRobotChannelRuntime(
  targetId: string,
  runId: string,
  robotId: string,
  channel: RobotChannelProjection,
) {
  channelSnapshots.set(robotChannelIdentity(targetId, runId, robotId, channel.channelId), channel);
}

export function removeRobotChannelRuntime(
  targetId: string,
  runId: string,
  robotId: string,
  channelId: string,
) {
  channelSnapshots.delete(robotChannelIdentity(targetId, runId, robotId, channelId));
}

export function getRobotStatusRuntime(targetId: string, runId: string, robotId: string) {
  return statusSnapshots.get(robotIdentity(targetId, runId, robotId));
}

export function setRobotStatusRuntime(targetId: string, runId: string, robot: RunRobot) {
  const key = robotIdentity(targetId, runId, robot.id);
  const current = statusSnapshots.get(key);
  const next: RunRobotStatus = {
    online: robot.online,
    operationalReady: robot.operationalReady,
    status: robot.status,
  };
  if (current && current.online === next.online
    && current.operationalReady === next.operationalReady
    && current.status === next.status) return false;
  statusSnapshots.set(key, next);
  return true;
}

export function subscribeRunRuntime(
  targetId: string,
  runId: string,
  listener: RobotRuntimeListener,
) {
  return subscribe(runListeners, robotRunIdentity(targetId, runId), listener);
}

export function subscribeRobotRuntime(
  targetId: string,
  runId: string,
  robotId: string,
  listener: RobotRuntimeListener,
) {
  return subscribe(robotListeners, robotIdentity(targetId, runId, robotId), listener);
}

export function subscribeRobotChannelRuntime(
  targetId: string,
  runId: string,
  robotId: string,
  channelId: string,
  listener: RobotRuntimeListener,
) {
  return subscribe(
    channelListeners,
    robotChannelIdentity(targetId, runId, robotId, channelId),
    listener,
  );
}

export function subscribeRobotStatusRuntime(
  targetId: string,
  runId: string,
  robotId: string,
  listener: RobotRuntimeListener,
) {
  return subscribe(statusListeners, robotIdentity(targetId, runId, robotId), listener);
}

export function notifyRobotRuntime(targetId: string, runId: string, robotId: string) {
  notify(robotListeners, robotIdentity(targetId, runId, robotId));
}

export function notifyRobotChannelRuntime(
  targetId: string,
  runId: string,
  robotId: string,
  channelId: string,
) {
  notify(channelListeners, robotChannelIdentity(targetId, runId, robotId, channelId));
}

export function notifyRobotStatusRuntime(targetId: string, runId: string, robotId: string) {
  notify(statusListeners, robotIdentity(targetId, runId, robotId));
}

export function releaseRunRuntimeState(targetId: string, runId: string) {
  const key = robotRunIdentity(targetId, runId);
  const prefix = `${key}\u0000`;
  runSnapshots.delete(key);
  removePrefixed(robotSnapshots, prefix);
  removePrefixed(statusSnapshots, prefix);
  removePrefixed(channelSnapshots, prefix);
}

export function resetRobotRuntimeState() {
  runSnapshots.clear();
  robotSnapshots.clear();
  channelSnapshots.clear();
  statusSnapshots.clear();
  runListeners.clear();
  robotListeners.clear();
  channelListeners.clear();
  statusListeners.clear();
}

function subscribe(
  registry: Map<string,Set<RobotRuntimeListener>>,
  key: string,
  listener: RobotRuntimeListener,
) {
  let target = registry.get(key);
  if (!target) {
    target = new Set();
    registry.set(key, target);
  }
  target.add(listener);
  return () => {
    target?.delete(listener);
    if (target?.size === 0) registry.delete(key);
  };
}

function notify(registry: Map<string,Set<RobotRuntimeListener>>, key: string) {
  registry.get(key)?.forEach((listener) => listener());
}

function removePrefixed<T>(registry: Map<string,T>, prefix: string) {
  registry.forEach((_value,key) => {
    if (key.startsWith(prefix)) registry.delete(key);
  });
}
