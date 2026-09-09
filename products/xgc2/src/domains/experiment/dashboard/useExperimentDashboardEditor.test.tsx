// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe,expect,it,vi } from 'vitest';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import {
  ProductWebCompositionProvider,
  type ProductWebComposition,
} from '../../../shared/productWebComposition';
import type { ExperimentDocument } from '../experimentModel';
import { useExperimentDashboardEditor } from './useExperimentDashboardEditor';

describe('useExperimentDashboardEditor composition', () => {
  it('keeps immutable dashboard and panel projections stable across unrelated renders', () => {
    const selectedExperiment = experimentFixture();
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument, _reason?: string) => experiment);
    const { result,rerender } = renderHook(
      ({ experiment }) => useExperimentDashboardEditor({ selectedExperiment: experiment,saveExperimentDraft }),
      { initialProps: { experiment: selectedExperiment },wrapper: ProductCompositionWrapper },
    );
    const dashboards = result.current.dashboards.items;
    const selectedDashboard = result.current.dashboards.selected;
    const panels = result.current.panels.items;

    rerender({ experiment: selectedExperiment });

    expect(result.current.dashboards.items).toBe(dashboards);
    expect(result.current.dashboards.selected).toBe(selectedDashboard);
    expect(result.current.panels.items).toBe(panels);
  });

  it('keeps dashboard, panel config and layout mutations local until one explicit save', async () => {
    const selectedExperiment = experimentFixture();
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument, _reason?: string) => experiment);
    const { result } = renderHook(
      () => useExperimentDashboardEditor({ selectedExperiment,saveExperimentDraft }),
      { wrapper: ProductCompositionWrapper },
    );
    const plugin = requiredPlugin('robot-instruments-grid');

    act(() => result.current.session.start());
    act(() => result.current.panels.add(plugin));
    const panel = result.current.panels.items[0]!;
    act(() => result.current.panels.saveConfig({
      ...panel,title: 'Fleet overview',options: { ...panel.options,compact: true },
    }));
    act(() => result.current.panels.updateLayout({ [panel.id]: { x: 3,y: 2,w: 9,h: 5 } }));

    expect(saveExperimentDraft).not.toHaveBeenCalled();
    expect(result.current.panels.items[0]).toMatchObject({
      id: panel.id,title: 'Fleet overview',gridPos: { x: 3,y: 2,w: 9,h: 5 },
    });
    act(() => result.current.dashboards.create());
    expect(result.current.dashboards.items).toHaveLength(2);

    await act(async () => { await result.current.session.save(); });

    expect(saveExperimentDraft).toHaveBeenCalledTimes(1);
    expect(saveExperimentDraft.mock.calls[0]?.[1]).toBe('Update experiment dashboards');
    expect(saveExperimentDraft.mock.calls[0]?.[0].spec.dashboards).toHaveLength(2);
    expect(result.current.session.editing).toBe(false);
  });

  it('owns dashboard rename, create, reorder and guarded deletion as one collection responsibility', () => {
    const selectedExperiment = experimentFixture();
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument, _reason?: string) => experiment);
    const { result } = renderHook(
      () => useExperimentDashboardEditor({ selectedExperiment,saveExperimentDraft }),
      { wrapper: ProductCompositionWrapper },
    );

    act(() => result.current.session.start());
    act(() => result.current.dashboards.rename('gcs', 'Flight operations'));
    expect(result.current.dashboards.selected.name).toBe('Flight opera');
    act(() => result.current.dashboards.create());
    expect(result.current.dashboards.items).toHaveLength(2);
    const secondId = result.current.dashboards.items[1]!.id;
    act(() => result.current.dashboards.create());
    expect(result.current.dashboards.items).toHaveLength(3);
    const thirdId = result.current.dashboards.items[2]!.id;
    act(() => result.current.dashboards.reorder([thirdId, 'gcs', secondId]));
    expect(result.current.dashboards.items.map((item) => item.id)).toEqual([thirdId, 'gcs', secondId]);
    act(() => result.current.dashboards.requestDelete('gcs'));
    act(() => result.current.dashboards.confirmDelete());
    expect(result.current.dashboards.items.map((item) => item.id)).toEqual([thirdId, secondId]);
    act(() => result.current.dashboards.requestDelete(secondId));
    act(() => result.current.dashboards.confirmDelete());
    expect(result.current.dashboards.items).toHaveLength(1);
    expect(result.current.dashboards.items[0]?.id).toBe(thirdId);
    act(() => result.current.dashboards.requestDelete(thirdId));
    act(() => result.current.dashboards.confirmDelete());
    expect(result.current.dashboards.items).toHaveLength(1);
    act(() => result.current.dashboards.reorder([thirdId]));
    expect(result.current.dashboards.items).toHaveLength(1);
  });

  it('rejects mutations outside edit mode and discards a draft without writing', () => {
    const selectedExperiment = experimentFixture();
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument, _reason?: string) => experiment);
    const { result } = renderHook(
      () => useExperimentDashboardEditor({ selectedExperiment,saveExperimentDraft }),
      { wrapper: ProductCompositionWrapper },
    );
    const plugin = requiredPlugin('robot-instruments-grid');

    act(() => {
      result.current.panels.add(plugin);
      result.current.dashboards.create();
      result.current.dashboards.rename('gcs', 'Outside edit');
      result.current.panels.openLibrary();
    });
    expect(result.current.panels.items).toHaveLength(0);
    expect(result.current.dashboards.items).toHaveLength(1);
    expect(result.current.panels.libraryOpen).toBe(false);

    act(() => result.current.session.start());
    act(() => {
      result.current.panels.add(plugin);
      result.current.dashboards.rename('gcs', 'Unsaved dashboard');
    });
    act(() => result.current.session.discard());

    expect(result.current.session.editing).toBe(false);
    expect(result.current.panels.items).toHaveLength(0);
    expect(result.current.dashboards.selected.name).toBe('GCS');
    expect(saveExperimentDraft).not.toHaveBeenCalled();
  });

  it('allows two Lichtblick panels inside the panel workspace', () => {
    const selectedExperiment = experimentFixture();
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument, _reason?: string) => experiment);
    const { result } = renderHook(
      () => useExperimentDashboardEditor({ selectedExperiment,saveExperimentDraft }),
      { wrapper: ProductCompositionWrapper },
    );
    const plugin = requiredPlugin('xgc2-lichtblick');

    act(() => result.current.session.start());
    act(() => result.current.panels.add(plugin));
    act(() => result.current.panels.add(plugin));

    expect(result.current.panels.items.filter((panel) => panel.pluginId === plugin.id)).toHaveLength(2);
    expect(result.current.session.saveError).toBe('');
  });

  it('does not save a dashboard containing an unregistered panel plugin', async () => {
    const selectedExperiment = experimentFixture();
    selectedExperiment.spec.dashboards[0]!.panels.push({
      schemaVersion: 3,id: 'unknown-panel',
      pluginId: 'missing-plugin',
      title: 'Missing',
      grid: { x: 0,y: 0,w: 6,h: 4 },
      view: { query: {},options: {},fieldConfig: {} },
      portBindings: [],
    });
    const saveExperimentDraft = vi.fn(async (experiment: ExperimentDocument) => experiment);
    const { result } = renderHook(
      () => useExperimentDashboardEditor({ selectedExperiment,saveExperimentDraft }),
      { wrapper: ProductCompositionWrapper },
    );

    act(() => result.current.session.start());
    await act(async () => { await result.current.session.save(); });

    expect(saveExperimentDraft).not.toHaveBeenCalled();
    expect(result.current.session.editing).toBe(true);
    expect(result.current.session.saveError).toContain('unregistered plugin "missing-plugin"');
  });
});

const testProductWebComposition: ProductWebComposition = {
  id: 'dashboard-editor-test',
  agentLinkComputeTargets: false,
  routes: [],
  navigation: {
    defaultPage: 'experiment',
    primary: [],
    operations: [],
    sections: {},
    sectionDefaults: {},
  },
  settings: { sections: [] },
  developer: {},
};

function ProductCompositionWrapper({ children }: PropsWithChildren) {
  return (
    <ProductWebCompositionProvider composition={testProductWebComposition}>
      {children}
    </ProductWebCompositionProvider>
  );
}

function requiredPlugin(id: string) {
  const plugin = getPanelPlugin(id);
  if (!plugin) throw new Error(`${id} panel plugin is missing`);
  return plugin;
}

function experimentFixture(resourceId = 'experiment-a'): ExperimentDocument {
  return {
    head: {
      domain: 'experiment',resourceId,name: 'Experiment',tags: [],mainCommitId: 'c1',currentVersion: 1,
      digest: 'd',revision: 1,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'experiment',resourceId,name: 'main',headCommitId: 'c1',headVersion: 1,
      revision: 1,createdAt: '',updatedAt: '',
    },
    spec: {
      schemaVersion: 15,name: 'Experiment',description: '',tags: [],
      runModes: ['simulation','physical'],
      localizationOffset:{ x:0,y:0,z:0 },
      robots: [],workflowInstances: [],
      dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
    },
  };
}
