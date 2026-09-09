import { validRobotProfileId } from './robotAssetAuthoring';
import { PX4_MODEL_FS150,PX4_MODEL_MOCAP_ROTOR } from './robotAssetContracts';
import {
  isRecord,
  nonEmptyString,
  safeInteger,
  validDateTime,
  validRobotOperationID,
} from './robotContractPrimitives';
import type {
  RobotChannelChange,
  RobotChannelProjection,
  RobotConnectionReset,
  RunRobot,
} from './robotRuntimeModel';

const canonicalSignedInteger = /^(?:0|-?[1-9][0-9]*)$/;
const minimumSignedInt64 = -9223372036854775808n;
const maximumSignedInt64 = 9223372036854775807n;

export function isRunRobot(value: unknown): value is RunRobot {
  if (!isRecord(value)) return false;
  const robot = value as Partial<RunRobot>;
  if (!nonEmptyString(robot.id)
    || !nonEmptyString(robot.robotAssetId)
    || !nonEmptyString(robot.robotAssetCommitId)
    || !nonEmptyString(robot.robotAssetDigest)
    || !nonEmptyString(robot.name)
    || !nonEmptyString(robot.kind)
    || (robot.hybridSource !== 'simulation' && robot.hybridSource !== 'physical')
    || typeof robot.profileId !== 'string'
    || !validRobotProfileId(robot.profileId)
    || !nonEmptyString(robot.namespace)
    || !Array.isArray(robot.operationContracts)
    || !validRobotOperationContracts(robot.operationContracts)
    || !nonEmptyString(robot.adapterDefinitionId)
    || !validRobotConnection(robot)
    || !validRobotAuthority(robot)
    || (robot.px4 !== undefined && !isRunRobotPX4(robot.px4))
    || (robot.scout !== undefined && !isRunRobotScout(robot.scout))
    || (robot.mecanum !== undefined && !isRunRobotMecanum(robot.mecanum))
    || [robot.px4,robot.scout,robot.mecanum].filter((arm) => arm !== undefined).length > 1
    || !isRecord(robot.channels)) return false;
  // Channel decoding is deliberately NOT part of robot acceptance: one channel
  // the browser cannot decode used to reject the robot, and one rejected robot
  // rejects the whole fleet snapshot, so a single unknown sample blanked every
  // instrument. runRobotWithDecodableChannels drops exactly the undecodable
  // channels instead. A non-live connection still cannot carry channels: it has
  // no authority to vouch for their freshness, and rendering them would show a
  // stale value as live.
  return robot.connectionState === 'live' || (
    robot.online === false
    && robot.operationalReady === false
    && robot.status === 'offline'
    && robot.onlineUntil === undefined
    && robot.operationalReadyUntil === undefined
    && Object.keys(robot.channels).length === 0
  );
}

/**
 * Keep every channel that decodes and is filed under its own channel ID; drop
 * only the ones that do not. Returns the same reference when nothing is
 * dropped so an untouched snapshot stays referentially stable for memos.
 */
export function runRobotWithDecodableChannels(robot: RunRobot): RunRobot {
  const entries = Object.entries(robot.channels);
  const decodable = entries.filter(([channelID, channel]) => (
    isRobotChannelProjection(channel) && channelID === channel.channelId
  ));
  return decodable.length === entries.length
    ? robot
    : { ...robot,channels: Object.fromEntries(decodable) };
}

export function isRobotChannelChange(value: unknown): value is RobotChannelChange {
  if (!isRecord(value)) return false;
  const change = value as Partial<RobotChannelChange>;
  return nonEmptyString(change.robotId)
    && safeInteger(change.connectionEpoch, 1)
    && validRobotAuthority(change)
    && isRobotChannelProjection(change);
}

export function isRobotConnectionReset(value: unknown): value is RobotConnectionReset {
  if (!isRecord(value)) return false;
  const reset = value as Partial<RobotConnectionReset>;
  return nonEmptyString(reset.robotId)
    && safeInteger(reset.connectionEpoch, 1)
    && isLiveConnectionState(reset.state)
    && safeInteger(reset.revision, 1)
    && (reset.detail === undefined || typeof reset.detail === 'string');
}

function validRobotOperationContracts(value: unknown[]): boolean {
  const ids = new Set<string>();
  return value.every((candidate) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['id','parameterSchema'])) return false;
    const contract = candidate as { id?: unknown;parameterSchema?: unknown };
    if (!validRobotOperationID(contract.id)
      || ids.has(contract.id)
      || !isStrictObjectParameterSchema(contract.parameterSchema)) return false;
    ids.add(contract.id);
    return true;
  });
}

function isStrictObjectParameterSchema(value: unknown): value is Record<string,unknown> {
  if (!isRecord(value) || value.type !== 'object' || value.additionalProperties !== false) return false;
  const properties = value.properties;
  if (!isRecord(properties) || !Object.values(properties).every(isRecord)) return false;
  if (value.required === undefined) return true;
  if (!Array.isArray(value.required)) return false;
  const required = new Set<string>();
  return value.required.every((name) => {
    if (typeof name !== 'string' || required.has(name) || !(name in properties)) return false;
    required.add(name);
    return true;
  });
}

function isRunRobotPX4(value: unknown) {
  if (!isRecord(value)) return false;
  return (value.modelId === PX4_MODEL_FS150
      || value.modelId === PX4_MODEL_MOCAP_ROTOR)
    && typeof value.mavSystemId === 'number'
    && safeInteger(value.mavSystemId, 1)
    && value.mavSystemId <= 255
    && typeof value.managementIp === 'string'
    && nonEmptyString(value.mocapRigidBodyName)
    && (value.modelId === PX4_MODEL_MOCAP_ROTOR
      ? value.positioningFrameNumber === 0 && value.positioningComparisonThresholdM === 0
      : typeof value.positioningFrameNumber === 'number'
        && safeInteger(value.positioningFrameNumber, 1)
        && value.positioningFrameNumber <= 999
        && typeof value.positioningComparisonThresholdM === 'number'
        && value.positioningComparisonThresholdM >= 1e-10
        && value.positioningComparisonThresholdM <= 10);
}

function isRunRobotScout(value: unknown) {
  return isRunRobotUGV(value);
}

function isRunRobotMecanum(value: unknown) {
  return isRunRobotUGV(value);
}

function isRunRobotUGV(value: unknown) {
  return isRecord(value)
    && hasExactKeys(value, [
      'managementAddress','connector','telemetryRemotePort','controlLocalPort','mocapRigidBodyName',
      'positioningFrameNumber','positioningComparisonThresholdM',
    ])
    && typeof value.managementAddress === 'string'
    && value.connector === 'swarm_ros_bridge'
    && typeof value.telemetryRemotePort === 'number'
    && safeInteger(value.telemetryRemotePort, 1)
    && value.telemetryRemotePort <= 65535
    && typeof value.controlLocalPort === 'number'
    && safeInteger(value.controlLocalPort, 1)
    && value.controlLocalPort <= 65535
    && typeof value.mocapRigidBodyName === 'string'
    && /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(value.mocapRigidBodyName)
    && typeof value.positioningFrameNumber === 'number'
    && safeInteger(value.positioningFrameNumber, 1)
    && value.positioningFrameNumber <= 999
    && typeof value.positioningComparisonThresholdM === 'number'
    && value.positioningComparisonThresholdM >= 1e-10
    && value.positioningComparisonThresholdM <= 10;
}

function validRobotConnection(robot: Partial<RunRobot>) {
  if (!safeInteger(robot.connectionEpoch, 0)
    || !safeInteger(robot.connectionRevision, 0)
    || !isRobotConnectionState(robot.connectionState)
    || (robot.connectionDetail !== undefined && typeof robot.connectionDetail !== 'string')) return false;
  if (robot.connectionState === 'inactive') {
    return robot.connectionEpoch === 0
      && robot.connectionRevision === 0
      && robot.connectionDetail === undefined;
  }
  return (robot.connectionEpoch ?? 0) > 0 && (robot.connectionRevision ?? 0) > 0;
}

function validRobotAuthority(value: {
  online?: unknown;
  operationalReady?: unknown;
  status?: unknown;
  onlineUntil?: unknown;
  operationalReadyUntil?: unknown;
}) {
  if (typeof value.online !== 'boolean'
    || typeof value.operationalReady !== 'boolean'
    || !isRobotStatus(value.status)
    || !validOptionalDeadline(value.onlineUntil)
    || !validOptionalDeadline(value.operationalReadyUntil)) return false;
  if (!value.online) {
    return !value.operationalReady
      && value.status === 'offline'
      && value.onlineUntil === undefined
      && value.operationalReadyUntil === undefined;
  }
  if (!validDateTime(value.onlineUntil)) return false;
  if (!value.operationalReady) {
    return value.status === 'limited' && value.operationalReadyUntil === undefined;
  }
  return value.status === 'online'
    && validDateTime(value.operationalReadyUntil)
    && Date.parse(value.operationalReadyUntil) <= Date.parse(value.onlineUntil);
}

function isRobotChannelProjection(value: unknown): value is RobotChannelProjection {
  if (!isRecord(value)) return false;
  const channel = value as Partial<RobotChannelProjection>;
  return nonEmptyString(channel.channelId)
    && safeInteger(channel.sequence, 0)
    && safeInteger(channel.messageId, 1)
    && (channel.sourceTime === undefined || isRobotSourceTime(channel.sourceTime))
    && validDateTime(channel.observedAt)
    && safeInteger(channel.sourceAgeMs, 0)
    && validDateTime(channel.staleAt)
    && typeof channel.stale === 'boolean'
    && isRecord(channel.value);
}

function isRobotSourceTime(value: unknown) {
  if (!isRecord(value)) return false;
  return typeof value.nanoseconds === 'string'
    && canonicalSignedInteger.test(value.nanoseconds)
    && value.nanoseconds.length <= 20
    && signedInt64(value.nanoseconds)
    && typeof value.clockDomain === 'number'
    && Number.isSafeInteger(value.clockDomain);
}

function signedInt64(value: string) {
  const parsed = BigInt(value);
  return parsed >= minimumSignedInt64 && parsed <= maximumSignedInt64;
}

function isRobotConnectionState(value: unknown): value is RunRobot['connectionState'] {
  return value === 'inactive' || isLiveConnectionState(value);
}

function isLiveConnectionState(value: unknown): value is RobotConnectionReset['state'] {
  return value === 'opening' || value === 'live' || value === 'closed' || value === 'revoked';
}

function isRobotStatus(value: unknown): value is RunRobot['status'] {
  return value === 'online' || value === 'limited' || value === 'offline';
}

function validOptionalDeadline(value: unknown) {
  return value === undefined || validDateTime(value);
}

function hasExactKeys(value: Record<string,unknown>, expected: string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => key in value);
}
