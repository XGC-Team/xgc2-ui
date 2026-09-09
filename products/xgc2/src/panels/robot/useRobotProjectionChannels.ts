import { useRobotChannelBundle,useRunRobotStatus } from '../../domains/robot/robotPublic';
import {
  MECANUM_UGV_KIND,
  PX4_MULTIROTOR_KIND,
  useRobotAssetKindComposition,
  type RobotAssetKindPanelProjection,
} from '../../domains/robot/robotAssetPublic';
import { isMocapRotor,isPX4Multirotor,type RobotPanelItem } from './robotProjectionModel';

/** Scout Mini adapter streams. No FCU link; lights are not on the radio contract. */
export const groundListMetricChannelIds = {
  position: 'vrpn.position',
  velocity: 'vrpn.velocity',
  speed: 'vrpn.speed',
  acceleration: 'vrpn.acceleration',
  command: 'command.velocity',
  power: 'state.power',
  imu: 'state.imu',
  health: 'state.health',
  chassis: 'state.chassis',
} as const;

export const scoutInstrumentChannels = [
  'vrpn.position','vrpn.velocity','vrpn.speed','command.velocity',
  'state.imu','state.power','state.health','state.chassis','diagnostic.stream-health',
] as const;

export const scoutListChannels = [
  ...scoutInstrumentChannels,
  groundListMetricChannelIds.acceleration,
] as const;

/** Mecanum has IMU, PowerVoltage, health, and cmd_vel. It has no chassis_state. */
export const mecanumInstrumentChannels = [
  'vrpn.position','vrpn.velocity','vrpn.speed','command.velocity',
  'state.imu','state.power','state.health','diagnostic.stream-health',
] as const;

export const mecanumListChannels = [
  ...mecanumInstrumentChannels,
  groundListMetricChannelIds.acceleration,
] as const;

export function groundRobotTelemetryChannels(
  robot: Pick<RobotPanelItem,'kind' | 'mecanum'>,
  instrument: boolean,
) {
  if (robot.kind === MECANUM_UGV_KIND) {
    return instrument ? mecanumInstrumentChannels : mecanumListChannels;
  }
  return instrument ? scoutInstrumentChannels : scoutListChannels;
}

// If the product model telemetry table is missing, still subscribe to MAVROS
// local pose/velocity/flight so the HUD is not an empty `--` board.
const fallbackPx4InstrumentChannels = [
  'state.flight','state.pose','state.velocity','state.imu','state.power','state.health',
  'state.mocap.pose','state.mocap.velocity','state.mocap.speed','state.localization.error',
  'setpoint.local','diagnostic.fcu-link','diagnostic.stream-health',
] as const;

const fallbackPx4ListChannels = [
  'state.flight','state.pose','state.velocity','state.power','state.health',
  'state.mocap.pose','state.mocap.velocity','state.mocap.speed','state.localization.error',
  'setpoint.local','diagnostic.fcu-link','diagnostic.stream-health',
] as const;

function channelIdsForRobot(
  robot: RobotPanelItem,
  instrument: boolean,
  px4Telemetry: ReturnType<typeof px4TelemetryForRobot>,
  kindProjection?: RobotAssetKindPanelProjection,
) {
  if (isPX4Multirotor(robot)) {
    if (instrument) return px4Telemetry?.instrumentChannels ?? fallbackPx4InstrumentChannels;
    return px4Telemetry?.listChannels ?? fallbackPx4ListChannels;
  }
  if (kindProjection) {
    return instrument ? kindProjection.instrumentChannels : kindProjection.listChannels;
  }
  return groundRobotTelemetryChannels(robot, instrument);
}

function px4TelemetryForRobot(
  robot: RobotPanelItem,
  composition: ReturnType<typeof useRobotAssetKindComposition>,
) {
  if (!isPX4Multirotor(robot)) return undefined;
  const modelId = requiredPX4ProjectionModelId(robot);
  return composition
    .contributionByProtocolKind(PX4_MULTIROTOR_KIND)
    ?.productModels
    ?.find((model) => model.id === modelId)
    ?.telemetry;
}

export function requiredPX4ProjectionModelId(robot: Pick<RobotPanelItem,'kind' | 'px4'>) {
  if (!isPX4Multirotor(robot)) return undefined;
  const modelId=robot.px4?.modelId;
  if (!modelId) throw new Error('PX4 runtime projection requires an explicit modelId.');
  return modelId;
}

export function useRobotProjectionChannels({ targetId,runId,robot,instrument }: {
  targetId: string;
  runId?: string;
  robot: RobotPanelItem;
  instrument: boolean;
}) {
  const composition = useRobotAssetKindComposition();
  const status = useRunRobotStatus(targetId, runId, robot.id);
  const flight = isPX4Multirotor(robot);
  const mocapRotor = isMocapRotor(robot);
  const px4Telemetry = px4TelemetryForRobot(robot, composition);
  const kindProjection = flight
    ? undefined
    : composition.contributionByProtocolKind(robot.kind)?.panelProjection;
  const channels = useRobotChannelBundle(
    targetId,
    runId,
    robot.id,
    channelIdsForRobot(robot, instrument, px4Telemetry, kindProjection),
    'compact',
  );
  const value = (channelId: string) => channels[channelId]?.value ?? {};
  const optionalValue = (channelId?: string) => channelId ? value(channelId) : {};
  const poseChannelId = flight
    ? px4Telemetry?.poseChannelId ?? 'state.pose'
    : kindProjection?.poseChannelId ?? 'vrpn.position';
  const velocityChannelId = flight
    ? px4Telemetry?.velocityChannelId ?? 'state.velocity'
    : kindProjection?.velocityChannelId ?? 'vrpn.velocity';
  const speedChannelId = flight
    ? px4Telemetry?.speedChannelId ?? 'state.speed'
    : kindProjection?.speedChannelId ?? 'vrpn.speed';
  const linkChannelId = flight
    ? px4Telemetry?.linkChannelId
    : kindProjection?.linkChannelId;

  return {
    status,
    flight,
    flightPresentation: px4Telemetry?.presentation ?? (mocapRotor ? 'mocap_rotor' : 'fs150'),
    telemetryChannelIds: {
      pose: poseChannelId,
      velocity: velocityChannelId,
      speed: speedChannelId,
      link: linkChannelId,
      mocapPose: px4Telemetry?.mocapPoseChannelId,
      localizationError: px4Telemetry?.localizationErrorChannelId,
      setpoint: px4Telemetry?.setpointChannelId,
    },
    mocapRotor,
    kindProjection,
    channels,
    flightState: value('state.flight'),
    poseChannel: channels[poseChannelId],
    pose: value(poseChannelId),
    velocity: value(velocityChannelId),
    speed: value(speedChannelId),
    localizationError: optionalValue(px4Telemetry?.localizationErrorChannelId),
    commandVelocityChannel: channels['command.velocity'],
    commandVelocity: value('command.velocity'),
    imu: value('state.imu'),
    power: value('state.power'),
    healthChannel: channels['state.health'],
    health: value('state.health'),
    chassis: value('state.chassis'),
    locomotion: value('state.locomotion'),
    joints: value('state.joints'),
    mocap: px4Telemetry?.mocapPoseChannelId
      ? channels[px4Telemetry.mocapPoseChannelId]
      : undefined,
    setpoint: px4Telemetry?.setpointChannelId
      ? channels[px4Telemetry.setpointChannelId]
      : undefined,
    fcuLink: optionalValue(linkChannelId),
    streamHealth: value('diagnostic.stream-health'),
  };
}

export type RobotProjectionChannels = ReturnType<typeof useRobotProjectionChannels>;
