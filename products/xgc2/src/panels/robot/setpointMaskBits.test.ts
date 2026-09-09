// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import { setpointMaskGroups } from './robotProjectionModel';

describe('setpointMaskGroups', () => {
  it('keeps lights unknown until a setpoint sample is available', () => {
    expect(setpointMaskGroups(null).every((group) => group.lights.every((light) => light === 'unknown'))).toBe(true);
    expect(setpointMaskGroups(0x7ff,{ available: false }).every((group) => (
      group.lights.every((light) => light === 'unknown')
    ))).toBe(true);
  });

  it('maps valid_fields into masked/unmasked after a sample arrives', () => {
    const groups = setpointMaskGroups(0b101); // px + pz
    expect(groups.map((group) => group.label)).toEqual(['p','v','a','y','yr']);
    expect(groups[0]?.lights).toEqual(['masked','unmasked','masked']);
    expect(groups[1]?.lights).toEqual(['unmasked','unmasked','unmasked']);
    expect(groups[3]?.lights).toEqual(['unmasked']);
    expect(groups[4]?.lights).toEqual(['unmasked']);
  });

  it('marks every light masked for the full field mask', () => {
    const groups = setpointMaskGroups(0x7ff);
    expect(groups.every((group) => group.lights.every((light) => light === 'masked'))).toBe(true);
  });
});
