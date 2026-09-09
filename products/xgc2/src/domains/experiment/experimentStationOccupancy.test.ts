import { describe,expect,it } from 'vitest';
import {
  OTHER_EXPERIMENT_RUNNING_REASON,
  otherExperimentRunDisabledReason,
} from './experimentStationOccupancy';

describe('otherExperimentRunDisabledReason',() => {
  it('disables other Experiments while one native Run occupies the station',() => {
    expect(otherExperimentRunDisabledReason('exp-b',new Set(['exp-a']),true))
      .toBe(OTHER_EXPERIMENT_RUNNING_REASON);
  });

  it('does not fence the Experiment that already owns the Run',() => {
    expect(otherExperimentRunDisabledReason('exp-a',new Set(['exp-a']),true)).toBe('');
  });

  it('stays silent until occupancy is resolved so the dashboard can fail closed as Checking',() => {
    expect(otherExperimentRunDisabledReason('exp-b',new Set(['exp-a']),false)).toBe('');
    expect(otherExperimentRunDisabledReason('exp-b',new Set(),true)).toBe('');
  });
});
