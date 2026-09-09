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

export type FlightRobotInstrumentTelemetry = {
  presentation: 'fs150' | 'mocap_rotor';
  online: boolean;
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
  streamHealth: Record<string,unknown>;
  fcuLink: Record<string,unknown>;
};

export type FlightRobotInstrumentReadout = {
  presentation: 'fs150' | 'mocap_rotor';
  online: boolean;
  linkReady: boolean;
  connected: boolean;
  armed: boolean | null;
  mode: string;
  flightStage: string;
  roll: number;
  pitch: number;
  yaw: number;
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
  const connected = booleanValue(input.flight.connected) ?? input.online;
  const orientation = objectValue(input.imu.orientation) ?? objectValue(input.pose.orientation);
  const mocapLinear = input.mocapState === 'fresh' ? objectValue(input.mocapVelocity.linear) : undefined;
  const localLinear = objectValue(input.localVelocity.linear);
  // Climb stays MAVROS-local. Left/right rulers are VRPN twist 2-norm and VRPN z.
  const vrpnLinear = vrpnTwistLinear(input);
  const vrpnPosition = vrpnHeightPosition(input);
  const linear = localLinear;
  const position = objectValue(input.pose.position);
  const mocapPosition = input.mocapState === 'fresh' ? objectValue(input.mocapPose.position) : undefined;
  const quaternion = normalizedQuaternion(orientation);
  const percentage = firstNumber(input.power, 'percentage');
  const positioningState = stringValue(objectValue(input.health?.positioning)?.state);
  const positioningStatus = input.presentation === 'fs150'
    ? positioningState === 'POSITIONING_STATE_ACTIVE'
      ? 'ready'
      : positioningState === 'POSITIONING_STATE_FROZEN' ? 'frozen' : 'unavailable'
    : input.poseFresh ? 'ready' : 'unavailable';
  const rtt = firstNumber(input.fcuLink, 'roundTripTimeMs', 'round_trip_time_ms');
  return {
    presentation: input.presentation,
    online: input.online && connected,
    linkReady: input.linkFresh,
    connected,
    armed: connected ? booleanValue(input.flight.armed) ?? false : null,
    mode: stringValue(input.flight.mode) ?? '--',
    flightStage: flightStageLabel(firstNumber(input.flight, 'landedState', 'landed_state')),
    roll: clamp(quaternionRollDegrees(quaternion), -30, 30),
    pitch: clamp(quaternionPitchDegrees(quaternion), -30, 30),
    yaw: normalizeYaw(quaternionYawDegrees(quaternion)),
    speed: twistLinearSpeed2Norm(vrpnLinear),
    altitude: numberValue(vrpnPosition?.z) ?? null,
    climb: numberValue(linear?.z) ?? null,
    positionErrorCm: scaledNonNegative(input.localizationError.meters, 100),
    x: numberValue(position?.x) ?? null,
    y: numberValue(position?.y) ?? null,
    mocapPosition: instrumentVector(mocapPosition),
    mocapVelocity: instrumentVector(mocapLinear),
    localSetpoint: localSetpointLabel(input.localSetpointState,input.localSetpoint),
    battery: percentage == null ? null : clamp(percentage <= 1 ? percentage * 100 : percentage,0,100),
    batteryVoltage: firstNumber(input.power, 'voltageV', 'voltage_v') ?? null,
    batteryCurrent: firstNumber(input.power, 'currentA', 'current_a') ?? null,
    roundTripTimeMs: rtt == null ? null : Math.max(0,rtt),
    positioning: positioningStatus === 'ready',
    positioningStatus,
    mocap: input.mocapState === 'missing' ? '--' : input.mocapState,
    healthTone: input.healthTone,
    frequencies: {
      imu: robotStreamRate(input.streamHealth,'state.imu'),
      power: robotStreamRate(input.streamHealth,'state.power'),
      localPosition: robotStreamRate(input.streamHealth,'state.pose'),
      mocapPosition: robotStreamRate(input.streamHealth,'state.mocap.pose'),
      mocapVelocity: robotStreamRate(
        input.streamHealth,
        input.presentation === 'mocap_rotor' ? 'state.velocity' : 'state.mocap.velocity',
      ),
      localSetpoint: robotStreamRate(input.streamHealth,'setpoint.local'),
      visionPose: robotStreamRate(input.streamHealth,'state.vision.pose'),
    },
  };
}

function vrpnTwistLinear(input: FlightRobotInstrumentTelemetry) {
  if (input.presentation === 'mocap_rotor') return objectValue(input.localVelocity.linear);
  return input.mocapState === 'fresh' ? objectValue(input.mocapVelocity.linear) : undefined;
}

function vrpnHeightPosition(input: FlightRobotInstrumentTelemetry) {
  if (input.presentation === 'mocap_rotor') return objectValue(input.pose.position);
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
