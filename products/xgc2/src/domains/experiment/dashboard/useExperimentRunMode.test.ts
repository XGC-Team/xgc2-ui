// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import type { ExperimentDocument,ExperimentRunMode } from '../experimentModel';
import { useExperimentRunMode } from './useExperimentRunMode';

describe('useExperimentRunMode', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('remembers the operator preference per Experiment', () => {
    const experiment = experimentFixture(['simulation','physical']);
    const first = renderHook(() => useExperimentRunMode(experiment, undefined));
    expect(first.result.current.value).toBe('simulation');
    expect(first.result.current.locked).toBe(false);

    act(() => first.result.current.select('physical'));
    expect(first.result.current.value).toBe('physical');
    expect(window.localStorage.getItem('xgc.experiment.runMode.exp-1'))
      .toBe(JSON.stringify('physical'));
    first.unmount();

    // A later mount of the same Experiment starts where the operator left off.
    const second = renderHook(() => useExperimentRunMode(experiment, undefined));
    expect(second.result.current.value).toBe('physical');

    // Another Experiment does not inherit it.
    const other = renderHook(() => useExperimentRunMode(experimentFixture(['simulation','physical'], 'exp-2'), undefined));
    expect(other.result.current.value).toBe('simulation');
  });

  it('shows and locks the frozen native Run mode instead of the local preference', () => {
    const experiment = experimentFixture(['simulation','physical']);
    window.localStorage.setItem('xgc.experiment.runMode.exp-1', JSON.stringify('simulation'));
    const { result } = renderHook(
      () => useExperimentRunMode(experiment, { runMode:'physical' }),
    );

    expect(result.current.value).toBe('physical');
    expect(result.current.locked).toBe(true);
  });

  it('drops a stored preference the Experiment no longer declares', () => {
    window.localStorage.setItem('xgc.experiment.runMode.exp-1', JSON.stringify('physical'));
    const { result } = renderHook(
      () => useExperimentRunMode(experimentFixture(['simulation']), undefined),
    );

    expect(result.current.options).toEqual(['simulation']);
    expect(result.current.value).toBe('simulation');
  });
});

function experimentFixture(runModes: ExperimentRunMode[], resourceId = 'exp-1'): ExperimentDocument {
  return {
    head: { domain: 'experiment',resourceId,name: 'Experiment',tags: [],mainCommitId: 'c1',currentVersion: 1,digest: 'd',revision: 1,createdAt: '',updatedAt: '' },
    branch: { domain: 'experiment',resourceId,name: 'main',headCommitId: 'c1',headVersion: 1,revision: 1,createdAt: '',updatedAt: '' },
    spec: {
      schemaVersion: 15,name: 'Experiment',description: '',tags: [],runModes,localizationOffset:{ x:0,y:0,z:0 },
      dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
      robots: [],workflowInstances: [],
    },
  };
}
