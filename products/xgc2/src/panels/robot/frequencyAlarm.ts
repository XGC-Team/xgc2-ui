/**
 * HUD frequency tones.
 * Sensor channels: live rate strictly below the floor is danger; `-- Hz` stays white.
 * Command streams the operator must send (setpoint / cmd_vel): ≤2 Hz white, >2 Hz green.
 * Power/battery Hz is informational only: always white.
 */

/** Optical VRPN pose on every robot that has one. Live rate strictly below is danger. */
export const VRPN_FREQUENCY_ALARM_HZ = 100;

/** IMU on every robot that has one. Live rate strictly below is danger. */
export const IMU_FREQUENCY_ALARM_HZ = 10;

/** MAVROS local_position on FS150 HUD LP. Live rate strictly below is danger. */
export const LOCAL_POSITION_FREQUENCY_ALARM_HZ = 15;

export const FLIGHT_FS150_FREQUENCY_ALARM_HZ = {
  'state.imu': IMU_FREQUENCY_ALARM_HZ,
  'state.mocap.pose': VRPN_FREQUENCY_ALARM_HZ,
  'state.pose': LOCAL_POSITION_FREQUENCY_ALARM_HZ,
  // Fusion-input starvation, not a 30 Hz prior. Missing `-- Hz` stays white.
  'state.vision.pose': 10,
} as const;

export const FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ = {
  'state.pose': VRPN_FREQUENCY_ALARM_HZ,
  'state.velocity': 5,
  'state.imu': IMU_FREQUENCY_ALARM_HZ,
} as const;

export const GROUND_FREQUENCY_ALARM_HZ = {
  'state.imu': IMU_FREQUENCY_ALARM_HZ,
  'vrpn.position': VRPN_FREQUENCY_ALARM_HZ,
} as const;

export const COMMAND_STREAM_CHANNEL_IDS = ['setpoint.local', 'command.velocity'] as const;

export const INFORMATIONAL_FREQUENCY_CHANNEL_IDS = ['state.power'] as const;

/** Operator-sent streams: white at or below this, green strictly above. */
export const COMMAND_STREAM_ACTIVE_HZ = 2;

export function isCommandStreamChannel(channelId: string) {
  return (COMMAND_STREAM_CHANNEL_IDS as readonly string[]).includes(channelId);
}

export function isInformationalFrequencyChannel(channelId: string) {
  return (INFORMATIONAL_FREQUENCY_CHANNEL_IDS as readonly string[]).includes(channelId);
}

export function formatAlarmHz(alarmHz: number) {
  return Number.isInteger(alarmHz) ? String(alarmHz) : String(alarmHz);
}

export function frequencyRateMagnitude(rateHz: number, compact = false) {
  if (!(rateHz > 0)) return '--';
  return compact ? String(Math.round(rateHz)) : rateHz.toFixed(1);
}

export function formatFrequencyRateLabel(rateHz: number) {
  return `${frequencyRateMagnitude(rateHz, false)} Hz`;
}

/** Double HUD compact: integer or `--`, then a space, then `Hz`. Never `--Hz`. */
export function formatFrequencyRateCompact(rateHz: number) {
  return `${frequencyRateMagnitude(rateHz, true)} Hz`;
}

export function frequencyValueTone(
  rateHz: number,
  channelId: string,
  sensorAlarmHz?: number,
): 'danger' | 'success' | 'normal' {
  if (isInformationalFrequencyChannel(channelId)) return 'normal';
  if (isCommandStreamChannel(channelId)) {
    return rateHz > COMMAND_STREAM_ACTIVE_HZ ? 'success' : 'normal';
  }
  const floor = sensorAlarmHz ?? 0;
  return rateHz > 0 && rateHz < floor ? 'danger' : 'normal';
}
