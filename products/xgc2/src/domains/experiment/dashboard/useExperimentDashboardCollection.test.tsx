// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { PANEL_SCHEMA_VERSION,type ExperimentDocument } from '../experimentModel';
import { useExperimentDashboardCollection } from './useExperimentDashboardCollection';

describe('useExperimentDashboardCollection location selection', () => {
  it('applies a pending GCS selection once the Experiment document arrives', () => {
    const onSelectedDashboardIdChange = vi.fn();
    const { result,rerender } = renderHook(
      ({ experiment,selectedDashboardId }) => useExperimentDashboardCollection({
        visibleExperiment: experiment,
        editing: false,
        updateDraft: vi.fn(),
        selectedDashboardId,
        onSelectedDashboardIdChange,
      }),
      { initialProps:{ experiment: undefined as ExperimentDocument | undefined,selectedDashboardId: 'gcs' } },
    );
    expect(result.current.selected.id).toBe('config');
    expect(result.current.selected.panels.map((panel) => panel.id)).toEqual(['robot-assets']);

    rerender({ experiment: experimentFixture(),selectedDashboardId: 'gcs' });
    expect(result.current.selected.id).toBe('gcs');
    expect(result.current.selected.panels.map((panel) => panel.id)).toEqual([
      'panel-a','panel-b','panel-c','panel-d','panel-e','panel-f',
    ]);
  });

  it('commits rapid Config/GCS selection without requiring the dashboard to already be loaded', () => {
    const onSelectedDashboardIdChange = vi.fn();
    const { result } = renderHook(() => useExperimentDashboardCollection({
      visibleExperiment: experimentFixture(),
      editing: false,
      updateDraft: vi.fn(),
      selectedDashboardId: 'config',
      onSelectedDashboardIdChange,
    }));
    act(() => result.current.select('gcs'));
    act(() => result.current.select('config'));
    act(() => result.current.select('gcs'));
    expect(onSelectedDashboardIdChange.mock.calls.map((call) => call[0])).toEqual(['gcs','config','gcs']);
  });
});

describe('useExperimentDashboardCollection tab names', () => {
  it('clips renamed and created dashboard names to twelve characters', () => {
    const updateDraft = vi.fn();
    const { result } = renderHook(() => useExperimentDashboardCollection({
      visibleExperiment: experimentFixture(),
      activeDraft: experimentFixture(),
      editing: true,
      updateDraft,
      selectedDashboardId: 'gcs',
    }));

    act(() => result.current.rename('gcs', 'Ground station'));
    expect(updateDraft.mock.calls.at(-1)?.[0].spec.dashboards.find(
      (dashboard: { id: string }) => dashboard.id === 'gcs',
    )?.name).toBe('Ground stati');

    act(() => result.current.create());
    expect(updateDraft.mock.calls.at(-1)?.[0].spec.dashboards.at(-1)?.name).toBe('Dashboard 3');
  });

  it('does not persist an empty clipped name', () => {
    const updateDraft = vi.fn();
    const { result } = renderHook(() => useExperimentDashboardCollection({
      visibleExperiment: experimentFixture(),
      activeDraft: experimentFixture(),
      editing: true,
      updateDraft,
      selectedDashboardId: 'gcs',
    }));
    act(() => result.current.rename('gcs', '   '));
    expect(updateDraft).not.toHaveBeenCalled();
  });
});

function experimentFixture(): ExperimentDocument {
  return {
    head: { domain: 'experiment',resourceId: 'exp-1',name: 'Experiment',tags: [],mainCommitId: 'c1',currentVersion: 1,digest: 'd',revision: 1,createdAt: '',updatedAt: '' },
    branch: { domain: 'experiment',resourceId: 'exp-1',name: 'main',headCommitId: 'c1',headVersion: 1,revision: 1,createdAt: '',updatedAt: '' },
    spec: {
      schemaVersion: 15,name: 'Experiment',description: '',tags: [],runModes: ['simulation'],localizationOffset:{ x:0,y:0,z:0 },
      robots: [],workflowInstances: [],
      dashboards: [
        { id: 'config',name: 'Config',description: '',panels: [panel('robot-assets')] },
        { id: 'gcs',name: 'GCS',description: '',panels: [
          panel('panel-a'),panel('panel-b'),panel('panel-c'),
          panel('panel-d'),panel('panel-e'),panel('panel-f'),
        ] },
      ],
    },
  };
}

function panel(id: string) {
  return {
    schemaVersion: PANEL_SCHEMA_VERSION,id,pluginId: 'automation-workflow-control',title: id,
    grid: { x: 0,y: 0,w: 6,h: 4 },
    view: { query: {},options: {},fieldConfig: {} },portBindings: [],
  };
}
