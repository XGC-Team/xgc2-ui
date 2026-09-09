export function normalizeRobotTargetId(targetId: string) {
  return targetId.trim() || 'local';
}

export function robotRunIdentity(targetId: string, runId: string) {
  return `${normalizeRobotTargetId(targetId)}\u0000${runId}`;
}

export function robotIdentity(targetId: string, runId: string, robotId: string) {
  return `${robotRunIdentity(targetId, runId)}\u0000${robotId}`;
}

export function robotChannelIdentity(
  targetId: string,
  runId: string,
  robotId: string,
  channelId: string,
) {
  return `${robotIdentity(targetId, runId, robotId)}\u0000${channelId}`;
}
