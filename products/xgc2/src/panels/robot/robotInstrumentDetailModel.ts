import { splitSignedArrayAxis, splitSignedFixed, topicRateLabel } from './robotProjectionModel';
import {
  numberValue,
  objectValue,
  orientationYawDegrees,
  robotStreamRate,
} from './robotTelemetryValues';

export const EMPTY_INSTRUMENT_VECTOR = '-- -- --';
export const EMPTY_INSTRUMENT_YAW = '-- deg';
export const EMPTY_INSTRUMENT_ERROR = '-- cm';
export const EMPTY_INSTRUMENT_DIAGNOSTIC = '--';

export type RobotInstrumentDetailRow = {
  slot: string;
  labelKey: string;
  value: string;
  diagnostic: string;
};

export type RobotInstrumentDetailSource = {
  flight: boolean;
  mocapRotor: boolean;
  kindProjection?: boolean;
  pose: Record<string, unknown>;
  poseStale?: boolean;
  mocap?: { stale?: boolean; value: Record<string, unknown> };
  localizationError: Record<string, unknown>;
  streamHealth?: Record<string, unknown>;
  poseChannelId?: string;
  mocapPoseChannelId?: string;
  localizationErrorChannelId?: string;
  managementAddress?: string;
  pingDiagnostic?: string;
};

function livePose(value: Record<string, unknown> | undefined, stale?: boolean) {
  return !value || stale ? {} : value;
}

export function formatInstrumentVector(position: Record<string, unknown> | undefined) {
  const axes = (['x', 'y', 'z'] as const).map((axis) => {
    const number = numberValue(position?.[axis]);
    if (number == null) return '--';
    const signed = splitSignedArrayAxis(number);
    return `${signed.sign}${signed.digits}`;
  });
  return axes.every((axis) => axis === '--') ? EMPTY_INSTRUMENT_VECTOR : axes.join(' ');
}

export function formatInstrumentYaw(orientation: unknown) {
  const yaw = orientationYawDegrees(orientation);
  if (yaw == null) return EMPTY_INSTRUMENT_YAW;
  const signed = splitSignedFixed(yaw, 2);
  return `${signed.sign}${signed.digits} deg`;
}

export function formatInstrumentErrorCm(meters: unknown) {
  const value = numberValue(meters);
  if (value == null) return EMPTY_INSTRUMENT_ERROR;
  return `${Math.max(0, value * 100).toFixed(1)} cm`;
}

export function formatInstrumentChannelDiagnostic(
  streamHealth: Record<string, unknown> | undefined,
  channelId: string | undefined,
  stale?: boolean,
) {
  if (stale) return 'stale';
  if (!channelId || !streamHealth) return EMPTY_INSTRUMENT_DIAGNOSTIC;
  return topicRateLabel(robotStreamRate(streamHealth, channelId));
}

export function formatInstrumentPingDiagnostic(state?: {
  status: string;
  result?: { reachable: boolean; latencyMs: number };
}) {
  if (!state || state.status === 'checking') return EMPTY_INSTRUMENT_DIAGNOSTIC;
  if (state.status === 'error') return 'fail';
  if (state.result?.reachable) {
    return `${state.result.latencyMs < 1 ? '<1' : Math.round(state.result.latencyMs)} ms`;
  }
  if (state.status === 'unreachable') return 'down';
  return EMPTY_INSTRUMENT_DIAGNOSTIC;
}

export function robotInstrumentManagementAddress(
  robot: {
    px4?: { managementIp?: string };
    scout?: { managementAddress?: string };
  },
  assetSpec?: object,
) {
  const fromRobot = robot.px4?.managementIp?.trim() || robot.scout?.managementAddress?.trim();
  if (fromRobot) return fromRobot;
  if (!assetSpec) return '';
  for (const value of Object.values(assetSpec as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const arm = value as Record<string, unknown>;
    for (const key of ['managementIp', 'managementAddress', 'robotAddress']) {
      const candidate = arm[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }
  return '';
}

function poseRows(
  pose: Record<string, unknown>,
  positionSlot: string,
  positionLabel: string,
  yawSlot: string,
  yawLabel: string,
  diagnostic: string,
): RobotInstrumentDetailRow[] {
  const position = objectValue(pose.position) ?? {};
  return [
    { slot: positionSlot, labelKey: positionLabel, value: formatInstrumentVector(position), diagnostic },
    { slot: yawSlot, labelKey: yawLabel, value: formatInstrumentYaw(pose.orientation), diagnostic },
  ];
}

/** Hover facts: known frontend address + poses. Not a telemetry dump. */
export function robotInstrumentDetailRows(input: RobotInstrumentDetailSource): RobotInstrumentDetailRow[] {
  const pose = livePose(input.pose, input.poseStale);
  const health = input.streamHealth ?? {};
  const address = input.managementAddress?.trim() ?? '';
  const rows: RobotInstrumentDetailRow[] = [{
    slot: 'ip',
    labelKey: 'IP',
    value: address || '--',
    diagnostic: input.pingDiagnostic ?? EMPTY_INSTRUMENT_DIAGNOSTIC,
  }];
  if (input.flight && !input.mocapRotor) {
    const mocap = livePose(input.mocap?.value, input.mocap?.stale);
    const vrpnChannel = input.mocapPoseChannelId || 'state.mocap.pose';
    const localChannel = input.poseChannelId || 'state.pose';
    return [
      ...rows,
      ...poseRows(mocap, 'vrpn-pos', 'VRPN pos', 'vrpn-yaw', 'VRPN yaw',
        formatInstrumentChannelDiagnostic(health, vrpnChannel, input.mocap?.stale)),
      ...poseRows(pose, 'local-pos', 'Local pos', 'local-yaw', 'Local yaw',
        formatInstrumentChannelDiagnostic(health, localChannel, input.poseStale)),
      {
        slot: 'err',
        labelKey: 'ERR',
        value: formatInstrumentErrorCm(input.localizationError.meters),
        diagnostic: formatInstrumentChannelDiagnostic(
          health,
          input.localizationErrorChannelId || 'state.localization.error',
        ),
      },
    ];
  }
  const poseChannel = input.poseChannelId
    || (input.kindProjection ? 'state.pose' : input.flight ? 'state.pose' : 'vrpn.position');
  const poseDiagnostic = formatInstrumentChannelDiagnostic(health, poseChannel, input.poseStale);
  if (input.kindProjection) {
    return [
      ...rows,
      ...poseRows(pose, 'odom-pos', 'Odom pos', 'yaw', 'Yaw', poseDiagnostic),
    ];
  }
  return [
    ...rows,
    ...poseRows(pose, 'vrpn-pos', 'VRPN pos', 'vrpn-yaw', 'VRPN yaw', poseDiagnostic),
  ];
}
