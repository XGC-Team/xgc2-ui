/**
 * Unitree B2 (quadruped) instrument semantic model.
 *
 * Channel IDs are the contract the B2 Adapter (G4) must publish into Core's
 * robot projection. UI never reads raw ROS or Zenoh — only these channels.
 *
 * Layout modes (shared with other robots): list | single | double board views.
 */

import {
  clamp,
  measuredQuaternion,
  normalizeYaw,
  numberValue,
  objectValue,
  quaternionYawDegrees,
  robotStreamRate,
  stringValue,
  type RobotHealthTone,
} from '../../../../panels/robot/robotTelemetryValues';
import {
  b2CoreSubscriptionReady,
  robotConnectionPresentation,
  type RobotConnectionPresentation,
} from '../../../../panels/robot/robotConnectionPresentation';

/** Channels for full instrument face (single / double board). */
export const b2InstrumentChannels = [
  'state.pose',
  'state.velocity',
  'state.speed',
  'state.power',
  'state.health',
  'state.locomotion',
  'state.joints',
  'diagnostic.link',
  'diagnostic.stream-health',
] as const;

/** Channels for dense list row (slightly fewer than instrument face). */
export const b2ListChannels = [
  'state.pose',
  'state.velocity',
  'state.speed',
  'state.power',
  'state.health',
  'state.locomotion',
  'diagnostic.link',
  'diagnostic.stream-health',
] as const;

/**
 * Backend / Adapter semantic payload shapes (documentation + UI readouts).
 * Core stores latest-value projections only (no SQLite telemetry frames).
 */
export type B2SemanticChannelCatalog = {
  /** nav-style pose: { position:{x,y,z}, orientation:{x,y,z,w} } from /b2/odom */
  'state.pose': {
    position?: { x?: number; y?: number; z?: number };
    orientation?: { x?: number; y?: number; z?: number; w?: number };
  };
  /** twist: { linear:{x,y,z}, angular:{x,y,z} } */
  'state.velocity': {
    linear?: { x?: number; y?: number; z?: number };
    angular?: { x?: number; y?: number; z?: number };
  };
  /** planar speed magnitude m/s */
  'state.speed': { metersPerSecond?: number };
  /**
   * Power from /b2/low_state BMS summary (downsampled 1–5 Hz).
   * percentage: 0–100 or 0–1; voltageV; currentA (signed, discharge negative ok).
   */
  'state.power': {
    percentage?: number;
    voltageV?: number;
    currentA?: number;
  };
  /** Aggregate common health: online, faults[], summary. */
  'state.health': {
    online?: boolean;
    summary?: string;
    faults?: string[];
  };
  /**
   * High-level locomotion / gait if available from driver diagnostics.
   * mode e.g. idle | standing | trotting | unknown
   */
  'state.locomotion': {
    mode?: string;
    motionEnabled?: boolean;
    commandStale?: boolean;
  };
  /**
   * Typed 3104 JointStateSet. G4 owns list bounds; channel metadata owns stale.
   */
  'state.joints': {
    name?: string[];
    position?: number[];
    velocity?: number[];
    effort?: number[];
    joints?: Array<{ name?: string;position?: number;velocity?: number;effort?: number }>;
  };
  /** Cross-host / adapter link quality */
  'diagnostic.link': {
    roundTripTimeMs?: number;
    connected?: boolean;
  };
  /** Per-channel source rates for UI Hz badges */
  'diagnostic.stream-health': {
    channels?: Array<{ channelId?: string; sourceRateHz?: number }>;
  };
};

export type B2RobotInstrumentTelemetry = {
  online: boolean;
  operationalReady: boolean;
  connectionState: string;
  connectionDetail?: string;
  poseFresh: boolean;
  velocityStale: boolean;
  speedStale: boolean;
  powerStale: boolean;
  locomotionStale: boolean;
  healthTone: RobotHealthTone;
  pose: Record<string, unknown>;
  velocity: Record<string, unknown>;
  speed: Record<string, unknown>;
  power: Record<string, unknown>;
  health: Record<string, unknown>;
  locomotion: Record<string, unknown>;
  joints: Record<string, unknown>;
  jointsStale: boolean;
  streamHealth: Record<string, unknown>;
  link: Record<string, unknown>;
  linkStale?: boolean;
  poseSequence?: number;
  speedSequence?: number;
  powerSequence?: number;
  poseObservedAt?: string;
  speedObservedAt?: string;
  powerObservedAt?: string;
};

export type B2RobotInstrumentReadout = {
  online: boolean;
  operationalReady: boolean;
  connectionPresentation: RobotConnectionPresentation;
  streamState: 'live' | 'stale' | 'offline';
  heading: number | null;
  linearSpeed: number | null;
  angularSpeed: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
  battery: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  locomotionMode: string;
  motionEnabled: boolean | null;
  commandStale: boolean;
  jointCount: number | null;
  jointsStale: boolean;
  health: string;
  link: string;
  roundTripTimeMs: number | null;
  pose: 'fresh' | 'stale';
  frequencies: Record<'pose' | 'speed' | 'power', number>;
};

export function b2RobotInstrumentReadout(input: B2RobotInstrumentTelemetry): B2RobotInstrumentReadout {
  const orientation = input.poseFresh ? measuredQuaternion(objectValue(input.pose.orientation)) : null;
  const position = input.poseFresh ? objectValue(input.pose.position) : undefined;
  const percentage = numberValue(input.power.percentage);
  const roundTripTimeMs = numberValue(input.link.roundTripTimeMs);
  const linear = input.velocityStale ? undefined : objectValue(input.velocity.linear);
  const angular = input.velocityStale ? undefined : objectValue(input.velocity.angular);
  const linearSpeed = input.speedStale
    ? null
    : numberValue(input.speed.metersPerSecond) ?? planarSpeed(linear);
  const motionEnabled = typeof input.locomotion.motionEnabled === 'boolean'
    ? input.locomotion.motionEnabled
    : null;
  const commandStale = input.locomotion.commandStale === true;
  const anyStream = input.poseFresh
    || !input.velocityStale
    || !input.speedStale
    || !input.powerStale
    || !input.locomotionStale
    || !input.jointsStale;
  const streamState = !anyStream
    ? 'offline'
    : !input.poseFresh
      || input.velocityStale
      || input.speedStale
      || input.powerStale
      || input.locomotionStale
      || input.jointsStale
      ? 'stale'
      : 'live';
  const connectionPresentation = robotConnectionPresentation({
    connectionState: input.connectionState,
    connectionDetail: input.connectionDetail,
    hasRun: input.healthTone !== 'idle',
    coreReady: b2CoreSubscriptionReady(
      input.linkStale === undefined && Object.keys(input.link).length === 0
        ? undefined
        : { stale: input.linkStale === true },
    ),
  });
  return {
    online: input.online,
    operationalReady: input.healthTone === 'healthy',
    connectionPresentation,
    streamState,
    heading: orientation ? normalizeYaw(quaternionYawDegrees(orientation)) : null,
    linearSpeed,
    angularSpeed: numberValue(angular?.z) ?? null,
    x: numberValue(position?.x) ?? null,
    y: numberValue(position?.y) ?? null,
    z: numberValue(position?.z) ?? null,
    battery: input.powerStale || percentage == null
      ? null
      : clamp(percentage <= 1 ? percentage * 100 : percentage, 0, 100),
    batteryVoltage: input.powerStale ? null : numberValue(input.power.voltageV) ?? null,
    batteryCurrent: input.powerStale ? null : numberValue(input.power.currentA) ?? null,
    locomotionMode: b2LocomotionLabel(input.locomotion),
    motionEnabled,
    commandStale,
    jointCount: b2JointCount(input.joints),
    jointsStale: input.jointsStale,
    health: stringValue(input.health.summary) ?? input.healthTone,
    link: connectionPresentation,
    roundTripTimeMs: roundTripTimeMs == null ? null : Math.max(0, roundTripTimeMs),
    pose: input.poseFresh ? 'fresh' : 'stale',
    frequencies: {
      pose: robotStreamRate(input.streamHealth, 'state.pose'),
      speed: robotStreamRate(input.streamHealth, 'state.speed'),
      power: robotStreamRate(input.streamHealth, 'state.power'),
    },
  };
}

export function b2LocomotionLabel(value?: Record<string, unknown>) {
  const mode = stringValue(value?.mode);
  if (!mode) return '--';
  return mode.replace(/[_-]+/g, ' ').trim().toUpperCase() || '--';
}

function b2JointCount(value: Record<string, unknown>) {
  if (Array.isArray(value.name)) return value.name.length;
  if (Array.isArray(value.joints)) return value.joints.length;
  return null;
}

export function b2HealthTone(input: {
  hasRun: boolean;
  connectionState: string;
  online: boolean;
  operationalReady: boolean;
  healthChannel: { stale?: boolean } | undefined;
  health: Record<string, unknown>;
  poseChannel: { stale?: boolean } | undefined;
}): RobotHealthTone {
  if (!input.hasRun) return 'idle';
  if (input.connectionState !== 'live' || !input.online) return 'unavailable';
  if (!input.healthChannel || input.healthChannel.stale) return 'unavailable';
  if (input.health.online === false) return 'unavailable';
  if (Array.isArray(input.health.faults) && input.health.faults.length > 0) return 'fault';
  if (!input.operationalReady) return 'fault';
  if (input.poseChannel?.stale) return 'fault';
  return 'healthy';
}

function planarSpeed(linear?: Record<string, unknown>) {
  const x = numberValue(linear?.x);
  const y = numberValue(linear?.y);
  if (x == null && y == null) return null;
  return Math.hypot(x ?? 0, y ?? 0);
}
