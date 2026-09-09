import type {
  RobotChannelChange,
  RobotConnectionReset,
  RobotPatchEvent,
  RunRobot,
} from './robotRuntimeModel';
import {
  normalizeRobotAuthority,
  normalizeRobotChannelFreshness,
} from './robotRuntimeFreshness';
import {
  getRobotRuntime,
  listRunRobotRuntime,
  notifyRobotChannelRuntime,
  notifyRobotRuntime,
  notifyRobotStatusRuntime,
  removeRobotChannelRuntime,
  removeRobotRuntime,
  setRobotChannelRuntime,
  setRobotRuntime,
  setRobotStatusRuntime,
  getRunRuntimeState,
  updateRunRuntimeState,
} from './robotRuntimeState';

type StagedRobotChange = {
  robotId: string;
  after: RunRobot;
  channelIds: Set<string>;
  connectionReset: boolean;
};

type CommittedRobotChanges = {
  robotIds: Set<string>;
  statusIds: Set<string>;
  channelIds: Map<string,Set<string>>;
  connectionIds: Set<string>;
};

export function installRunRobotProjection(targetId: string, runId: string, robots: RunRobot[]) {
  const now = Date.now();
  const normalized: RunRobot[] = [];
  const incomingRobotIds = new Set<string>();
  const changedChannels = new Map<string,Set<string>>();
  const changedRobotIds = new Set<string>();
  const changedStatusIds = new Set<string>();
  robots.forEach((robot) => {
    incomingRobotIds.add(robot.id);
    const previous = getRobotRuntime(targetId, runId, robot.id);
    const nextChannels = Object.fromEntries(Object.entries(robot.channels).map(([channelId,channel]) => {
      const channelID = channel.channelId || channelId;
      const next = normalizeRobotChannelFreshness({ ...channel,channelId: channelID }, now);
      setRobotChannelRuntime(targetId, runId, robot.id, next);
      addChangedChannel(changedChannels, robot.id, channelID);
      return [channelID,next];
    }));
    Object.keys(previous?.channels ?? {}).forEach((channelId) => {
      if (nextChannels[channelId]) return;
      removeRobotChannelRuntime(targetId, runId, robot.id, channelId);
      addChangedChannel(changedChannels, robot.id, channelId);
    });
    const nextRobot = normalizeRobotAuthority({ ...robot,channels: nextChannels }, now);
    normalized.push(nextRobot);
    setRobotRuntime(targetId, runId, nextRobot);
    changedRobotIds.add(robot.id);
    if (setRobotStatusRuntime(targetId, runId, nextRobot)) changedStatusIds.add(robot.id);
  });
  listRunRobotRuntime(targetId, runId).forEach((robot) => {
    if (!incomingRobotIds.has(robot.id)) removeRobotRuntime(targetId, runId, robot.id);
  });
  changedChannels.forEach((channels,robotId) => {
    channels.forEach((channelId) => notifyRobotChannelRuntime(targetId, runId, robotId, channelId));
  });
  changedRobotIds.forEach((robotId) => notifyRobotRuntime(targetId, runId, robotId));
  changedStatusIds.forEach((robotId) => notifyRobotStatusRuntime(targetId, runId, robotId));
  return normalized;
}

export function applyRunRobotPatch(targetId: string, runId: string, event: RobotPatchEvent) {
  if (event.targetId !== targetId || event.runId !== runId) {
    throw new Error('robot patch does not match the retained run');
  }
  const now = Date.now();
  const staged = stageRobotResets(targetId, runId, event.resets, now);
  stageRobotChanges(targetId, runId, event.changes, now, staged);
  const committed = commitRobotChanges(targetId, runId, staged);
  commitRobotPatchProjection(targetId, runId, committed, event.emittedAt);
  notifyCommittedRobotChanges(targetId, runId, committed);
}

function stageRobotResets(
  targetId: string,
  runId: string,
  resets: RobotConnectionReset[],
  now: number,
) {
  const staged = new Map<string,StagedRobotChange>();
  resets.forEach((reset) => {
    const robotId = reset.robotId.trim();
    const previousStage = staged.get(robotId);
    const currentRobot = previousStage?.after ?? getRobotRuntime(targetId, runId, robotId);
    if (!currentRobot) throw new Error(`robot reset references unknown robot "${robotId}"`);
    if (reset.connectionEpoch < currentRobot.connectionEpoch
      || (reset.connectionEpoch === currentRobot.connectionEpoch
        && reset.revision <= currentRobot.connectionRevision)) return;
    const {
      connectionDetail: _connectionDetail,
      onlineUntil: _onlineUntil,
      operationalReadyUntil: _operationalReadyUntil,
      ...current
    } = currentRobot;
    const after = normalizeRobotAuthority({
      ...current,
      connectionEpoch: reset.connectionEpoch,
      connectionState: reset.state,
      ...(reset.detail === undefined ? {} : { connectionDetail: reset.detail }),
      connectionRevision: reset.revision,
      online: false,
      operationalReady: false,
      status: 'offline',
      channels: {},
    }, now);
    staged.set(robotId, {
      robotId,
      after,
      channelIds: new Set([
        ...(previousStage?.channelIds ?? []),
        ...Object.keys(currentRobot.channels),
      ]),
      connectionReset: true,
    });
  });
  return staged;
}

function stageRobotChanges(
  targetId: string,
  runId: string,
  changes: RobotChannelChange[],
  now: number,
  staged: Map<string,StagedRobotChange>,
) {
  changes.forEach((change) => {
    const robotId = change.robotId.trim();
    const channelId = change.channelId.trim();
    if (!robotId || !channelId) throw new Error('robot patch contains an empty robot or channel ID');
    const stage = staged.get(robotId);
    const currentRobot = stage?.after ?? getRobotRuntime(targetId, runId, robotId);
    if (!currentRobot) throw new Error(`robot patch references unknown robot "${robotId}"`);
    if (change.connectionEpoch < currentRobot.connectionEpoch) return;
    if (change.connectionEpoch > currentRobot.connectionEpoch) {
      throw new Error(`robot patch references future connection epoch for "${robotId}"`);
    }
    if (currentRobot.connectionState !== 'live') return;
    const currentChannel = currentRobot.channels[channelId];
    if (currentChannel && currentChannel.messageId !== change.messageId) {
      throw new Error(`robot patch changes message ID for channel "${channelId}"`);
    }
    if (currentChannel
      && change.sequence <= currentChannel.sequence
      && Date.parse(change.observedAt) <= Date.parse(currentChannel.observedAt)) return;
    const {
      robotId: _robotId,
      connectionEpoch: _connectionEpoch,
      online,
      operationalReady,
      status,
      onlineUntil,
      operationalReadyUntil,
      ...channel
    } = change;
    const nextChannel = normalizeRobotChannelFreshness(channel, now);
    const nextRobot = normalizeRobotAuthority({
      ...currentRobot,
      online,
      operationalReady,
      status,
      onlineUntil,
      operationalReadyUntil,
      channels: { ...currentRobot.channels,[channelId]: nextChannel },
    }, now);
    staged.set(robotId, {
      robotId,
      after: nextRobot,
      channelIds: new Set([...(stage?.channelIds ?? []),channelId]),
      connectionReset: stage?.connectionReset ?? false,
    });
  });
}

function commitRobotChanges(
  targetId: string,
  runId: string,
  staged: Map<string,StagedRobotChange>,
): CommittedRobotChanges {
  const robotIds = new Set<string>();
  const statusIds = new Set<string>();
  const channelIds = new Map<string,Set<string>>();
  const connectionIds = new Set<string>();
  staged.forEach((stage) => {
    setRobotRuntime(targetId, runId, stage.after);
    robotIds.add(stage.robotId);
    stage.channelIds.forEach((channelId) => {
      const channel = stage.after.channels[channelId];
      if (channel) setRobotChannelRuntime(targetId, runId, stage.robotId, channel);
      else removeRobotChannelRuntime(targetId, runId, stage.robotId, channelId);
      addChangedChannel(channelIds, stage.robotId, channelId);
    });
    if (stage.connectionReset) connectionIds.add(stage.robotId);
    if (setRobotStatusRuntime(targetId, runId, stage.after)) statusIds.add(stage.robotId);
  });
  return { robotIds,statusIds,channelIds,connectionIds };
}

function commitRobotPatchProjection(
  targetId: string,
  runId: string,
  committed: CommittedRobotChanges,
  emittedAt: string,
) {
  if (committed.statusIds.size === 0 && committed.connectionIds.size === 0) return;
  const current = getRunRuntimeState(targetId, runId);
  if (!current.projection) return;
  const robots = current.projection.robots.map((robot) => {
    const statusChanged = committed.statusIds.has(robot.id);
    const connectionChanged = committed.connectionIds.has(robot.id);
    if (!statusChanged && !connectionChanged) return robot;
    const live = getRobotRuntime(targetId, runId, robot.id);
    if (live && connectionChanged) return live;
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
    projection: {
      ...current.projection,
      robots,
      updatedAt: committed.connectionIds.size > 0 && emittedAt > current.projection.updatedAt
        ? emittedAt
        : current.projection.updatedAt,
    },
  });
}

function notifyCommittedRobotChanges(
  targetId: string,
  runId: string,
  committed: CommittedRobotChanges,
) {
  committed.channelIds.forEach((channels,robotId) => {
    channels.forEach((channelId) => notifyRobotChannelRuntime(targetId, runId, robotId, channelId));
  });
  committed.robotIds.forEach((robotId) => notifyRobotRuntime(targetId, runId, robotId));
  committed.statusIds.forEach((robotId) => notifyRobotStatusRuntime(targetId, runId, robotId));
}

function addChangedChannel(
  changed: Map<string,Set<string>>,
  robotId: string,
  channelId: string,
) {
  let channels = changed.get(robotId);
  if (!channels) {
    channels = new Set();
    changed.set(robotId, channels);
  }
  channels.add(channelId);
}
