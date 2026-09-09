import { describe,expect,it } from 'vitest';
import { experimentZhMessages } from './experimentMessages';
import {
  experimentRobotComposition,
  experimentRobotSimulationSourceMark,
} from './experimentRunModePresentation';

describe('experimentRobotSimulationSourceMark', () => {
  it.each([
    ['simulation','simulation',false],
    ['simulation','physical',false],
    ['physical','simulation',false],
    ['physical','physical',false],
    ['experiment','simulation',false],
    ['hybrid','simulation',true],
    ['hybrid','physical',false],
    [undefined,'simulation',false],
    ['hybrid',undefined,false],
  ] as const)('runMode %s authored %s → %s', (runMode,hybridSource,visible) => {
    expect(experimentRobotSimulationSourceMark(runMode, hybridSource)).toBe(visible);
  });
});

describe('experimentRobotComposition', () => {
  it('derives mixed only for a Hybrid Experiment Run with physical and simulation slots', () => {
    expect(experimentRobotComposition('hybrid', [
      { hybridSource: 'physical' },
      { hybridSource: 'simulation' },
    ])).toBe('mixed');
  });

  it.each([
    ['simulation',[{ hybridSource: 'physical' },{ hybridSource: 'simulation' }]],
    ['physical',[{ hybridSource: 'physical' },{ hybridSource: 'simulation' }]],
    ['hybrid',[{ hybridSource: 'physical' },{ hybridSource: 'physical' }]],
    ['hybrid',[{ hybridSource: 'simulation' },{ hybridSource: 'simulation' }]],
    ['hybrid',[]],
  ] as const)('does not derive mixed for run mode %s and a non-mixed effective fleet', (runMode,robots) => {
    expect(experimentRobotComposition(runMode, robots)).toBeUndefined();
  });

  it('presents the derived composition as 虚实结合 in Chinese', () => {
    expect(experimentZhMessages.Mixed).toBe('虚实结合');
  });
});
