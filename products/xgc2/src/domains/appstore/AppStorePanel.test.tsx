// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { AppStorePanel } from './AppStorePanel';
import { getAppStoreSnapshot,installAppStoreApp,syncCatalogAppStore } from './appStoreService';
import type { AppStoreApp,AppStoreDetail,AppStoreSetting } from './appStoreModel';
import type * as ExecutionPublicModule from '../execution/executionPublic';

const publishNotification = vi.fn();

vi.mock('../execution/executionPublic', async (importOriginal) => ({
  ...await importOriginal<typeof ExecutionPublicModule>(),
  executionRequestId: vi.fn(() => 'request-1'),
}));

vi.mock('../groundStationInteraction/groundStationInteractionPublic', async (importOriginal) => {
  const React = await import('react');
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGroundStationNotification: (
      targetId: string,
      message: string,
      options: { title: string;severity?: string;source?: string;dedupeKey?: string },
    ) => {
      React.useEffect(() => {
        if (!message.trim()) return;
        publishNotification({
          targetId,
          message,
          title: options.title,
          severity: options.severity,
          source: options.source,
          dedupeKey: options.dedupeKey,
        });
      }, [message, options.dedupeKey, options.severity, options.source, options.title, targetId]);
    },
    useGroundStationErrorNotification: vi.fn(),
  };
});

vi.mock('./appStoreService', () => ({
  getAppStoreInstallDiff: vi.fn(),getAppStoreSnapshot: vi.fn(),installAppStoreApp: vi.fn(),
  operateAppStoreInstall: vi.fn(),saveAppStoreSetting: vi.fn(),syncCatalogAppStore: vi.fn(),
}));

describe('AppStorePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAppStoreSnapshot).mockResolvedValue({
      apps: [appStoreApp({ key: 'xgc2-ros1-central-sim',name: 'XGC2 ROS1 Central Simulation',tags: ['Simulation', 'ROS1'],architectures: ['amd64'] })],
      details: [appStoreDetail()],installed: [],setting: appStoreSetting(),
    });
  });

  it('uses foundation contained section tabs beside search without category/tag filters', async () => {
    const { container } = render(<AppStorePanel targetId="agent-a" targetCoreId="edge-core" />);
    const row = (await screen.findByRole('button', { name: 'Open XGC2 ROS1 Central Simulation details' })).closest('article')!;
    expect(getAppStoreSnapshot).toHaveBeenCalledWith('agent-a', { targetCoreId: 'edge-core' });
    const chrome = container.querySelector('[data-xgc-role="app-store-chrome"]');
    const tabs = chrome?.querySelector('[data-xgc-role="app-store-tabs"]');
    expect(tabs).not.toBeNull();
    expect(tabs).toHaveClass('xgc-segmented-control');
    expect(tabs).toHaveClass('xgc-tab-strip');
    expect(tabs).not.toHaveAttribute('data-xgc-variant', 'underline');
    expect(chrome!.querySelector('[data-xgc-role="app-store-search"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="app-store-body"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Sync remote app catalog' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Available' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Updates' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'App category' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'App tag' })).toBeNull();
    expect(within(row).queryByText('ROS1')).not.toBeInTheDocument();
    expect(within(row).getByText('Simulation')).toBeInTheDocument();
    expect(syncCatalogAppStore).not.toHaveBeenCalled();
  });

  it('automatically syncs an empty catalog once and toasts success instead of inline Notice', async () => {
    type Snapshot = Awaited<ReturnType<typeof getAppStoreSnapshot>>;
    let resolveInitialSnapshot!: (snapshot: Snapshot) => void;
    vi.mocked(getAppStoreSnapshot)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveInitialSnapshot = resolve; }))
      .mockResolvedValueOnce({
        apps: [appStoreApp({ key: 'auto-synced-app',name: 'Auto synced app' })],
        details: [],installed: [],setting: appStoreSetting(),
      });
    vi.mocked(syncCatalogAppStore).mockResolvedValue({ job: { id: 'sync-job' } as never,receipt: {} as never });

    const view = render(<AppStorePanel targetId="agent-a" targetCoreId="edge-core" />);

    expect(view.container.querySelector('[data-xgc-role="app-store-catalog"]')).toHaveAttribute('data-xgc-empty', 'true');
    expect(view.container.querySelector('[data-xgc-role="app-store-empty-state"]')).toBeNull();
    expect(syncCatalogAppStore).not.toHaveBeenCalled();
    await act(async () => resolveInitialSnapshot({ apps: [],details: [],installed: [],setting: appStoreSetting() }));
    await waitFor(() => expect(syncCatalogAppStore).toHaveBeenCalledWith({
      action: 'sync',targetId: 'agent-a',requestId: 'request-1',idempotencyKey: 'request-1',reason: 'operator request',
    }, { targetCoreId: 'edge-core' }));
    expect(await screen.findByText('Auto synced app')).toBeInTheDocument();
    await waitFor(() => expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Catalog updated.',
      severity: 'success',
      source: 'app-store',
    })));
    expect(publishNotification).not.toHaveBeenCalledWith(expect.objectContaining({
      message: 'Catalog refresh started.',
    }));
    expect(within(view.container.querySelector('[data-xgc-role="app-store-body"]')!).queryByText('Catalog updated.')).toBeNull();
    expect(getAppStoreSnapshot).toHaveBeenCalledTimes(2);
    expect(syncCatalogAppStore).toHaveBeenCalledTimes(1);
  });

  it('starts an installation and keeps the user in the App Store', async () => {
    const accepted = { id: 'job-1',kind: 'app.install' } as never;
    vi.mocked(installAppStoreApp).mockResolvedValue({ job: accepted,receipt: {} as never });
    render(<AppStorePanel />);
    const row = (await screen.findByRole('button', { name: 'Open XGC2 ROS1 Central Simulation details' })).closest('article')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Install' }));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-xgc-id', 'xgc2-ros1-central-sim');
    expect(within(drawer).queryByText('Advanced')).toBeNull();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Install' }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(installAppStoreApp).toHaveBeenCalledWith('xgc2-ros1-central-sim', {
      targetId: 'local',action: 'install',version: '1.0.0',requestId: 'request-1',idempotencyKey: 'request-1',reason: 'operator request',
    }, {}));
    await waitFor(() => expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Installation started.',
      severity: 'success',
    })));
    expect(screen.queryByText('job-1')).not.toBeInTheDocument();
  });

  it('keeps the install drawer open when submission fails and toasts the error', async () => {
    vi.mocked(installAppStoreApp).mockRejectedValue(new Error('install request failed'));
    render(<AppStorePanel />);
    const row = (await screen.findByRole('button', { name: 'Open XGC2 ROS1 Central Simulation details' })).closest('article')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Install' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Install' }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Install' }));

    await waitFor(() => expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'install request failed',
      severity: 'error',
    })));
    expect(screen.getByRole('dialog', { name: 'Install XGC2 ROS1 Central Simulation' })).toBeInTheDocument();
  });

  it('does not let an old target refresh overwrite the current target snapshot', async () => {
    type Snapshot = Awaited<ReturnType<typeof getAppStoreSnapshot>>;
    let resolveAgentA!: (snapshot: Snapshot) => void;
    let resolveAgentB!: (snapshot: Snapshot) => void;
    vi.mocked(getAppStoreSnapshot).mockImplementation((targetId) => new Promise((resolve) => {
      if (targetId === 'agent-a') resolveAgentA = resolve;
      else resolveAgentB = resolve;
    }));
    const view = render(<AppStorePanel targetId="agent-a" />);
    await waitFor(() => expect(getAppStoreSnapshot).toHaveBeenCalledWith('agent-a', {}));
    view.rerender(<AppStorePanel targetId="agent-b" />);
    await waitFor(() => expect(getAppStoreSnapshot).toHaveBeenCalledWith('agent-b', {}));

    await act(async () => resolveAgentB({
      apps: [appStoreApp({ key: 'agent-b-app',name: 'Agent B app' })],details: [],installed: [],setting: appStoreSetting(),
    }));
    expect(await screen.findByText('Agent B app')).toBeInTheDocument();
    await act(async () => resolveAgentA({
      apps: [appStoreApp({ key: 'agent-a-app',name: 'Stale Agent A app' })],details: [],installed: [],setting: appStoreSetting(),
    }));
    await waitFor(() => expect(screen.queryByText('Stale Agent A app')).not.toBeInTheDocument());
    expect(screen.getByText('Agent B app')).toBeInTheDocument();
  });

  it('does not expose a Settings tab after image-registry settings moved to Settings', async () => {
    render(<AppStorePanel targetId="agent-a" />);
    await screen.findByRole('button', { name: 'Open XGC2 ROS1 Central Simulation details' });
    expect(screen.getByRole('tab', { name: 'Available' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Installed' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Updates' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="app-store-settings"]')).toBeNull();
  });
});

function appStoreDetail(): AppStoreDetail {
  return { id: 'detail-1',appId: 'xgc2-ros1-central-sim',appKey: 'xgc2-ros1-central-sim',version: '1.0.0',params: [],dockerCompose: '',status: 'normal',updatedAt: '' };
}

function appStoreApp(overrides: Partial<AppStoreApp>): AppStoreApp {
  return { id: overrides.key ?? 'app-1',key: 'app-1',name: 'Demo app',type: 'simulation',description: 'Demo app description.',icon: '',resource: '',status: 'normal',limit: 1,website: '',github: '',document: '',tags: [],architectures: [],crossVersionUpdate: false,batchInstallSupport: false,updatedAt: '',...overrides };
}

function appStoreSetting(): AppStoreSetting {
  return { id: 'default',registry: 'aliyun',imageSource: 'mirror',mirrorPrefix: 'registry.cn-hangzhou.aliyuncs.com/xgc2-app-store',updatedAt: '' };
}
