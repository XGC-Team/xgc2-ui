// Fixture-only telemetry for the developer instrument visual surface.
// Every value here is simulated; the gallery page marks itself as FIXTURE and
// must never be read as live robot data. Builders mirror the current unit
// test fixtures (RobotListProjection.test.tsx / GroundRobotInstrument.test.tsx
// / FlightRobotInstrument.test.tsx) so the reviewed tree matches tested truth.

import type { RobotPanelItem } from '../../../src/panels/robot/robotProjectionModel';
import type { RobotProjectionChannels } from '../../../src/panels/robot/useRobotProjectionChannels';

export type InstrumentFixtureKind = 'scout' | 'mecanum' | 'fs150' | 'wall4';
export type InstrumentFixtureBattery = 'healthy96' | 'low6' | 'full100' | 'missing';

export const instrumentFixtureBatteries: readonly InstrumentFixtureBattery[] = [
  'healthy96','low6','full100','missing',
];

export function fixtureRobotIds(kind: InstrumentFixtureKind): readonly string[] {
  if (kind === 'wall4') return ['ugv-01','ugv-02','ugv-03','ugv-04'];
  if (kind === 'mecanum') return ['ugv-05'];
  if (kind === 'fs150') return ['uav-01'];
  return ['ugv-01'];
}

export function fixtureRobot(kind: Exclude<InstrumentFixtureKind,'wall4'>, id: string, name: string): RobotPanelItem {
  const base: RobotPanelItem = {
    id,
    robotAssetId: `fixture-asset-${id}`,
    robotAssetCommitId: 'fixture-commit',
    robotAssetDigest: 'fixture-digest',
    name,
    kind: 'scout_mini',
    hybridSource: 'physical',
    profileId: 'scout-mini.ros1.v6',
    namespace: `/${id}`,
    scout: { managementAddress: '192.0.2.10' },
    operationContracts: [],
    connectionEpoch: 1,
    connectionState: 'live',
    connectionRevision: 1,
    online: true,
    operationalReady: true,
    status: 'online',
    channels: {},
  };
  if (kind === 'mecanum') {
    return {
      ...base,
      kind: 'mecanum_ugv',
      profileId: 'mecanum-ugv.ros1.v3',
      scout: undefined,
      mecanum: { mocapRigidBodyName: id },
    };
  }
  if (kind === 'fs150') {
    return {
      ...base,
      kind: 'px4_multirotor',
      profileId: 'px4-multirotor.ros1.v1',
      scout: undefined,
      px4: { modelId: 'fs150',mavSystemId: 1,managementIp: '192.0.2.20',mocapRigidBodyName: id },
    };
  }
  return base;
}

type FixtureChannel = {
  channelId: string;
  sequence: number;
  messageId: number;
  observedAt: string;
  sourceAgeMs: number;
  staleAt: string;
  stale: boolean;
  value: Record<string,unknown>;
};

function liveChannel(channelId: string, value: Record<string,unknown> = {}): FixtureChannel {
  const now = Date.now();
  return {
    channelId,
    sequence: 8,
    messageId: 8,
    observedAt: new Date(now - 20).toISOString(),
    sourceAgeMs: 20,
    staleAt: new Date(now + 980).toISOString(),
    stale: false,
    value,
  };
}

function fixturePower(kind: Exclude<InstrumentFixtureKind,'wall4'>, battery: InstrumentFixtureBattery): Record<string,unknown> {
  if (battery === 'missing') return {};
  const percentage = battery === 'healthy96' ? 96 : battery === 'low6' ? 6 : 100;
  const voltageV = kind === 'scout'
    ? (battery === 'low6' ? 21.2 : 28.9)
    : kind === 'mecanum'
      ? (battery === 'low6' ? 9.9 : 12.35)
      : (battery === 'low6' ? 19.8 : 22.4);
  return { percentageState: 'PERCENTAGE_STATE_AVAILABLE',percentage,voltageV };
}

function groundProjection(kind: 'scout' | 'mecanum', battery: InstrumentFixtureBattery): RobotProjectionChannels {
  const poseChannel = liveChannel('vrpn.position', {
    position: { x: 1.8,y: 0,z: 0.18 },
    orientation: { x: 0,y: 0,z: 0,w: 1 },
  });
  const velocityChannel = liveChannel('vrpn.velocity', {
    linear: { x: 0.21,y: -0.04,z: 0.01 },angular: { z: 0.03 },
  });
  const commandVelocityChannel = liveChannel('command.velocity', {
    linear: { x: 0.32 },angular: { z: -0.18 },
  });
  const imuChannel = liveChannel('state.imu', {
    linearAcceleration: { x: 9.81,y: 0,z: 0 },
  });
  const healthChannel = liveChannel('state.health', {
    online: true,summary: 'healthy',faults: [],
    positioning: {
      state: 'POSITIONING_STATE_STABLE',
      reason: 'POSITIONING_REASON_STATIONARY_WINDOW_STABLE',
      observedAgeMs: 20,windowSpreadM: 0.004,sampleCount: 12,
    },
  });
  const power = fixturePower(kind, battery);
  const channels: Record<string,FixtureChannel> = {
    'vrpn.position': poseChannel,
    'vrpn.velocity': velocityChannel,
    'vrpn.speed': liveChannel('vrpn.speed', { metersPerSecond: 0 }),
    'command.velocity': commandVelocityChannel,
    'state.imu': imuChannel,
    'state.health': healthChannel,
    'state.controller': liveChannel('state.controller', { text: 'Ready' }),
  };
  if (battery !== 'missing') channels['state.power'] = liveChannel('state.power', power);
  if (kind === 'scout') {
    channels['state.chassis'] = liveChannel('state.chassis', {
      controlMode: 'CONTROL_MODE_COMMAND_CAN',nativeControlMode: 1,
    });
  }
  return {
    status: { online: true,operationalReady: true,status: 'online' },
    flight: false,
    flightPresentation: 'fs150',
    telemetryChannelIds: {
      pose: 'vrpn.position',
      velocity: 'vrpn.velocity',
      speed: 'vrpn.speed',
      link: undefined,
      mocapPose: undefined,
      localizationError: undefined,
      setpoint: undefined,
    },
    mocapRotor: false,
    kindProjection: undefined,
    channels,
    flightState: {},
    poseChannel,
    pose: poseChannel.value,
    velocity: velocityChannel.value,
    speed: { metersPerSecond: 0 },
    localizationError: {},
    commandVelocityChannel,
    commandVelocity: commandVelocityChannel.value,
    imu: imuChannel.value,
    power,
    healthChannel,
    health: healthChannel.value,
    chassis: channels['state.chassis']?.value ?? {},
    controller: { text: 'Ready' },
    locomotion: {},
    joints: {},
    mocap: undefined,
    setpoint: undefined,
    fcuLink: {},
    streamHealth: { channels: [
      { channelId: 'vrpn.position',sourceRateHz: 50,sourceAgeMs: 8,stale: false },
      { channelId: 'vrpn.speed',sourceRateHz: 50 },
      { channelId: 'vrpn.velocity',sourceRateHz: 50 },
      { channelId: 'state.imu',sourceRateHz: 80,sourceAgeMs: 14,stale: false },
      { channelId: 'state.power',sourceRateHz: 1.5 },
      { channelId: 'command.velocity',sourceRateHz: 20 },
      { channelId: 'state.controller',sourceRateHz: 5,stale: false },
    ] },
  } as RobotProjectionChannels;
}

function flightProjection(battery: InstrumentFixtureBattery): RobotProjectionChannels {
  const base = groundProjection('scout', battery);
  const poseChannel = liveChannel('state.pose', {
    position: { x: 0.5,y: 0.4,z: 1.1 },
    orientation: { x: 0,y: 0,z: 0,w: 1 },
  });
  const mocap = liveChannel('state.mocap.pose', {
    position: { x: 2.1,y: 0.3,z: 1.2 },
    orientation: { x: 0,y: 0,z: 0,w: 1 },
  });
  const power = fixturePower('fs150', battery);
  const channels: Record<string,FixtureChannel> = {
    'state.pose': poseChannel,
    'state.mocap.pose': mocap,
    'state.mocap.velocity': liveChannel('state.mocap.velocity', { linear: { x: 0.3,y: 0.4,z: 0 } }),
    'state.mocap.speed': liveChannel('state.mocap.speed', { metersPerSecond: 0.4 }),
    'diagnostic.fcu-link': liveChannel('diagnostic.fcu-link', { roundTripTimeMs: 18 }),
    'state.flight': liveChannel('state.flight', { connected: true,mode: 'OFFBOARD',armed: true,landedState: 1 }),
    'state.controller': liveChannel('state.controller', { text: 'Ready' }),
  };
  if (battery !== 'missing') channels['state.power'] = liveChannel('state.power', power);
  return {
    ...base,
    flight: true,
    flightPresentation: 'fs150',
    telemetryChannelIds: {
      pose: 'state.pose',
      velocity: 'state.velocity',
      speed: 'state.mocap.speed',
      link: 'diagnostic.fcu-link',
      mocapPose: 'state.mocap.pose',
      localizationError: 'state.localization.error',
      setpoint: 'setpoint.local',
    },
    channels,
    poseChannel,
    pose: poseChannel.value,
    mocap,
    speed: { metersPerSecond: 0.4 },
    localizationError: { meters: 0.458 },
    power,
    health: {
      positioning: {
        state: 'POSITIONING_STATE_ACTIVE',
        reason: 'POSITIONING_REASON_MOTION_DETECTED',
        observedAgeMs: 8,windowSpreadM: 0.01,sampleCount: 5,
      },
    },
    flightState: { connected: true,mode: 'OFFBOARD',armed: true,landedState: 1 },
    controller: { text: 'Ready' },
    fcuLink: { roundTripTimeMs: 18 },
    streamHealth: { channels: [
      { channelId: 'state.pose',sourceRateHz: 30 },
      { channelId: 'state.imu',sourceRateHz: 50,stale: false },
      { channelId: 'state.mocap.pose',sourceRateHz: 50 },
      { channelId: 'state.mocap.velocity',sourceRateHz: 50 },
      { channelId: 'state.mocap.speed',sourceRateHz: 50 },
      { channelId: 'setpoint.local',sourceRateHz: 10 },
      { channelId: 'state.controller',sourceRateHz: 5,stale: false },
    ] },
  } as RobotProjectionChannels;
}

export function fixtureProjection(kind: Exclude<InstrumentFixtureKind,'wall4'>, battery: InstrumentFixtureBattery): RobotProjectionChannels {
  return kind === 'fs150' ? flightProjection(battery) : groundProjection(kind, battery);
}

export function fixtureRobotName(kind: Exclude<InstrumentFixtureKind,'wall4'>, id: string): string {
  const upper = id.toUpperCase();
  const prefix = kind === 'fs150' ? 'UAV' : 'UGV';
  return upper.startsWith(`${prefix}-`) ? upper : upper.replace(prefix, `${prefix}-`);
}
