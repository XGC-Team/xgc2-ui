import { describe,expect,it } from 'vitest';
import { MECANUM_UGV_KIND,PX4_MULTIROTOR_KIND } from '../../domains/robot/robotAssetPublic';
import {
  groundListMetricChannelIds,
  groundRobotTelemetryChannels,
  mecanumInstrumentChannels,
  mecanumListChannels,
  requiredPX4ProjectionModelId,
  scoutInstrumentChannels,
  scoutListChannels,
} from './useRobotProjectionChannels';

describe('groundRobotTelemetryChannels', () => {
  it('subscribes Scout instruments to IMU, PowerVoltage, chassis_state, and stream-health', () => {
    const channels = groundRobotTelemetryChannels({ kind: 'scout_mini' }, true);
    expect(channels).toEqual(scoutInstrumentChannels);
    expect(channels).toEqual(expect.arrayContaining([
      'state.imu','state.power','state.health','state.chassis','diagnostic.stream-health',
    ]));
    expect(channels).not.toContain('diagnostic.fcu-link');
  });

  it('subscribes Mecanum instruments to IMU, PowerVoltage, and health, not chassis_state', () => {
    const channels = groundRobotTelemetryChannels({ kind: MECANUM_UGV_KIND }, true);
    expect(channels).toEqual(mecanumInstrumentChannels);
    expect(channels).toEqual(expect.arrayContaining([
      'state.imu','state.power','state.health','diagnostic.stream-health',
    ]));
    expect(channels).not.toContain('state.chassis');
    expect(channels).not.toContain('diagnostic.fcu-link');
  });

  it('adds only the real VRPN acceleration channel to list subscriptions', () => {
    expect(groundRobotTelemetryChannels({ kind:'scout_mini' },false)).toEqual(scoutListChannels);
    expect(groundRobotTelemetryChannels({ kind: MECANUM_UGV_KIND }, false))
      .toEqual(mecanumListChannels);
    expect(scoutInstrumentChannels).not.toContain(groundListMetricChannelIds.acceleration);
    expect(mecanumInstrumentChannels).not.toContain(groundListMetricChannelIds.acceleration);
    expect(scoutListChannels).toContain(groundListMetricChannelIds.acceleration);
    expect(mecanumListChannels).toContain(groundListMetricChannelIds.acceleration);
  });

  it('freezes source provenance for the eight ground list fields and four header contracts', () => {
    expect(groundListMetricChannelIds).toEqual({
      position:'vrpn.position',
      velocity:'vrpn.velocity',
      speed:'vrpn.speed',
      acceleration:'vrpn.acceleration',
      command:'command.velocity',
      power:'state.power',
      imu:'state.imu',
      health:'state.health',
      chassis:'state.chassis',
    });
  });

  it('rejects a PX4 runtime projection without an explicit modelId',() => {
    expect(() => requiredPX4ProjectionModelId({ kind:PX4_MULTIROTOR_KIND,px4:{} } as never))
      .toThrow('PX4 runtime projection requires an explicit modelId.');
    expect(requiredPX4ProjectionModelId({
      kind:PX4_MULTIROTOR_KIND,px4:{ modelId:'fs150' },
    } as never)).toBe('fs150');
    // Experiment selection category markers remain a separate shape; only a
    // runtime PX4 projection is admitted here.
    expect(requiredPX4ProjectionModelId({ kind:'scout_mini',px4:undefined } as never)).toBeUndefined();
  });
});
