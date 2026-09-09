import { describe,expect,it } from 'vitest';
import {
  compareExperimentRobotBindingSlots,
  experimentRobotAssignmentLabel,
  experimentRobotRoleLabel,
} from './experimentRobotBindingPresentation';

describe('Experiment Robot binding presentation',() => {
  it('separates the Experiment role from the physical asset identity',() => {
    expect(experimentRobotRoleLabel({ id:'px4-1' })).toBe('UAV-01');
    expect(experimentRobotAssignmentLabel({ id:'px4-01' },'FS150-04'))
      .toBe('UAV-01 — FS150-04');
    expect(experimentRobotAssignmentLabel({ id:'ugv-02' },'Mecanum-18'))
      .toBe('UGV-02 — Mecanum-18');
    expect(experimentRobotAssignmentLabel({ id:'scout-04' },'Scout-04'))
      .toBe('UGV-04 — Scout-04');
    expect(experimentRobotRoleLabel({ id:'mecanum-2' })).toBe('UGV-02');
  });

  it('preserves authored custom role IDs',() => {
    expect(experimentRobotAssignmentLabel({ id:'leader' },'FS150-04'))
      .toBe('leader — FS150-04');
  });

  it('clusters native slots as ordered UAV followed by ordered shared UGV',() => {
    const bindings = [
      { id:'ugv-02',mecanum:{} },
      { id:'px4-03',px4:{} },
      { id:'ugv-01',scout:{} },
      { id:'px4-01',px4:{} },
      { id:'b2-01',unitreeB2:{} },
    ];
    expect([...bindings].sort(compareExperimentRobotBindingSlots).map(({ id }) => id))
      .toEqual(['px4-01','px4-03','ugv-01','ugv-02','b2-01']);
  });
});
