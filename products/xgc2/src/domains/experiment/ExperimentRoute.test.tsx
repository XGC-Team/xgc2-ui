// @vitest-environment jsdom

import { fireEvent,render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../../profiles/core-dev';
import { ProductWebCompositionProvider } from '../../shared/productWebComposition';
import type * as ExecutionPublicModule from '../execution/executionPublic';
import { RobotAssetKindCompositionProvider } from '../robot/robotAssetPublic';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';
import type { ExperimentDocument } from './experimentModel';
import { ExperimentRoute } from './ExperimentRoute';

function renderWithComposition(ui: ReactElement) {
  const view = render(
    <ProductWebCompositionProvider composition={productWebComposition}>
      <RobotAssetKindCompositionProvider composition={robotAssetKindCompositionWithUnitreeB2}>
        {ui}
      </RobotAssetKindCompositionProvider>
    </ProductWebCompositionProvider>,
  );
  return {
    ...view,
    rerender: (next: ReactElement) => view.rerender(
      <ProductWebCompositionProvider composition={productWebComposition}>
        <RobotAssetKindCompositionProvider composition={robotAssetKindCompositionWithUnitreeB2}>
          {next}
        </RobotAssetKindCompositionProvider>
      </ProductWebCompositionProvider>,
    ),
  };
}

const mocks = vi.hoisted(() => ({
  useExperimentCatalog: vi.fn(),
  useExperimentLocation: vi.fn(),
  useRobotAssetStore: vi.fn(),
  useAutomationWorkspace: vi.fn(),
  selectedExecutionTargetId: vi.fn(),
  useGroundStationErrorNotification: vi.fn(),
  useStationExperimentOccupancy: vi.fn(() => ({ runningExperimentIds: new Set<string>(),resolved: true,error:'' })),
  listRoute: vi.fn(),
  dashboardRoute: vi.fn(),
  gcsMode: false,
  setView: vi.fn(),
  setSelectedExperimentId: vi.fn(),
  replaceDetailResourceId: vi.fn(),
  replaceInvalidDetailWithList: vi.fn(),
}));
vi.mock('./useExperimentCatalog', () => ({ useExperimentCatalog: mocks.useExperimentCatalog }));
vi.mock('./useExperimentLocation', () => ({ useExperimentLocation: mocks.useExperimentLocation }));
vi.mock('./useExperimentListRunningIds', () => ({
  useStationExperimentOccupancy: mocks.useStationExperimentOccupancy,
  useExperimentListRunningIds: () => mocks.useStationExperimentOccupancy().runningExperimentIds,
}));
vi.mock('../../app/navigationContext', () => ({
  useNavigation: () => ({ gcsMode: mocks.gcsMode,page: 'experiment' }),
}));
vi.mock('../automation/automationPublic', () => ({ useAutomationWorkspace: (targetId: string) => mocks.useAutomationWorkspace(targetId) }));
vi.mock('../robot/robotAssetStore', () => ({ useRobotAssetStore: mocks.useRobotAssetStore }));
vi.mock('../execution/executionPublic', async (importOriginal) => ({
  ...await importOriginal<typeof ExecutionPublicModule>(),
  selectedExecutionTargetId: () => mocks.selectedExecutionTargetId(),
}));
vi.mock('../groundStationInteraction/groundStationInteractionPublic', () => ({
  useGroundStationErrorNotification: mocks.useGroundStationErrorNotification,
  GroundStationActivityScopeProvider: ({ children }: { children: ReactElement }) => children,
}));
vi.mock('../core/corePublic', () => ({ useCoreNodes: () => [] }));
vi.mock('./routes/ExperimentListRoute', () => ({
  ExperimentListRoute: (props: unknown) => {
    mocks.listRoute(props);
    return <section data-xgc-role="experiment-list-route" />;
  },
}));
vi.mock('./routes/ExperimentDashboardRoute', () => ({
  ExperimentDashboardRoute: (props: unknown) => {
    mocks.dashboardRoute(props);
    return <nav data-xgc-role="experiment-dashboard-tabs" />;
  },
}));

describe('ExperimentRoute binding authority', () => {
  beforeEach(() => {
    mocks.setView.mockReset();
    mocks.setSelectedExperimentId.mockReset();
    mocks.replaceDetailResourceId.mockReset();
    mocks.replaceInvalidDetailWithList.mockReset();
    mocks.dashboardRoute.mockReset();
    mocks.listRoute.mockReset();
    mocks.useGroundStationErrorNotification.mockReset();
    mocks.useStationExperimentOccupancy.mockReset();
    mocks.useStationExperimentOccupancy.mockReturnValue({
      runningExperimentIds: new Set<string>(),resolved: true,error:'',
    });
    mocks.gcsMode = false;
    mocks.selectedExecutionTargetId.mockReturnValue('local');
    mocks.useAutomationWorkspace.mockImplementation((targetId: string) => automationRuntime(targetId));
    mockWorkspace();
  });

  it('does not render stale cached content before typed references load', () => {
    mockWorkspace({ loaded: false });
    const { container } = renderWithComposition(<ExperimentRoute />);
    expect(container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-list-route"]')).toBeNull();
  });

  it('replaces a missing detail only after the Experiment catalog resolves authoritatively', () => {
    mockWorkspace({ experiments: [],selectedExperimentId: 'missing',experimentsResolved: false,error: 'Core unavailable' });
    const { rerender } = renderWithComposition(<ExperimentRoute />);
    expect(mocks.replaceInvalidDetailWithList).not.toHaveBeenCalled();

    mockWorkspace({ experiments: [],selectedExperimentId: 'missing',experimentsResolved: true,error: '' });
    rerender(<ExperimentRoute />);
    expect(mocks.replaceInvalidDetailWithList).toHaveBeenCalledOnce();
  });

  it('replaces one legacy local-fleet deep link with the current ordinary fixture identity',() => {
    const current = document();
    current.head.resourceId = 'current-six';
    current.branch.resourceId = 'current-six';
    current.spec.name = '6 PX4 multirotors experiment';
    current.spec.tags = ['devfixture','px4'];
    mockWorkspace({
      experiments:[current],
      selectedExperimentId:'11e9d34e-a4b7-442c-8743-f62b26df3f24',
      selectedDashboardId:'gcs',
    });

    renderWithComposition(<ExperimentRoute />);

    expect(mocks.replaceDetailResourceId).toHaveBeenCalledWith('current-six');
    expect(mocks.replaceInvalidDetailWithList).not.toHaveBeenCalled();
  });

  it.each(['list', 'detail'] as const)('keeps a persistent unavailable state with Retry in the %s view', (view) => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mocks.selectedExecutionTargetId.mockReturnValue('agent-a');
    mockWorkspace({
      view,
      experiments: [],
      selectedExperimentId: view === 'detail' ? 'missing' : '',
      experimentsResolved: false,
      error: 'Core unavailable',
      refresh,
    });

    const { container } = renderWithComposition(<ExperimentRoute />);
    const unavailable = container.querySelector('[data-xgc-role="experiment-catalog-unavailable"][data-xgc-id="agent-a"]');

    expect(unavailable).toHaveTextContent('Experiments unavailable');
    expect(unavailable).toHaveTextContent('Core unavailable');
    expect(container.querySelector('[data-xgc-role="experiment-list-route"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="experiment-catalog-retry"][data-xgc-id="agent-a"]')!);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not present an unresolved retry as an empty Experiment catalog', () => {
    mockWorkspace({
      view: 'list',
      experiments: [],
      selectedExperimentId: '',
      experimentsResolved: false,
      loading: true,
      error: '',
    });

    const { container } = renderWithComposition(<ExperimentRoute />);

    expect(container.querySelector('[data-xgc-role="experiment-catalog-loading"]')).toBeNull();
    expect(container).not.toHaveTextContent('Loading experiments');
    expect(container.querySelector('[data-xgc-role="experiment-list-route"]')).toBeNull();
  });

  it('does not paint Loading experiments before the first listing attempt finishes', () => {
    mockWorkspace({
      view: 'list',
      experiments: [],
      selectedExperimentId: '',
      loaded: false,
      experimentsResolved: false,
      loading: true,
      error: '',
    });

    const { container } = renderWithComposition(<ExperimentRoute />);

    expect(container.querySelector('[data-xgc-role="experiment-catalog-loading"]')).toBeNull();
    expect(container).not.toHaveTextContent('Loading experiments');
    expect(container.querySelector('[data-xgc-role="experiment-list-route"]')).toBeNull();
  });

  it('keeps the dashboard tree parked while the Experiment list is showing', () => {
    mockWorkspace({ view: 'detail' });
    const view = renderWithComposition(<ExperimentRoute />);
    expect(view.container.querySelector('[data-xgc-role="experiment-dashboard-surface"]'))
      .not.toHaveAttribute('hidden');
    expect(view.container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();

    mockWorkspace({ view: 'list' });
    view.rerender(<ExperimentRoute />);

    expect(view.container.querySelector('[data-xgc-role="experiment-list-route"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-xgc-role="experiment-dashboard-surface"]'))
      .toHaveAttribute('hidden');
    expect(view.container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();
  });

  it('passes the selected Agent to the list without moving station occupancy off local', () => {
    mocks.selectedExecutionTargetId.mockReturnValue('agent-a');
    mockWorkspace({ view: 'list',selectedExperimentId: '' });

    renderWithComposition(<ExperimentRoute />);

    expect(mocks.listRoute).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'agent-a' }));
    expect(mocks.useStationExperimentOccupancy).toHaveBeenCalledWith(
      'local',
    );
  });

  it('observes only the active Experiment Session service for station occupancy',() => {
    const automation = automationRuntime('local');
    mocks.useAutomationWorkspace.mockReturnValue(automation);
    mockWorkspace();

    renderWithComposition(<ExperimentRoute />);

    expect(mocks.useStationExperimentOccupancy).toHaveBeenCalledWith(
      'local',
    );
  });

  it('disables other Experiment Runs when the station already has an active Run, without a Notice banner', () => {
    const other = document();
    other.head.resourceId = 'exp-run';
    other.branch.resourceId = 'exp-run';
    other.spec.name = 'Running experiment';
    mocks.useStationExperimentOccupancy.mockReturnValue({
      runningExperimentIds: new Set(['exp-run']),resolved: true,error:'',
    });
    mockWorkspace({
      experiments: [document(), other],
      selectedExperimentId: 'exp-1',
    });

    const { container } = renderWithComposition(<ExperimentRoute />);

    expect(container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-experiment-health-warning')).toBeNull();
    expect(mocks.dashboardRoute).toHaveBeenCalledWith(expect.objectContaining({
      experiment: expect.objectContaining({
        experimentAdmissionDisabledReason: 'Another Experiment is already running.',
        stationOccupancyResolved: true,
      }),
    }));
  });

  it('does not fence the Experiment that currently owns the station Run', () => {
    mocks.useStationExperimentOccupancy.mockReturnValue({
      runningExperimentIds: new Set(['exp-1']),resolved: true,error:'',
    });
    mockWorkspace();

    renderWithComposition(<ExperimentRoute />);

    expect(mocks.dashboardRoute).toHaveBeenCalledWith(expect.objectContaining({
      experiment: expect.objectContaining({
        experimentAdmissionDisabledReason: '',
        stationOccupancyResolved: true,
      }),
    }));
  });

  it('keeps a legal experiment open in degraded mode when a referenced resource is unavailable', () => {
    mockWorkspace({ robotAssets: [] });
    const { container } = renderWithComposition(<ExperimentRoute />);
    expect(container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="experiment-binding-warning"]')).toHaveTextContent('Robot binding');
    expect(mocks.setView).not.toHaveBeenCalled();
  });

  it('opens after the Robot ref resolves without an Automation binding', () => {
    mockWorkspace();
    const { container } = renderWithComposition(<ExperimentRoute />);
    expect(container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();
    expect(mocks.dashboardRoute).toHaveBeenCalledWith(expect.objectContaining({
      experiment: expect.objectContaining({
        robotAssetCatalog: expect.objectContaining({
          assets: [expect.objectContaining({ head: expect.objectContaining({ resourceId: 'robot-1' }) })],
          loading: false,
          error: '',
        }),
        experimentAdmissionDisabledReason: '',
      }),
    }));
  });

  it('admits a stored Unitree B2 reference for physical Experiment panels (connector may still be offline)', () => {
    mockWorkspace({
      robotAssets: [{
        head: head('robot','robot-1','B2 01'),
        branch: branch('robot','robot-1'),
        spec: {
          name: 'B2 01',description: '',tags: [],kind: 'unitree_b2',profileId: 'unitree.b2.v1',
          unitreeB2: {
            serialNumber: 'b2-01.lab.local',
            robotAddress: 'b2-01.lab.local',
            rosDomainId: 42,
            sshUsername: 'thor',
            sshPassword: '1',
          },
        },
      }],
    });
    const { container } = renderWithComposition(<ExperimentRoute />);

    expect(container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="experiment-robot-admission-disabled"]'))
      .not.toBeInTheDocument();
    expect(mocks.dashboardRoute).toHaveBeenCalledWith(expect.objectContaining({
      experiment: expect.objectContaining({
        experimentAdmissionDisabledReason: '',
      }),
    }));
  });

  it('scopes GCS browser interaction guards to a concrete Experiment dashboard', () => {
    mocks.gcsMode = true;
    mockWorkspace({ view: 'list',selectedExperimentId: '' });
    const list = renderWithComposition(<ExperimentRoute />);
    const listZoom = new WheelEvent('wheel', { ctrlKey: true,cancelable: true });
    window.dispatchEvent(listZoom);
    expect(listZoom.defaultPrevented).toBe(false);
    list.unmount();

    mockWorkspace();
    renderWithComposition(<ExperimentRoute />);
    const dashboardZoom = new WheelEvent('wheel', { ctrlKey: true,cancelable: true });
    window.dispatchEvent(dashboardZoom);
    expect(dashboardZoom.defaultPrevented).toBe(true);
  });

  it('keeps the dashboard open and sends a Robot catalog failure to the global notification host', () => {
    mockWorkspace({ robotError: 'Robot catalog unavailable' });
    const { container } = renderWithComposition(<ExperimentRoute />);

    expect(container.querySelector('[data-xgc-role="experiment-dashboard-tabs"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="experiment-robot-binding-catalog-error"]'))
      .toBeNull();
    expect(mocks.useGroundStationErrorNotification).toHaveBeenCalledWith(
      'local','Robot bindings: Robot catalog unavailable',
      expect.objectContaining({ source: 'experiment-robot-bindings' }),
    );
  });

  it('loads a separate local Automation runtime only for a remote dashboard target', () => {
    mocks.selectedExecutionTargetId.mockReturnValue('agent-a');
    mockWorkspace();

    renderWithComposition(<ExperimentRoute />);

    expect(mocks.useAutomationWorkspace).toHaveBeenCalledWith('agent-a');
    expect(mocks.useAutomationWorkspace).toHaveBeenCalledWith('local');
    expect(mocks.dashboardRoute).toHaveBeenCalledWith(expect.objectContaining({
      experiment: expect.objectContaining({
        automationRuntime: expect.objectContaining({ targetId: 'agent-a' }),
        localAutomationRuntime: expect.objectContaining({ targetId: 'local' }),
      }),
      environment: expect.objectContaining({ executionTargetId: 'agent-a' }),
    }));
  });
});

function automationRuntime(targetId: string) {
  return {
    targetId,documents: [],catalog: [],runSummaries: [],runDetailsById: {},loading: false,error: '',
    start: vi.fn(),runDocument: vi.fn(),runBoundAutomation: vi.fn(),stop: vi.fn(),loadRunDetail: vi.fn(),refreshExecutionHistory: vi.fn().mockResolvedValue([]),
  };
}

function workspace(overrides: Record<string,unknown> = {}) {
  const experiment = document();
  return {
    view: 'detail',setView: mocks.setView,experiments: [experiment],setExperiments: vi.fn(),namespaces: [],setNamespaces: vi.fn(),
    robotAssets: [{
      head: head('robot','robot-1','PX4 1'),
      branch: branch('robot','robot-1'),
      spec: {
        name: 'PX4 1',description: '',tags: [],kind: 'px4_multirotor',profileId: 'px4.multirotor.ros1.v9',
        px4: {
          modelId: 'fs150',mavSystemId: 1,managementIp: '192.0.2.10',sshUsername: 'pilot',sshPassword: 'secret',
          mocapRigidBodyName: 'uav1',physicalMavrosLocalPort: 9010,physicalFcuRemotePort: 14550,
          simulationLocalPort: 15000,simulationRemotePort: 15300,
          simulation: { productId: 'xgc2-gazebo-sim-fs150-sitl',launchPackage: 'gazebo_sim_fs150_sitl',launchFile: 'fs150.launch' },
        },
      },
    }],
    loaded: true,loading: false,experimentsResolved: true,error: '',robotError: '',selectedExperimentId: 'exp-1',selectedDashboardId:'gcs',setSelectedExperimentId: mocks.setSelectedExperimentId,selectedExperiment: experiment,refresh: vi.fn(),saveExperimentDraft: vi.fn(),
    ...overrides,
  };
}

function mockWorkspace(overrides: Record<string,unknown> = {}) {
  const state = workspace(overrides);
  mocks.useExperimentCatalog.mockReturnValue({
    experiments: state.experiments,namespaces: state.namespaces,loaded: state.loaded,loading: state.loading,
    experimentsResolved: state.experimentsResolved,error: state.error,refresh: state.refresh,
    saveExperimentDraft: state.saveExperimentDraft,createExperiment: vi.fn(),archiveExperiment: vi.fn(),
    createNamespace: vi.fn(),updateNamespace: vi.fn(),archiveNamespace: vi.fn(),
  });
  mocks.useExperimentLocation.mockReturnValue({
    view: state.view,setView: state.setView,selectedExperimentId: state.selectedExperimentId,
    setSelectedExperimentId: state.setSelectedExperimentId,
    selectedDashboardId:state.selectedDashboardId,setSelectedDashboardId:vi.fn(),
    replaceDetailResourceId:mocks.replaceDetailResourceId,
    replaceInvalidDetailWithList: mocks.replaceInvalidDetailWithList,
  });
  mocks.useRobotAssetStore.mockReturnValue({
    assets: state.robotAssets,
    namespaces: [],
    loaded: true,
    loading: false,
    error: state.robotError,
  });
}

function document(): ExperimentDocument {
  return { head: head('experiment','exp-1','Experiment'),branch: branch('experiment','exp-1'),spec: { schemaVersion: 15,name: 'Experiment',description: '',tags: [],runModes: ['simulation','physical'],localizationOffset:{ x:0,y:0,z:0 },dashboards: [{ id: 'gcs',name: 'GCS',description: '',panels: [] }],
    robots: [{
      id: 'leader',ref: { domain: 'robot',resourceId: 'robot-1',branch: 'main' },namespace: '/uav1',
      hybridSource: 'physical',runtimeParameters: {},initialPose: { x: 0,y: 0,z: 0,yaw: 0 },
    }],workflowInstances: [],
  } };
}

function head(domain: string, resourceId: string, name: string) { return { domain,resourceId,name,tags: [],mainCommitId: 'c1',currentVersion: 1,digest: 'd',revision: 1,createdAt: '',updatedAt: '' }; }
function branch(domain: string, resourceId: string) { return { domain,resourceId,name: 'main',headCommitId: 'c1',headVersion: 1,revision: 1,createdAt: '',updatedAt: '' }; }
