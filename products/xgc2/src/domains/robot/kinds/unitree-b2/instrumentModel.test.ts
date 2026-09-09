import { describe,expect,it } from 'vitest';
import {
  b2HealthTone,
  b2LocomotionLabel,
  b2RobotInstrumentReadout,
  type B2RobotInstrumentTelemetry,
} from './instrumentModel';

function baseTelemetry(overrides: Partial<B2RobotInstrumentTelemetry> = {}): B2RobotInstrumentTelemetry {
  return {
    online: true,
    operationalReady: true,
    connectionState: 'live',
    poseFresh: true,
    velocityStale: false,
    speedStale: false,
    powerStale: false,
    locomotionStale: false,
    healthTone: 'healthy',
    pose: {
      position: { x: 1.25,y: -0.5,z: 0.55 },
      orientation: { x: 0,y: 0,z: 0,w: 1 },
    },
    velocity: {
      linear: { x: 0.8,y: 0,z: 0 },
      angular: { x: 0,y: 0,z: 0.2 },
    },
    speed: { metersPerSecond: 0.8 },
    power: { percentage: 72,voltageV: 47.6,currentA: -1.2 },
    health: { online: true,summary: 'ok',faults: [] },
    locomotion: { mode: 'standing',motionEnabled: false,commandStale: false },
    joints: { name: Array.from({ length: 12 },(_, index) => `joint_${index}`) },
    jointsStale: false,
    streamHealth: {
      channels: [
        { channelId: 'state.pose',sourceRateHz: 15 },
        { channelId: 'state.speed',sourceRateHz: 15 },
        { channelId: 'state.power',sourceRateHz: 2 },
      ],
    },
    link: { roundTripTimeMs: 12.5 },
    ...overrides,
  };
}

describe('b2RobotInstrumentReadout', () => {
  it('maps dog power, pose, locomotion and joint summary', () => {
    const value = b2RobotInstrumentReadout(baseTelemetry());
    expect(value.battery).toBeCloseTo(72);
    expect(value.batteryVoltage).toBeCloseTo(47.6);
    expect(value.batteryCurrent).toBeCloseTo(-1.2);
    expect(value.linearSpeed).toBeCloseTo(0.8);
    expect(value.angularSpeed).toBeCloseTo(0.2);
    expect(value.heading).toBe(0);
    expect(value.x).toBeCloseTo(1.25);
    expect(value.y).toBeCloseTo(-0.5);
    expect(value.z).toBeCloseTo(0.55);
    expect(value.locomotionMode).toBe('STANDING');
    expect(value.motionEnabled).toBe(false);
    expect(value.jointCount).toBe(12);
    expect(value.jointsStale).toBe(false);
    expect(value.pose).toBe('fresh');
    expect(value.streamState).toBe('live');
    expect(value.link).toBe('live');
    expect(value.frequencies.pose).toBeCloseTo(15);
    expect(value.frequencies.power).toBeCloseTo(2);
  });

  it('treats fractional battery as ratio', () => {
    const value = b2RobotInstrumentReadout(baseTelemetry({
      power: { percentage: 0.42,voltageV: 46 },
    }));
    expect(value.battery).toBeCloseTo(42);
  });

  it('derives planar speed from linear when speed channel missing', () => {
    const value = b2RobotInstrumentReadout(baseTelemetry({
      speed: {},
      velocity: { linear: { x: 3,y: 4,z: 0 },angular: { z: 0 } },
    }));
    expect(value.linearSpeed).toBeCloseTo(5);
  });

  it('reads command safety from locomotion and stale from channel metadata', () => {
    const value = b2RobotInstrumentReadout(baseTelemetry({
      locomotion: { mode: 'standing',motionEnabled: true,commandStale: true },
      joints: { joints: [{ name: 'FR_hip_joint' },{ name: 'FL_hip_joint' }] },
      jointsStale: true,
    }));
    expect(value.motionEnabled).toBe(true);
    expect(value.commandStale).toBe(true);
    expect(value.jointCount).toBe(2);
    expect(value.jointsStale).toBe(true);
    expect(value.streamState).toBe('stale');
  });

  it('distinguishes an individual stale stream from an offline adapter', () => {
    expect(b2RobotInstrumentReadout(baseTelemetry({ powerStale: true })).streamState).toBe('stale');
    expect(b2RobotInstrumentReadout(baseTelemetry({ online: false })).streamState).toBe('offline');
  });
});

describe('b2LocomotionLabel', () => {
  it('normalizes gait labels', () => {
    expect(b2LocomotionLabel({ mode: 'trot_running' })).toBe('TROT RUNNING');
    expect(b2LocomotionLabel({})).toBe('--');
  });
});

describe('b2HealthTone', () => {
  it('returns idle without a run', () => {
    expect(b2HealthTone({
      hasRun: false,
      connectionState: 'live',
      online: true,
      operationalReady: true,
      healthChannel: { stale: false },
      health: { online: true },
      poseChannel: { stale: false },
    })).toBe('idle');
  });

  it('returns unavailable when offline or connection not live', () => {
    expect(b2HealthTone({
      hasRun: true,
      connectionState: 'closed',
      online: true,
      operationalReady: true,
      healthChannel: { stale: false },
      health: { online: true },
      poseChannel: { stale: false },
    })).toBe('unavailable');
  });

  it('returns fault when faults present or pose stale', () => {
    expect(b2HealthTone({
      hasRun: true,
      connectionState: 'live',
      online: true,
      operationalReady: true,
      healthChannel: { stale: false },
      health: { online: true,faults: ['driver_timeout'] },
      poseChannel: { stale: false },
    })).toBe('fault');
    expect(b2HealthTone({
      hasRun: true,
      connectionState: 'live',
      online: true,
      operationalReady: true,
      healthChannel: { stale: false },
      health: { online: true },
      poseChannel: { stale: true },
    })).toBe('fault');
  });

  it('returns healthy when live and streams ok', () => {
    expect(b2HealthTone({
      hasRun: true,
      connectionState: 'live',
      online: true,
      operationalReady: true,
      healthChannel: { stale: false },
      health: { online: true },
      poseChannel: { stale: false },
    })).toBe('healthy');
  });
});
