// @vitest-environment jsdom

import { act,fireEvent,render,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { RobotAssetDocument } from './robotAssetContracts';
import { RobotAssetsRoute } from './RobotAssetsRoute';

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  checkRobotAssetReachability: vi.fn(),
  closeLocation: vi.fn(),
  drawerProps: vi.fn(),
  openLocation: vi.fn(),
  pageProps: vi.fn(),
  replaceInvalidWithList: vi.fn(),
  refresh: vi.fn(),
  setSearch: vi.fn(),
  toggleFolder: vi.fn(),
  useConfigAssetCatalogView: vi.fn(),
  useConfigurationLocation: vi.fn(),
  useGroundStationErrorNotification: vi.fn(),
  useRobotAssetStore: vi.fn(),
}));

vi.mock('../../hooks/useConfigurationLocation', () => ({
  useConfigurationLocation: mocks.useConfigurationLocation,
}));
vi.mock('../../app/navigationContext', () => ({
  useNavigation: () => ({ page: 'robotAssets' }),
}));
vi.mock('../assets/assetsPublic', () => ({
  useConfigAssetCatalogView: mocks.useConfigAssetCatalogView,
}));
vi.mock('../groundStationInteraction/groundStationInteractionPublic', () => ({
  useGroundStationErrorNotification: mocks.useGroundStationErrorNotification,
}));
vi.mock('./robotAssetService', () => ({
  checkRobotAssetReachability: mocks.checkRobotAssetReachability,
}));
vi.mock('./robotAssetStore', () => ({ useRobotAssetStore: mocks.useRobotAssetStore }));
vi.mock('./RobotAssetsPage', () => ({
  RobotAssetsPage: (props: {
    assets: RobotAssetDocument[];
    onArchive: (asset: RobotAssetDocument) => void;
    onCheckReachability: (asset: RobotAssetDocument) => void;
    onConfigure: (asset: RobotAssetDocument) => void;
    onSortModeChange: (value: string) => void;
    reachabilityById: Readonly<Record<string,{ status: string }>>;
    sortMode: string;
  }) => {
    mocks.pageProps(props);
    const asset = props.assets[0];
    return (
      <section data-xgc-role="robot-assets-page">
        {asset && (
          <>
            <button data-xgc-role="route-check" onClick={() => props.onCheckReachability(asset)}>
              Check
            </button>
            <button data-xgc-role="route-configure" onClick={() => props.onConfigure(asset)}>
              Configure
            </button>
            <button data-xgc-role="route-archive" onClick={() => props.onArchive(asset)}>
              Archive
            </button>
            <output data-xgc-role="route-reachability-state">
              {props.reachabilityById[asset.head.resourceId]?.status ?? 'idle'}
            </output>
          </>
        )}
      </section>
    );
  },
}));
vi.mock('./RobotAssetConfigDrawer',() => ({
  RobotAssetConfigDrawer: (props: {
    document?: RobotAssetDocument;
    onClose: () => void;
  }) => {
    mocks.drawerProps(props);
    return <aside data-xgc-role="route-robot-editor" data-xgc-id={props.document?.head.resourceId}>
      <button data-xgc-role="route-editor-close" onClick={props.onClose}>Close</button>
    </aside>;
  },
}));

describe('RobotAssetsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.useConfigurationLocation.mockReturnValue({
      resourceId:'',open:mocks.openLocation,close:mocks.closeLocation,
      replaceInvalidWithList:mocks.replaceInvalidWithList,
    });
    mocks.useConfigAssetCatalogView.mockReturnValue({
      search: '',collapsedFolders: [],
      setSearch: mocks.setSearch,toggleFolder: mocks.toggleFolder,
    });
    setStore();
  });

  it('keeps a catalog load error persistently visible beside the catalog', () => {
    setStore({ error: 'Core catalog request failed' });

    const { container,rerender } = render(<RobotAssetsRoute />);
    const selector = '[data-xgc-role="robot-asset-catalog-error"][data-xgc-id="robot"]';
    expect(container.querySelector(selector)).toHaveTextContent('Robot catalog unavailable');
    expect(container.querySelector(selector)).toHaveTextContent('Core catalog request failed');
    expect(mocks.useGroundStationErrorNotification).toHaveBeenCalledWith(
      'local','Core catalog request failed',expect.objectContaining({ source: 'robot-assets' }),
    );

    rerender(<RobotAssetsRoute />);
    expect(container.querySelector(selector)).toHaveTextContent('Core catalog request failed');
    fireEvent.click(container.querySelector('[data-xgc-role="robot-asset-catalog-retry"]')!);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('preserves a Robot deep link through a failed load and opens it after retry succeeds',() => {
    setStore({ assets:[],error:'request timeout after 8000ms: /robot-assets' });
    mocks.useConfigurationLocation.mockReturnValue({
      resourceId:'robot-a',open:mocks.openLocation,close:mocks.closeLocation,
      replaceInvalidWithList:mocks.replaceInvalidWithList,
    });
    const { container,rerender } = render(<RobotAssetsRoute />);
    expect(mocks.replaceInvalidWithList).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-xgc-role="robot-asset-catalog-retry"]')!);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    setStore({ assets:[robot(false)] });
    rerender(<RobotAssetsRoute />);
    expect(container.querySelector('[data-xgc-role="route-robot-editor"][data-xgc-id="robot-a"]')).toBeInTheDocument();
    expect(mocks.replaceInvalidWithList).not.toHaveBeenCalled();
  });

  it('retains the Route archive guard for system Robot assets', () => {
    setStore({ assets: [robot(true)] });
    const { container } = render(<RobotAssetsRoute />);

    fireEvent.click(container.querySelector('[data-xgc-role="route-archive"]')!);

    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it('persists and restores the Robot sort selection independently of catalog view state', () => {
    window.localStorage.setItem('xgc.robot.catalog.local.sortMode','"name-asc"');
    render(<RobotAssetsRoute />);

    const pageProps = mocks.pageProps.mock.lastCall?.[0] as {
      onSortModeChange: (value: string) => void;
      sortMode: string;
    };
    expect(pageProps.sortMode).toBe('name-asc');

    act(() => pageProps.onSortModeChange('updated-asc'));
    expect(window.localStorage.getItem('xgc.robot.catalog.local.sortMode')).toBe('"updated-asc"');
  });

  it('projects the management diagnostic as reachable without runtime liveness semantics', async () => {
    setStore({ assets: [robot(false)] });
    mocks.checkRobotAssetReachability.mockResolvedValue({
      address: '192.0.2.10',reachable: true,latencyMs: 2,
      detail: 'management address responded',checkedAt: '2026-08-10T10:00:00Z',
    });
    const { container } = render(<RobotAssetsRoute />);

    fireEvent.click(container.querySelector('[data-xgc-role="route-check"]')!);

    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="route-reachability-state"]'),
    ).toHaveTextContent('reachable'));
  });

  it('opens the exact Robot asset editor from a deep link and closes back to the list',() => {
    const asset = robot(false);
    setStore({ assets:[asset] });
    mocks.useConfigurationLocation.mockReturnValue({
      resourceId:asset.head.resourceId,open:mocks.openLocation,close:mocks.closeLocation,
      replaceInvalidWithList:mocks.replaceInvalidWithList,
    });
    const { container } = render(<RobotAssetsRoute />);

    expect(container.querySelector(
      '[data-xgc-role="route-robot-editor"][data-xgc-id="robot-a"]',
    )).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-xgc-role="route-editor-close"]')!);
    expect(mocks.closeLocation).toHaveBeenCalledOnce();
  });

  it('writes a Robot asset editor location when Configure is opened from the list',() => {
    const asset = robot(false);
    setStore({ assets:[asset] });
    const { container } = render(<RobotAssetsRoute />);

    fireEvent.click(container.querySelector('[data-xgc-role="route-configure"]')!);
    expect(mocks.openLocation).toHaveBeenCalledWith(asset.head.resourceId);
    expect(container.querySelector('[data-xgc-role="route-robot-editor"]')).toBeInTheDocument();
  });

  it('returns an unknown Robot asset deep link to the list',() => {
    setStore({ assets:[robot(false)] });
    mocks.useConfigurationLocation.mockReturnValue({
      resourceId:'missing-robot',open:mocks.openLocation,close:mocks.closeLocation,
      replaceInvalidWithList:mocks.replaceInvalidWithList,
    });
    render(<RobotAssetsRoute />);
    expect(mocks.replaceInvalidWithList).toHaveBeenCalledOnce();
  });
});

function setStore(options: { assets?: RobotAssetDocument[];error?: string } = {}) {
  mocks.useRobotAssetStore.mockReturnValue({
    assets: options.assets ?? [],
    loading: false,
    error: options.error ?? '',
    refresh: mocks.refresh,
    archive: mocks.archive,
    create: vi.fn(),
    commit: vi.fn(),
  });
}

function robot(system: boolean): RobotAssetDocument {
  return {
    head: {
      domain: 'robot',resourceId: 'robot-a',name: 'Robot A',description: '',tags: [],system,
      mainCommitId: 'commit-a',currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: '2026-08-10T00:00:00Z',updatedAt: '2026-08-10T00:00:00Z',
    },
    branch: {
      domain: 'robot',resourceId: 'robot-a',name: 'main',headCommitId: 'commit-a',
      headVersion: 1,revision: 1,createdAt: '2026-08-10T00:00:00Z',
      updatedAt: '2026-08-10T00:00:00Z',
    },
    spec: {
      name: 'Robot A',description: '',tags: [],kind: 'px4_multirotor',
      profileId: 'px4.multirotor.ros1.v9',
      px4: {
        modelId:'fs150',mavSystemId: 1,managementIp: '192.0.2.10',sshUsername: 'pilot',sshPassword: 'secret',
        mocapRigidBodyName: 'robot-a',physicalMavrosLocalPort: 9010,physicalFcuRemotePort: 14550,
        simulationLocalPort: 15000,simulationRemotePort: 15300,
        simulation: {
          productId: 'xgc2-gazebo-sim-fs150-sitl',launchPackage: 'gazebo_sim_fs150_sitl',
          launchFile: 'fs150.launch',
        },
      },
    },
  };
}
