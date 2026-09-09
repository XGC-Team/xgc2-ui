import type { LocalizedText } from '../../shared/localization/localizedText';
import { firstNumber,objectValue,stringValue } from './robotTelemetryValues';

export const ADAPTER_POSITIONING_SOURCE = 'state.health.positioning';

export type RobotListHeaderStatusTone =
  | 'neutral'
  | 'muted'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger';

export type RobotListHeaderStatusItem = {
  kind: 'latency' | 'power' | 'position';
  role:
    | 'robot-network-indicator'
    | 'robot-power-indicator'
    | 'robot-position-indicator';
  label: string;
  tone: RobotListHeaderStatusTone;
  source?: string;
  value?: number | null;
  active?: boolean;
};

export type RobotListCommunicationStatus = {
  measurement: 'rtt' | 'imu-age';
  milliseconds: number | null;
  source: string;
  stale?: boolean;
  /** MAVROS/FCU connected even when timesync RTT is missing. */
  connected?: boolean;
  warningAfterMs?: number;
  dangerAfterMs?: number;
};

export type RobotListPositioningStatus = {
  state?: string | null;
  reason?: string | null;
  observedAgeMs?: number | null;
  windowSpreadM?: number | null;
  sampleCount?: number | null;
  source?: string;
  stale?: boolean;
  available?: boolean;
  online?: boolean;
};

export const LIST_HEADER_IMU_AGE_WARNING_MS = 500;
export const LIST_HEADER_IMU_AGE_DANGER_MS = 1_000;
/** Displayed SoC (rounded, same integer as the battery glyph). 51% is warning; 50% and below is danger. */
export const LIST_HEADER_BATTERY_WARNING_PERCENT = 51;
export const LIST_HEADER_BATTERY_DANGER_PERCENT = 50;

/** Euclidean ||local pose − VRPN pose|| from adapter `px4.localization-position-error`. */
export const LIST_HEADER_POSITION_ERROR_TITLE =
  'Euclidean ||MAVROS local pose − VRPN pose||. Adapter processor px4.localization-position-error writes state.localization.error.meters as hypot(Δx,Δy,Δz) of /mavros/local_position/pose versus the VRPN pose, compared as received with no extra transform. DistanceEstimate.frame_id is the local pose frame. Not an EKF covariance or threshold flag.';

/** Live VRPN–local distance strictly above this is danger; missing stays white. */
export const VRPN_LOCAL_POSITION_ERROR_ALARM_CM = 10;

export function vrpnLocalPositionErrorTone(cm: number | null | undefined): 'danger' | 'normal' {
  return cm != null && Number.isFinite(cm) && cm > VRPN_LOCAL_POSITION_ERROR_ALARM_CM
    ? 'danger'
    : 'normal';
}

export function listHeaderPositionError(
  meters: number | null | undefined,
  t: LocalizedText = identityRobotText,
): {
  text: string;
  title: string;
  tone: 'danger' | 'normal';
  alarmCm: number;
} | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  const cm = Math.max(0, meters * 100);
  return {
    text:t('POS ERR {error} cm',{ error:cm.toFixed(1) }),
    title:t(LIST_HEADER_POSITION_ERROR_TITLE),
    tone: vrpnLocalPositionErrorTone(cm),
    alarmCm: VRPN_LOCAL_POSITION_ERROR_ALARM_CM,
  };
}

export function listHeaderStatusItems(input: {
  communication?: RobotListCommunicationStatus;
  battery?: {
    percentage?: number | null;
    voltageV?: number | null;
    source?: string;
    stale?: boolean;
  };
  position?: RobotListPositioningStatus;
  /** Before Total Run: keep glyphs muted like UAV HUD. Missing VRPN is not a live fault. */
  idle?: boolean;
}, t: LocalizedText = identityRobotText): RobotListHeaderStatusItem[] {
  const communicationMs = finiteNonNegative(input.communication?.milliseconds);
  const batteryPercentage = normalizedPercentage(input.battery?.percentage);
  const batteryVoltage = finiteNonNegative(input.battery?.voltageV);
  const items: RobotListHeaderStatusItem[] = [
    {
      kind: 'latency',
      role: 'robot-network-indicator',
      label: communicationLabel(input.communication,t),
      tone: communicationTone(input.communication),
      source: input.communication?.source,
      value: communicationMs,
      active: communicationMs != null || input.communication?.connected === true,
    },
    {
      kind: 'position',
      role: 'robot-position-indicator',
      label: positionLabel(input.position,t),
      tone: positionTone(input.position),
      source: input.position?.source,
      active: positionActive(input.position),
    },
    {
      kind: 'power',
      role: 'robot-power-indicator',
      label: batteryStatusLabel(
        batteryPercentage,
        batteryVoltage,
        input.battery?.stale === true,
        t,
      ),
      tone: batteryStatusTone(
        batteryPercentage,
        batteryVoltage,
        input.battery?.stale === true,
      ),
      source: input.battery?.source,
      value: batteryPercentage,
      active: batteryPercentage != null || batteryVoltage != null,
    },
  ];
  if (!input.idle) return items;
  return items.map((item) => ({ ...item,tone: 'muted' as const }));
}

/** Project Adapter `state.health.positioning` only. Never derive liveness from pose/mocap channels. */
export function adapterPositioningStatus(
  health: Record<string,unknown> | undefined,
  options?: { streamStale?: boolean; stale?: boolean; online?: boolean },
): RobotListPositioningStatus {
  const positioning = objectValue(health?.positioning);
  const streamStale = options?.stale === true || options?.streamStale === true;
  if (!positioning) {
    return {
      available: false,
      source: ADAPTER_POSITIONING_SOURCE,
      stale: streamStale,
      online: options?.online,
    };
  }
  const state = stringValue(positioning.state);
  return {
    state,
    reason: stringValue(positioning.reason),
    observedAgeMs: firstNumber(positioning,'observedAgeMs','observed_age_ms') ?? null,
    windowSpreadM: firstNumber(positioning,'windowSpreadM','window_spread_m') ?? null,
    sampleCount: firstNumber(positioning,'sampleCount','sample_count') ?? null,
    source: ADAPTER_POSITIONING_SOURCE,
    stale: streamStale,
    available: state != null && state !== 'POSITIONING_STATE_UNSPECIFIED',
    online: options?.online,
  };
}

export function px4CommunicationStatus(input: {
  roundTripTimeMs: number | null | undefined;
  connected: boolean;
  stale?: boolean;
  source?: string;
}): RobotListCommunicationStatus {
  return {
    measurement: 'rtt',
    milliseconds: finiteNonNegative(input.roundTripTimeMs),
    source: input.source ?? 'diagnostic.fcu-link.roundTripTimeMs',
    stale: input.stale === true,
    connected: input.connected,
  };
}

function finiteNonNegative(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? Math.max(0,value) : null;
}

function normalizedPercentage(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const percentage = value <= 1 ? value * 100 : value;
  return Math.min(100,Math.max(0,percentage));
}

function normalizedText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

export function imuAgeCommunicationStatus(channel: {
  sourceAgeMs?: number | null;
  stale?: boolean;
} | undefined, source = 'state.imu.sourceAgeMs'): RobotListCommunicationStatus | undefined {
  const channelAgeMs = finiteNonNegative(channel?.sourceAgeMs);
  if (channelAgeMs == null && !channel) return undefined;
  return {
    measurement: 'imu-age',
    milliseconds: channelAgeMs,
    source,
    stale: channel?.stale === true,
    warningAfterMs: LIST_HEADER_IMU_AGE_WARNING_MS,
    dangerAfterMs: LIST_HEADER_IMU_AGE_DANGER_MS,
  };
}

function communicationLabel(
  communication: RobotListCommunicationStatus | undefined,
  t: LocalizedText,
) {
  const milliseconds = finiteNonNegative(communication?.milliseconds);
  if (milliseconds == null) {
    if (communication?.measurement === 'imu-age' && communication.stale) {
      return t('Communication freshness from IMU age unavailable; stream stale');
    }
    if (communication?.connected) return t('Communication link connected');
    return t('Communication freshness unavailable');
  }
  if (communication?.measurement === 'imu-age') {
    return t(communication.stale
      ? 'Communication freshness from last IMU receipt age {age} ms; stream stale'
      : 'Communication freshness from last IMU receipt age {age} ms',{
      age:Math.round(milliseconds),
    });
  }
  return t(communication?.stale
    ? 'FCU round-trip time {latency} ms; stream stale'
    : 'FCU round-trip time {latency} ms',{
    latency:milliseconds.toFixed(1),
  });
}

function communicationTone(
  communication: RobotListCommunicationStatus | undefined,
): RobotListHeaderStatusTone {
  const milliseconds = finiteNonNegative(communication?.milliseconds);
  if (communication?.stale) return 'danger';
  if (milliseconds == null) return communication?.connected ? 'info' : 'neutral';
  if (communication?.dangerAfterMs != null && milliseconds >= communication.dangerAfterMs) return 'danger';
  if (communication?.warningAfterMs != null && milliseconds >= communication.warningAfterMs) return 'warning';
  if (communication?.measurement === 'imu-age') return 'success';
  if (milliseconds <= 60) return 'success';
  if (milliseconds <= 100) return 'info';
  if (milliseconds <= 150) return 'warning';
  return 'danger';
}

function batteryStatusLabel(
  percentage: number | null,
  voltageV: number | null,
  stale: boolean,
  t: LocalizedText,
) {
  const voltage = voltageV == null ? null : `${voltageV.toFixed(1)} V`;
  const value = percentage == null
    ? voltage == null
      ? t('Battery status unavailable')
      : t('Battery {voltage}; percentage unavailable',{ voltage })
    : t('Battery {percentage}%{voltage}',{
      percentage:Math.round(percentage),
      voltage:voltage == null ? '' : `; ${voltage}`,
    });
  return stale ? t('{value}; stream stale',{ value }) : value;
}

function batteryStatusTone(
  percentage: number | null,
  voltageV: number | null,
  stale: boolean,
): RobotListHeaderStatusTone {
  return batteryTelemetryTone(percentage,{ voltageV,stale });
}

/**
 * Tone for the integer shown on the battery glyph (`Math.round`).
 * Charge color is SoC only. Stream stale / low Hz must not recolor a 100% pack.
 */
export function batteryTelemetryTone(
  percentage: number | null | undefined,
  options: { voltageV?: number | null; stale?: boolean; muted?: boolean } = {},
): RobotListHeaderStatusTone {
  if (options.muted) return 'muted';
  const displayed = displayedBatteryPercent(percentage);
  if (displayed == null) return options.voltageV == null ? 'neutral' : 'info';
  if (displayed <= LIST_HEADER_BATTERY_DANGER_PERCENT) return 'danger';
  if (displayed <= LIST_HEADER_BATTERY_WARNING_PERCENT) return 'warning';
  if (displayed <= 75) return 'info';
  return 'success';
}

function displayedBatteryPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const percentage = value <= 1 ? value * 100 : value;
  return Math.round(Math.min(100,Math.max(0,percentage)));
}

function positionLabel(position: RobotListPositioningStatus | undefined,t: LocalizedText) {
  const state = normalizedText(position?.state);
  if (state != null && position) return structuredPositionLabel(position,state,t);
  if (!position?.available) return t('VRPN position unavailable');
  const age = finiteNonNegative(position.observedAgeMs);
  const suffix = age == null ? '' : '; age {age} ms';
  const values = age == null ? undefined : { age:Math.round(age) };
  if (position.stale) return t(`VRPN positioning stale${suffix}`,values);
  if (position.online === false) return t(`VRPN positioning offline${suffix}`,values);
  if (position.online !== true) return t(`VRPN positioning freshness unavailable${suffix}`,values);
  return t(`VRPN positioning fresh${suffix}`,values);
}

function positionTone(position: RobotListPositioningStatus | undefined): RobotListHeaderStatusTone {
  const state = normalizedText(position?.state);
  if (position?.stale) return 'danger';
  if (state != null) {
    if (state === 'POSITIONING_STATE_TIMED_OUT') return 'danger';
    if (
      state === 'POSITIONING_STATE_WARMING_UP'
      || state === 'POSITIONING_STATE_JITTERING'
      || state === 'POSITIONING_STATE_FROZEN'
    ) {
      return 'warning';
    }
    if (
      state === 'POSITIONING_STATE_ACTIVE'
      || state === 'POSITIONING_STATE_STABLE'
      || state === 'POSITIONING_STATE_MOVING'
    ) {
      return 'success';
    }
    return 'neutral';
  }
  if (!position?.available) return 'neutral';
  if (position.online === false) return 'danger';
  return position.online === true ? 'info' : 'neutral';
}

function structuredPositionLabel(
  position: RobotListPositioningStatus,
  state: string,
  t: LocalizedText,
) {
  if (state === 'POSITIONING_STATE_UNSPECIFIED') return t('VRPN positioning unavailable');
  const observedAgeMs = finiteNonNegative(position.observedAgeMs);
  const windowSpreadM = finiteNonNegative(position.windowSpreadM);
  const sampleCount = finiteNonNegative(position.sampleCount);
  const details = [
    translatePositionToken(normalizedText(position.reason),/^POSITIONING_REASON_/,t),
    observedAgeMs == null ? null : t('age {age} ms',{ age:Math.round(observedAgeMs) }),
    windowSpreadM == null ? null : t('spread {spread} m',{ spread:windowSpreadM.toFixed(3) }),
    sampleCount == null ? null : t('{count} samples',{ count:Math.round(sampleCount) }),
  ].filter((value): value is string => value != null);
  const stateLabel = translatePositionToken(state,/^POSITIONING_STATE_/,t) ?? state;
  const label = details.length > 0
    ? t('VRPN positioning {state}; {details}',{ state:stateLabel,details:details.join('; ') })
    : t('VRPN positioning {state}',{ state:stateLabel });
  return position.stale ? t('{value}; stream stale',{ value:label }) : label;
}

function positionActive(position: RobotListPositioningStatus | undefined) {
  const state = normalizedText(position?.state);
  if (state != null) {
    return state !== 'POSITIONING_STATE_UNSPECIFIED' && state !== 'POSITIONING_STATE_TIMED_OUT';
  }
  return Boolean(position?.available && position.online && !position.stale);
}

function translatePositionToken(
  value: string | null,
  prefix: RegExp,
  t: LocalizedText,
) {
  if (value == null) return null;
  return t(value.replace(prefix, '').toLowerCase().replaceAll('_',' '));
}

function identityRobotText(text: string,values?: Readonly<Record<string,string | number>>) {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g,(match,key: string) => String(values[key] ?? match));
}
