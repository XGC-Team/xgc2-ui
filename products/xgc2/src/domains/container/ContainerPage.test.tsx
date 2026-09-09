// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { ContainerPage } from './ContainerPage';

const containerApiMock = vi.hoisted(() => ({
  buildContainerImage: vi.fn(),
  createContainerComposeProject: vi.fn(),
  createContainerNetwork: vi.fn(),
  createContainer: vi.fn(),
  createContainerVolume: vi.fn(),
  getContainerComposeConfig: vi.fn(),
  getContainerLogs: vi.fn(),
  getContainerStatus: vi.fn(),
  inspectContainer: vi.fn(),
  inspectContainerImage: vi.fn(),
  inspectContainerNetwork: vi.fn(),
  connectContainerNetwork: vi.fn(),
  disconnectContainerNetwork: vi.fn(),
  listContainerComposeProjects: vi.fn(),
  listContainerImages: vi.fn(),
  listContainerNetworkInterfaces: vi.fn(),
  listContainerNetworks: vi.fn(),
  listContainers: vi.fn(),
  listContainerVolumes: vi.fn(),
  loadContainerImage: vi.fn(),
  operateContainer: vi.fn(),
  operateContainerComposeProject: vi.fn(),
  pruneContainerBuildCache: vi.fn(),
  pruneContainerImages: vi.fn(),
  pruneContainerNetworks: vi.fn(),
  pullContainerImage: vi.fn(),
  pushContainerImage: vi.fn(),
  removeContainerImages: vi.fn(),
  removeContainerNetwork: vi.fn(),
  removeContainerNetworks: vi.fn(),
  removeContainerVolume: vi.fn(),
  saveContainerImage: vi.fn(),
  tagContainerImage: vi.fn(),
}));

vi.mock('./containerService', () => containerApiMock);

const terminalWriteMock = vi.hoisted(() => vi.fn());

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    clear() {}
    dispose() {}
    loadAddon() {}
    open() {}
    reset() {}
    scrollToBottom() {}
    write(value: string) {
      terminalWriteMock(value);
    }
  },
}));

describe('ContainerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    containerApiMock.getContainerStatus.mockResolvedValue({
      dockerAvailable: true,
      serverVersion: '26.1.3',
      containerCount: 0,
      runningCount: 0,
      imageCount: 0,
      networkCount: 2,
      volumeCount: 0,
      message: '',
      collectedAt: '2026-05-31T00:00:00.000Z',
    });
    containerApiMock.listContainers.mockResolvedValue([]);
    containerApiMock.listContainerComposeProjects.mockResolvedValue([]);
    containerApiMock.listContainerImages.mockResolvedValue([]);
    containerApiMock.pruneContainerImages.mockResolvedValue({ output: 'pruned' });
    containerApiMock.pruneContainerBuildCache.mockResolvedValue({ output: 'builder pruned' });
    containerApiMock.saveContainerImage.mockResolvedValue(new Blob(['tar-bytes']));
    containerApiMock.loadContainerImage.mockResolvedValue({ output: 'Loaded image' });
    containerApiMock.tagContainerImage.mockResolvedValue({ output: 'tagged' });
    containerApiMock.pushContainerImage.mockResolvedValue({ output: 'pushed' });
    containerApiMock.buildContainerImage.mockResolvedValue({ output: 'built' });
    containerApiMock.inspectContainerImage.mockResolvedValue({ content: '[{"Id":"sha256:img"}]' });
    containerApiMock.listContainerNetworks.mockResolvedValue([
      {
        id: '36408d3580aa',
        name: '1panel-network',
        driver: 'bridge',
        scope: 'local',
        ipv4: true,
        ipv6: false,
        internal: false,
        attachable: false,
        subnet: '172.18.0.0/16',
        gateway: '172.18.0.1',
        ipRange: '',
        subnetV6: '',
        gatewayV6: '',
        ipRangeV6: '',
        parent: '',
        labels: ['com.docker.compose.project=1panel'],
        createdAt: '2026-05-01T00:00:00Z',
        isSystem: false,
        containers: 1,
      },
      {
        id: 'bridge',
        name: 'bridge',
        driver: 'bridge',
        scope: 'local',
        ipv4: true,
        ipv6: false,
        internal: false,
        attachable: false,
        subnet: '172.17.0.0/16',
        gateway: '172.17.0.1',
        ipRange: '',
        subnetV6: '',
        gatewayV6: '',
        ipRangeV6: '',
        parent: '',
        labels: [],
        createdAt: '2026-01-01T00:00:00Z',
        isSystem: true,
        containers: 0,
      },
    ]);
    containerApiMock.listContainerNetworkInterfaces.mockResolvedValue(['eth0', 'wlan0']);
    containerApiMock.listContainerVolumes.mockResolvedValue([]);
    containerApiMock.createContainer.mockResolvedValue({ output: 'Container created' });
    containerApiMock.getContainerLogs.mockResolvedValue({ content: 'log line one\nlog line two' });
    containerApiMock.inspectContainer.mockResolvedValue({ content: '{"Id":"abc"}' });
    containerApiMock.inspectContainerNetwork.mockResolvedValue({
      content: JSON.stringify([{
        Name: '1panel-network',
        Id: '36408d3580aa',
        Driver: 'bridge',
        Scope: 'local',
        EnableIPv4: true,
        EnableIPv6: false,
        IPAM: { Driver: 'default', Config: [{ Subnet: '172.18.0.0/16', Gateway: '172.18.0.1' }] },
        Containers: {},
      }]),
    });
    containerApiMock.pruneContainerNetworks.mockResolvedValue({ output: 'Deleted Networks' });
    containerApiMock.removeContainerNetworks.mockResolvedValue({ output: 'Network removed' });
    containerApiMock.getContainerComposeConfig.mockResolvedValue({
      path: '/opt/apps/n8n/docker-compose.yml',
      content: 'services:\n  n8n:\n    image: n8nio/n8n\n',
    });
  });

  it('renders Docker networks in the unified container data table', async () => {
    const { container } = render(<ContainerPage activeTab="networks" />);

    expect(await screen.findByText('1panel-network')).toBeInTheDocument();
    await waitFor(() => expect(containerApiMock.listContainerNetworks).toHaveBeenCalled());

    const panel = container.querySelector('[data-xgc-role="container-network-table-panel"]');
    const table = container.querySelector('.xgc-data-table.container-data-table-shell');
    const footer = container.querySelector('[data-xgc-role="container-network-pagination"]');
    const row = container.querySelector<HTMLElement>('[data-xgc-role="container-network-row"][data-xgc-id="1panel-network"]');
    const systemRow = container.querySelector<HTMLElement>('[data-xgc-role="container-network-row"][data-xgc-id="bridge"]');

    expect(panel).toBeInTheDocument();
    expect(panel).toContainElement(table as HTMLElement);
    expect(panel).toContainElement(footer as HTMLElement);
    expect(footer).toHaveClass('container-image-footer');
    expect(footer?.querySelector('.xgc-pagination')).not.toBeNull();
    expect(table).toBeInTheDocument();
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent('bridge');
    expect(row).toHaveTextContent('172.18.0.0/16');
    expect(row).toHaveTextContent('172.18.0.1');
    expect(screen.getByText('Operation')).toBeInTheDocument();
    expect(screen.getByRole('table')).toContainElement(screen.getByRole('columnheader', { name: 'Operation' }));
    expect(row).not.toBeNull();
    expect(within(row!).getByRole('cell', { name: 'bridge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove bridge' })).toBeDisabled();
    // System tag is plain text (no pill chrome).
    expect(systemRow?.querySelector('[data-xgc-role="container-network-system-tag"]')).toHaveTextContent('system');
    expect(systemRow?.querySelector('[data-xgc-role="container-network-system-tag"]')).toHaveAttribute('data-xgc-id', 'bridge');
    expect(within(systemRow!).getByRole('button', { name: 'Remove bridge' })).toHaveAttribute('data-xgc-role', 'container-network-remove');
    expect(within(row!).getByRole('button', { name: 'Remove 1panel-network' })).toHaveAttribute('data-xgc-id', '1panel-network');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('uses the shared operator workspace and Panel for all Containers tabs', async () => {
    const { container,rerender } = render(<ContainerPage activeTab="containers" />);
    const page = container.querySelector('[data-xgc-role="container-page"]');
    expect(page).toHaveClass('xgc-operator-workspace');
    expect(page).toHaveClass('xgc-workspace-full-span');
    expect(page).toHaveAttribute('data-xgc-tab', 'containers');
    expect(await screen.findByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(container.querySelector('.xgc-panel.container-section')).not.toBeNull();

    for (const tab of ['compose','images','networks','volumes'] as const) {
      rerender(<ContainerPage activeTab={tab} />);
      expect(container.querySelector('[data-xgc-role="container-page"]')).toHaveAttribute('data-xgc-tab', tab);
      expect(container.querySelector('.xgc-panel.container-section')).not.toBeNull();
    }
  });

  it('renders the state filter strip with shared workspace controls', async () => {
    const { container } = render(<ContainerPage activeTab="containers" />);
    expect(await screen.findByRole('button', { name: 'Paused' })).toBeInTheDocument();
    const filter = container.querySelector('[data-xgc-role="container-state-filter"]');
    const paused = container.querySelector('[data-xgc-role="container-state-filter-option"][data-xgc-id="paused"]');
    expect(filter).toHaveClass('xgc-segmented-control', 'xgc-tab-strip', 'container-state-filter');
    expect(paused).toHaveClass('xgc-tab-item', 'xgc-tab-control');
    expect(paused).toHaveTextContent('Paused');
  });

  it('keeps filters and table in separate toolbar and content regions', async () => {
    const { container } = render(<ContainerPage activeTab="containers" />);
    expect(await screen.findByRole('button', { name: 'Create' })).toBeInTheDocument();
    const toolbar = container.querySelector('[data-xgc-role="container-list-toolbar"]');
    const stateFilter = container.querySelector('[data-xgc-role="container-state-filter"]');
    const tableShell = container.querySelector('.container-data-table-shell');
    expect(toolbar).not.toBeNull();
    expect(stateFilter).not.toBeNull();
    expect(tableShell).not.toBeNull();
    // State tabs + search/refresh/create share one toolbar; table is a sibling that scrolls alone.
    expect(toolbar).toContainElement(stateFilter as HTMLElement);
    expect(toolbar!.contains(tableShell!)).toBe(false);

    const right = toolbar!.querySelector('.container-toolbar-right');
    expect(right).not.toBeNull();
    const rightNames = Array.from(right!.querySelectorAll('button')).map((button) => (
      button.getAttribute('aria-label') ?? button.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    ));
    const refreshIndex = rightNames.findIndex((label) => label.includes('Refresh'));
    const createIndex = rightNames.findIndex((label) => label.includes('Create'));
    expect(refreshIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(refreshIndex);
  });

  it('names icon actions and gives the create drawer modal keyboard behavior', async () => {
    containerApiMock.listContainers.mockResolvedValue([{
      id: 'container-a',name: 'api',names: 'api',image: 'nginx:alpine',state: 'running',status: 'Up',ports: '',created: '',
    }]);
    render(<ContainerPage activeTab="containers" />);

    expect(await screen.findByRole('button', { name: 'Stop api' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop api' })).toHaveAttribute('data-xgc-role', 'container-start-stop');
    expect(screen.getByRole('button', { name: 'Stop api' })).toHaveAttribute('data-xgc-id', 'container-a');
    expect(screen.getByRole('button', { name: 'Restart api' })).toHaveAttribute('data-xgc-role', 'container-restart');
    expect(screen.getByRole('button', { name: 'Restart api' })).toHaveAttribute('data-xgc-id', 'container-a');
    expect(screen.getByRole('button', { name: 'Remove api' })).toHaveAttribute('data-xgc-role', 'container-remove');
    expect(screen.getByRole('button', { name: 'Remove api' })).toHaveAttribute('data-xgc-id', 'container-a');
    expect(screen.getByRole('button', { name: 'Logs' })).toHaveAttribute('data-xgc-role', 'container-logs');
    expect(screen.getByRole('button', { name: 'Inspect api details' })).toHaveAttribute('data-xgc-role', 'container-inspect');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = screen.getByRole('dialog', { name: 'Create container' });
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Create container' })).not.toBeInTheDocument();
  });

  it('opens container Logs in a wide terminal-style right panel', async () => {
    containerApiMock.listContainers.mockResolvedValue([{
      id: '843d437acbc3',
      name: 'flamboyant_bardeen',
      names: 'flamboyant_bardeen',
      image: 'nginx:alpine',
      state: 'exited',
      status: 'Exited',
      ports: '',
      created: '2026-05',
    }]);
    const { container } = render(<ContainerPage activeTab="containers" />);

    expect(await screen.findByRole('button', { name: 'Logs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    const drawer = await screen.findByRole('dialog', { name: /Logs: flamboyant_bardeen/i });
    expect(drawer).toHaveClass('config-drawer', 'config-drawer-extra-wide', 'container-output-drawer');
    expect(drawer).toHaveAttribute('data-xgc-role', 'container-detail-drawer');
    expect(drawer).toHaveAttribute('data-xgc-id', 'logs');
    // Title is container name only — no muted subtitle under the header.
    expect(within(drawer).getByText('flamboyant_bardeen')).toBeInTheDocument();
    expect(within(drawer).queryByText('Container logs')).not.toBeInTheDocument();
    const shell = container.querySelector('[data-xgc-role="container-detail-content"]');
    expect(shell).toHaveClass('container-terminal-shell');
    expect(container.querySelector('[data-xgc-role="container-terminal-window"]')).not.toBeNull();
    expect(container.querySelector('.container-terminal-log')).toHaveAttribute('role', 'log');
    await waitFor(() => {
      expect(terminalWriteMock).toHaveBeenCalled();
      const written = terminalWriteMock.mock.calls.map((call) => String(call[0])).join('');
      expect(written).toContain('log line one');
      expect(written).toContain('log line two');
    });
    expect(containerApiMock.getContainerLogs).toHaveBeenCalledWith('843d437acbc3',200,undefined);
  });

  it('opens Details with operator-readable inspect facts instead of raw JSON only', async () => {
    containerApiMock.listContainers.mockResolvedValue([{
      id: '3b5e7e5d0628',
      name: 'xgc2-final-sdk-pure-focal',
      names: 'xgc2-final-sdk-pure-focal',
      image: 'ubuntu:20.04',
      state: 'exited',
      status: 'Exited',
      ports: '',
      created: '2026-07-17',
    }]);
    containerApiMock.inspectContainer.mockResolvedValue({
      content: JSON.stringify({
        Id: '3b5e7e5d0628abcdef',
        Name: '/xgc2-final-sdk-pure-focal',
        State: { Status: 'exited',Running: false,ExitCode: 137,OOMKilled: false },
        Config: { Image: 'ubuntu:20.04',Cmd: ['bash'],Env: ['MODE=prod'] },
        HostConfig: {
          NetworkMode: 'bridge',
          RestartPolicy: { Name: 'no' },
          PortBindings: { '22/tcp': [{ HostIp: '0.0.0.0',HostPort: '2222' }] },
        },
        NetworkSettings: { Networks: { bridge: { IPAddress: '172.17.0.3' } } },
        Mounts: [{ Source: '/host/data',Destination: '/data',Mode: 'rw',RW: true }],
      }),
    });
    const { container } = render(<ContainerPage activeTab="containers" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Inspect xgc2-final-sdk-pure-focal details' }));
    await waitFor(() => expect(containerApiMock.inspectContainer).toHaveBeenCalledWith('3b5e7e5d0628',undefined));
    const drawer = await screen.findByRole('dialog', { name: /Details: xgc2-final-sdk-pure-focal/i });
    expect(drawer).toHaveAttribute('data-xgc-id', 'inspect');
    // Header: container name only (no muted description under the title).
    expect(drawer.querySelector('header strong')).toHaveTextContent('xgc2-final-sdk-pure-focal');
    expect(drawer.querySelector('header span')).toBeNull();
    expect(within(drawer).queryByText(/Status, ports, mounts/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(drawer).getByText('Image')).toBeInTheDocument();
    });
    expect(within(drawer).getByText('ubuntu:20.04')).toBeInTheDocument();
    expect(within(drawer).getByText(/2222 → 22\/tcp/)).toBeInTheDocument();
    expect(within(drawer).getByText(/\/host\/data → \/data/)).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="container-inspect-summary"]')).not.toBeNull();
    expect(drawer.querySelector('[data-xgc-role="container-inspect-facts"]')).not.toBeNull();
    const summaryTab = within(drawer).getByRole('tab', { name: 'Summary' });
    const jsonTab = within(drawer).getByRole('tab', { name: 'JSON' });
    expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    expect(jsonTab).toHaveAttribute('aria-selected', 'false');
    expect(drawer.querySelector('[data-xgc-role="container-inspect-raw"]')).toBeNull();

    // Summary and JSON are mutually exclusive (workflow node I/O pattern).
    fireEvent.click(jsonTab);
    expect(jsonTab).toHaveAttribute('aria-selected', 'true');
    expect(summaryTab).toHaveAttribute('aria-selected', 'false');
    expect(drawer.querySelector('[data-xgc-role="container-inspect-facts"]')).toBeNull();
    const raw = drawer.querySelector('[data-xgc-role="container-inspect-raw"]') as HTMLElement;
    expect(raw).not.toBeNull();
    expect(raw.tagName).toBe('SECTION');
    expect(raw).toHaveClass('container-inspect-json','xgc-code-block');
    expect(raw.querySelector('pre > code')).not.toBeNull();
    expect(raw.textContent).toContain('"Id": "3b5e7e5d0628abcdef"');
    expect(raw.textContent).toContain('"Image": "ubuntu:20.04"');

    fireEvent.click(summaryTab);
    expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    expect(drawer.querySelector('[data-xgc-role="container-inspect-facts"]')).not.toBeNull();
    expect(drawer.querySelector('[data-xgc-role="container-inspect-raw"]')).toBeNull();
    expect(within(drawer).getByText('ubuntu:20.04')).toBeInTheDocument();
  });

  it('filters container rows through semantic pressed state without generic active classes', async () => {
    containerApiMock.listContainers.mockResolvedValue([
      {
        id: 'container-running',name: 'api',names: 'api',image: 'nginx:alpine',state: 'running',status: 'Up',ports: '',created: '',
      },
      {
        id: 'container-exited',name: 'worker',names: 'worker',image: 'worker:latest',state: 'exited',status: 'Exited',ports: '',created: '',
      },
    ]);
    const { container } = render(<ContainerPage activeTab="containers" />);

    expect(await screen.findByText('worker')).toBeInTheDocument();
    const filters = screen.getByRole('group', { name: 'Filter containers by state' });
    const exited = within(filters).getByRole('button', { name: 'Exited' });
    fireEvent.click(exited);

    expect(exited).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('api')).not.toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();
    expect(container.querySelector('.active')).toBeNull();
  });

  it('submits normalized create data through shared form controls', async () => {
    render(<ContainerPage activeTab="containers" />);
    await waitFor(() => expect(containerApiMock.listContainers).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const dialog = screen.getByRole('dialog', { name: 'Create container' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'api' } });
    fireEvent.change(within(dialog).getByLabelText('Image'), { target: { value: 'nginx:alpine' } });
    fireEvent.change(within(dialog).getByLabelText('Ports'), { target: { value: '8080:80, 9000:90' } });
    fireEvent.change(within(dialog).getByLabelText('Environment'), { target: { value: 'MODE=prod\nDEBUG=0' } });
    fireEvent.change(within(dialog).getByLabelText('Volumes'), { target: { value: '/tmp:/data' } });
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Privileged' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(containerApiMock.createContainer).toHaveBeenCalledWith({
      name: 'api',
      image: 'nginx:alpine',
      ports: ['8080:80','9000:90'],
      env: ['MODE=prod','DEBUG=0'],
      volumes: ['/tmp:/data'],
      command: '',
      restartPolicy: 'unless-stopped',
      privileged: true,
    },undefined));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create container' })).not.toBeInTheDocument());
  });

  it('keeps each Docker resource responsive when an unrelated resource request fails', async () => {
    let rejectImages: (reason: Error) => void = () => undefined;
    containerApiMock.listContainerImages.mockImplementation(() => new Promise((_,reject) => {
      rejectImages = reject;
    }));
    const view = render(<ContainerPage activeTab="networks" />);

    expect(await screen.findByText('1panel-network')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled();

    await act(async () => rejectImages(new Error('Image registry unavailable')));
    expect(screen.queryByText('Image registry unavailable')).not.toBeInTheDocument();

    view.rerender(<ContainerPage activeTab="images" />);
    expect(await screen.findByText('Image registry unavailable')).toBeInTheDocument();
  });

  it('refreshes only the mutated Docker resource and runtime summary', async () => {
    containerApiMock.createContainerNetwork.mockResolvedValue({ output: 'Network created' });
    render(<ContainerPage activeTab="networks" />);

    expect(await screen.findByText('1panel-network')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const drawer = await screen.findByRole('dialog', { name: 'Create network' });
    fireEvent.change(within(drawer).getByLabelText('Network name'), { target: { value: 'mission-net' } });
    fireEvent.change(within(drawer).getByLabelText('IPv4 subnet'), { target: { value: '172.28.0.0/16' } });
    fireEvent.change(within(drawer).getByLabelText('IPv4 gateway'), { target: { value: '172.28.0.1' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(containerApiMock.createContainerNetwork).toHaveBeenCalledWith(expect.objectContaining({
      name: 'mission-net',
      driver: 'bridge',
      ipv4: true,
      subnet: '172.28.0.0/16',
      gateway: '172.28.0.1',
      internal: false,
      attachable: false,
    }),undefined));
    await waitFor(() => {
      expect(containerApiMock.listContainerNetworks).toHaveBeenCalledTimes(2);
      expect(containerApiMock.getContainerStatus).toHaveBeenCalledTimes(2);
    });
    expect(containerApiMock.listContainers).toHaveBeenCalledTimes(1);
    expect(containerApiMock.listContainerComposeProjects).toHaveBeenCalledTimes(1);
    expect(containerApiMock.listContainerImages).toHaveBeenCalledTimes(1);
    expect(containerApiMock.listContainerVolumes).toHaveBeenCalledTimes(1);
  });

  it('opens network inspect details from the network name', async () => {
    render(<ContainerPage activeTab="networks" />);
    expect(await screen.findByText('1panel-network')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1panel-network' }));
    await waitFor(() => expect(containerApiMock.inspectContainerNetwork).toHaveBeenCalledWith('1panel-network', undefined));
    expect(await screen.findByRole('dialog', { name: /Network details: 1panel-network/i })).toBeInTheDocument();
    expect(screen.getByText('Connected containers')).toBeInTheDocument();
    expect(screen.getByText('Connect container')).toBeInTheDocument();
  });

  it('connects and disconnects containers from a network detail drawer', async () => {
    containerApiMock.listContainers.mockResolvedValue([
      {
        id: 'cid-api',
        name: 'api',
        names: '/api',
        image: 'nginx',
        command: '',
        created: '',
        status: 'Up',
        state: 'running',
        ports: '',
        labels: [],
      },
    ]);
    containerApiMock.connectContainerNetwork.mockResolvedValue({ output: 'connected' });
    containerApiMock.disconnectContainerNetwork.mockResolvedValue({ output: 'disconnected' });
    containerApiMock.inspectContainerNetwork
      .mockResolvedValueOnce({
        content: JSON.stringify([{
          Name: '1panel-network',
          Id: '36408d3580aa',
          Driver: 'bridge',
          Scope: 'local',
          EnableIPv4: true,
          EnableIPv6: false,
          IPAM: { Driver: 'default', Config: [{ Subnet: '172.18.0.0/16', Gateway: '172.18.0.1' }] },
          Containers: {},
        }]),
      })
      .mockResolvedValue({
        content: JSON.stringify([{
          Name: '1panel-network',
          Id: '36408d3580aa',
          Driver: 'bridge',
          Scope: 'local',
          EnableIPv4: true,
          EnableIPv6: false,
          IPAM: { Driver: 'default', Config: [{ Subnet: '172.18.0.0/16', Gateway: '172.18.0.1' }] },
          Containers: {
            'cid-api': {
              Name: 'api',
              IPv4Address: '172.18.0.10/16',
              IPv6Address: '',
              MacAddress: '02:42:ac:12:00:0a',
              EndpointID: 'endpoint-abcdef',
            },
          },
        }]),
      });

    render(<ContainerPage activeTab="networks" />);
    expect(await screen.findByText('1panel-network')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1panel-network' }));
    expect(await screen.findByText('Connect container')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Container to connect'));
    fireEvent.click(await screen.findByRole('option', { name: 'api' }));
    fireEvent.change(screen.getByLabelText('Connect IPv4 address'), { target: { value: '172.18.0.10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(containerApiMock.connectContainerNetwork).toHaveBeenCalledWith(
      '1panel-network',
      expect.objectContaining({ container: 'cid-api', ipv4: '172.18.0.10' }),
      undefined,
    ));

    const disconnect = await screen.findByRole('button', { name: 'Disconnect api' });
    expect(disconnect).toHaveAttribute('data-xgc-role', 'container-network-disconnect');
    expect(disconnect).toHaveAttribute('data-xgc-id', 'cid-api');
    expect(disconnect.closest('[data-xgc-role="container-network-endpoint-row"]')).toHaveAttribute('data-xgc-id', 'cid-api');
    fireEvent.click(disconnect);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(containerApiMock.disconnectContainerNetwork).toHaveBeenCalledWith(
      '1panel-network',
      expect.objectContaining({ container: 'api' }),
      undefined,
    ));
  });

  it('opens compose YAML from Config files via a YAML action', async () => {
    containerApiMock.listContainerComposeProjects.mockResolvedValue([{
      name: 'n8n',
      status: 'running(1)',
      configFiles: '/opt/apps/n8n/docker-compose.yml',
    }]);
    const { container } = render(<ContainerPage activeTab="compose" />);

    expect(await screen.findByText('n8n')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop n8n' })).toHaveAttribute('data-xgc-role', 'container-compose-up');
    expect(screen.getByRole('button', { name: 'Stop n8n' })).toHaveAttribute('data-xgc-id', 'n8n');
    expect(screen.getByRole('button', { name: 'Restart n8n' })).toHaveAttribute('data-xgc-role', 'container-compose-restart');
    expect(screen.getByRole('button', { name: 'Down n8n' })).toHaveAttribute('data-xgc-role', 'container-compose-down');
    expect(screen.getByRole('button', { name: 'Delete n8n' })).toHaveAttribute('data-xgc-role', 'container-compose-delete');
    fireEvent.click(screen.getByRole('button', { name: 'View YAML for n8n' }));

    await waitFor(() => expect(containerApiMock.getContainerComposeConfig).toHaveBeenCalledWith(
      '/opt/apps/n8n/docker-compose.yml',
      undefined,
    ));
    const drawer = await screen.findByRole('dialog', { name: /Compose YAML: n8n/i });
    expect(drawer).toHaveAttribute('data-xgc-id', 'yaml');
    expect(container.querySelector('[data-xgc-role="container-compose-yaml-path"]'))
      .toHaveTextContent('/opt/apps/n8n/docker-compose.yml');
    expect(container.querySelector('[data-xgc-role="container-compose-yaml-path"]'))
      .toHaveAttribute('data-xgc-id', '/opt/apps/n8n/docker-compose.yml');
    expect(container.querySelector('[data-xgc-role="container-compose-yaml"] pre'))
      .toHaveTextContent('services:');
    expect(container.querySelector('[data-xgc-role="container-compose-yaml"] pre'))
      .toHaveTextContent('n8nio/n8n');
  });

  it('searches images and exposes prune / import / export / refresh actions', async () => {
    containerApiMock.listContainerImages.mockResolvedValue([
      {
        id: 'sha256:c849c34b2e6fabcdef',
        repository: 'wordpress',
        tag: '7.0.1',
        size: '762.38 MB',
        createdAt: '2026-07-14 10:29:04',
        inUse: true,
      },
      {
        id: 'sha256:deadbeef0001',
        repository: 'redis',
        tag: '7-alpine',
        size: '40 MB',
        createdAt: '2026-06-01 00:00:00',
        inUse: false,
      },
    ]);
    const { container } = render(<ContainerPage activeTab="images" />);

    expect(await screen.findByText('wordpress')).toBeInTheDocument();
    expect(screen.getByText('In use')).toBeInTheDocument();
    expect(screen.getByText('Unused')).toBeInTheDocument();
    // Status/tag are plain table text — no pill highlight chrome.
    const unused = screen.getByText('Unused');
    expect(unused).toHaveClass('container-image-status');
    expect(unused).toHaveAttribute('data-xgc-status', 'unused');

    fireEvent.change(screen.getByPlaceholderText('Search images'), { target: { value: 'redis' } });
    expect(screen.queryByText('wordpress')).not.toBeInTheDocument();
    expect(screen.getByText('redis')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(containerApiMock.listContainerImages).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Prune dangling' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prune' }));
    await waitFor(() => expect(containerApiMock.pruneContainerImages).toHaveBeenCalledWith(false,undefined));

    fireEvent.click(screen.getByRole('button', { name: 'Prune build cache' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prune' }));
    await waitFor(() => expect(containerApiMock.pruneContainerBuildCache).toHaveBeenCalled());

    // Export is a per-row icon action (not a toolbar button).
    fireEvent.click(screen.getByRole('button', { name: 'Export redis:7-alpine' }));
    await waitFor(() => expect(containerApiMock.saveContainerImage).toHaveBeenCalledWith('redis:7-alpine',undefined));

    expect(container.querySelector('[data-xgc-role="container-image-import-input"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument();
  });

  it('keeps paginated table footers inside the shared table panel chrome', async () => {
    const { container,rerender } = render(<ContainerPage activeTab="volumes" />);
    expect(await screen.findByRole('button', { name: 'Create' })).toBeInTheDocument();

    const volumePanel = container.querySelector('[data-xgc-role="container-volume-table-panel"]');
    const volumeFooter = container.querySelector('[data-xgc-role="container-volume-pagination"]');
    expect(volumePanel).not.toBeNull();
    expect(volumeFooter).not.toBeNull();
    expect(volumePanel).toContainElement(volumeFooter as HTMLElement);
    expect(volumeFooter?.querySelector('.container-image-footer-summary')).toBeInTheDocument();
    // Zero selection must not pollute the range label (keeps left column short / aligned).
    expect(volumeFooter?.querySelector('.container-image-footer-summary')?.textContent).not.toMatch(/^0 selected/);

    rerender(<ContainerPage activeTab="networks" />);
    const networkPanel = container.querySelector('[data-xgc-role="container-network-table-panel"]');
    const networkFooter = container.querySelector('[data-xgc-role="container-network-pagination"]');
    expect(networkPanel).toContainElement(networkFooter as HTMLElement);

    rerender(<ContainerPage activeTab="images" />);
    const imagePanel = container.querySelector('[data-xgc-role="container-image-table-panel"]');
    const imageFooter = container.querySelector('[data-xgc-role="container-image-pagination"]');
    expect(imagePanel).toContainElement(imageFooter as HTMLElement);
  });

  it('marks volume inspect and remove with the volume name', async () => {
    containerApiMock.listContainerVolumes.mockResolvedValue([{
      name: 'data-vol',
      driver: 'local',
      mountpoint: '/var/lib/docker/volumes/data-vol/_data',
      scope: 'local',
    }]);
    render(<ContainerPage activeTab="volumes" />);
    expect(await screen.findByRole('button', { name: 'Inspect data-vol' })).toHaveAttribute('data-xgc-role', 'container-volume-inspect');
    expect(screen.getByRole('button', { name: 'Inspect data-vol' })).toHaveAttribute('data-xgc-id', 'data-vol');
    expect(screen.getByRole('button', { name: 'Remove data-vol' })).toHaveAttribute('data-xgc-role', 'container-volume-remove');
    expect(screen.getByRole('button', { name: 'Remove data-vol' })).toHaveAttribute('data-xgc-id', 'data-vol');
  });

  it('supports image push, build, tag, inspect, sort, and pagination', async () => {
    containerApiMock.listContainerImages.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `sha256:img${String(index).padStart(4, '0')}`,
        repository: index === 0 ? 'alpine' : `app-${String(index).padStart(2, '0')}`,
        tag: 'latest',
        size: `${10 + index} MB`,
        createdAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
        inUse: index % 2 === 0,
      })),
    );
    const { container: root } = render(<ContainerPage activeTab="images" />);

    expect(await screen.findByText('alpine')).toBeInTheDocument();
    expect(root.querySelector('[data-xgc-role="container-image-pagination"]')).toHaveTextContent('of 21');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument());
    expect(screen.queryByText('alpine')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('alpine')).toBeInTheDocument();

    // Default sort is repository asc — alpine is first on page 1.
    // Push / Tag / Inspect are per-row icon actions with name-scoped aria-labels.
    fireEvent.click(screen.getByRole('button', { name: 'Push alpine:latest' }));
    expect(screen.getByRole('button', { name: 'Push alpine:latest' })).toHaveAttribute('data-xgc-role', 'container-image-push');
    expect(screen.getByRole('button', { name: 'Push alpine:latest' })).toHaveAttribute('data-xgc-id', 'alpine:latest');
    await waitFor(() => expect(containerApiMock.pushContainerImage).toHaveBeenCalledWith('alpine:latest',undefined));

    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    const buildDrawer = await screen.findByRole('dialog', { name: /Build image/i });
    fireEvent.change(within(buildDrawer).getByPlaceholderText('my-app:latest'), {
      target: { value: 'demo:dev' },
    });
    fireEvent.click(within(buildDrawer).getByRole('button', { name: 'Build' }));
    await waitFor(() => expect(containerApiMock.buildContainerImage).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'demo:dev' }),
      undefined,
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Tag alpine:latest' }));
    const tagDrawer = await screen.findByRole('dialog', { name: /Tag image/i });
    fireEvent.change(within(tagDrawer).getByPlaceholderText('registry.example.com/app:1.0.0'), {
      target: { value: 'demo:1' },
    });
    fireEvent.click(within(tagDrawer).getByRole('button', { name: 'Tag' }));
    await waitFor(() => expect(containerApiMock.tagContainerImage).toHaveBeenCalledWith(
      'alpine:latest',
      'demo:1',
      undefined,
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Inspect alpine:latest' }));
    await waitFor(() => expect(containerApiMock.inspectContainerImage).toHaveBeenCalledWith('alpine:latest',undefined));
    expect(await screen.findByRole('dialog', { name: /Details: alpine:latest/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Size/ }));
    const sizeHeader = screen.getByRole('columnheader', { name: /Size/ });
    expect(sizeHeader).toHaveAttribute('aria-sort', 'ascending');
  });
});
