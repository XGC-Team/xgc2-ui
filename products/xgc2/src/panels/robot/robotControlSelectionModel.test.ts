import { describe,expect,it } from 'vitest';
import {
  remoteControlSelectionRefusal,
  robotIdsForRemoteControl,
} from './robotControlSelectionModel';

const px4 = (id: string) => ({ id,px4: {} });
const scout = (id: string) => ({ id,scout: {} });
const mecanum = (id: string) => ({ id,mecanum: {} });
const b2 = (id: string) => ({ id,unitreeB2: {} });

describe('robotIdsForRemoteControl', () => {
  it('aims at the selected Experiment robot instead of broadcasting the fleet', () => {
    expect(robotIdsForRemoteControl(
      ['scout-01'],
      [px4('px4-01'), scout('scout-01')],
    )).toEqual(['scout-01']);
  });

  it('does not turn an empty instrument selection into a fleet broadcast', () => {
    expect(robotIdsForRemoteControl([], [px4('px4-01'), scout('scout-01')]))
      .toEqual([]);
  });

  it('keeps every selected compatible kind and drops stale or unsupported ids', () => {
    expect(robotIdsForRemoteControl(
      ['gone','scout-01','mecanum-01','b2-01','px4-01'],
      [px4('px4-01'),scout('scout-01'),mecanum('mecanum-01'),b2('b2-01')],
    )).toEqual(['scout-01','mecanum-01','px4-01']);
  });

  it('explains empty, stale, and unsupported selections precisely', () => {
    const robots = [scout('scout-01'),b2('b2-01')];
    expect(remoteControlSelectionRefusal([],robots))
      .toBe('Select at least one Scout, Mecanum, or PX4 robot in Robot instruments.');
    expect(remoteControlSelectionRefusal(['gone'],robots))
      .toBe('The selected robots are no longer available in this Experiment.');
    expect(remoteControlSelectionRefusal(['b2-01'],robots))
      .toBe('Remote control supports Scout, Mecanum, and PX4 robots.');
    expect(remoteControlSelectionRefusal(['b2-01','scout-01'],robots)).toBe('');
  });
});
