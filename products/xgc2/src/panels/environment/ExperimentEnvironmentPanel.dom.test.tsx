/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import {
  createDashboardRunStore,
  DashboardRunStoreProvider,
  type DashboardRunPublisher,
  type DashboardRunSnapshot,
} from '../../domains/experiment/experimentPublic';
import type { ExperimentEnvironment,PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelPluginProps } from '../types';
import { ExperimentEnvironmentPanel } from './ExperimentEnvironmentPanel';
import {
  ExperimentEnvironmentPanelFrameProvider,
  ExperimentEnvironmentPanelHeaderLeading,
  ExperimentEnvironmentPanelHeaderActions,
} from './experimentEnvironmentFrame';

const nav = vi.hoisted(() => ({
  managedHostId: 'local',
}));

const environments = vi.hoisted(() => ({
  current: [] as ExperimentEnvironment[],
  error: '',
  powerError: '',
  options: null as null | {
    worldImage: string;
    worldRequired?: boolean;
    sceneName: string;
    profiles: { id: string;os: string;version: string;ros: string;installed: boolean }[];
    slots: { slotId: string;robotName: string;profile: string;imageReady: boolean }[];
  },
  optionsError: '',
  optionsPlacement: undefined as undefined | string,
  createError: '',
  created: null as unknown,
  lifecycle: null as null | { action: string; experimentId: string; generationId: string; slotIds?: readonly string[] },
  radio: null as null | {
    experimentId: string;
    generationId: string;
    settings: { delayMs: number;lossPercent: number;reorderPercent: number };
    slotIds?: readonly string[];
  },
  listCalls: 0,
}));

const liveHosts = vi.hoisted(() => {
  let hosts: { id: string;displayName: string;enrollment: string;connectivity: string;managementConnection: string }[] = [];
  const listeners = new Set<() => void>();
  return {
    get: () => hosts,
    replace: (next: typeof hosts) => {
      hosts = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

const observation = vi.hoisted(() => ({
  retain: vi.fn(() => vi.fn()),
}));


vi.mock('../../app/navigationContext', () => ({
  useNavigation: (select: (state: { managedHostId: string }) => unknown) => select(nav),
}));

vi.mock('../../domains/experiment/experimentPublic', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listExperimentEnvironments: () => {
      environments.listCalls += 1;
      return environments.error ? Promise.reject(new Error(environments.error)) : Promise.resolve(environments.current);
    },
    startContainerLifecycle: (
      _targetId: string,
      action: string,
      experimentId: string,
      generationId: string,
      slotIds?: readonly string[],
    ) => {
      environments.lifecycle = { action, experimentId, generationId, ...(slotIds ? { slotIds } : {}) };
      return environments.powerError
        ? Promise.reject(new Error(environments.powerError))
        : Promise.resolve({ id: 'run-life', status: 'running', revision: 2 });
    },
    applyExperimentRadio: (
      _targetId: string,
      experimentId: string,
      generationId: string,
      settings: { delayMs: number;lossPercent: number;reorderPercent: number },
      slotIds?: readonly string[],
    ) => {
      environments.radio = { experimentId, generationId, settings, ...(slotIds ? { slotIds } : {}) };
      return Promise.resolve({ id: 'run-radio', status: 'running', revision: 2 });
    },
    getExperimentEnvironmentOptions: (_experimentId: string, placement?: string) => {
      environments.optionsPlacement = placement;
      return environments.optionsError
        ? Promise.reject(new Error(environments.optionsError))
        : Promise.resolve(environments.options);
    },
    createExperimentEnvironment: (_experimentId: string, body: unknown) => {
      environments.created = body;
      return environments.createError
        ? Promise.reject(new Error(environments.createError))
        : Promise.resolve(environments.current[0] ?? presence('offline'));
    },
  };
});

vi.mock('../../domains/managedHost/managedHostPublic', async () => {
  const React = await import('react');
  return {
    useManagedHosts: () => React.useSyncExternalStore(liveHosts.subscribe, liveHosts.get, liveHosts.get),
  };
});

vi.mock('../../domains/host/hostPublic', () => ({
  HostFilesWorkspace: function Files({ managedHostId,initialDirectory }: { managedHostId: string;initialDirectory: string }) {
    const [openedFor] = useState(managedHostId);
    return <div data-xgc-role="experiment-environment-files" data-xgc-id={managedHostId} data-directory={initialDirectory} data-opened-for={openedFor} />;
  },
  HostSettingsPanel: function Settings({ apiTarget }: { apiTarget: { managedHostId?: string } }) {
    return <div data-xgc-role="experiment-environment-agent-settings" data-xgc-id={apiTarget.managedHostId ?? ''} />;
  },
}));

vi.mock('../../domains/terminal/terminalPublic', () => ({
  defineTerminalComposition: (value: unknown) => value,
  TerminalLocalShellLeaf: true,
  TerminalPage: ({ managedHostId }: { managedHostId?: string }) => (
    <div data-xgc-role="experiment-environment-terminal-page" data-xgc-id={managedHostId ?? ''} />
  ),
}));

const panel = {
  id: 'environment-1',
  pluginId: 'experiment-environment',
  title: 'Environment',
  gridPos: { x: 0,y: 0,w: 10,h: 8 },
  query: {},
  options: {},
  fieldConfig: {},
  portBindings: [],
} satisfies PanelInstance;

function context(
  sessionState: 'active' | 'succeeded' = 'succeeded',
  selectedPlacement?: 'centralized' | 'per-robot',
): PanelPluginProps<readonly ['experiment']>['context'] {
  return {
    executionTargetId: 'local',
    ports: {
      actions: {},
      authoring: {},
      interactions: {},
      data: {
        robots: {
          id: 'robots',
          label: 'Experiment',
          contract: 'experiment.robots.v1',
          connected: true,
          value: { head: { resourceId: 'exp-a' },spec: { name: 'Field A' } },
          trace: {},
        },
        'robot-runtime': {
          id: 'robot-runtime',
          label: 'Experiment runtime',
          contract: 'experiment.runtime.v1',
          connected: true,
          value: {
            targetId: 'local',
            processInstances: [],
            documents: [],
            catalog: [],
            runSummaries: [],
            runDetailsById: {},
            loading: false,
            error: '',
            ...(selectedPlacement ? { selectedPlacement } : {}),
            sessionViews: [{
              session: {
                id: 'session-1',
                targetId: 'local',
                experimentResourceId: 'exp-a',
                state: sessionState,
                mode: 'full',
                runMode: 'simulation',
                revision: 1,
              },
              members: [],
            }],
          },
          trace: {},
        },
      },
    },
  };
}

function presence(connectivity: 'ready' | 'offline'): ExperimentEnvironment {
  return {
    experimentId: 'exp-a',
    generationId: '1',
    phase: 'powered',
    connected: connectivity === 'ready',
    coreEndpoint: '10.88.0.251:9092',
    experimentCommitId: 'commit',
    radio: { name: 'radio',cidr: '10.88.0.0/24',gateway: '10.88.0.251' },
    physics: { name: 'physics',cidr: '10.89.0.0/24',gateway: '10.89.0.251' },
    rosMasterUri: 'http://10.89.0.252:11311',
    gazeboMasterUri: 'http://10.89.0.253:11345',
    agentLinkListening: true,
    instances: [{
      slotId: 'slot-1',
      role: 'robot',
      profile: 'fs150-focal-noetic',
      agentId: 'agent-a',
      displayName: 'Field A/UAV 1',
      containerName: 'container-a',
      image: 'robot@sha256:aa',
      radioAddress: '10.88.0.10',
      physicsAddress: '10.89.0.10',
      workspacePath: '/var/lib/xgc2-managed',
      managedHost: {
        id: 'agent-a',
        displayName: 'Field A/UAV 1',
        enrollment: 'enrolled',
        connectivity,
        managementConnection: 'idle',
      },
    }],
  };
}

/** Three powered robots holding an applied, a failed, and no receipt for 50 ms · 5% · 1%. */
function radioEnvironment(): ExperimentEnvironment {
  const base = presence('ready');
  const robot = base.instances[0]!;
  const settings = { delayMs: 50,lossPercent: 5,reorderPercent: 1 };
  return {
    ...base,
    radioImpairment: {
      ...settings,
      applied: false,
      applyError: 'uav-2: nsenter: permission denied',
      receipts: {
        'uav-1': { ...settings,containerId: 'id-uav-1',applied: true },
        'uav-2': { ...settings,containerId: 'id-uav-2',applied: false,error: 'nsenter: permission denied' },
      },
    },
    instances: [
      { ...robot,slotId: 'uav-1',role: 'slot',agentId: 'agent-1',displayName: 'Field A/UAV 1',containerId: 'id-uav-1',radio: 'applied' },
      {
        ...robot,slotId: 'uav-2',role: 'slot',agentId: 'agent-2',displayName: 'Field A/UAV 2',containerId: 'id-uav-2',
        radio: 'failed',radioError: 'nsenter: permission denied',
      },
      { ...robot,slotId: 'uav-3',role: 'slot',agentId: 'agent-3',displayName: 'Field A/UAV 3',containerId: 'id-uav-3',radio: 'pending' },
    ],
  };
}

let runStore: DashboardRunPublisher;

function lifecycleRuntime(details: DashboardRunSnapshot['automation']['runDetailsById'] = {}): DashboardRunSnapshot['automation'] {
  return {
    targetId: 'local',
    documents: [],catalog: [],runSummaries: [],loading: false,error: '',
    runDocument: vi.fn(),runBoundAutomation: vi.fn(),stop: vi.fn(),cancel: vi.fn(),
    stopRunSet: vi.fn(),refreshExecutionHistory: vi.fn(),
    runDetailsById: details,
    retainRunObservation: observation.retain,
    retainRunDetail: () => () => undefined,
    loadRunDetail: async () => ({ invocations: [],nodeSummaries: [],loading: false,error: '' }),
  };
}

function lifecycleSnapshot(details: DashboardRunSnapshot['automation']['runDetailsById'] = {}): DashboardRunSnapshot {
  const runtime = lifecycleRuntime(details);
  return {
    actions: {} as DashboardRunSnapshot['actions'],
    automation: runtime,
    localAutomation: runtime,
    runtimes: new Map([['local',runtime]]),
  };
}

function renderPanel(
  sessionState: 'active' | 'succeeded' = 'succeeded',
  selectedPlacement?: 'centralized' | 'per-robot',
) {
  return render(
    <DashboardRunStoreProvider value={runStore}>
      <ExperimentEnvironmentPanelFrameProvider panel={panel}>
        <ExperimentEnvironmentPanelHeaderLeading panel={panel} editing={false} />
        <ExperimentEnvironmentPanelHeaderActions panel={panel} editing={false} />
        <ExperimentEnvironmentPanel panel={panel} context={context(sessionState, selectedPlacement)} />
      </ExperimentEnvironmentPanelFrameProvider>
    </DashboardRunStoreProvider>,
  );
}

function openOperations() {
  if (!document.querySelector('[data-xgc-role="experiment-environment-operations-drawer"]')) {
    fireEvent.click(screen.getByRole('button', { name: 'Environment operations' }));
  }
}

function closeOperations() {
  fireEvent.click(screen.getByRole('button', { name: 'Close environment operations' }));
}

describe('Experiment environment panel', () => {
  beforeEach(() => {
    nav.managedHostId = 'local';
    window.localStorage.clear();
    environments.error = '';
    environments.powerError = '';
    environments.options = null;
    environments.optionsError = '';
    environments.optionsPlacement = undefined;
    environments.createError = '';
    environments.created = null;
    environments.lifecycle = null;
    environments.radio = null;
    environments.listCalls = 0;
    environments.current = [presence('ready')];
    liveHosts.replace([]);
    observation.retain.mockClear();
    runStore = createDashboardRunStore(lifecycleSnapshot());
  });

  it('opens files for the environment Agent and not another experiment', async () => {
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
      expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')?.getAttribute('data-directory')).toBe('/var/lib/xgc2-managed');
      expect(document.querySelector('[data-xgc-role="experiment-environment-instance-state"]')?.textContent).toBe('Agent connected');
    });
    expect(document.querySelector('[data-xgc-id="agent-b"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-terminal-page"]')).toBeNull();
    expect(document.querySelector('[aria-label="World image"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-create"]')).toBeNull();
  });

  it('keeps files available when the algorithm session is running', async () => {
    renderPanel('active');
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).not.toBeNull();
    });
  });

  it('passes selected Agent to TerminalPage even when global nav stays local', async () => {
    nav.managedHostId = 'local';
    window.localStorage.setItem(
      'xgc.panel.experiment-environment.view.environment-1',
      JSON.stringify('terminal'),
    );
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-terminal-page"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
    });
    expect(nav.managedHostId).toBe('local');
    expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).toBeNull();
  });

  it('opens a fresh file workspace when selecting a different container', async () => {
    const dual = presence('ready');
    dual.instances.push({ ...dual.instances[0]!,slotId: 'slot-2',agentId: 'agent-b',displayName: 'Field A/UAV 2' });
    environments.current = [dual];
    renderPanel();
    await waitFor(() => expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')?.getAttribute('data-opened-for')).toBe('agent-a'));
    fireEvent.click(screen.getByRole('button', { name: /UAV 2/ }));
    await waitFor(() => expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')?.getAttribute('data-opened-for')).toBe('agent-b'));
  });

  it('isolates TerminalPage managedHostId when switching containers', async () => {
    const dual = presence('ready');
    dual.instances = [
      { ...dual.instances[0]! },
      {
        ...dual.instances[0]!,
        slotId: 'slot-2',
        agentId: 'agent-b',
        displayName: 'Field A/UAV 2',
        containerName: 'container-b',
        managedHost: {
          id: 'agent-b',
          displayName: 'Field A/UAV 2',
          enrollment: 'enrolled',
          connectivity: 'ready',
          managementConnection: 'idle',
        },
      },
    ];
    environments.current = [dual];
    nav.managedHostId = 'local';
    window.localStorage.setItem(
      'xgc.panel.experiment-environment.view.environment-1',
      JSON.stringify('terminal'),
    );
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-terminal-page"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
    });
    fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('UAV 2'))!);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-terminal-page"]')?.getAttribute('data-xgc-id')).toBe('agent-b');
    });
    expect(nav.managedHostId).toBe('local');
    fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('UAV 1'))!);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-terminal-page"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
    });
    expect(nav.managedHostId).toBe('local');
  });

  it('does not adopt an Agent registered to another experiment', async () => {
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instance"]')?.getAttribute('data-xgc-id')).toBe('slot-1');
    });
    expect(document.querySelectorAll('[data-xgc-role="experiment-environment-instance"]')).toHaveLength(1);
    expect(document.querySelector('[data-xgc-id="agent-b"]')).toBeNull();
  });

  it('marks a load error on the same element as its role', async () => {
    environments.error = 'runtime unavailable';
    environments.current = [];
    renderPanel();
    await waitFor(() => {
      const error = document.querySelector('[data-xgc-role="experiment-environment-error"]');
      expect(error?.getAttribute('data-xgc-id')).toBe('environment-1');
      expect(error?.textContent).toBe('runtime unavailable');
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).toBeNull();
  });

  it('marks an action error on the same element as its role', async () => {
    environments.powerError = 'session is active';
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instances"]')).not.toBeNull();
    });
    openOperations();
    const power = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Power environment');
    fireEvent.click(power!);
    await waitFor(() => {
      const error = document.querySelector('[data-xgc-role="experiment-environment-error"]');
      expect(error?.getAttribute('data-xgc-id')).toBe('environment-1');
      expect(error?.textContent).toBe('session is active');
    });
    expect(environments.lifecycle).toEqual({ action: 'power', experimentId: 'exp-a', generationId: '1' });
    expect(document.querySelector('[data-xgc-role="experiment-environment-run"]')).toBeNull();
  });

  it('prepares from an inspected world image and shows OS and ROS instead of a digest field', async () => {
    environments.current = [];
    environments.options = {
      worldImage: 'world@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sceneName: 'Empty yard',
      profiles: [
        { id: 'fs150-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: true },
        { id: 'scout-bionic-melodic',os: 'ubuntu',version: '18.04',ros: 'melodic',installed: false },
      ],
      slots: [{ slotId: 'uav-1',robotName: 'UAV 1',profile: 'fs150-focal-noetic',imageReady: true }],
    };
    renderPanel('succeeded', 'per-robot');
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-scene"]')?.textContent).toBe('Empty yard');
    });
    expect(environments.optionsPlacement).toBe('per-robot');
    expect(document.querySelector('[aria-label="World image"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-image-missing"]')).toBeNull();
    const installed = document.querySelector('[data-xgc-role="experiment-environment-profile"][data-xgc-id="uav-1"]');
    expect(installed?.textContent).toBe('ubuntu 20.04 · ROS noetic');
    const missing = document.querySelector('[data-xgc-role="experiment-environment-profile"][data-xgc-id="scout-bionic-melodic"]');
    expect(missing).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-phase"]')?.textContent).toBe('Environment not prepared');
    expect(document.querySelector('[data-xgc-role="experiment-environment-tools-empty"]')?.textContent)
      .toContain('Prepare and power the environment to manage files and terminals.');
    expect(screen.getByRole('button', { name: 'Environment files' })).toHaveAttribute('aria-label','Environment files');
    fireEvent.click(screen.getByRole('button', { name: 'Environment terminal' }));
    expect(document.querySelector('[data-xgc-role="experiment-environment-tools-empty"]')?.textContent)
      .toContain('Environment terminal');
    expect(document.querySelector('[data-xgc-role="experiment-environment-terminal-page"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-image"]')?.getAttribute('data-xgc-image-ready')).toBe('true');
    expect(document.querySelector('[data-xgc-role="experiment-environment-image"]')?.textContent).toBe('Image installed');
    const prepare = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare');
    expect(prepare).toBeEnabled();
    fireEvent.click(prepare!);
    await waitFor(() => {
      expect(environments.created).toEqual({ placement: 'per-robot',slots: [{ slotId: 'uav-1' }] });
    });
  });

  it('prepares when options return a non-empty world image and stays off when it is empty', async () => {
    environments.current = [];
    environments.options = {
      worldImage: 'gazebo:latest',
      sceneName: 'Empty yard',
      profiles: [
        { id: 'fs150-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: true },
      ],
      slots: [{ slotId: 'uav-1',robotName: 'UAV 1',profile: 'fs150-focal-noetic',imageReady: true }],
    };
    const named = renderPanel('succeeded', 'centralized');
    await waitFor(() => {
      expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare')).toBeEnabled();
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-image-missing"]')).toBeNull();
    expect(document.querySelector('[aria-label="World image"]')).toBeNull();
    named.unmount();
    environments.options = { ...environments.options, worldImage: '  ' };
    renderPanel('succeeded', 'centralized');
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-image-missing"]')?.textContent)
        .toBe('no installed world image');
    });
    expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare')).toBeDisabled();
  });

  it('prepares a lightweight experiment without a world image or a world row', async () => {
    environments.current = [];
    environments.options = {
      worldImage: '',
      worldRequired: false,
      sceneName: 'Empty yard',
      profiles: [
        { id: 'fs150-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: true },
      ],
      slots: [{ slotId: 'uav-1',robotName: 'UAV 1',profile: 'fs150-focal-noetic',imageReady: true }],
    };
    renderPanel('succeeded', 'per-robot');
    await waitFor(() => {
      expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare')).toBeEnabled();
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-world"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-image-missing"]')).toBeNull();
    fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare')!);
    await waitFor(() => {
      expect(environments.created).toEqual({ placement: 'per-robot',slots: [{ slotId: 'uav-1' }] });
    });
  });

  it('prepares centralized without presenting virtual robot slots as containers', async () => {
    environments.current = [];
    environments.options = {
      worldImage: 'world@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sceneName: '',
      profiles: [
        { id: 'fs150-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: false },
        { id: 'scout-bionic-melodic',os: 'ubuntu',version: '18.04',ros: 'melodic',installed: false },
        { id: 'scout-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: false },
        { id: 'wheeltec-bionic-melodic',os: 'ubuntu',version: '18.04',ros: 'melodic',installed: false },
      ],
      slots: [{ slotId: 'ugv-1',robotName: 'Scout',profile: 'scout-bionic-melodic',imageReady: false }],
    };
    renderPanel('succeeded', 'centralized');
    await waitFor(() => expect(document.querySelector('[data-xgc-role="experiment-environment-create"]')).not.toBeNull());
    expect(document.querySelectorAll('[data-xgc-role="experiment-environment-profile"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-xgc-role="experiment-environment-slot"]')).toHaveLength(1);
    expect(document.querySelector('[data-xgc-role="experiment-environment-scene"]')).toBeNull();
    const prepare = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare');
    expect(prepare).toBeEnabled();
    fireEvent.click(prepare!);
    await waitFor(() => {
      expect(environments.created).toEqual({ placement: 'centralized',slots: [{ slotId: 'ugv-1' }] });
    });
  });

  it('disables per-robot Prepare when a slot image is missing and keeps the existing missing copy', async () => {
    environments.current = [];
    environments.options = {
      worldImage: 'world@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sceneName: 'Empty yard',
      profiles: [
        { id: 'fs150-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: true },
      ],
      slots: [{ slotId: 'uav-1',robotName: 'UAV 1',profile: 'fs150-focal-noetic',imageReady: false }],
    };
    renderPanel('succeeded', 'per-robot');
    await waitFor(() => {
      expect(environments.optionsPlacement).toBe('per-robot');
      expect(document.querySelector('[data-xgc-role="experiment-environment-image"]')?.textContent)
        .toBe('Image not installed');
    });
    expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare')).toBeDisabled();
  });

  it('does not substitute an installed Scout image for a missing FS150 image', async () => {
    environments.current = [];
    environments.options = {
      worldImage: 'world@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sceneName: 'Empty yard',
      profiles: [
        { id: 'fs150-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: true },
        { id: 'scout-bionic-melodic',os: 'ubuntu',version: '18.04',ros: 'melodic',installed: true },
      ],
      slots: [{ slotId: 'uav-1',robotName: 'UAV 1',profile: 'fs150-focal-noetic',imageReady: false }],
    };
    renderPanel('succeeded', 'per-robot');
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-profile"]')?.textContent).toBe('ubuntu 20.04 · ROS noetic');
    });
    expect(document.querySelectorAll('[data-xgc-role="experiment-environment-profile"]')).toHaveLength(1);
    expect(document.querySelector('[data-xgc-role="experiment-environment-profile-choice"]')).toBeNull();
    expect(screen.queryByText('ubuntu 18.04 · ROS melodic')).toBeNull();
    expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare')).toBeDisabled();
    expect(environments.created).toBeNull();
  });

  it('shows the create response error unchanged', async () => {
    environments.current = [];
    environments.createError = 'no installed world image';
    environments.options = {
      worldImage: 'world@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sceneName: 'Empty yard',
      profiles: [
        { id: 'fs150-focal-noetic',os: 'ubuntu',version: '20.04',ros: 'noetic',installed: true },
      ],
      slots: [{ slotId: 'uav-1',robotName: 'UAV 1',profile: 'fs150-focal-noetic',imageReady: false }],
    };
    renderPanel('succeeded', 'centralized');
    await waitFor(() => {
      expect([...document.querySelectorAll('button')].some((button) => button.textContent === 'Prepare')).toBe(true);
    });
    fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Prepare')!);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-error"]')?.textContent).toBe('no installed world image');
    });
  });

  it('posts container-lifecycle.power and shows the returned Run', async () => {
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instances"]')).not.toBeNull();
    });
    openOperations();
    fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Power environment')!);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-run"]')?.getAttribute('data-xgc-status')).toBe('running');
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-run"]')?.textContent).toBe('running');
    expect(environments.lifecycle).toEqual({ action: 'power', experimentId: 'exp-a', generationId: '1' });
    expect([...document.querySelectorAll('button')].some((button) => button.textContent === 'Cancel')).toBe(true);
  });

  it('acts on the selected container alone and keeps whole-environment actions unscoped', async () => {
    const current = presence('ready');
    current.instances = [
      { ...current.instances[0]!,slotId: 'world',role: 'world',agentId: 'agent-world',displayName: 'Field A/world' },
      { ...current.instances[0]!,slotId: 'uav-1',role: 'slot' },
      { ...current.instances[0]!,slotId: 'uav-2',role: 'slot',agentId: 'agent-b',displayName: 'Field A/UAV 2' },
      { ...current.instances[0]!,slotId: 'ugv-1',role: 'centralized',agentId: 'agent-shared',displayName: 'Field A/Scout',managedHost: null },
    ];
    environments.current = [current];
    renderPanel();
    await waitFor(() => expect(document.querySelectorAll('[data-xgc-role="experiment-environment-instance"]')).toHaveLength(4));
    fireEvent.click(screen.getByRole('button', { name: /UAV 2/ }));
    openOperations();
    const group = document.querySelector('[data-xgc-role="experiment-environment-instance-actions"]');
    expect(group?.getAttribute('data-xgc-id')).toBe('uav-2');
    expect(group?.getAttribute('aria-label')).toBe('UAV 2');
    expect([...document.querySelectorAll('[data-xgc-role="experiment-environment-instance-action"]')]
      .map((button) => button.getAttribute('data-xgc-id'))).toEqual(['uav-2:power','uav-2:off','uav-2:rebuild']);
    fireEvent.click(document.querySelector('[data-xgc-id="uav-2:rebuild"]')!);
    await waitFor(() => expect(environments.lifecycle).toEqual({
      action: 'rebuild',experimentId: 'exp-a',generationId: '1',slotIds: ['uav-2'],
    }));
    await waitFor(() => expect(document.querySelector('[data-xgc-id="uav-2:power"]')).toBeDisabled());
    closeOperations();
    fireEvent.click(screen.getByRole('button', { name: /Scout/ }));
    openOperations();
    // A centralized robot runs in the world container and has none to act on.
    expect(document.querySelector('[data-xgc-role="experiment-environment-instance-actions"]')).toBeNull();
    closeOperations();
    fireEvent.click(screen.getByRole('button', { name: /Simulation world/ }));
    openOperations();
    expect(document.querySelector('[data-xgc-role="experiment-environment-instance-actions"]')?.getAttribute('data-xgc-id')).toBe('world');
  });

  it('releases the lifecycle buttons and reloads the environment when the shared run becomes terminal', async () => {
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instances"]')).not.toBeNull();
    });
    const listsAfterOpen = environments.listCalls;
    openOperations();
    fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Power environment')!);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-run"]')?.getAttribute('data-xgc-status')).toBe('running');
    });
    await waitFor(() => expect(observation.retain).toHaveBeenCalledWith('run-life'));
    expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Power environment')).toBeDisabled();
    runStore.publish(lifecycleSnapshot({
      'run-life': {
        run: { id: 'run-life',status: 'running',revision: 3 } as never,
        invocations: [],nodeSummaries: [],loading: false,error: '',
      },
    }));
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-run"]')?.getAttribute('data-xgc-status')).toBe('running');
    });
    expect(environments.listCalls).toBe(listsAfterOpen);
    environments.current = [presence('offline')];
    runStore.publish(lifecycleSnapshot({
      'run-life': {
        run: { id: 'run-life',status: 'succeeded',revision: 4 } as never,
        invocations: [],nodeSummaries: [],loading: false,error: '',
      },
    }));
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-run"]')?.getAttribute('data-xgc-status')).toBe('succeeded');
      expect(environments.listCalls).toBe(listsAfterOpen + 1);
      expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Power environment')).toBeEnabled();
      expect(document.querySelector('[data-xgc-role="experiment-environment-instance-state"]')?.textContent).toBe('Agent disconnected');
    });
    expect([...document.querySelectorAll('button')].some((button) => button.textContent === 'Cancel')).toBe(false);
  });

  it('follows the shared host snapshot without listing the environment again', async () => {
    environments.current = [presence('offline')];
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instance-state"]')?.textContent).toBe('Agent disconnected');
    });
    const listsAfterOpen = environments.listCalls;
    expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).toBeNull();
    liveHosts.replace([{
      id: 'agent-a',
      displayName: 'Field A/UAV 1',
      enrollment: 'enrolled',
      connectivity: 'ready',
      managementConnection: 'idle',
    }]);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-instance-state"]')?.textContent).toBe('Agent connected');
    expect(environments.listCalls).toBe(listsAfterOpen);
  });

  it('keeps each slot\'s agent settings and never re-points the shared robot asset', async () => {
    const current = presence('ready');
    current.instances = [
      { ...current.instances[0]!,assetId: 'robot-fs150',profile: 'fs150-focal-noetic' },
      {
        ...current.instances[0]!,
        slotId: 'ugv-1',
        role: 'slot',
        assetId: 'robot-scout',
        profile: 'scout-focal-noetic',
        agentId: 'agent-scout',
        displayName: 'Scout',
      },
    ];
    environments.current = [current];
    renderPanel();
    await waitFor(() => expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).not.toBeNull());
    openOperations();
    fireEvent.click(document.querySelector('[data-xgc-role="experiment-environment-agent-toggle"]')!);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-agent-settings"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
    });
    // Moving a robot onboard is its Experiment slot's host binding; an
    // Experiment page must not commit that into the asset every Experiment shares.
    expect(document.querySelector('[data-xgc-role="robot-asset-onboard"]')).toBeNull();
  });

  it('separates exactly three views and keeps lifecycle controls in panel operations', async () => {
    renderPanel();
    await waitFor(() => expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).not.toBeNull());
    expect([...document.querySelectorAll('[data-xgc-role="experiment-environment-view"]')].map((node) => node.getAttribute('data-xgc-id')))
      .toEqual(['files','terminal','network']);
    expect(document.querySelector('[data-xgc-role="experiment-environment-lifecycle"]')).toBeNull();
    expect(screen.queryByLabelText('Radio delay')).toBeNull();
    const initialListCalls = environments.listCalls;
    openOperations();
    expect(document.querySelector('[data-xgc-role="experiment-environment-phase"]')?.textContent).toBe('Powered');
    closeOperations();
    fireEvent.click(screen.getByRole('button', { name: 'Environment network' }));
    expect(screen.getByLabelText('Radio delay')).toHaveValue('0');
    expect(screen.getByLabelText('Radio loss')).toHaveValue('0');
    expect(screen.getByLabelText('Radio reorder')).toHaveValue('0');
    expect(document.querySelector('[data-xgc-role="experiment-environment-radio-status"]')?.textContent).toBe('Not applied');
    expect(document.querySelector('[data-xgc-role="experiment-environment-instance"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Environment terminal' }));
    expect(document.querySelector('[data-xgc-role="experiment-environment-terminal-page"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
    expect(screen.queryByLabelText('Radio delay')).toBeNull();
    expect(environments.listCalls).toBe(initialListCalls);
  });

  it('starts from the stored radio settings so Apply cannot silently reset them', async () => {
    const shaped = radioEnvironment();
    environments.current = [shaped];
    window.localStorage.setItem('xgc.panel.experiment-environment.view.environment-1', JSON.stringify('network'));
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Radio delay')).toHaveValue('50'));
    expect(screen.getByLabelText('Radio loss')).toHaveValue('5');
    expect(screen.getByLabelText('Radio reorder')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Apply radio impairment' }));
    // Apply is the radio workflow Run with the settings on screen, not a stored value.
    await waitFor(() => expect(environments.radio).toEqual({
      experimentId: 'exp-a',generationId: '1',settings: { delayMs: 50,lossPercent: 5,reorderPercent: 1 },
    }));
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-radio-run"]')?.getAttribute('data-xgc-status')).toBe('running');
    });
    expect(screen.getByRole('button', { name: 'Apply radio impairment' })).toBeDisabled();
  });

  it('applies an edited draft and shows the stored settings once a Run stores them', async () => {
    environments.current = [radioEnvironment()];
    window.localStorage.setItem('xgc.panel.experiment-environment.view.environment-1', JSON.stringify('network'));
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Radio delay')).toHaveValue('50'));
    fireEvent.change(screen.getByLabelText('Radio delay'), { target: { value: '80' } });
    expect(screen.getByLabelText('Radio delay')).toHaveValue('80');
    // A draft does not change what the status line reports.
    expect(document.querySelector('[data-xgc-role="experiment-environment-radio-status"]')?.textContent).toBe('Apply failed');
    fireEvent.click(screen.getByRole('button', { name: 'Apply radio impairment' }));
    await waitFor(() => expect(environments.radio?.settings).toEqual({ delayMs: 80,lossPercent: 5,reorderPercent: 1 }));
    const stored = radioEnvironment();
    stored.radioImpairment = { ...stored.radioImpairment!,delayMs: 80,applied: true,applyError: '' };
    stored.instances = stored.instances.map((instance) => ({ ...instance,radio: 'applied' as const,radioError: undefined }));
    environments.current = [stored];
    runStore.publish(lifecycleSnapshot({
      'run-radio': {
        run: { id: 'run-radio',status: 'succeeded',revision: 3 } as never,
        invocations: [],nodeSummaries: [],loading: false,error: '',
      },
    }));
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-radio-status"]')?.textContent).toBe('80 ms · 5% · 1%');
    });
    expect(screen.getByLabelText('Radio delay')).toHaveValue('80');
    expect([...document.querySelectorAll('[data-xgc-role="experiment-environment-radio-result"]')]
      .map((row) => row.getAttribute('data-xgc-state'))).toEqual(['applied','applied','applied']);
  });

  it('reports each robot from its receipt and retries only a failed robot', async () => {
    environments.current = [radioEnvironment()];
    window.localStorage.setItem('xgc.panel.experiment-environment.view.environment-1', JSON.stringify('network'));
    renderPanel();
    await waitFor(() => {
      expect(document.querySelectorAll('[data-xgc-role="experiment-environment-radio-result"]')).toHaveLength(3);
    });
    const rows = [...document.querySelectorAll('[data-xgc-role="experiment-environment-radio-result"]')];
    expect(rows.map((row) => [row.getAttribute('data-xgc-id'),row.getAttribute('data-xgc-state')])).toEqual([
      ['uav-1','applied'],['uav-2','failed'],['uav-3','pending'],
    ]);
    expect(rows.map((row) => row.textContent)).toEqual(['UAV 1Applied','UAV 2Apply failedApply again','UAV 3Not applied']);
    // One failed robot is never reported as all applied.
    expect(document.querySelector('[data-xgc-role="experiment-environment-radio-status"]')?.textContent).toBe('Apply failed');
    expect(document.querySelector('[data-xgc-role="experiment-environment-error"]')?.textContent).toBe('uav-2: nsenter: permission denied');
    expect(document.querySelectorAll('[data-xgc-role="experiment-environment-radio-retry"]')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Radio delay'), { target: { value: '90' } });
    fireEvent.click(document.querySelector('[data-xgc-role="experiment-environment-radio-retry"][data-xgc-id="uav-2"]')!);
    // A retry re-applies the stored settings to that robot, not an unapplied draft.
    await waitFor(() => expect(environments.radio).toEqual({
      experimentId: 'exp-a',generationId: '1',settings: { delayMs: 50,lossPercent: 5,reorderPercent: 1 },slotIds: ['uav-2'],
    }));
    expect(document.querySelector('[data-xgc-role="experiment-environment-radio-pending"]')).toBeNull();
  });

  it('says a powered-off environment applies the settings when its robots start', async () => {
    const off = radioEnvironment();
    off.phase = 'off';
    environments.current = [off];
    window.localStorage.setItem('xgc.panel.experiment-environment.view.environment-1', JSON.stringify('network'));
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-radio-pending"]')?.textContent)
        .toBe('Power the environment to apply these settings to its robots.');
    });
    expect(screen.getByRole('button', { name: 'Apply radio impairment' })).toBeEnabled();
  });

  it('keeps a server radio applyError visible when the environment is reopened', async () => {
    const loaded = presence('ready');
    loaded.radioImpairment = {
      delayMs: 20,
      lossPercent: 5,
      reorderPercent: 1,
      applied: false,
      applyError: 'tc on eth0: permission denied',
    };
    environments.current = [loaded];
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-error"]')?.textContent)
        .toBe('tc on eth0: permission denied');
    });
  });

  it('clears the radio applyError display when a later environment payload omits it', async () => {
    const failed = presence('ready');
    failed.radioImpairment = {
      delayMs: 20,
      lossPercent: 0,
      reorderPercent: 0,
      applied: false,
      applyError: 'tc failed',
    };
    environments.current = [failed];
    const view = renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-error"]')?.textContent).toBe('tc failed');
    });
    view.unmount();
    const cleared = presence('ready');
    cleared.radioImpairment = {
      delayMs: 20,
      lossPercent: 0,
      reorderPercent: 0,
      applied: true,
    };
    environments.current = [cleared];
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-error"]')).toBeNull();
  });

  it('prefers a local action error over a server radio applyError', async () => {
    const loaded = presence('ready');
    loaded.radioImpairment = {
      delayMs: 0,
      lossPercent: 0,
      reorderPercent: 0,
      applied: false,
      applyError: 'tc on eth0: permission denied',
    };
    environments.current = [loaded];
    environments.powerError = 'session is active';
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instances"]')).not.toBeNull();
    });
    openOperations();
    fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Power environment')!);
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-error"]')?.textContent)
        .toBe('session is active');
    });
  });

  it('keeps centralized robots selectable without pretending they have a container', async () => {
    const connected = presence('ready');
    connected.instances = [
      { ...connected.instances[0]!,slotId: 'uav-1',role: 'slot' },
      {
        ...connected.instances[0]!,
        slotId: 'ugv-1',
        role: 'centralized',
        agentId: 'agent-shared',
        displayName: 'Field A/Scout',
        managedHost: null,
      },
    ];
    environments.current = [connected];
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')?.getAttribute('data-xgc-id')).toBe('agent-a');
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-instance"][data-xgc-id="ugv-1"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-xgc-role="experiment-environment-instance"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name:/Scout/ }));
    expect(document.querySelector('[data-xgc-role="experiment-environment-tools-empty"]')).toHaveTextContent('Choose Per robot and prepare a new environment');
    expect(document.querySelector('[data-xgc-role="experiment-environment-files"][data-xgc-id="agent-shared"]')).toBeNull();
    expect(screen.queryByText('Runs on ground station')).toBeNull();
  });

  it('lists readable robot names without technical details above the file workspace', async () => {
    const current = presence('ready');
    current.instances = [
      {
        ...current.instances[0]!,
        slotId: 'world',
        role: 'world',
        profile: undefined,
        agentId: 'agent-world',
        displayName: 'Field A/world',
        containerName: 'xgc2e-world',
        containerId: 'abcdef0123456789',
        managedHost: {
          id: 'agent-world',
          displayName: 'Field A/world',
          enrollment: 'enrolled',
          connectivity: 'ready',
          managementConnection: 'idle',
        },
      },
      { ...current.instances[0]! },
    ];
    environments.current = [current];
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instance-name"][data-xgc-id="world"]')?.textContent).toBe('Simulation world');
      expect(document.querySelector('[data-xgc-role="experiment-environment-instance-name"][data-xgc-id="slot-1"]')?.textContent).toBe('UAV 1');
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-detail-value"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-details-toggle"]')).toBeNull();
    const workspace = document.querySelector('[data-xgc-role="experiment-environment"]')!;
    expect(workspace.textContent).not.toMatch(/sha256|xgc2e-world|abcdef0123456789|ROS master|Core endpoint/);
    expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')?.getAttribute('data-xgc-id')).toBe('agent-world');
  });

  it('shows a container Docker reports missing or stopped instead of its Agent link', async () => {
    const current = presence('ready');
    current.instances = [
      { ...current.instances[0]!,slotId: 'uav-1',role: 'slot',containerState: 'running' },
      { ...current.instances[0]!,slotId: 'uav-2',role: 'slot',agentId: 'agent-b',displayName: 'Field A/UAV 2',containerState: 'exited' },
      { ...current.instances[0]!,slotId: 'uav-3',role: 'slot',agentId: 'agent-c',displayName: 'Field A/UAV 3',containerState: 'absent' },
      { ...current.instances[0]!,slotId: 'uav-4',role: 'slot',agentId: 'agent-d',displayName: 'Field A/UAV 4',containerState: 'unknown' },
    ];
    environments.current = [current];
    renderPanel();
    await waitFor(() => expect(document.querySelectorAll('[data-xgc-role="experiment-environment-instance-state"]')).toHaveLength(4));
    expect([...document.querySelectorAll('[data-xgc-role="experiment-environment-instance-state"]')].map((state) => state.textContent))
      .toEqual(['Agent connected','Container stopped','Container not created','Agent connected']);
  });

  it('does not open files when the managed host is offline', async () => {
    environments.current = [presence('offline')];
    renderPanel();
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="experiment-environment-instance-state"]')?.textContent).toBe('Agent disconnected');
    });
    expect(document.querySelector('[data-xgc-role="experiment-environment-files"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-environment-tools"]')?.getAttribute('data-xgc-open')).toBe('false');
    expect(document.querySelector('[data-xgc-role="experiment-environment-tools-empty"]')?.textContent).toContain('Agent disconnected');
  });
});
