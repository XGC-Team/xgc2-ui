import { describe, expect, it } from 'vitest';
import {
  EMPTY_INSTRUMENT_DIAGNOSTIC,
  EMPTY_INSTRUMENT_ERROR,
  EMPTY_INSTRUMENT_VECTOR,
  EMPTY_INSTRUMENT_YAW,
  formatInstrumentErrorCm,
  formatInstrumentPingDiagnostic,
  formatInstrumentVector,
  formatInstrumentYaw,
  robotInstrumentDetailRows,
  robotInstrumentManagementAddress,
} from './robotInstrumentDetailModel';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const hz = '-- Hz';

describe('robotInstrumentDetailModel', () => {
  it('formats list-matching vectors, yaw, uncapped ERR, and ping diagnostics', () => {
    expect(formatInstrumentVector({ x: -0.6, y: 12.04, z: -0.004 })).toBe('-0.60 12.04 -0.00');
    expect(formatInstrumentVector({})).toBe(EMPTY_INSTRUMENT_VECTOR);
    expect(formatInstrumentYaw(identity)).toBe('0.00 deg');
    expect(formatInstrumentYaw({})).toBe(EMPTY_INSTRUMENT_YAW);
    expect(formatInstrumentErrorCm(0.458)).toBe('45.8 cm');
    expect(formatInstrumentErrorCm(1.234)).toBe('123.4 cm');
    expect(formatInstrumentErrorCm(undefined)).toBe(EMPTY_INSTRUMENT_ERROR);
    expect(formatInstrumentPingDiagnostic({ status: 'reachable', result: { reachable: true, latencyMs: 12 } }))
      .toBe('12 ms');
    expect(formatInstrumentPingDiagnostic({ status: 'unreachable', result: { reachable: false, latencyMs: 0 } }))
      .toBe('down');
  });

  it('reads management IP from robot arms or asset spec without naming a leaf kind', () => {
    expect(robotInstrumentManagementAddress({ px4: { managementIp: '192.168.51.11' } }))
      .toBe('192.168.51.11');
    expect(robotInstrumentManagementAddress(
      {},
      { mecanum: { managementAddress: '192.168.51.201' } },
    )).toBe('192.168.51.201');
  });

  it('emits IP plus FS150 VRPN, local, and ERR rows even when idle', () => {
    const idle = robotInstrumentDetailRows({
      flight: true,
      mocapRotor: false,
      pose: {},
      localizationError: {},
    });
    expect(idle.map((row) => row.slot)).toEqual(['ip', 'vrpn-pos', 'vrpn-yaw', 'local-pos', 'local-yaw', 'err']);
    expect(idle[0]).toMatchObject({ value: '--', diagnostic: EMPTY_INSTRUMENT_DIAGNOSTIC });
    expect(idle.slice(1).map((row) => row.diagnostic)).toEqual([hz, hz, hz, hz, hz]);

    const live = robotInstrumentDetailRows({
      flight: true,
      mocapRotor: false,
      managementAddress: '192.168.51.11',
      pingDiagnostic: '12 ms',
      pose: { position: { x: 0.5, y: 0.4, z: 1.1 }, orientation: identity },
      mocap: {
        value: { position: { x: -0.6, y: 12.04, z: -0.004 }, orientation: identity },
      },
      localizationError: { meters: 0.458 },
      streamHealth: { channels: [
        { channelId: 'state.mocap.pose', sourceRateHz: 100 },
        { channelId: 'state.pose', sourceRateHz: 30 },
        { channelId: 'state.localization.error', sourceRateHz: 30 },
      ] },
    });
    expect(live[0]).toEqual({ slot: 'ip', labelKey: 'IP', value: '192.168.51.11', diagnostic: '12 ms' });
    expect(live.find((row) => row.slot === 'vrpn-pos')).toEqual({
      slot: 'vrpn-pos', labelKey: 'VRPN pos', value: '-0.60 12.04 -0.00', diagnostic: '100.0 Hz',
    });
    expect(live.find((row) => row.slot === 'local-pos')?.diagnostic).toBe('30.0 Hz');
    expect(live.find((row) => row.slot === 'err')?.value).toBe('45.8 cm');
  });

  it('treats Ground and mocap_rotor pose as VRPN and kind projection as odom', () => {
    const ground = robotInstrumentDetailRows({
      flight: false,
      mocapRotor: false,
      pose: { position: { x: 1.8, y: 0, z: 0.18 }, orientation: identity },
      localizationError: { meters: 0.1 },
    });
    expect(ground.map((row) => row.labelKey)).toEqual(['IP', 'VRPN pos', 'VRPN yaw']);
    expect(ground[1]?.value).toBe('1.80 0.00 0.18');
    expect(ground.some((row) => row.slot === 'err')).toBe(false);

    const rotor = robotInstrumentDetailRows({
      flight: true,
      mocapRotor: true,
      pose: { position: { x: 2, y: 3, z: 4 }, orientation: identity },
      localizationError: { meters: 0.2 },
    });
    expect(rotor.map((row) => row.labelKey)).toEqual(['IP', 'VRPN pos', 'VRPN yaw']);

    const kind = robotInstrumentDetailRows({
      flight: false,
      mocapRotor: false,
      kindProjection: true,
      pose: { position: { x: -1, y: 0.5, z: 0 }, orientation: identity },
      localizationError: {},
    });
    expect(kind.map((row) => row.labelKey)).toEqual(['IP', 'Odom pos', 'Yaw']);
  });

  it('clears stale pose and mocap instead of holding the last live values', () => {
    const rows = robotInstrumentDetailRows({
      flight: true,
      mocapRotor: false,
      poseStale: true,
      pose: { position: { x: 1, y: 1, z: 1 }, orientation: identity },
      mocap: {
        stale: true,
        value: { position: { x: 2, y: 2, z: 2 }, orientation: identity },
      },
      localizationError: { meters: 0.05 },
    });
    expect(rows.find((row) => row.slot === 'vrpn-pos')?.value).toBe(EMPTY_INSTRUMENT_VECTOR);
    expect(rows.find((row) => row.slot === 'vrpn-pos')?.diagnostic).toBe('stale');
    expect(rows.find((row) => row.slot === 'local-pos')?.value).toBe(EMPTY_INSTRUMENT_VECTOR);
    expect(rows.find((row) => row.slot === 'err')?.value).toBe('5.0 cm');
  });
});
