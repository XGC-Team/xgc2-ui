import {
  groundCoreSubscriptionReady,
  robotConnectionPresentation,
  type RobotConnectionPresentation,
} from './robotConnectionPresentation';
import {
  booleanValue,
  clamp,
  firstNumber,
  measuredQuaternion,
  normalizeYaw,
  numberValue,
  objectValue,
  quaternionPitchDegrees,
  quaternionRollDegrees,
  quaternionYawDegrees,
  robotStreamRate,
  streamChannelReady,
  streamHealthChannel,
  stringValue,
  twistLinearSpeed2Norm,
  type RobotHealthTone,
} from './robotTelemetryValues';

export const GROUND_POSE_CHANNEL_ID = 'vrpn.position';
export const GROUND_IMU_CHANNEL_ID = 'state.imu';
export const GROUND_COMMAND_CHANNEL_ID = 'command.velocity';
export const GROUND_POWER_CHANNEL_ID = 'state.power';
export const GROUND_CONTROLLER_CHANNEL_ID = 'state.controller';
export const GROUND_IMU_AGE_SOURCE = 'diagnostic.stream-health.channels[state.imu].sourceAgeMs';

export type GroundRobotInstrumentTelemetry = {
  online: boolean;
  operationalReady: boolean;
  connectionState: string;
  connectionDetail?: string;
  poseFresh: boolean;
  healthTone: RobotHealthTone;
  pose: Record<string,unknown>;
  velocity: Record<string,unknown>;
  commandVelocity: Record<string,unknown>;
  speed: Record<string,unknown>;
  power: Record<string,unknown>;
  imu?: Record<string,unknown>;
  chassis?: Record<string,unknown>;
  controller?: Record<string,unknown>;
  health: Record<string,unknown>;
  streamHealth: Record<string,unknown>;
  powerStale?: boolean;
  chassisStale?: boolean;
  controllerStale?: boolean;
  commandSequence?: number;
  velocitySequence?: number;
  speedSequence?: number;
  commandObservedAt?: string;
  velocityObservedAt?: string;
  speedObservedAt?: string;
};

export type GroundRobotInstrumentReadout = {
  online: boolean;
  operationalReady: boolean;
  connectionPresentation: RobotConnectionPresentation;
  roll: number | null;
  pitch: number | null;
  heading: number | null;
  linearSpeed: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
  commandLinear: number | null;
  commandLinearY: number | null;
  actualLinear: number | null;
  commandAngular: number | null;
  actualAngular: number | null;
  linearError: number | null;
  angularError: number | null;
  imuAgeMs: number | null;
  imuStale: boolean;
  imuRate: number;
  commandRate: number;
  battery: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  powerStale: boolean;
  controlMode: string;
  controllerStatus: string;
  hasChassisContract: boolean;
  chassisStale: boolean;
  health: string;
  connectionState: string;
  pose: 'fresh' | 'stale';
  positioningStatus: 'ready' | 'frozen' | 'unavailable';
  frequencies: Record<'position' | 'speed' | 'imu' | 'power' | 'command',number>;
};

export function groundRobotInstrumentReadout(input: GroundRobotInstrumentTelemetry): GroundRobotInstrumentReadout {
  const poseLive = channelLive(input.streamHealth, GROUND_POSE_CHANNEL_ID, input.poseFresh);
  const velocityLive = channelLive(
    input.streamHealth,
    'vrpn.velocity',
    Boolean(objectValue(input.velocity.linear) || objectValue(input.velocity.angular)),
  );
  const commandLive = channelLive(
    input.streamHealth,
    GROUND_COMMAND_CHANNEL_ID,
    Boolean(objectValue(input.commandVelocity.linear) || objectValue(input.commandVelocity.angular)),
  );
  const orientation = poseLive ? measuredQuaternion(objectValue(input.pose.orientation)) : null;
  const position = poseLive ? objectValue(input.pose.position) : undefined;
  const heading = orientation ? normalizeYaw(quaternionYawDegrees(orientation)) : null;
  const commandLinear = commandLive ? objectValue(input.commandVelocity.linear) : undefined;
  const commandAngular = commandLive ? objectValue(input.commandVelocity.angular) : undefined;
  const actualLinearVector = velocityLive ? objectValue(input.velocity.linear) : undefined;
  const actualAngular = velocityLive ? objectValue(input.velocity.angular) : undefined;
  const linearSpeed = twistLinearSpeed2Norm(actualLinearVector);
  const commandLinearValue = numberValue(commandLinear?.x) ?? null;
  const commandLinearYValue = numberValue(commandLinear?.y) ?? null;
  const commandAngularValue = numberValue(commandAngular?.z) ?? null;
  const actualAngularValue = numberValue(actualAngular?.z) ?? null;
  const percentage = stringValue(input.power.percentageState) === 'PERCENTAGE_STATE_AVAILABLE'
    ? firstNumber(input.power, 'percentage')
    : null;
  const batteryVoltage = firstNumber(input.power, 'voltageV', 'voltage_v') ?? null;
  const positioningState = stringValue(objectValue(input.health.positioning)?.state);
  const positioningStatus = groundPositioningStatus(positioningState);
  const imuChannel = streamHealthChannel(input.streamHealth, GROUND_IMU_CHANNEL_ID);
  const powerChannel = streamHealthChannel(input.streamHealth, GROUND_POWER_CHANNEL_ID);
  const connectionPresentation = robotConnectionPresentation({
    connectionState: input.connectionState,
    connectionDetail: input.connectionDetail,
    hasRun: input.healthTone !== 'idle',
    coreReady: groundCoreSubscriptionReady(input.streamHealth),
  });
  const commandLatched = connectionPresentation !== 'disconnected';
  const powerStale = input.powerStale === true || booleanValue(powerChannel?.stale) === true;
  const powerLive = commandLatched && !powerStale;
  const chassisMode = commandLatched ? scoutControlModeLabel(input.chassis) : '--';
  const controllerLive = connectionPresentation !== 'disconnected'
    && input.controllerStale !== true
    && channelLive(
      input.streamHealth,
      GROUND_CONTROLLER_CHANNEL_ID,
      Boolean(stringValue(input.controller?.text)),
    );
  const controllerStatus = controllerLive
    ? (stringValue(input.controller?.text)?.trim() || '--')
    : '--';
  const commandRate = commandLatched
    ? robotStreamRate(input.streamHealth, GROUND_COMMAND_CHANNEL_ID)
    : 0;
  const imuRate = commandLatched
    ? robotStreamRate(input.streamHealth, GROUND_IMU_CHANNEL_ID)
    : 0;
  const powerRate = powerLive
    ? robotStreamRate(input.streamHealth, GROUND_POWER_CHANNEL_ID)
    : 0;
  return {
    online: input.online,
    operationalReady: input.healthTone === 'healthy',
    connectionPresentation,
    roll: orientation ? quaternionRollDegrees(orientation) : null,
    pitch: orientation ? quaternionPitchDegrees(orientation) : null,
    heading,
    linearSpeed,
    x: numberValue(position?.x) ?? null,
    y: numberValue(position?.y) ?? null,
    z: numberValue(position?.z) ?? null,
    commandLinear: commandLatched ? commandLinearValue : null,
    commandLinearY: commandLatched ? commandLinearYValue : null,
    actualLinear: linearSpeed,
    commandAngular: commandLatched ? commandAngularValue : null,
    actualAngular: actualAngularValue,
    linearError: commandLatched
      ? responseError(linearSpeed, twistLinearSpeed2Norm(commandLinear))
      : null,
    angularError: commandLatched
      ? responseError(actualAngularValue, commandAngularValue)
      : null,
    imuAgeMs: firstNumber(imuChannel, 'sourceAgeMs', 'source_age_ms') ?? null,
    imuStale: booleanValue(imuChannel?.stale) === true,
    imuRate,
    commandRate,
    battery: percentage == null
      ? null
      : clamp(percentage <= 1 ? percentage * 100 : percentage,0,100),
    batteryVoltage: powerLive ? batteryVoltage : null,
    batteryCurrent: powerLive ? firstNumber(input.power, 'currentA', 'current_a') ?? null : null,
    powerStale,
    controlMode: chassisMode,
    controllerStatus,
    hasChassisContract: chassisMode !== '--',
    chassisStale: input.chassisStale === true,
    health: stringValue(input.health.summary) ?? input.healthTone,
    connectionState: input.connectionState.trim().toLowerCase(),
    pose: poseLive ? 'fresh' : 'stale',
    positioningStatus,
    frequencies: {
      position: robotStreamRate(input.streamHealth, GROUND_POSE_CHANNEL_ID),
      speed: robotStreamRate(input.streamHealth,'vrpn.speed'),
      imu: imuRate,
      power: powerRate,
      command: commandRate,
    },
  };
}

type ScoutChassisSemantic = 'remote' | 'command' | 'uart';

/** Scout Mini native: 0 and 1 are command CAN, 2 UART, 3 remote. */
export function scoutChassisSemantic(value?: Record<string,unknown>): ScoutChassisSemantic | undefined {
  switch (stringValue(value?.controlMode)) {
    case 'CONTROL_MODE_REMOTE': return 'remote';
    case 'CONTROL_MODE_COMMAND_CAN': return 'command';
    case 'CONTROL_MODE_COMMAND_UART': return 'uart';
  }
  switch (numberValue(value?.controlMode)) {
    case 1: return 'remote';
    case 2: return 'command';
    case 3: return 'uart';
  }
  switch (firstNumber(value, 'nativeControlMode')) {
    case 0:
    case 1: return 'command';
    case 2: return 'uart';
    case 3: return 'remote';
  }
  return undefined;
}

export function scoutControlModeLabel(value?: Record<string,unknown>) {
  switch (scoutChassisSemantic(value)) {
    case 'remote': return 'RC';
    case 'command': return 'CMD';
    case 'uart': return 'UART';
  }
  const native = firstNumber(value, 'nativeControlMode');
  return native == null ? '--' : `MODE ${native}`;
}

export function scoutChassisModeTone(value?: Record<string,unknown>) {
  switch (scoutChassisSemantic(value)) {
    case 'command': return 'success';
    case 'remote':
    case 'uart': return 'danger';
    default: return 'normal';
  }
}

function groundPositioningStatus(
  positioningState: string | undefined,
): GroundRobotInstrumentReadout['positioningStatus'] {
  if (
    positioningState === 'POSITIONING_STATE_ACTIVE'
    || positioningState === 'POSITIONING_STATE_STABLE'
    || positioningState === 'POSITIONING_STATE_MOVING'
  ) {
    return 'ready';
  }
  if (
    positioningState === 'POSITIONING_STATE_FROZEN'
    || positioningState === 'POSITIONING_STATE_JITTERING'
    || positioningState === 'POSITIONING_STATE_WARMING_UP'
  ) {
    return 'frozen';
  }
  return 'unavailable';
}

function channelLive(
  streamHealth: Record<string,unknown>,
  channelId: string,
  fallback: boolean,
) {
  return streamHealthChannel(streamHealth, channelId)
    ? streamChannelReady(streamHealth, channelId)
    : fallback;
}

function responseError(actual: number | null, command: number | null) {
  return actual == null || command == null ? null : actual - command;
}
