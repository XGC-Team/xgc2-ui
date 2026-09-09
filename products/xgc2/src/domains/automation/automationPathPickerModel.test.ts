import { describe,expect,it } from 'vitest';
import { isGazeboWorldPathField,isROSBagPlayPathField } from './automationPathPickerModel';

describe('isROSBagPlayPathField', () => {
  it('matches the rosbag-play bagPath file field for bag, mcap, and db3', () => {
    expect(isROSBagPlayPathField('bagPath', 'file', ['.bag', '.mcap', '.db3'])).toBe(true);
    expect(isROSBagPlayPathField('bagPath', 'file', ['.BAG'])).toBe(true);
    expect(isROSBagPlayPathField('bagPath', 'file', ['.mcap'])).toBe(true);
    expect(isROSBagPlayPathField('bagPath', 'file', ['.db3'])).toBe(true);
  });

  it('does not treat Home plotting or other path fields as the play picker', () => {
    expect(isROSBagPlayPathField('bagPath', 'directory', ['.bag'])).toBe(false);
    expect(isROSBagPlayPathField('outputPrefix', 'file', ['.bag'])).toBe(false);
    expect(isROSBagPlayPathField('bagPath', 'file', ['.txt'])).toBe(false);
    expect(isROSBagPlayPathField('bagPath', 'file')).toBe(false);
    expect(isGazeboWorldPathField('world', 'file', ['.world'])).toBe(true);
    expect(isROSBagPlayPathField('world', 'file', ['.world'])).toBe(false);
  });
});
