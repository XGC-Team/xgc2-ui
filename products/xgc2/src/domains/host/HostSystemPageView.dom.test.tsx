// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { HostSystemPage as StaticHostSystemPage } from './HostSystemPageView';
import { consumeRequestedHostFilePath,requestHostFilePath } from './hostFileNavigation';
import type { HostSystemProfile } from './hostCapabilityModel';
import { DISABLED_HOST_SYSTEM_PROFILE,LOCAL_HOST_SYSTEM_PROFILE } from './hostCapabilityModel';
import { defineHostSystemComposition } from './hostSystemComposition';
import { HostFilesSystemLeaf } from './systemLeaves/files';
import { HostFirewallSystemLeaf } from './systemLeaves/firewall';
import { HostLogsSystemLeaf } from './systemLeaves/hostLogs';
import { HostNetworkSystemLeaf } from './systemLeaves/network';
import { HostOverviewSystemLeaf } from './systemLeaves/overview';
import { HostProcessesSystemLeaf } from './systemLeaves/processes';
import { HostSSHServiceSystemLeaf } from './systemLeaves/sshService';

const getHostFiles = vi.fn();
const getHostRecycle = vi.fn();
const restoreHostRecycle = vi.fn();
const getHostOverview = vi.fn();
const getHostSSH = vi.fn();
const getHostProcesses = vi.fn();
const getHostNetworkSnapshot = vi.fn();
const listHostLogSources = vi.fn();
const readHostLogChunk = vi.fn();
const getHostFirewallStatus = vi.fn();
const listHostFirewallRules = vi.fn();
const getHostSettings = vi.fn();

vi.mock('../../components/SystemIOTrend', () => ({
  SystemIOTrend: () => <div data-testid="system-io-trend" />,
}));

vi.mock('./hostFileActions', () => ({
  chmodHostFile: vi.fn(),
  chownHostFile: vi.fn(),
  compressHostFile: vi.fn(),
  copyHostFile: vi.fn(),
  createHostFile: vi.fn(),
  deleteHostFile: vi.fn(),
  downloadHostFile: vi.fn(),
  getHostFileContent: vi.fn(),
  getHostFiles: (...args: unknown[]) => getHostFiles(...args),
  getHostRecycle: (...args: unknown[]) => getHostRecycle(...args),
  moveHostFile: vi.fn(),
  restoreHostRecycle: (...args: unknown[]) => restoreHostRecycle(...args),
  saveHostFileContent: vi.fn(),
  uploadHostFile: vi.fn(),
}));

vi.mock('./hostOverviewActions', () => ({
  getHostOverview: (...args: unknown[]) => getHostOverview(...args),
}));

vi.mock('./hostProcessActions', () => ({
  getHostProcesses: (...args: unknown[]) => getHostProcesses(...args),
  killHostProcess: vi.fn(),
}));

vi.mock('./hostNetworkActions', () => ({
  getHostNetworkSnapshot: (...args: unknown[]) => getHostNetworkSnapshot(...args),
}));

vi.mock('./hostSSHActions', () => ({
  getHostSSH: (...args: unknown[]) => getHostSSH(...args),
  getHostSSHConfigFile: vi.fn(),
  operateHostSSH: vi.fn(),
  saveHostSSHConfigFile: vi.fn(),
  updateHostSSHSetting: vi.fn(),
}));

vi.mock('./hostFirewallActions', () => ({
  getHostFirewallStatus: (...args: unknown[]) => getHostFirewallStatus(...args),
  listHostFirewallRules: (...args: unknown[]) => listHostFirewallRules(...args),
  operateHostFirewall: vi.fn(),
  removeHostFirewallRule: vi.fn(),
}));

vi.mock('./hostLogActions', () => ({
  listHostLogSources: (...args: unknown[]) => listHostLogSources(...args),
  readHostLogChunk: (...args: unknown[]) => readHostLogChunk(...args),
}));

vi.mock('./hostSettingsService', () => ({
  getHostSettings: (...args: unknown[]) => getHostSettings(...args),
  applyHostSettings: vi.fn(),
  subscribeHostSettings: vi.fn(() => () => {}),
}));

vi.mock('./hostStore', () => ({ useHostOverviewRefresh: vi.fn() }));

const allServices: HostSystemProfile = {
  Overview: true,
  Files: true,
  Processes: true,
  Network: true,
  MaintenanceCleanup: true,
  SSHService: true,
  Firewall: true,
  HostLogs: true,
  SystemVisible: true,
  RuntimeTabVisible: true,
  MaintenanceVisible: true,
};

const allComposition = defineHostSystemComposition({
  Overview: HostOverviewSystemLeaf,
  HostLogs: HostLogsSystemLeaf,
  Files: HostFilesSystemLeaf,
  Processes: HostProcessesSystemLeaf,
  Network: HostNetworkSystemLeaf,
  SSHService: HostSSHServiceSystemLeaf,
  Firewall: HostFirewallSystemLeaf,
});

function HostSystemPage(props: ComponentProps<typeof StaticHostSystemPage>) {
  return <StaticHostSystemPage composition={allComposition} {...props} />;
}

function hostRecycleFixture() {
  return {
    id: 'recycle-1',
    name: 'removed.txt',
    originalPath: '/var/lib/xgc2/removed.txt',
    recyclePath: '/var/lib/xgc2/recycle/recycle-1',
    isDir: false,
    size: 7,
    deletedAt: '2026-08-10T00:00:00Z',
  };
}

describe('HostSystemPage capability gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    consumeRequestedHostFilePath();
    getHostOverview.mockResolvedValue(hostOverview());
    getHostSSH.mockResolvedValue(sshFixture());
    getHostProcesses.mockResolvedValue([processFixture('proc')]);
    getHostNetworkSnapshot.mockResolvedValue(networkSnapshotFixture());
    listHostLogSources.mockResolvedValue([{ id: 'syslog',path: '/var/log/syslog',size: 10,modTime: 'now' }]);
    readHostLogChunk.mockResolvedValue({ sourceId: 'syslog',content: 'line',nextOffset: 4 });
    getHostFirewallStatus.mockResolvedValue({ enabled: true,backend: 'nftables' });
    listHostFirewallRules.mockResolvedValue([]);
    getHostRecycle.mockResolvedValue([hostRecycleFixture()]);
    restoreHostRecycle.mockResolvedValue(hostRecycleFixture());
    getHostSettings.mockResolvedValue({
      timezone: 'UTC',
      ntpEnabled: true,
      cpuGovernor: 'performance',
      availableGovernors: ['performance'],
      displayIdleSeconds: 0,
      autologinEnabled: false,
      autologinUser: 'operator',
      sleepEnabled: false,
      pendingRestart: false,
      collectedAt: '2026-08-16T00:00:00Z',
    });
    getHostFiles.mockResolvedValue(filesListing());
  });

  it('keeps full file operations for the local host', async () => {
    const { container } = render(<HostSystemPage activeTab="files" managedHostId="local" />);

    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recycle bin' })).toBeInTheDocument();
    expect(screen.getByTitle('Download')).toBeInTheDocument();
    expect(container.querySelector('.xgc-host-page')).toHaveAttribute('data-xgc-tab', 'files');
    expect(container.querySelector('[data-xgc-role="host-files-section"]')).toHaveAttribute('data-chrome', 'flat');
    const searchControl = container.querySelector('[data-xgc-role="host-files-search"][data-xgc-id="host-files"]');
    expect(searchControl).toContainElement(screen.getByRole('searchbox', { name: 'Find in current directory' }));
    expect(searchControl).toHaveAttribute('data-size', 'compact');
    const searchGroup = container.querySelector('[data-xgc-role="host-files-search-group"]');
    const actionButtons = container.querySelector('[data-xgc-role="host-files-action-buttons"]');
    const actionsToolbar = container.querySelector('[data-xgc-role="host-files-actions"]');
    expect(actionsToolbar?.firstElementChild).toBe(searchGroup);
    expect(actionsToolbar?.lastElementChild).toBe(actionButtons);
    expect(container.querySelector('[data-xgc-role="host-files-refresh"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="host-files-create-file"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="host-files-create-folder"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="host-files-upload"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="host-files-recycle"]')).toHaveAttribute('data-xgc-size', 'compact');

    fireEvent.click(screen.getByRole('button', { name: 'More actions for hello.txt' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(await screen.findByText('Delete hello.txt? It will be moved to the recycle bin.')).toBeInTheDocument();
  });

  it('opens and restores the local Core recycle bin', async () => {
    getHostRecycle
      .mockResolvedValueOnce([hostRecycleFixture()])
      .mockResolvedValueOnce([]);
    render(<HostSystemPage activeTab="files" managedHostId="local" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Recycle bin' }));
    expect(await screen.findByText('/var/lib/xgc2/removed.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close recycle bin' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreHostRecycle).toHaveBeenCalledWith('recycle-1',{}));
    await waitFor(() => expect(getHostRecycle).toHaveBeenCalledTimes(2));
  });

  it('opens a requested local folder when navigating from another domain', async () => {
    requestHostFilePath('/home/operator/Documents/XGC/ScreenRecording');

    render(<HostSystemPage activeTab="files" managedHostId="local" />);

    await waitFor(() => expect(getHostFiles).toHaveBeenCalledWith(
      '/home/operator/Documents/XGC/ScreenRecording',
      false,
      '',
      {},
    ));
  });

  it('keeps agent file ops (create/upload/download; open via name click)', async () => {
    render(
      <HostSystemPage
        activeTab="files"
        managedHostId="agent-b"
        systemProfile={allServices}
        managementConnection="ready"
      />,
    );

    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByTitle('Download')).toBeInTheDocument();
    // Name cell opens/edits — no separate Edit control in the operations column.
    expect(screen.getByTitle('Edit hello.txt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recycle bin' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for hello.txt' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(await screen.findByText('Delete hello.txt? This cannot be undone.')).toBeInTheDocument();
    expect(getHostFiles).toHaveBeenCalled();
  });

  it('opens a new requested directory after Files has been parked without remounting its table', async () => {
    const { container,rerender } = render(<HostSystemPage activeTab="files" managedHostId="local" />);
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    const viewport = container.querySelector('[data-xgc-role="data-table-row-viewport"][data-xgc-id="host-files"]');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in current directory' }), { target: { value: 'old filter' } });
    rerender(<HostSystemPage activeTab="overview" managedHostId="local" />);
    expect(await screen.findByText('host')).toBeInTheDocument();
    const destination = '/home/operator/Documents/XGC/ScreenRecording';
    getHostFiles.mockResolvedValueOnce({ ...filesListing(),path: destination });

    act(() => requestHostFilePath(destination));
    rerender(<HostSystemPage activeTab="files" managedHostId="local" />);
    await waitFor(() => expect(getHostFiles).toHaveBeenLastCalledWith(destination,false,'',{}));
    expect(await screen.findByDisplayValue(destination)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Find in current directory' })).toHaveValue('');
    expect(container.querySelector('[data-xgc-role="data-table-row-viewport"][data-xgc-id="host-files"]')).toBe(viewport);
  });

  it('retains a requested folder while a listing is in flight and disables new search submissions', async () => {
    let release!: (value: ReturnType<typeof filesListing>) => void;
    getHostFiles.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const { container } = render(<HostSystemPage activeTab="files" managedHostId="local" />);
    const search = container.querySelector<HTMLInputElement>('[data-xgc-role="host-files-search"] input');
    expect(search).toHaveAttribute('readonly');
    expect(search).toHaveAttribute('aria-busy', 'true');
    const destination = '/home/operator/recordings';
    getHostFiles.mockResolvedValueOnce({ ...filesListing(),path: destination });
    act(() => requestHostFilePath(destination));
    expect(getHostFiles).toHaveBeenCalledTimes(1);

    await act(async () => release(filesListing()));
    expect(await screen.findByDisplayValue(destination)).toBeInTheDocument();
    expect(getHostFiles).toHaveBeenCalledTimes(2);
    expect(getHostFiles).toHaveBeenLastCalledWith(destination,false,'',{});
  });

  it('does not consume a station folder request on a remote Agent', async () => {
    const destination = '/home/operator/recordings';
    requestHostFilePath(destination);
    render(<HostSystemPage activeTab="files" managedHostId="agent-a" executionTargetId="agent-a" systemProfile={allServices} managementConnection="ready" />);
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    expect(getHostFiles).toHaveBeenCalledWith('~',false,'',{ managedHostId: 'agent-a' });
    act(() => expect(consumeRequestedHostFilePath()).toBe(destination));
  });

  it('does not mount remote files when offline (0 request)', () => {
    render(
      <HostSystemPage
        activeTab="files"
        managedHostId="agent-b"
        systemProfile={allServices}
        managementConnection="connecting"
      />,
    );
    expect(screen.getByText(/Files connection connecting/i)).toBeInTheDocument();
    expect(getHostFiles).not.toHaveBeenCalled();
  });

  it('renders unavailable notice and makes 0 request when service is disabled', () => {
    render(
      <HostSystemPage
        activeTab="files"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, Overview: true }}
        managementConnection="ready"
      />,
    );
    expect(screen.getByText(/Files unavailable/i)).toBeInTheDocument();
    expect(getHostFiles).not.toHaveBeenCalled();
    expect(getHostOverview).not.toHaveBeenCalled();
  });

  it('does not mount or request a source-absent local leaf', () => {
    render(
      <StaticHostSystemPage
        activeTab="files"
        managedHostId="local"
        composition={defineHostSystemComposition({ Overview: HostOverviewSystemLeaf })}
      />,
    );

    expect(screen.getByText(/Files unavailable/i)).toBeInTheDocument();
    expect(getHostFiles).not.toHaveBeenCalled();
    expect(getHostOverview).not.toHaveBeenCalled();
  });

  it('loads the overview once on initial render (local)', async () => {
    render(<HostSystemPage activeTab="overview" managedHostId="local" />);

    expect(await screen.findByText('host')).toBeInTheDocument();
    expect(getHostOverview).toHaveBeenCalledTimes(1);
    expect(getHostFiles).not.toHaveBeenCalled();
    expect(listHostLogSources).not.toHaveBeenCalled();
    expect(screen.queryByText('Host logs')).not.toBeInTheDocument();
  });

  it('renders remote overview with refresh control; no interval poll when set to off', async () => {
    vi.useFakeTimers();
    render(
      <HostSystemPage
        activeTab="overview"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, Overview: true, HostLogs: true }}
        managementConnection="ready"
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('host')).toBeInTheDocument();
    expect(getHostOverview).toHaveBeenCalledTimes(1);
    expect(listHostLogSources).not.toHaveBeenCalled();
    // "Off" means exactly no hidden sampling: current traffic rates only gain
    // a second sample after a manual refresh or a selected polling interval.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(getHostOverview).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getHostOverview).toHaveBeenCalledTimes(1);
    expect(listHostLogSources).not.toHaveBeenCalled();
    // Core and Agent both expose the interval control.
    expect(document.querySelector('[data-xgc-role="system-auto-refresh"]')).not.toBeNull();
    vi.useRealTimers();
  });

  it('suppresses automatic remote overview requests while connecting', () => {
    render(
      <HostSystemPage
        activeTab="overview"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, Overview: true, HostLogs: true }}
        managementConnection="connecting"
      />,
    );
    expect(screen.getByText(/Overview offline/i)).toBeInTheDocument();
    expect(getHostOverview).not.toHaveBeenCalled();
    expect(listHostLogSources).not.toHaveBeenCalled();
  });

  it('fetches only the active remote runtime view', async () => {
    const { container } = render(
      <HostSystemPage
        activeTab="processes"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, Processes: true, Network: true }}
        managementConnection="ready"
      />,
    );

    expect((await screen.findAllByText('proc')).length).toBeGreaterThan(0);
    expect(getHostProcesses).toHaveBeenCalledTimes(1);
    expect(getHostNetworkSnapshot).not.toHaveBeenCalled();
    expect(container.querySelector('.xgc-host-page')).toHaveAttribute('data-xgc-tab', 'processes');
    expect(container.querySelector('[data-xgc-role="host-runtime"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="host-runtime-leaf"][data-xgc-id="processes"]')).not.toBeNull();
    expect(screen.getByRole('tablist', { name: 'Host runtime view' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Network' }));
    await waitFor(() => expect(getHostNetworkSnapshot).toHaveBeenCalledTimes(1));
    expect(getHostProcesses).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.xgc-host-page')).toHaveAttribute('data-xgc-tab', 'processes');
    expect(container.querySelector('[data-xgc-role="host-runtime-leaf"][data-xgc-id="network"]')).not.toBeNull();
  });

  it('does not request disabled remote runtime views', async () => {
    render(
      <HostSystemPage
        activeTab="processes"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, Processes: true, Network: false }}
        managementConnection="ready"
      />,
    );
    expect((await screen.findAllByText('proc')).length).toBeGreaterThan(0);
    expect(getHostProcesses).toHaveBeenCalled();
    expect(getHostNetworkSnapshot).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: 'Network' })).not.toBeInTheDocument();
  });

  it('loads a Network-only membership inside the Runtime tab', async () => {
    const { container } = render(
      <HostSystemPage
        activeTab="processes"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, Processes: false, Network: true }}
        managementConnection="ready"
      />,
    );

    await waitFor(() => expect(getHostNetworkSnapshot).toHaveBeenCalledTimes(1));
    expect(getHostProcesses).not.toHaveBeenCalled();
    expect(container.querySelector('.xgc-host-page')).toHaveAttribute('data-xgc-tab', 'processes');
    expect(container.querySelector('[data-xgc-role="host-runtime-leaf"][data-xgc-id="network"]')).not.toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Host runtime view' })).not.toBeInTheDocument();
  });

  it('loads remote typed SSH and firewall only when enabled', async () => {
    render(
      <HostSystemPage
        activeTab="ssh"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, SSHService: true, Firewall: true }}
        managementConnection="ready"
      />,
    );
    expect(await screen.findByRole('region', { name: 'Base configuration' })).toBeInTheDocument();
    expect(getHostSSH).toHaveBeenCalledWith(expect.objectContaining({ managedHostId: 'agent-b' }));
    expect(getHostFirewallStatus).toHaveBeenCalledWith(expect.objectContaining({ managedHostId: 'agent-b' }));
    expect(screen.queryByRole('button', { name: 'All config' })).not.toBeInTheDocument();
  });

  it('makes 0 SSH request when offline', () => {
    render(
      <HostSystemPage
        activeTab="ssh"
        managedHostId="agent-b"
        systemProfile={{ ...DISABLED_HOST_SYSTEM_PROFILE, SSHService: true }}
        managementConnection="unavailable"
      />,
    );
    expect(screen.getByText(/SSH \/ Firewall offline/i)).toBeInTheDocument();
    expect(getHostSSH).not.toHaveBeenCalled();
  });

  it('renders overview charts without host identity/metric cards above them', async () => {
    const { container } = render(<HostSystemPage activeTab="overview" managedHostId="local" systemProfile={LOCAL_HOST_SYSTEM_PROFILE} />);

    expect(await screen.findByText('host')).toBeInTheDocument();
    const page = container.querySelector('.xgc-host-page');
    expect(page).toHaveClass('xgc-operator-workspace');
    expect(page).toHaveAttribute('data-xgc-tab', 'overview');
    expect(container.querySelector('[data-xgc-role="system-overview"]')).not.toBeNull();
    const resources = container.querySelector('[data-xgc-role="system-overview-resources"]');
    expect(resources).toHaveClass('xgc-panel');
    expect(resources?.querySelectorAll('.xgc-panel[data-chrome="flat"]')).toHaveLength(6);
    const status = container.querySelector('[data-xgc-role="system-overview-status"]');
    expect(status).not.toBeNull();
    expect(status).not.toHaveClass('xgc-panel');
    expect(status).toHaveAttribute('data-xgc-align', 'end');
    expect(status?.querySelector('[data-xgc-role="system-auto-refresh"]')).not.toBeNull();
    expect(status?.querySelector('[data-xgc-role="system-overview-refresh"]')).not.toBeNull();
    const trend = container.querySelector('[data-xgc-role="system-overview-trend"]');
    expect(trend).not.toBeNull();
    expect(trend).not.toHaveClass('xgc-panel');
    expect(trend?.querySelectorAll(':scope > .xgc-panel')).toHaveLength(3);
    expect(container.querySelector('[data-xgc-role="system-overview-trend-network"]')).toHaveClass('xgc-panel');
    expect(container.querySelector('[data-xgc-role="system-overview-trend-disk"]')).toHaveClass('xgc-panel');
    expect(container.querySelector('[data-xgc-role="system-overview-trend-load"]')).toHaveClass('xgc-panel');
    const monitor = container.querySelector('[data-xgc-role="system-overview-monitor"]');
    expect(monitor).not.toBeNull();
    expect(monitor).not.toHaveClass('xgc-panel');
    expect(monitor?.querySelectorAll(':scope > .xgc-panel')).toHaveLength(3);
    expect(container.querySelector('[data-xgc-role="system-overview-memory"]')).toHaveClass('xgc-panel');
    expect(container.querySelector('[data-xgc-role="system-overview-memory"]')).toHaveAttribute('data-padding', 'none');
    expect(container.querySelector('[data-xgc-role="system-overview-trend-network"]')).toHaveAttribute('data-padding', 'none');
    expect(container.querySelector('[data-xgc-role="system-overview-disk"]')).toHaveClass('xgc-panel');
    expect(container.querySelector('[data-xgc-role="system-overview-load"]')).toHaveClass('xgc-panel');
    expect(container.querySelector('[data-xgc-role="system-overview-memory"] .resource-bar')).toHaveClass('xgc-resource-meter');
    expect(container.querySelector('[data-xgc-role="system-auto-refresh"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="system-overview-refresh"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="system-overview-identity"]')).toBeNull();
    for (const role of ['system-overview-cpu-table','system-overview-mem-table','system-overview-net-table']) {
      expect(container.querySelectorAll(`[data-xgc-role="${role}"] .xgc-host-overview-table-row`)).toHaveLength(3);
      expect(container.querySelectorAll(`[data-xgc-role="${role}"] [data-xgc-role="system-overview-process-placeholder"]`)).toHaveLength(3);
      expect(container.querySelector(`[data-xgc-role="${role}"] [data-xgc-role="system-overview-process-placeholder"][data-xgc-id="${role === 'system-overview-cpu-table' ? 'cpu' : role === 'system-overview-mem-table' ? 'mem' : 'net'}:0"]`)).not.toBeNull();
    }
    expect(container.querySelector('[data-xgc-role="system-overview-tops"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-overview-basic"]')).not.toHaveAttribute('data-fill');
    expect(container.querySelector('[data-xgc-role="system-overview-network"]')).not.toHaveAttribute('data-fill');
    expect(container.querySelector('[data-xgc-role="system-overview-top-cpu"]')).not.toHaveAttribute('data-fill');
    expect(container.querySelector('[data-xgc-role="system-overview-top-mem"]')).not.toHaveAttribute('data-fill');
    expect(container.querySelector('[data-xgc-role="system-overview-top-net"]')).not.toHaveAttribute('data-fill');
    const processPagers = container.querySelectorAll('[data-xgc-role="system-overview-process-pagination"]');
    expect(processPagers).toHaveLength(3);
    expect(container.querySelector('[data-xgc-role="system-overview-process-card"][data-xgc-id="cpu"]'))
      .toHaveAttribute('data-xgc-paginated','true');
    expect(container.querySelector('[data-xgc-role="system-overview-process-card"][data-xgc-id="cpu"]')!.lastElementChild)
      .toBe(container.querySelector('[data-xgc-role="system-overview-process-pagination"][data-xgc-id="cpu"]'));
    expect(screen.getByRole('button', { name: 'Previous CPU process page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next CPU process page' })).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="system-host-settings"]')).toBeNull();
  });

  it('stamps Overview host/meter leaves so Marker does not lock the whole card', async () => {
    const { container } = render(<HostSystemPage activeTab="overview" managedHostId="local" systemProfile={LOCAL_HOST_SYSTEM_PROFILE} />);

    expect(await screen.findByText('host')).toBeInTheDocument();
    const hostname = container.querySelector('[data-xgc-role="system-overview-host-row"][data-xgc-id="hostname"]');
    expect(hostname).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-overview-host-label"][data-xgc-id="hostname"]')).toHaveTextContent('Hostname');
    expect(container.querySelector('[data-xgc-role="system-overview-host-value"][data-xgc-id="hostname"]')).toHaveTextContent('host');
    expect(container.querySelector('[data-xgc-role="system-overview-basic-title"][data-xgc-id="system-overview-basic"]')).toHaveTextContent('Host');
    expect(container.querySelector('[data-xgc-role="system-overview-memory-meter"][data-xgc-id="system-overview-memory"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-overview-memory-label"][data-xgc-id="system-overview-memory"]')).toHaveTextContent('Memory');
    expect(container.querySelector('[data-xgc-role="system-overview-memory-percent"][data-xgc-id="system-overview-memory"]')).toHaveTextContent('50.0%');
    expect(container.querySelector('[data-xgc-role="system-overview-memory-detail"][data-xgc-id="system-overview-memory"]')).toHaveTextContent('50 B / 100 B');
    expect(container.querySelector('[data-xgc-role="system-overview-load-label"][data-xgc-id="system-overview-load"]')).toHaveTextContent('Load · 1m');
  });

  it('parks Overview while Files is visible and does not remount it', async () => {
    const { rerender, container } = render(
      <HostSystemPage activeTab="overview" managedHostId="local" />,
    );
    expect(await screen.findByText('host')).toBeInTheDocument();
    expect(getHostOverview).toHaveBeenCalledTimes(1);

    rerender(<HostSystemPage activeTab="files" managedHostId="local" />);
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    const overviewSurface = container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="overview"]');
    const filesSurface = container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]');
    expect(overviewSurface).toHaveAttribute('hidden');
    expect(filesSurface).not.toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="system-overview"]')).not.toBeNull();

    rerender(<HostSystemPage activeTab="overview" managedHostId="local" />);
    expect(overviewSurface).not.toHaveAttribute('hidden');
    expect(filesSurface).toHaveAttribute('hidden');
    expect(screen.queryByText('Loading system overview')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
    expect(getHostOverview).toHaveBeenCalledTimes(1);
  });

  it('covers Overview until it has content instead of holding Files', async () => {
    let release!: (value: ReturnType<typeof hostOverview>) => void;
    getHostOverview.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));
    const { rerender, container } = render(
      <HostSystemPage activeTab="files" managedHostId="local" />,
    );
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();

    rerender(<HostSystemPage activeTab="overview" managedHostId="local" />);
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]')).toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="overview"]')).toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"][data-xgc-id="system-page"]')).not.toBeNull();
    expect(screen.queryByText('Loading system overview')).not.toBeInTheDocument();

    await act(async () => {
      release(hostOverview());
    });
    expect(await screen.findByText('host')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="overview"]')).not.toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]')).toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
  });

  it('covers Files with a busy overlay until the listing arrives', async () => {
    let release!: (value: ReturnType<typeof filesListing>) => void;
    getHostFiles.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));
    const { container } = render(
      <HostSystemPage activeTab="files" managedHostId="local" />,
    );

    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"][data-xgc-id="system-page"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]')).toHaveAttribute('hidden');
    expect(screen.queryByText('hello.txt')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-files-empty"]')).toBeNull();

    await act(async () => {
      release(filesListing());
    });
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]')).not.toHaveAttribute('hidden');
  });

  it('keeps a failed first listing distinct from an empty directory and retries in place', async () => {
    getHostFiles.mockRejectedValueOnce(new Error('Permission denied'));
    const { container } = render(<HostSystemPage activeTab="files" managedHostId="local" />);

    const failure = await screen.findByText('Unable to load files');
    expect(failure.closest('[data-xgc-role="host-files-error"]')).toHaveTextContent('Permission denied');
    expect(container.querySelector('[data-xgc-role="host-files-empty"]')).toBeNull();
    await waitFor(() => expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull());
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]')).not.toHaveAttribute('hidden');
    const viewport = container.querySelector('[data-xgc-role="data-table-row-viewport"][data-xgc-id="host-files"]');
    expect(viewport).toContainElement(failure);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-files-error"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="data-table-row-viewport"][data-xgc-id="host-files"]')).toBe(viewport);
  });

  it('uses No files only after a successful empty listing', async () => {
    getHostFiles.mockResolvedValue({ ...filesListing(),entries: [] });
    const { container } = render(<HostSystemPage activeTab="files" managedHostId="local" />);

    expect(await screen.findByText('No files')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-files-error"]')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in current directory' }), { target: { value: 'draft only' } });
    expect(screen.getByText('No files')).toBeInTheDocument();
    expect(screen.queryByText('No matching files')).not.toBeInTheDocument();
  });

  it('disables directory writes after opening a different path fails and restores them only after a successful listing', async () => {
    render(<HostSystemPage activeTab="files" managedHostId="local" />);
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    const destination = '/unreadable';
    const pathInput = screen.getByRole('textbox', { name: 'Host file path' });
    fireEvent.change(pathInput,{ target: { value: destination } });
    expect(screen.getByRole('button', { name: 'File' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'hello.txt' })).toBeDisabled();
    getHostFiles.mockRejectedValueOnce(new Error('Permission denied'));
    fireEvent.keyDown(pathInput,{ key: 'Enter' });
    expect(await screen.findByText('Unable to load files')).toBeInTheDocument();
    expect(pathInput).toHaveValue(destination);
    for (const name of ['File','Folder','Upload']) expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh files' })).toBeEnabled();

    getHostFiles.mockResolvedValueOnce({ ...filesListing(),path: destination });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'File' })).toBeEnabled());
    expect(pathInput).toHaveValue(destination);
  });

  it('distinguishes an applied search with no matches from an empty directory', async () => {
    const { container } = render(<HostSystemPage activeTab="files" managedHostId="local" />);
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    getHostFiles.mockResolvedValueOnce({ ...filesListing(),entries: [] });
    const search = screen.getByRole('searchbox', { name: 'Find in current directory' });
    fireEvent.change(search, { target: { value: 'unmatched' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(await screen.findByText('No matching files')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-files-empty"]')).toBeNull();
    expect(getHostFiles).toHaveBeenLastCalledWith(filesListing().path,false,'unmatched',{});
  });

  it('covers Files until the listing arrives instead of holding Overview', async () => {
    let release!: (value: ReturnType<typeof filesListing>) => void;
    getHostFiles.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));
    const { rerender, container } = render(
      <HostSystemPage activeTab="overview" managedHostId="local" />,
    );
    expect(await screen.findByText('host')).toBeInTheDocument();

    rerender(<HostSystemPage activeTab="files" managedHostId="local" />);
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="overview"]')).toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]')).toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"][data-xgc-id="system-page"]')).not.toBeNull();
    expect(screen.queryByText('hello.txt')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-files-empty"]')).toBeNull();

    await act(async () => {
      release(filesListing());
    });
    expect(await screen.findByText('hello.txt')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="files"]')).not.toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="system-tab-surface"][data-xgc-id="overview"]')).toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
  });

  it('renders Host policy on the dedicated Host tab', async () => {
    const { container } = render(<HostSystemPage activeTab="host" managedHostId="local" />);

    expect(await screen.findByRole('button', { name: 'Host policy' })).toBeInTheDocument();
    expect(container.querySelector('.xgc-host-page')).toHaveAttribute('data-xgc-tab', 'host');
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
    const section = container.querySelector('[data-xgc-role="system-host-settings"][data-xgc-id="host-policy"]');
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute('data-xgc-expanded', 'true');
    expect(section).toHaveClass('xgc-host-settings');
    expect(getHostSettings).toHaveBeenCalled();
  });

  it('keeps Overview Refresh available after a failed first request', async () => {
    getHostOverview.mockRejectedValueOnce(new Error('Overview unavailable'));
    const { container } = render(<HostSystemPage activeTab="overview" managedHostId="local" />);
    expect(await screen.findByText('Overview unavailable')).toBeInTheDocument();
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toBeEnabled();
    expect(container.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();

    fireEvent.click(refresh);
    expect(await screen.findByText('host')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBe(refresh);
    expect(screen.queryByText('Overview unavailable')).not.toBeInTheDocument();
  });

  it('keeps the load card focused on the 1-minute value', async () => {
    getHostOverview.mockResolvedValue({
      ...hostOverview(),
      loadAverage: '5.62 4.10 2.30',
    });
    const { container } = render(
      <HostSystemPage activeTab="overview" managedHostId="local" systemProfile={LOCAL_HOST_SYSTEM_PROFILE} />,
    );

    const loadCard = await screen.findByText('Load · 1m');
    expect(loadCard.closest('[data-xgc-role="system-overview-load"]')).not.toBeNull();
    const value = container.querySelector('[data-xgc-role="system-overview-load-value"][data-xgc-id="1m"]');
    expect(value).toHaveTextContent('5.62 · 8 CPUs');
    expect(value).not.toHaveTextContent('4.10');
    expect(value).not.toHaveTextContent('2.30');
  });

  it('turns an Overview resource hotspot into a typed Runtime process request', async () => {
    getHostOverview.mockResolvedValue({
      ...hostOverview(),
      topCpuProcesses: [{
        pid: 42,name: 'b2-camera',cpuPercent: 91,memoryBytes: 256 * 1024 * 1024,connections: 3,
      }],
    });
    const onInspectRuntimeProcess = vi.fn();
    const { container } = render(
      <HostSystemPage
        activeTab="overview"
        managedHostId="local"
        onInspectRuntimeProcess={onInspectRuntimeProcess}
      />,
    );

    const hotspot = await screen.findByRole('button',{ name: 'Inspect b2-camera PID 42 in Runtime' });
    expect(hotspot).toHaveAttribute('data-xgc-role','system-overview-process-row');
    expect(hotspot).toHaveAttribute('data-xgc-id','cpu:42');
    expect(hotspot).toHaveAttribute('data-xgc-action','inspect-runtime');
    const cpuTable = container.querySelector('[data-xgc-role="system-overview-cpu-table"]')!;
    expect(cpuTable.querySelectorAll('[data-xgc-role="system-overview-process-placeholder"]')).toHaveLength(2);
    expect(cpuTable.querySelectorAll('.xgc-host-overview-table-row')).toHaveLength(3);
    expect(container.querySelector('[data-xgc-role="system-overview-process-pagination"][data-xgc-id="cpu"]')).not.toBeNull();

    fireEvent.click(hotspot);
    expect(onInspectRuntimeProcess).toHaveBeenCalledWith({
      pid: 42,name: 'b2-camera',metric: 'cpu',
    });
  });

  it('keeps a Network skeleton aligned to Host rows with the pager as the last row', async () => {
    getHostOverview.mockResolvedValue({
      ...hostOverview(),
      io: { ...hostOverview().io,networkIfaceCount: 7 },
      networkInterfaces: Array.from({ length: 7 },(_,index) => ({
        name: `eth${index}`,up: true,address: `192.0.2.${index + 1}`,
        rxBytes: 1000 + index,txBytes: 2000 + index,
      })),
    });
    const { container } = render(<HostSystemPage activeTab="overview" managedHostId="local" systemProfile={LOCAL_HOST_SYSTEM_PROFILE} />);

    expect((await screen.findAllByTitle('Current download rate · cumulative received data')).length).toBeGreaterThan(1);
    expect(screen.getAllByTitle('Current upload rate · cumulative sent data').length).toBeGreaterThan(1);
    expect(container.querySelector('[data-xgc-role="system-overview-network-help"]')).toBeNull();
    expect(screen.getByText('Network · 7 NICs')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-xgc-role="system-overview-basic"] .info-row')).toHaveLength(8);
    expect(container.querySelector('[data-xgc-role="system-overview-network-card"]')).toHaveAttribute('data-xgc-paginated','true');
    expect(container.querySelectorAll('[data-xgc-role="system-overview-nic"]')).toHaveLength(6);
    expect(container.querySelector('[data-xgc-role="system-overview-nic-name"][data-xgc-id="eth0"]')).toHaveTextContent('eth0');
    expect(container.querySelector('[data-xgc-role="system-overview-nic-state"][data-xgc-id="eth0"]')).toHaveTextContent('up');
    expect(container.querySelectorAll('[data-xgc-role="system-overview-nic-placeholder"]')).toHaveLength(0);
    expect(container.querySelector('[data-xgc-role="system-overview-nic"]')).toHaveTextContent('0 B/s · 1000 B');
    expect(container.querySelector('[data-xgc-role="system-overview-nic"]')).toHaveTextContent('0 B/s · 2.0 KB');
    const pagination = container.querySelector('[data-xgc-role="system-overview-nic-pagination"]');
    expect(pagination).toHaveAttribute('data-xgc-id', 'nics');
    expect(pagination).toHaveAttribute('role','navigation');
    expect(pagination).toHaveAttribute('aria-label','Network interface pages');
    expect(container.querySelector('[data-xgc-role="system-overview-nic-page-previous"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="system-overview-nic-page-next"]')).toHaveAttribute('data-xgc-size', 'compact');
    expect(container.querySelector('[data-xgc-role="system-overview-nic-page-previous"]')).toHaveAttribute('data-xgc-appearance', 'ghost');
    expect(container.querySelector('[data-xgc-role="system-overview-nic-page-next"]')).toHaveAttribute('data-xgc-appearance', 'ghost');
    expect(screen.getByLabelText('Page 1 of 2')).toBeInTheDocument();
    const networkCard = container.querySelector('[data-xgc-role="system-overview-network-card"]')!;
    expect(networkCard.lastElementChild).toBe(pagination);
    fireEvent.click(screen.getByRole('button',{ name: 'Next network interface page' }));
    expect(container.querySelectorAll('[data-xgc-role="system-overview-nic"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-xgc-role="system-overview-nic-placeholder"]')).toHaveLength(5);
    expect(screen.getByLabelText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name: 'Next network interface page' })).toBeDisabled();
  });

  it('keeps the Network pager and empty slots when no interfaces are reported', async () => {
    const { container } = render(<HostSystemPage activeTab="overview" managedHostId="local" systemProfile={LOCAL_HOST_SYSTEM_PROFILE} />);
    expect(await screen.findByText('host')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="system-overview-network-summary"]')).toBeNull();
    expect(container.querySelectorAll('[data-xgc-role="system-overview-nic"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-xgc-role="system-overview-nic-placeholder"]')).toHaveLength(6);
    const pagination = container.querySelector('[data-xgc-role="system-overview-nic-pagination"]');
    expect(pagination).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="system-overview-network-card"]')!.lastElementChild).toBe(pagination);
    expect(pagination?.querySelector('[aria-label="Page 1 of 1"]')).not.toBeNull();
    expect(screen.getByRole('button',{ name: 'Previous network interface page' })).toBeDisabled();
    expect(screen.getByRole('button',{ name: 'Next network interface page' })).toBeDisabled();
  });

  it('paginates top process tables after three visible rows', async () => {
    const processes = Array.from({ length: 5 },(_,index) => ({
      pid: 100 + index,
      name: `proc-${index}`,
      cpuPercent: 10 - index,
      memoryBytes: (5 - index) * 1024 * 1024,
      connections: 5 - index,
    }));
    getHostOverview.mockResolvedValue({
      ...hostOverview(),
      topCpuProcesses: processes,
      topMemoryProcesses: processes,
      topNetworkProcesses: processes,
    });
    const { container } = render(
      <HostSystemPage activeTab="overview" managedHostId="local" systemProfile={LOCAL_HOST_SYSTEM_PROFILE} />,
    );

    expect(await screen.findAllByText('proc-0')).toHaveLength(3);
    const cpuTable = container.querySelector('[data-xgc-role="system-overview-cpu-table"]')!;
    expect(container.querySelector('[data-xgc-role="system-overview-process-card"][data-xgc-id="cpu"]'))
      .toHaveAttribute('data-xgc-paginated','true');
    expect(cpuTable.querySelectorAll('[data-xgc-role="system-overview-process-row"]')).toHaveLength(3);
    expect(cpuTable.querySelector('[data-xgc-role="system-overview-process-row"][data-xgc-id="cpu:100"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-overview-process-row"][data-xgc-id="mem:100"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-xgc-role="system-overview-process-row"][data-xgc-id="cpu:100"]')).toHaveLength(1);
    expect(cpuTable.querySelector('[data-xgc-role="system-overview-process-name"][data-xgc-id="cpu:100"]')).toHaveTextContent('proc-0');
    expect(cpuTable).toHaveTextContent('proc-0');
    expect(cpuTable).not.toHaveTextContent('proc-3');
    fireEvent.click(screen.getByRole('button',{ name: 'Next CPU process page' }));
    expect(cpuTable.querySelectorAll('[data-xgc-role="system-overview-process-row"]')).toHaveLength(2);
    expect(cpuTable.querySelectorAll('[data-xgc-role="system-overview-process-placeholder"]')).toHaveLength(1);
    expect(cpuTable.querySelectorAll('.xgc-host-overview-table-row')).toHaveLength(3);
    expect(cpuTable).toHaveTextContent('proc-3');
    expect(cpuTable).not.toHaveTextContent('proc-0');
    expect(screen.getByRole('button',{ name: 'Next CPU process page' })).toBeDisabled();
  });
});

function filesListing() {
  return {
    path: '/var/lib/xgc2',
    parent: '/var/lib',
    entries: [
      {
        name: 'hello.txt',
        path: '/var/lib/xgc2/hello.txt',
        isDir: false,
        size: 5,
        mode: '-rw-r--r--',
        user: 'root',
        group: 'root',
        uid: '0',
        gid: '0',
        modTime: new Date(0).toISOString(),
        isSymlink: false,
        canEdit: true,
        canDownload: true,
      },
    ],
  };
}

function hostOverview() {
  return {
    hostname: 'host',
    distro: 'Linux · amd64',
    os: 'linux',
    arch: 'amd64',
    kernel: 'test',
    uptime: '1m',
    loadAverage: '0.1 0.1 0.1',
    cpu: 'cpu',
    cpuCount: 8,
    memory: { totalBytes: 100, availableBytes: 50, usedBytes: 50, usedPercent: 50 },
    disk: { path: '/', totalBytes: 100, freeBytes: 50, usedBytes: 50, usedPercent: 50, filesystem: 'overlay', mountOptions: '' },
    io: { diskReadBytes: 0, diskWriteBytes: 0, networkRxBytes: 0, networkTxBytes: 0, diskDeviceCount: 1, networkIfaceCount: 1 },
    networkInterfaces: [],
    topCpuProcesses: [],
    topMemoryProcesses: [],
    topNetworkProcesses: [],
    collectedAt: new Date(0).toISOString(),
    commands: {},
  };
}

function sshFixture() {
  return {
    exists: true,
    active: true,
    autoStart: true,
    serviceName: 'sshd',
    configPath: '',
    port: '22',
    listenAddress: '0.0.0.0',
    permitRootLogin: 'prohibit-password',
    passwordAuthentication: 'yes',
    pubkeyAuthentication: 'yes',
    useDNS: 'no',
    raw: {},
    remoteTyped: true,
  };
}

function processFixture(command: string) {
  return {
    pid: 42,startTicks: 99,name: command,ppid: 1,threads: 2,user: 'operator',cpuPercent: 1,state: 'running',
    cpuTime: '1s',memory: 1024,connections: 1,startTime: '2026-07-23T00:00:00Z',command,
  };
}

function portFixture() {
  return { type: 'tcp',protocol: 'tcp',pid: 42,process: 'proc',local: '127.0.0.1:8080',remote: '',state: 'LISTEN' };
}

function networkSnapshotFixture() {
  return {
    interfaces: [],
    routes: [],
    listeners: [portFixture()],
    diagnostics: {
      dns: { nameServers: [],searchDomains: [],options: [],source: '' },
      proxy: { httpProxy: '',httpsProxy: '',allProxy: '',noProxy: [],source: '' },
      assignments: [],
      remoteAccess: [],
      collectedAt: new Date(0).toISOString(),
    },
  };
}
