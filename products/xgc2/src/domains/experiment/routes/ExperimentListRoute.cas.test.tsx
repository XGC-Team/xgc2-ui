// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../../../profiles/core-dev';
import { ProductWebCompositionProvider } from '../../../shared/productWebComposition';
import {
  newPanelWorkflowBinding,
  newSystemPanelWorkflowInstance,
  PANEL_SCHEMA_VERSION,
  type ExperimentDashboard,
  type ExperimentDocument,
  type ExperimentPanel,
  type ExperimentWorkflowInstance,
} from '../experimentModel';
import {
  ExperimentCommitConflict,
  type CreateStoredExperimentInput,
} from '../useExperimentCatalog';
import { ExperimentListRoute } from './ExperimentListRoute';

const notificationMocks = vi.hoisted(() => ({ useError: vi.fn() }));

vi.mock('../../groundStationInteraction/groundStationInteractionPublic', async (loadOriginal) => ({
  ...await loadOriginal<Record<string, unknown>>(),
  useGroundStationErrorNotification: notificationMocks.useError,
}));

function renderWithComposition(ui: ReactElement) {
  const view = render(
    <ProductWebCompositionProvider composition={productWebComposition}>
      {ui}
    </ProductWebCompositionProvider>,
  );
  return {
    ...view,
    rerender: (next: ReactElement) => view.rerender(
      <ProductWebCompositionProvider composition={productWebComposition}>
        {next}
      </ProductWebCompositionProvider>,
    ),
  };
}

describe('ExperimentListRoute resource mutations', () => {
  beforeEach(() => {
    notificationMocks.useError.mockReset();
    window.localStorage.clear();
  });

  it('marks the durable active Experiment owner with a running glow and no start/stop controls', () => {
    const { container } = renderWithComposition(
      <ExperimentListRoute {...routeProps(experiment('c1', 1), vi.fn(), new Set(['experiment-1']))} />,
    );
    expect(
      container.querySelector('[data-xgc-role="experiment-row"][data-xgc-id="experiment-1"]'),
    ).toHaveAttribute('data-xgc-running', 'true');
    expect(container.querySelector('[data-xgc-role="experiment-start"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-stop"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-activate"]')).toBeNull();
  });

  it('uses the list layout instead of the dashboard grid wrapper', () => {
    const current = experiment('c1', 1);
    const { container } = renderWithComposition(<ExperimentListRoute {...routeProps(current, vi.fn())} />);
    const route = container.querySelector('[data-xgc-role="experiment-list-route"]');

    expect(route).toHaveClass('xgc-experiment-list-route', 'xgc-workspace-full-span');
    expect(route).not.toHaveClass('experiment-grid');
    expect(route?.querySelector('[data-xgc-role="experiment-list-page"]')).not.toBeNull();
  });

  it('fills the parked Experiment route so the list host is not clipped to zero height', () => {
    const processCss = readFileSync(resolve(process.cwd(), 'src/styles/process.css'), 'utf8');
    const routeRule = processCss.match(/\[class~="xgc-experiment-list-route"\]\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(routeRule).toMatch(/min-height:\s*0/);
    expect(routeRule).toMatch(/height:\s*100%/);
  });

  it('restores one target-scoped view toggle and persists each transition', async () => {
    window.localStorage.setItem('xgc.experiment.catalog.agent-a.viewMode', '"list"');
    const { container } = renderWithComposition(
      <ExperimentListRoute {...routeProps(experiment('c1', 1), vi.fn())} />,
    );
    const toggle = container.querySelector('[data-xgc-role="experiment-view-toggle"]')!;

    expect(toggle).toHaveAttribute('data-xgc-mode', 'list');
    expect(toggle).toHaveAccessibleName('Folder view');
    expect(toggle).toHaveAttribute('title', 'Folder view');
    expect(container.querySelector('[data-xgc-role="experiment-folder-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-list-view"]')).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('data-xgc-mode', 'folder');
    expect(toggle).toHaveAccessibleName('List view');
    await waitFor(() => expect(
      window.localStorage.getItem('xgc.experiment.catalog.agent-a.viewMode'),
    ).toBe('"folder"'));
  });

  it('persists System and Template visibility per target independently of the view mode', () => {
    window.localStorage.setItem('xgc.experiment.catalog.agent-a.hideSystem', 'false');
    window.localStorage.setItem('xgc.experiment.catalog.agent-a.hideTemplates', 'true');
    const { container,unmount } = renderWithComposition(
      <ExperimentListRoute {...routeProps(experiment('c1', 1), vi.fn())} />,
    );
    const system = container.querySelector('[data-xgc-role="experiment-protected-visibility-toggle"][data-xgc-id="system"]')!;
    const templates = container.querySelector('[data-xgc-role="experiment-protected-visibility-toggle"][data-xgc-id="templates"]')!;
    expect(system).toHaveAccessibleName('Hide system experiments');
    expect(templates).toHaveAccessibleName('Show template experiments');
    fireEvent.click(system);
    fireEvent.click(templates);
    expect(window.localStorage.getItem('xgc.experiment.catalog.agent-a.hideSystem')).toBe('true');
    expect(window.localStorage.getItem('xgc.experiment.catalog.agent-a.hideTemplates')).toBe('false');
    unmount();

    const restored = renderWithComposition(
      <ExperimentListRoute {...routeProps(experiment('c1', 1), vi.fn())} />,
    );
    expect(restored.container.querySelector('[data-xgc-role="experiment-protected-visibility-toggle"][data-xgc-id="system"]')).toHaveAccessibleName('Show system experiments');
    expect(restored.container.querySelector('[data-xgc-role="experiment-protected-visibility-toggle"][data-xgc-id="templates"]')).toHaveAccessibleName('Hide template experiments');
  });

  it('creates an Experiment with empty Robot bindings and the system Config dashboard', async () => {
    const current = experiment('c1', 1);
    const created = experiment('c2', 2);
    const props = routeProps(current, vi.fn());
    props.catalog.createExperiment = vi.fn().mockResolvedValue(created);
    const { container } = renderWithComposition(<ExperimentListRoute {...props} />);

    fireEvent.click(container.querySelector('[data-xgc-role="experiment-create"]')!);
    fireEvent.change(screen.getByLabelText('Name'),{ target: { value: 'New Experiment' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Create' }));

    await waitFor(() => expect(props.catalog.createExperiment).toHaveBeenCalledOnce());
    const input = vi.mocked(props.catalog.createExperiment).mock.calls[0]?.[0] as CreateStoredExperimentInput | undefined;
    expect(input?.spec.robots).toEqual([]);
    expect(input?.spec.workflowInstances).toEqual([
      expect.objectContaining({ id:'panel-robot-assets' }),
    ]);
    // GCS is user authoring added by a later Commit, not implicit Create state.
    const dashboards: ExperimentDashboard[] = input?.spec.dashboards ?? [];
    expect(dashboards.map((dashboard) => dashboard.id)).toEqual(['config']);
  });

  it('preserves the existing workflow instances when saving settings', async () => {
    const current = experiment('c1', 1);
    current.spec.robots = [{
      id: 'px4-01',
      ref: { domain: 'robot',resourceId: 'robot-1',branch: 'main' },
      namespace: '/uav1',
      hybridSource: 'physical',
      runtimeParameters: {},
      initialPose: { x: 4,y: 2,z: 0,yaw: 0.5 },
      px4: {},
    }];
    const workflowInstances = current.spec.workflowInstances;
    const saveExperimentDraft = vi.fn().mockResolvedValue(current);
    const { container } = renderWithComposition(<ExperimentListRoute {...routeProps(current, saveExperimentDraft)} />);

    fireEvent.click(container.querySelector('[data-xgc-role="experiment-settings"][data-xgc-id="experiment-1"]')!);
    fireEvent.change(screen.getByLabelText('Description'),{ target: { value: 'Updated metadata' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Save' }));

    await waitFor(() => expect(saveExperimentDraft).toHaveBeenCalledOnce());
    const saved = saveExperimentDraft.mock.calls[0]?.[0];
    expect(saved?.spec.description).toBe('Updated metadata');
    expect(saved?.spec.workflowInstances).toEqual(workflowInstances);
  });

  it('does not expose localization offset or workflow graph in settings, and preserves existing instances', async () => {
    const current = experiment('c1', 1);
    const systemWorkflow = {
      ...newSystemPanelWorkflowInstance('opaque-panel'),
      id:'system-owned-workflow',
    };
    const managedWorkflow = workflowInstance('managed-workflow', 'managed-automation');
    const userWorkflow = workflowInstance('survey-workflow', 'survey-automation');
    current.spec.localizationOffset = { x:1.25,y:-0.5,z:0.25 };
    current.spec.workflowInstances = [systemWorkflow,managedWorkflow,userWorkflow];
    current.spec.dashboards = [{
      id:'gcs',name:'GCS',description:'',panels:[
        panel('managed-panel', [newPanelWorkflowBinding(managedWorkflow.id, true)]),
        panel('system-panel', [newPanelWorkflowBinding(systemWorkflow.id, false)]),
      ],
    }];
    const saveExperimentDraft = vi.fn().mockImplementation(async (document: ExperimentDocument) => document);
    const { container } = renderWithComposition(
      <ExperimentListRoute {...routeProps(current, saveExperimentDraft)} />,
    );

    fireEvent.click(container.querySelector('[data-xgc-role="experiment-settings"][data-xgc-id="experiment-1"]')!);

    expect(container.querySelector('[data-xgc-role="experiment-settings-localization-offset"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-localization-offset-x"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-settings-workflow-graph"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-workflow-instance"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-settings-parameter-binding-add"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-settings-stage-profile"]')).toBeNull();
    expect(screen.queryByText('Localization offset')).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow graph')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name:'Add workflow' })).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow instance')).not.toBeInTheDocument();
    expect(screen.queryByText('Execution target')).not.toBeInTheDocument();
    expect(screen.queryByText('Action presets')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Description'), { target:{ value:'Updated metadata' } });
    fireEvent.click(screen.getByRole('button', { name:'Save' }));

    await waitFor(() => expect(saveExperimentDraft).toHaveBeenCalledOnce());
    const saved = saveExperimentDraft.mock.calls[0]?.[0] as ExperimentDocument | undefined;
    expect(saved?.spec.description).toBe('Updated metadata');
    expect(saved?.spec.localizationOffset).toEqual({ x:1.25,y:-0.5,z:0.25 });
    expect(saved?.spec.workflowInstances).toEqual([
      systemWorkflow,
      managedWorkflow,
      userWorkflow,
    ]);
  });

  it('closes a stale settings drawer and requires reopening after a commit conflict', async () => {
    const stale = experiment('c1', 1);
    const latest = experiment('c2', 2);
    latest.spec.name = 'Latest name';
    const saveExperimentDraft = vi.fn().mockRejectedValueOnce(new ExperimentCommitConflict('409 Conflict', latest));
    const props = routeProps(stale, saveExperimentDraft);
    const { container,rerender } = renderWithComposition(<ExperimentListRoute {...props} />);

    fireEvent.click(container.querySelector('[data-xgc-role="experiment-settings"][data-xgc-id="experiment-1"]')!);
    expect(container.querySelector('[data-xgc-role="experiment-settings-drawer"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-settings-parameter-binding-add"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-settings-stage-profile"]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My stale edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(container.querySelector('[data-xgc-role="experiment-settings-drawer"]')).toBeNull());
    expect(container.querySelector('[data-xgc-role="experiment-list-error"]')).toBeNull();
    expect(notificationMocks.useError).toHaveBeenCalledWith(
      'agent-a',expect.stringContaining('reopen settings'),expect.objectContaining({ source: 'experiment-list' }),
    );
    expect(saveExperimentDraft).toHaveBeenCalledOnce();

    rerender(<ExperimentListRoute {...routeProps(latest, saveExperimentDraft)} />);
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-settings"][data-xgc-id="experiment-1"]')!);
    expect(screen.getByLabelText('Name')).toHaveValue('Latest name');
  });

  it('closes a stale tag dialog instead of rebasing over a newer revision', async () => {
    const stale = experiment('c1', 1);
    const latest = experiment('c2', 2);
    const saveExperimentDraft = vi.fn().mockRejectedValueOnce(new ExperimentCommitConflict('409 Conflict', latest));
    const { container } = renderWithComposition(<ExperimentListRoute {...routeProps(stale, saveExperimentDraft)} />);

    fireEvent.click(container.querySelector('[data-xgc-role="experiment-edit-tags"][data-xgc-id="experiment-1"]')!);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '新标签' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));

    await waitFor(() => expect(container.querySelector('[data-xgc-role="experiment-tag-dialog"]')).toBeNull());
    expect(container.querySelector('[data-xgc-role="experiment-list-error"]')).toBeNull();
    expect(notificationMocks.useError).toHaveBeenCalledWith(
      'agent-a',expect.stringContaining('reopen tags'),expect.objectContaining({ source: 'experiment-list' }),
    );
    expect(saveExperimentDraft).toHaveBeenCalledOnce();
  });

  it('clears settings errors before every attempt so identical failures notify again and success stays clear', async () => {
    const current = experiment('c1', 1);
    const saveExperimentDraft = vi.fn()
      .mockRejectedValueOnce(new Error('Save unavailable'))
      .mockRejectedValueOnce(new Error('Save unavailable'))
      .mockResolvedValueOnce(current);
    const { container } = renderWithComposition(
      <ExperimentListRoute {...routeProps(current, saveExperimentDraft)} />,
    );

    fireEvent.click(container.querySelector('[data-xgc-role="experiment-settings"][data-xgc-id="experiment-1"]')!);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated metadata' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveExperimentDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notificationMocks.useError).toHaveBeenLastCalledWith(
      'agent-a','Save unavailable',expect.objectContaining({ source: 'experiment-list' }),
    ));
    const firstFailureNotifications = notificationCallCount('Save unavailable');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveExperimentDraft).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(notificationCallCount('Save unavailable'))
      .toBeGreaterThan(firstFailureNotifications));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(container.querySelector('[data-xgc-role="experiment-settings-drawer"]')).toBeNull());
    expect(saveExperimentDraft).toHaveBeenCalledTimes(3);
    expect(notificationMocks.useError).toHaveBeenLastCalledWith(
      'agent-a','',expect.objectContaining({ source: 'experiment-list' }),
    );
  });
});

function notificationCallCount(message: string) {
  return notificationMocks.useError.mock.calls.filter((call) => call[1] === message).length;
}

function routeProps(
  document: ExperimentDocument,
  saveExperimentDraft: (experiment: ExperimentDocument, reason?: string) => Promise<ExperimentDocument>,
  runningExperimentIds: ReadonlySet<string> = new Set(),
) {
  return {
    targetId: 'agent-a',
    catalog: {
      experiments: [document],namespaces: [],loaded: true,loading: false,experimentsResolved: true,error: '',
      refresh: vi.fn(),saveExperimentDraft,createExperiment: vi.fn(),archiveExperiment: vi.fn(),
      createNamespace: vi.fn(),updateNamespace: vi.fn(),archiveNamespace: vi.fn(),
    },
    selectedExperimentId: '',
    runningExperimentIds,
    setSelectedExperimentId: vi.fn(),
    openDashboard: vi.fn(),
  };
}

function experiment(commitId: string, revision: number): ExperimentDocument {
  return {
    head: {
      domain: 'experiment',resourceId: 'experiment-1',name: 'Experiment',tags: [],
      mainCommitId: commitId,currentVersion: revision,digest: 'd',revision,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'experiment',resourceId: 'experiment-1',name: 'main',headCommitId: commitId,
      headVersion: revision,revision,createdAt: '',updatedAt: '',
    },
    spec: {
      schemaVersion: 15,name: 'Experiment',description: '',tags: ['demo'],
      runModes: ['simulation','physical'],
      localizationOffset:{ x:0,y:0,z:0 },
      robots: [],workflowInstances: [],
      dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
    },
  };
}

function workflowInstance(id: string, resourceId: string): ExperimentWorkflowInstance {
  return {
    id,
    ref:{ domain:'automation',resourceId,branch:'main' },
    actionPresets:[{
      id:'run',actionId:'run',inputs:{},parameterBindings:[],
    }],
  };
}

function panel(id: string, portBindings: ExperimentPanel['portBindings']): ExperimentPanel {
  return {
    schemaVersion:PANEL_SCHEMA_VERSION,
    id,
    pluginId:'test-panel',
    title:'Test panel',
    grid:{ x:0,y:0,w:6,h:4 },
    view:{ query:{},options:{},fieldConfig:{} },
    portBindings,
  };
}
