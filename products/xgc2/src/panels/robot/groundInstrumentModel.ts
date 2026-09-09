import {
  booleanValue,
  clamp,
  firstNumber,
  normalizeYaw,
  normalizedQuaternion,
  numberValue,
  objectValue,
  quaternionPitchDegrees,
  quaternionRollDegrees,
  quaternionYawDegrees,
  robotStreamRate,
  stringValue,
  twistLinearSpeed2Norm,
  type RobotHealthTone,
} from './robotTelemetryValues';

export const GROUND_POSE_CHANNEL_ID = 'vrpn.position';
export const GROUND_IMU_CHANNEL_ID = 'state.imu';
export const GROUND_COMMAND_CHANNEL_ID = 'command.velocity';
export const GROUND_POWER_CHANNEL_ID = 'state.power';
export const GROUND_IMU_AGE_SOURCE = 'diagnostic.stream-health.channels[state.imu].sourceAgeMs';

export type GroundRobotInstrumentTelemetry = {
  online: boolean;
  operationalReady: boolean;
  connectionState: string;
  poseFresh: boolean;
  healthTone: RobotHealthTone;
  pose: Record<string,unknown>;
  velocity: Record<string,unknown>;
  commandVelocity: Record<string,unknown>;
  speed: Record<string,unknown>;
  power: Record<string,unknown>;
  imu?: Record<string,unknown>;
  chassis?: Record<string,unknown>;
  health: Record<string,unknown>;
  streamHealth: Record<string,unknown>;
  powerStale?: boolean;
  chassisStale?: boolean;
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
  hasChassisContract: boolean;
  chassisStale: boolean;
  health: string;
  connectionState: string;
  pose: 'fresh' | 'stale';
  positioningStatus: 'ready' | 'frozen' | 'unavailable';
  frequencies: Record<'position' | 'speed' | 'imu' | 'power' | 'command',number>;
};

export function groundRobotInstrumentReadout(input: GroundRobotInstrumentTelemetry): GroundRobotInstrumentReadout {
  const orientation = objectValue(input.pose.orientation);
  const position = objectValue(input.pose.position);
  const hasOrientation = Boolean(orientation && ['x','y','z','w'].some((axis) => numberValue(orientation[axis]) != null));
  const quaternion = hasOrientation ? normalizedQuaternion(orientation) : null;
  const heading = quaternion ? normalizeYaw(quaternionYawDegrees(quaternion)) : null;
  const commandLinear = objectValue(input.commandVelocity.linear);
  const commandAngular = objectValue(input.commandVelocity.angular);
  const actualLinearVector = objectValue(input.velocity.linear);
  const actualAngular = objectValue(input.velocity.angular);
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
  const positioningStatus = groundPositioningStatus(positioningState, input.poseFresh);
  const imuChannel = streamChannel(input.streamHealth, GROUND_IMU_CHANNEL_ID);
  const powerChannel = streamChannel(input.streamHealth, GROUND_POWER_CHANNEL_ID);
  const chassisMode = scoutControlModeLabel(input.chassis);
  return {
    online: input.online,
    operationalReady: input.healthTone === 'healthy',
    roll: quaternion ? quaternionRollDegrees(quaternion) : null,
    pitch: quaternion ? quaternionPitchDegrees(quaternion) : null,
    heading,
    linearSpeed,
    x: numberValue(position?.x) ?? null,
    y: numberValue(position?.y) ?? null,
    z: numberValue(position?.z) ?? null,
    commandLinear: commandLinearValue,
    commandLinearY: commandLinearYValue,
    actualLinear: linearSpeed,
    commandAngular: commandAngularValue,
    actualAngular: actualAngularValue,
    linearError: responseError(linearSpeed, twistLinearSpeed2Norm(commandLinear)),
    angularError: responseError(actualAngularValue, commandAngularValue),
    imuAgeMs: firstNumber(imuChannel, 'sourceAgeMs', 'source_age_ms') ?? null,
    imuStale: booleanValue(imuChannel?.stale) === true,
    imuRate: robotStreamRate(input.streamHealth, GROUND_IMU_CHANNEL_ID),
    commandRate: robotStreamRate(input.streamHealth, GROUND_COMMAND_CHANNEL_ID),
    battery: percentage == null
      ? null
      : clamp(percentage <= 1 ? percentage * 100 : percentage,0,100),
    batteryVoltage,
    batteryCurrent: firstNumber(input.power, 'currentA', 'current_a') ?? null,
    powerStale: input.powerStale === true || booleanValue(powerChannel?.stale) === true,
    controlMode: chassisMode,
    hasChassisContract: chassisMode !== '--',
    chassisStale: input.chassisStale === true,
    health: stringValue(input.health.summary) ?? input.healthTone,
    connectionState: input.connectionState.trim().toLowerCase(),
    pose: input.poseFresh ? 'fresh' : 'stale',
    positioningStatus,
    frequencies: {
      position: robotStreamRate(input.streamHealth, GROUND_POSE_CHANNEL_ID),
      speed: robotStreamRate(input.streamHealth,'vrpn.speed'),
      imu: robotStreamRate(input.streamHealth, GROUND_IMU_CHANNEL_ID),
      power: robotStreamRate(input.streamHealth, GROUND_POWER_CHANNEL_ID),
      command: robotStreamRate(input.streamHealth, GROUND_COMMAND_CHANNEL_ID),
    },
  };
}

export function scoutControlModeLabel(value?: Record<string,unknown>) {
  switch (stringValue(value?.controlMode)) {
    case 'CONTROL_MODE_REMOTE': return 'RC';
    case 'CONTROL_MODE_COMMAND_CAN': return 'CMD';
    case 'CONTROL_MODE_COMMAND_UART': return 'UART';
  }
  const native = firstNumber(value, 'nativeControlMode');
  return native == null ? '--' : `MODE ${native}`;
}

export function scoutChassisModeTone(value?: Record<string,unknown>) {
  switch (stringValue(value?.controlMode)) {
    case 'CONTROL_MODE_COMMAND_CAN': return 'success';
    case 'CONTROL_MODE_REMOTE':
    case 'CONTROL_MODE_COMMAND_UART': return 'danger';
    default: return 'normal';
  }
}

function groundPositioningStatus(
  positioningState: string | undefined,
  poseFresh: boolean,
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
  if (positioningState) return 'unavailable';
  return poseFresh ? 'ready' : 'unavailable';
}

function responseError(actual: number | null, command: number | null) {
  return actual == null || command == null ? null : actual - command;
}

function streamChannel(health: Record<string,unknown>, channelId: string) {
  const channels = Array.isArray(health.channels) ? health.channels : [];
  return channels.map(objectValue).find((item) => (
    item?.channelId === channelId || item?.channel_id === channelId
  ));
}
