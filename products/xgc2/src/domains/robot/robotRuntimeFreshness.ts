import type {
  RobotChannelChange,
  RobotChannelProjection,
  RunRobot,
} from './robotRuntimeModel';
import {
  getRunRuntimeState,
  getRobotRuntime,
  listRunRobotRuntime,
  notifyRobotChannelRuntime,
  notifyRobotRuntime,
  notifyRobotStatusRuntime,
  setRobotChannelRuntime,
  setRobotRuntime,
  setRobotStatusRuntime,
  updateRunRuntimeState,
} from './robotRuntimeState';

export function normalizeRobotChannelFreshness(
  channel: RobotChannelProjection,
  now: number,
) {
  return {
    ...channel,
    stale: channel.stale || deadlineExpired(channel.staleAt, now),
  };
}

export function normalizeRobotAuthority(robot: RunRobot, now: number): RunRobot {
  const online = robot.online && !deadlineExpired(robot.onlineUntil, now);
  const operationalReady = online
    && robot.operationalReady
    && !deadlineExpired(robot.operationalReadyUntil, now);
  const status = !online
    ? 'offline'
    : !operationalReady && robot.status === 'online'
      ? 'limited'
      : robot.status;
  return { ...robot,online,operationalReady,status };
}

export function nextRunFreshnessDeadline(targetId: string, runId: string) {
  let earliest = Number.POSITIVE_INFINITY;
  listRunRobotRuntime(targetId, runId).forEach((robot) => {
    Object.values(robot.channels).forEach((channel) => {
      if (!channel.stale) earliest = Math.min(earliest, parsedDeadline(channel.staleAt));
    });
    if (robot.online) earliest = Math.min(earliest, parsedDeadline(robot.onlineUntil));
    if (robot.operationalReady) {
      earliest = Math.min(earliest, parsedDeadline(robot.operationalReadyUntil));
    }
  });
  return earliest;
}

export function earliestRobotPatchDeadline(changes: RobotChannelChange[]) {
  let earliest = Number.POSITIVE_INFINITY;
  changes.forEach((change) => {
    if (!change.stale) earliest = Math.min(earliest, parsedDeadline(change.staleAt));
    if (change.online) earliest = Math.min(earliest, parsedDeadline(change.onlineUntil));
    if (change.operationalReady) {
      earliest = Math.min(earliest, parsedDeadline(change.operationalReadyUntil));
    }
  });
  return earliest;
}

export function expireRunRobotFreshness(targetId: string, runId: string) {
  const now = Date.now();
  const changedRobots = new Set<string>();
  const changedStatuses = new Set<string>();
  const changedChannels = new Map<string,Set<string>>();
  listRunRobotRuntime(targetId, runId).forEach((robot) => {
    let channelChanged = false;
    const channels = { ...robot.channels };
    Object.entries(channels).forEach(([channelId,channel]) => {
      if (channel.stale || !deadlineExpired(channel.staleAt, now)) return;
      const next = { ...channel,stale: true };
      channels[channelId] = next;
      setRobotChannelRuntime(targetId, runId, robot.id, next);
      let robotChannels = changedChannels.get(robot.id);
      if (!robotChannels) {
        robotChannels = new Set();
        changedChannels.set(robot.id, robotChannels);
      }
      robotChannels.add(channelId);
      channelChanged = true;
    });
    const nextRobot = normalizeRobotAuthority(channelChanged ? { ...robot,channels } : robot, now);
    const statusChanged = !sameRobotStatus(robot, nextRobot);
    if (!channelChanged && !statusChanged) return;
    setRobotRuntime(targetId, runId, nextRobot);
    changedRobots.add(robot.id);
    if (setRobotStatusRuntime(targetId, runId, nextRobot)) changedStatuses.add(robot.id);
  });
  if (changedStatuses.size > 0) syncProjectionRobotStatuses(targetId, runId, changedStatuses);
  changedChannels.forEach((channels,robotId) => {
    channels.forEach((channelId) => notifyRobotChannelRuntime(targetId, runId, robotId, channelId));
  });
  changedRobots.forEach((robotId) => notifyRobotRuntime(targetId, runId, robotId));
  changedStatuses.forEach((robotId) => notifyRobotStatusRuntime(targetId, runId, robotId));
}

function syncProjectionRobotStatuses(
  targetId: string,
  runId: string,
  changedRobotIds: Set<string>,
) {
  const current = getRunRuntimeState(targetId, runId);
  if (!current.projection) return;
  const robots = current.projection.robots.map((robot) => {
    if (!changedRobotIds.has(robot.id)) return robot;
    const live = getRobotRuntime(targetId, runId, robot.id);
    return live ? {
      ...robot,
      online: live.online,
      operationalReady: live.operationalReady,
      status: live.status,
      onlineUntil: live.onlineUntil,
      operationalReadyUntil: live.operationalReadyUntil,
    } : robot;
  });
  updateRunRuntimeState(targetId, runId, {
    projection: { ...current.projection,robots },
  });
}

function deadlineExpired(deadline: string | undefined, now: number) {
  const parsed = deadline ? Date.parse(deadline) : Number.NaN;
  return !Number.isFinite(parsed) || now >= parsed;
}

function parsedDeadline(deadline: string | undefined) {
  return deadline ? Date.parse(deadline) : Number.NaN;
}

function sameRobotStatus(left: RunRobot, right: RunRobot) {
  return left.online === right.online
    && left.operationalReady === right.operationalReady
    && left.status === right.status;
}
