import { describe,expect,it } from 'vitest';
import {
  environmentProfileLabel,
  experimentEnvironmentIdentity,
  availableWorldImage,
  managedHostBelongsToExperiment,
} from './environmentPanelModel';

const expA = { resourceId: 'exp-a',name: 'Field A' };
const expB = { resourceId: 'exp-b',name: 'Field B' };

describe('experiment environment host identity', () => {
  it('keeps the same robot name in two experiments on different Agents', () => {
    expect(managedHostBelongsToExperiment('Field A/UAV 1', expA)).toBe(true);
    expect(managedHostBelongsToExperiment('Field B/UAV 1', expA)).toBe(false);
    expect(managedHostBelongsToExperiment('Field A/UAV 1', expB)).toBe(false);
    expect(managedHostBelongsToExperiment('station-agent', expA)).toBe(false);
  });

  it('accepts the experiment resource id when the Agent registered that prefix', () => {
    expect(managedHostBelongsToExperiment('exp-a/UAV 1', expA)).toBe(true);
    expect(managedHostBelongsToExperiment('Field A longer/UAV 1', expA)).toBe(false);
  });

  it('reads the open experiment document and nothing else', () => {
    expect(experimentEnvironmentIdentity({
      head: { resourceId: 'exp-a' },
      spec: { name: 'Field A' },
    })).toEqual(expA);
    expect(experimentEnvironmentIdentity({ head: { resourceId: 'exp-a' } })).toBeUndefined();
  });
});

describe('installed environment options', () => {
  it('labels a profile from OS and ROS and ignores a bare id', () => {
    expect(environmentProfileLabel({
      os: 'ubuntu', version: '20.04', ros: 'noetic',
    })).toBe('ubuntu 20.04 · ROS noetic');
    expect(environmentProfileLabel({})).toBe('');
  });

  it('accepts a non-empty world image from options and ignores a digest rule', () => {
    expect(availableWorldImage('gazebo:latest')).toBe('gazebo:latest');
    expect(availableWorldImage('  installed-world  ')).toBe('installed-world');
    expect(availableWorldImage('')).toBe('');
    expect(availableWorldImage('   ')).toBe('');
    expect(availableWorldImage(undefined)).toBe('');
  });
});
