import { describe,expect,it } from 'vitest';
import {
  COMMAND_STREAM_ACTIVE_HZ,
  FLIGHT_FS150_FREQUENCY_ALARM_HZ,
  FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ,
  GROUND_FREQUENCY_ALARM_HZ,
  IMU_FREQUENCY_ALARM_HZ,
  LOCAL_POSITION_FREQUENCY_ALARM_HZ,
  VRPN_FREQUENCY_ALARM_HZ,
  formatFrequencyRateCompact,
  formatFrequencyRateLabel,
  frequencyRateMagnitude,
  frequencyValueTone,
  isCommandStreamChannel,
  isInformationalFrequencyChannel,
} from './frequencyAlarm';

describe('frequencyAlarm', () => {
  it('treats setpoint and cmd_vel as operator-sent command streams', () => {
    expect(isCommandStreamChannel('setpoint.local')).toBe(true);
    expect(isCommandStreamChannel('command.velocity')).toBe(true);
    expect(isCommandStreamChannel('state.imu')).toBe(false);
    expect(isInformationalFrequencyChannel('state.power')).toBe(true);
    expect(isInformationalFrequencyChannel('state.imu')).toBe(false);
    expect(COMMAND_STREAM_ACTIVE_HZ).toBe(2);
  });

  it('keeps command streams white at or below 2 Hz and green strictly above', () => {
    expect(frequencyValueTone(0, 'setpoint.local')).toBe('normal');
    expect(frequencyValueTone(2, 'setpoint.local')).toBe('normal');
    expect(frequencyValueTone(2.01, 'setpoint.local')).toBe('success');
    expect(frequencyValueTone(3, 'setpoint.local')).toBe('success');
    expect(frequencyValueTone(0, 'command.velocity')).toBe('normal');
    expect(frequencyValueTone(2, 'command.velocity')).toBe('normal');
    expect(frequencyValueTone(10, 'command.velocity')).toBe('success');
    expect(frequencyValueTone(1, 'setpoint.local', 3)).toBe('normal');
    expect(frequencyValueTone(1, 'command.velocity', 5)).toBe('normal');
  });

  it('paints sensor channels red only when live rate is strictly below the floor', () => {
    expect(frequencyValueTone(0, 'state.imu', FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.imu'])).toBe('normal');
    expect(frequencyValueTone(10, 'state.imu', FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.imu'])).toBe('normal');
    expect(frequencyValueTone(9.9, 'state.imu', FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.imu'])).toBe('danger');
    expect(frequencyValueTone(0, 'state.vision.pose', FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.vision.pose'])).toBe('normal');
    expect(frequencyValueTone(9, 'state.vision.pose', FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.vision.pose'])).toBe('danger');
    expect(frequencyValueTone(28.4, 'state.vision.pose', FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.vision.pose'])).toBe('normal');
  });

  it('keeps battery power frequency white at any measured rate', () => {
    expect(frequencyValueTone(0, 'state.power')).toBe('normal');
    expect(frequencyValueTone(0.4, 'state.power', 0.5)).toBe('normal');
    expect(frequencyValueTone(1, 'state.power', 0.5)).toBe('normal');
    expect(frequencyValueTone(10, 'state.power')).toBe('normal');
    expect(GROUND_FREQUENCY_ALARM_HZ).not.toHaveProperty('state.power');
    expect(GROUND_FREQUENCY_ALARM_HZ).not.toHaveProperty('state.health');
    expect(FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ).not.toHaveProperty('state.power');
  });

  it('paints every robot VRPN pose red strictly below 100 Hz', () => {
    expect(VRPN_FREQUENCY_ALARM_HZ).toBe(100);
    expect(FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.mocap.pose']).toBe(100);
    expect(GROUND_FREQUENCY_ALARM_HZ['vrpn.position']).toBe(100);
    expect(FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ['state.pose']).toBe(100);
    expect(frequencyValueTone(0, 'state.mocap.pose', VRPN_FREQUENCY_ALARM_HZ)).toBe('normal');
    expect(frequencyValueTone(100, 'state.mocap.pose', VRPN_FREQUENCY_ALARM_HZ)).toBe('normal');
    expect(frequencyValueTone(99.9, 'state.mocap.pose', VRPN_FREQUENCY_ALARM_HZ)).toBe('danger');
    expect(frequencyValueTone(50, 'vrpn.position', VRPN_FREQUENCY_ALARM_HZ)).toBe('danger');
    expect(frequencyValueTone(5, 'state.pose', VRPN_FREQUENCY_ALARM_HZ)).toBe('danger');
  });

  it('keeps a space between the placeholder or digits and Hz', () => {
    expect(frequencyRateMagnitude(0, true)).toBe('--');
    expect(frequencyRateMagnitude(8.4, true)).toBe('8');
    expect(formatFrequencyRateLabel(0)).toBe('-- Hz');
    expect(formatFrequencyRateLabel(8)).toBe('8.0 Hz');
    expect(formatFrequencyRateCompact(0)).toBe('-- Hz');
    expect(formatFrequencyRateCompact(8.4)).toBe('8 Hz');
    expect(formatFrequencyRateCompact(0)).not.toBe('--Hz');
    expect(formatFrequencyRateCompact(8.4)).not.toBe('8Hz');
  });

  it('paints FS150 local position red strictly below 15 Hz', () => {
    expect(LOCAL_POSITION_FREQUENCY_ALARM_HZ).toBe(15);
    expect(FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.pose']).toBe(15);
    expect(FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ['state.pose']).toBe(100);
    expect(frequencyValueTone(0, 'state.pose', LOCAL_POSITION_FREQUENCY_ALARM_HZ)).toBe('normal');
    expect(frequencyValueTone(15, 'state.pose', LOCAL_POSITION_FREQUENCY_ALARM_HZ)).toBe('normal');
    expect(frequencyValueTone(14.9, 'state.pose', LOCAL_POSITION_FREQUENCY_ALARM_HZ)).toBe('danger');
    expect(frequencyValueTone(9, 'state.pose', LOCAL_POSITION_FREQUENCY_ALARM_HZ)).toBe('danger');
  });

  it('paints every robot IMU red strictly below 10 Hz', () => {
    expect(IMU_FREQUENCY_ALARM_HZ).toBe(10);
    expect(FLIGHT_FS150_FREQUENCY_ALARM_HZ['state.imu']).toBe(10);
    expect(GROUND_FREQUENCY_ALARM_HZ['state.imu']).toBe(10);
    expect(FLIGHT_MOCAP_ROTOR_FREQUENCY_ALARM_HZ['state.imu']).toBe(10);
    expect(frequencyValueTone(0, 'state.imu', IMU_FREQUENCY_ALARM_HZ)).toBe('normal');
    expect(frequencyValueTone(10, 'state.imu', IMU_FREQUENCY_ALARM_HZ)).toBe('normal');
    expect(frequencyValueTone(8, 'state.imu', IMU_FREQUENCY_ALARM_HZ)).toBe('danger');
  });
});
