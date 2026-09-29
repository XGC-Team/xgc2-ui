import {
  robotConnectionPresentation,
  px4CoreSubscriptionReady,
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
  type RobotInstrumentVector,
} from './robotTelemetryValues';

/** FS150 HUD RTT: live ms strictly above this is danger; missing `--` stays white. */
export const FCU_ROUND_TRIP_ALARM_MS = 15;

export function roundTripTimeTone(ms: number | null | undefined): 'danger' | 'normal' {
  return ms != null && Number.isFinite(ms) && ms > FCU_ROUND_TRIP_ALARM_MS ? 'danger' : 'normal';
}

/** PX4 OFFBOARD is programmatic control; other modes stay white. */
export function flightModeTone(mode: string | null | undefined): 'success' | 'normal' {
  return typeof mode === 'string' && mode.trim().toUpperCase() === 'OFFBOARD' ? 'success' : 'normal';
}

/** PX4 unlocked (ARMED) is success green; DISARMED and missing stay white. */
export function flightArmedTone(armed: boolean | null | undefined): 'success' | 'normal' {
  return armed === true ? 'success' : 'normal';
}

/** HUD and list MODE/ARM gate: Core flight stale, never Adapter stream-health. */
export function flightPedestalLive(input: {
  connectionPresentation: RobotConnectionPresentation;
  flightChannelStale?: boolean;
}): boolean {
  return input.connectionPresentation !== 'disconnected'
    && input.flightChannelStale !== true;
}

export type FlightRobotInstrumentTelemetry = {
  presentation: 'fs150' | 'mocap_rotor';
  online: boolean;
  connectionState: string;
  connectionDetail?: string;
  linkFresh: boolean;
  poseFresh: boolean;
  mocapState: 'fresh' | 'stale' | 'missing';
  healthTone: RobotHealthTone;
  flight: Record<string,unknown>;
  pose: Record<string,unknown>;
  mocapPose: Record<string,unknown>;
  imu: Record<string,unknown>;
  localVelocity: Record<string,unknown>;
  mocapVelocity: Record<string,unknown>;
  mocapSpeed: Record<string,unknown>;
  localizationError: Record<string,unknown>;
  localSetpoint: Record<string,unknown>;
  localSetpointState: 'fresh' | 'stale' | 'missing';
  power: Record<string,unknown>;
  health?: Record<string,unknown>;
  controller?: Record<string,unknown>;
  streamHealth: Record<string,unknown>;
  fcuLink: Record<string,unknown>;
  /** Core `channels['state.flight'].stale`. Missing is not stale. */
  flightChannelStale?: boolean;
};

export type FlightRobotInstrumentReadout = {
  presentation: 'fs150' | 'mocap_rotor';
  online: boolean;
  connectionPresentation: RobotConnectionPresentation;
  linkReady: boolean;
  connected: boolean;
  armed: boolean | null;
  mode: string;
  flightStage: string;
  roll: number | null;
  pitch: number | null;
  yaw: number | null;
  speed: number | null;
  altitude: number | null;
  climb: number | null;
  positionErrorCm: number | null;
  x: number | null;
  y: number | null;
  mocapPosition: RobotInstrumentVector;
  mocapVelocity: RobotInstrumentVector;
  localSetpoint: string;
  battery: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  roundTripTimeMs: number | null;
  positioning: boolean;
  positioningStatus: 'ready' | 'frozen' | 'unavailable';
  mocap: string;
  healthTone: RobotHealthTone;
  frequencies: Record<'imu' | 'power' | 'localPosition' | 'mocapPosition' | 'mocapVelocity' | 'localSetpoint' | 'visionPose',number>;
};

export function flightRobotInstrumentReadout(input: FlightRobotInstrumentTelemetry): FlightRobotInstrumentReadout {
  const connected = booleanValue(input.flight.connected) === true;
  const imuLive = channelLive(input.streamHealth,'state.imu',Boolean(objectValue(input.imu.orientation)));
  const quaternion = imuLive ? measuredQuaternion(objectValue(input.imu.orientation)) : null;
  const poseLive = input.poseFresh;
  const velocityLive = channelLive(
    input.streamHealth,
    'state.velocity',
    Boolean(objectValue(input.localVelocity.linear)),
  );
  const mocapLinear = input.mocapState === 'fresh' ? objectValue(input.mocapVelocity.linear) : undefined;
  const localLinear = velocityLive ? objectValue(input.localVelocity.linear) : undefined;
  const vrpnLinear = vrpnTwistLinear(input);
  const vrpnPosition = vrpnHeightPosition(input);
  const position = poseLive ? objectValue(input.pose.position) : undefined;
  const mocapPosition = input.mocapState === 'fresh' ? objectValue(input.mocapPose.position) : undefined;
  const percentage = firstNumber(input.power, 'percentage');
  const positioningState = stringValue(objectValue(input.health?.positioning)?.state);
  const positioningStatus = input.presentation === 'mocap_rotor'
    ? input.poseFresh ? 'ready' : 'unavailable'
    : adapterPositioningStatus(positioningState);
  const rtt = firstNumber(input.fcuLink, 'roundTripTimeMs', 'round_trip_time_ms');
  const connectionPresentation = robotConnectionPresentation({
    connectionState: input.connectionState,
    connectionDetail: input.connectionDetail,
    hasRun: input.healthTone !== 'idle',
    coreReady: px4CoreSubscriptionReady({
      flight: input.flight,
      streamHealth: input.streamHealth,
    }),
  });
  // Missing Core state.flight is not stale; recovering may still show last MODE.
  const robotOwnedLive = connectionPresentation !== 'disconnected';
  const pedestalLive = flightPedestalLive({
    connectionPresentation,
    flightChannelStale: input.flightChannelStale,
  });
  const controllerLive = robotOwnedLive
    && channelLive(input.streamHealth, 'state.controller', Boolean(stringValue(input.controller?.text)));
  const imuAttitudeLive = robotOwnedLive && imuLive;
  const attitude = imuAttitudeLive ? quaternion : null;
  const powerChannel = streamHealthChannel(input.streamHealth, 'state.power');
  const powerLive = robotOwnedLive && booleanValue(powerChannel?.stale) !== true;
  const climbLive = robotOwnedLive && velocityLive;
  return {
    presentation: input.presentation,
    online: input.online,
    connectionPresentation,
    linkReady: input.linkFresh,
    connected,
    armed: pedestalLive ? booleanValue(input.flight.armed) ?? null : null,
    mode: pedestalLive ? stringValue(input.flight.mode) ?? '--' : '--',
    flightStage: input.presentation === 'mocap_rotor'
      ? (pedestalLive
        ? flightStageLabel(firstNumber(input.flight, 'landedState', 'landed_state'))
        : '--')
      : (controllerLive
        ? (stringValue(input.controller?.text)?.trim() || '--')
        : '--'),
    roll: attitude ? clamp(quaternionRollDegrees(attitude), -30, 30) : null,
    pitch: attitude ? clamp(quaternionPitchDegrees(attitude), -30, 30) : null,
    yaw: attitude ? normalizeYaw(quaternionYawDegrees(attitude)) : null,
    speed: twistLinearSpeed2Norm(vrpnLinear),
    altitude: numberValue(vrpnPosition?.z) ?? null,
    climb: climbLive ? numberValue(localLinear?.z) ?? null : null,
    positionErrorCm: scaledNonNegative(input.localizationError.meters, 100),
    x: numberValue(position?.x) ?? null,
    y: numberValue(position?.y) ?? null,
    mocapPosition: instrumentVector(mocapPosition),
    mocapVelocity: instrumentVector(mocapLinear),
    localSetpoint: robotOwnedLive
      ? localSetpointLabel(input.localSetpointState,input.localSetpoint)
      : '--',
    battery: percentage == null ? null : clamp(percentage <= 1 ? percentage * 100 : percentage,0,100),
    batteryVoltage: powerLive ? firstNumber(input.power, 'voltageV', 'voltage_v') ?? null : null,
    batteryCurrent: powerLive ? firstNumber(input.power, 'currentA', 'current_a') ?? null : null,
    roundTripTimeMs: robotOwnedLive && rtt != null ? Math.max(0,rtt) : null,
    positioning: positioningStatus === 'ready',
    positioningStatus,
    mocap: input.mocapState === 'missing' ? '--' : input.mocapState,
    healthTone: input.healthTone,
    frequencies: {
      imu: robotOwnedLive ? robotStreamRate(input.streamHealth,'state.imu') : 0,
      power: powerLive ? robotStreamRate(input.streamHealth,'state.power') : 0,
      localPosition: robotOwnedLive ? robotStreamRate(input.streamHealth,'state.pose') : 0,
      mocapPosition: robotStreamRate(input.streamHealth,'state.mocap.pose'),
      mocapVelocity: robotStreamRate(
        input.streamHealth,
        input.presentation === 'mocap_rotor' ? 'state.velocity' : 'state.mocap.velocity',
      ),
      localSetpoint: robotOwnedLive ? robotStreamRate(input.streamHealth,'setpoint.local') : 0,
      visionPose: robotOwnedLive ? robotStreamRate(input.streamHealth,'state.vision.pose') : 0,
    },
  };
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

function adapterPositioningStatus(
  positioningState: string | undefined,
): FlightRobotInstrumentReadout['positioningStatus'] {
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

function vrpnTwistLinear(input: FlightRobotInstrumentTelemetry) {
  if (input.presentation === 'mocap_rotor') {
    return channelLive(input.streamHealth,'state.velocity',true)
      ? objectValue(input.localVelocity.linear)
      : undefined;
  }
  return input.mocapState === 'fresh' ? objectValue(input.mocapVelocity.linear) : undefined;
}

function vrpnHeightPosition(input: FlightRobotInstrumentTelemetry) {
  if (input.presentation === 'mocap_rotor') {
    return input.poseFresh ? objectValue(input.pose.position) : undefined;
  }
  return input.mocapState === 'fresh' ? objectValue(input.mocapPose.position) : undefined;
}

export function flightStageLabel(value: unknown) {
  switch (typeof value === 'number' ? value : numberValue(value)) {
    case 1: return 'GROUND';
    case 2: return 'AIRBORNE';
    case 3: return 'TAKEOFF';
    case 4: return 'LANDING';
    default: return '--';
  }
}

function instrumentVector(value?: Record<string,unknown>): RobotInstrumentVector {
  return { x: numberValue(value?.x) ?? null,y: numberValue(value?.y) ?? null,z: numberValue(value?.z) ?? null };
}

function localSetpointLabel(state: FlightRobotInstrumentTelemetry['localSetpointState'], value: Record<string,unknown>) {
  if (state === 'missing') return '--';
  if (state === 'stale') return 'stale';
  const frame = (stringValue(value.coordinateFrame) ?? 'frame?').replace('LOCAL_COORDINATE_FRAME_','');
  const fields = numberValue(value.validFields);
  return fields == null ? frame : `${frame} · 0x${fields.toString(16)}`;
}

function scaledNonNegative(value: unknown, scale: number) {
  const number = numberValue(value);
  return number == null ? null : Math.max(0,number * scale);
}
