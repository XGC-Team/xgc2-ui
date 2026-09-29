import { describe,expect,it } from 'vitest';
import {
  experimentRobotConfigSourceLabel,
  experimentRobotSimulationSourceMark,
  experimentRobotSourceForRunMode,
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

describe('experimentRobotSourceForRunMode', () => {
  it.each([
    ['simulation','physical','simulation'],
    ['simulation','simulation','simulation'],
    ['physical','simulation','physical'],
    ['physical','physical','physical'],
    ['hybrid','simulation','simulation'],
    ['hybrid','physical','physical'],
    ['hybrid',undefined,'unknown'],
    ['hybrid','','unknown'],
    ['experiment','simulation','unknown'],
    [undefined,'simulation','unknown'],
    ['','physical','unknown'],
  ] as const)('runMode %s slot %s → %s', (runMode,hybridSource,source) => {
    expect(experimentRobotSourceForRunMode(runMode, hybridSource)).toBe(source);
  });
});

describe('experimentRobotConfigSourceLabel', () => {
  const idle = {
    running: false,frozenLoading: false,frozenReady: false,sessionRunMode: '',selectedRunMode: '',inFrozenRoster: false,
    draftHybridSource: 'physical',frozenHybridSource: undefined,
  } as const;

  it('idle cards follow the selected mode and ignore authored hybridSource in pure modes', () => {
    expect(experimentRobotConfigSourceLabel({ ...idle,selectedRunMode: 'simulation' }))
      .toEqual({ current: 'simulation' });
    expect(experimentRobotConfigSourceLabel({ ...idle,selectedRunMode: 'physical',draftHybridSource: 'simulation' }))
      .toEqual({ current: 'physical' });
  });

  it('idle hybrid cards read the draft slot and report missing values as unknown', () => {
    expect(experimentRobotConfigSourceLabel({ ...idle,selectedRunMode: 'hybrid',draftHybridSource: 'simulation' }))
      .toEqual({ current: 'simulation' });
    expect(experimentRobotConfigSourceLabel({ ...idle,selectedRunMode: 'hybrid',draftHybridSource: undefined }))
      .toEqual({ current: 'unknown' });
  });

  it('idle cards make no claim under a custom or empty mode', () => {
    expect(experimentRobotConfigSourceLabel({ ...idle,selectedRunMode: 'experiment' }))
      .toEqual({ current: 'unknown' });
    expect(experimentRobotConfigSourceLabel({ ...idle,selectedRunMode: '' }))
      .toEqual({ current: 'unknown' });
  });

  it('a pure running Session reports its mode while the frozen roster is loading', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenLoading: true,sessionRunMode: 'simulation',
    })).toEqual({ current: 'simulation' });
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenLoading: true,sessionRunMode: 'physical',draftHybridSource: 'simulation',
    })).toEqual({ current: 'physical' });
  });

  it('a hybrid Session stays unknown until the frozen commit is resolved', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenLoading: true,sessionRunMode: 'hybrid',inFrozenRoster: true,frozenHybridSource: 'simulation',
    })).toEqual({ current: 'unknown' });
  });

  it('a failed frozen read leaves even a pure Session source unknown', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenLoading: false,sessionRunMode: 'simulation',inFrozenRoster: false,
    })).toEqual({ current: 'unknown' });
  });

  it('a running pure Session unifies every roster slot and never paints authored hybridSource', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'physical',
      inFrozenRoster: true,draftHybridSource: 'simulation',frozenHybridSource: 'simulation',
    })).toEqual({ current: 'physical' });
  });

  it('a running hybrid Session reads the frozen slot and only flags a real draft difference', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'hybrid',
      inFrozenRoster: true,draftHybridSource: 'simulation',frozenHybridSource: 'simulation',
    })).toEqual({ current: 'simulation' });
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'hybrid',
      inFrozenRoster: true,draftHybridSource: 'physical',frozenHybridSource: 'simulation',
    })).toEqual({ current: 'simulation',next: 'physical' });
  });

  it('keeps a replaced slot unknown instead of inheriting the previous Robot source', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'hybrid',
      inFrozenRoster: false,draftHybridSource: 'simulation',frozenHybridSource: undefined,
    })).toEqual({ current: 'unknown',next: 'simulation' });
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'physical',inFrozenRoster: false,
    })).toEqual({ current: 'unknown',next: 'physical' });
  });

  it('does not invent a next source when the draft value is unusable', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'hybrid',
      inFrozenRoster: true,draftHybridSource: '',frozenHybridSource: 'simulation',
    })).toEqual({ current: 'simulation' });
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'hybrid',
      inFrozenRoster: false,draftHybridSource: undefined,frozenHybridSource: undefined,
    })).toEqual({ current: 'unknown' });
  });

  it('running under an unknown Session mode claims nothing', () => {
    expect(experimentRobotConfigSourceLabel({
      ...idle,running: true,frozenReady: true,sessionRunMode: 'experiment',
      inFrozenRoster: true,frozenHybridSource: 'simulation',
    })).toEqual({ current: 'unknown' });
  });
});
