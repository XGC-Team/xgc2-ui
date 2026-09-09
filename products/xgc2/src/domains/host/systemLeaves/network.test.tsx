// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { HostNetworkSnapshot } from '../hostModel';
import { HostNetworkSystemLeaf } from './network';

const hostApi = vi.hoisted(() => ({ getHostNetworkSnapshot: vi.fn() }));
const profileApi = vi.hoisted(() => ({
  listNetworkProfilePresets: vi.fn(),
  listNetworkProfiles: vi.fn(),
  createNetworkProfile: vi.fn(),
  commitNetworkProfile: vi.fn(),
}));

vi.mock('../hostNetworkActions',() => hostApi);
vi.mock('../hostNetworkProfileService',() => profileApi);

describe('HostNetworkSystemLeaf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hostApi.getHostNetworkSnapshot.mockResolvedValue(networkSnapshot());
    profileApi.listNetworkProfilePresets.mockResolvedValue(networkPresets());
    profileApi.listNetworkProfiles.mockResolvedValue([]);
  });

  it('loads one passive snapshot and exposes robot health, routes, listeners and remote sessions', async () => {
    const onInspectRuntimeProcess = vi.fn();
    const { container } = render(
      <HostNetworkSystemLeaf
        executionTargetId="agent-a"
        managedHostId="agent-a"
        isRemote
        requestsAllowed
        actionsEnabled
        onInspectRuntimeProcess={onInspectRuntimeProcess}
      />,
    );

    expect(await screen.findByText('1 ready / 1')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Health' })).toHaveAttribute('aria-current','page');
    expect(profileApi.listNetworkProfilePresets).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Profiles' }));
    expect(await screen.findByDisplayValue('Agent Direct')).toBeInTheDocument();
    expect(hostApi.getHostNetworkSnapshot).toHaveBeenCalledTimes(1);
    expect(hostApi.getHostNetworkSnapshot).toHaveBeenCalledWith({ managedHostId: 'agent-a' });
    expect(screen.getByRole('navigation',{ name:'Network views' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-xgc-role="host-network-navigation-group"]')).toHaveLength(3);
    expect(screen.getByRole('button',{ name: 'Profiles' })).toHaveAttribute('aria-current','page');
    expect(container.querySelector('[data-xgc-role="host-network-profile"][data-xgc-id="agent-egress"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="host-network-profile-agent-mode"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="host-network-view"][data-xgc-id="routes"]')).not.toBeNull();
    const toolbar = container.querySelector('[data-xgc-role="host-runtime-toolbar"]');
    expect(toolbar).toHaveAttribute('data-xgc-id', 'network');
    expect(toolbar?.firstElementChild).toHaveAttribute('data-xgc-role','host-runtime-search-group');
    expect(toolbar?.lastElementChild).toHaveAttribute('data-xgc-role','host-runtime-actions');
    expect(container.querySelector('[data-xgc-role="host-runtime-section"]')).toHaveAttribute('data-xgc-id', 'network');

    fireEvent.click(screen.getByRole('button',{ name: 'Health' }));
    expect(await screen.findByText('1 ready / 1')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-network-health-check"][data-xgc-id="route"]'))
      .toHaveTextContent('Ready');
    expect(container.querySelector('[data-xgc-role="host-network-health-check"][data-xgc-id="remote-access"]'))
      .toHaveTextContent('1 SSH · 1 desktop');

    fireEvent.click(screen.getByRole('button',{ name: 'Path' }));
    const target = screen.getByPlaceholderText('Enter URL, hostname, or IP');
    const searchControl = container.querySelector('[data-xgc-role="host-network-search"][data-xgc-id="path"]');
    expect(searchControl).toContainElement(target);
    expect(searchControl).toHaveAttribute('data-size', 'compact');
    fireEvent.change(target,{ target: { value: 'http://camera.robot.lan:8080' } });
    expect(container.querySelector('[data-xgc-role="host-network-path-row"][data-xgc-id="proxy"]'))
      .toHaveTextContent('Direct');

    fireEvent.click(screen.getByRole('button',{ name: 'Routes' }));
    expect(container.querySelector('[data-xgc-role="host-route-table"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="host-route-table"]')).toHaveTextContent('192.168.8.1');
    expect(screen.getByRole('button',{ name: 'Routes' })).toHaveAttribute('aria-current','page');

    fireEvent.click(screen.getByRole('button',{ name: 'Listeners' }));
    expect(container.querySelector('[data-xgc-role="host-port-table"]')).not.toBeNull();
    expect(screen.getByText('0.0.0.0:22')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-port-row"]'))
      .toHaveAttribute('data-xgc-id', 'tcp-0.0.0.0:22--0');

    fireEvent.click(screen.getByRole('button',{ name: 'Remote access' }));
    expect(container.querySelectorAll('[data-xgc-role="host-remote-access-row"]')).toHaveLength(3);
    expect(screen.getByText('Remote desktop')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-process-end"]')).toBeNull();
    const inspect = screen.getAllByRole('button',{ name: 'Inspect' })[0];
    expect(inspect).toHaveAttribute('data-xgc-role', 'host-remote-access-inspect');
    expect(inspect).toHaveAttribute('data-xgc-id', 'ssh-active-42-192.168.8.5-0');

    fireEvent.click(inspect);
    expect(onInspectRuntimeProcess).toHaveBeenCalledWith({ pid: 42,name: 'sshd',metric: 'cpu' });
  });

  it('shows Core router profile controls only on a Core target',async () => {
    const { container } = render(
      <HostNetworkSystemLeaf
        executionTargetId="local"
        targetCoreId="core-a"
        isRemote={false}
        requestsAllowed
        actionsEnabled
      />,
    );

    fireEvent.click(screen.getByRole('button',{ name:'Profiles' }));
    expect(await screen.findByDisplayValue('Auto')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="host-network-profile"][data-xgc-id="core-router"]')).not.toBeNull();
    expect(screen.getByText('Robot interface')).toBeInTheDocument();
    expect(screen.getByText('IPv4 / CIDR')).toBeInTheDocument();
    expect(screen.getByRole('switch',{ name:'Share Internet' })).not.toBeChecked();
    expect(screen.getByRole('switch',{ name:'GitHub proxy' })).not.toBeChecked();
    expect(container.querySelector('[data-xgc-role="host-network-profile-agent-mode"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="host-network-profile-apply"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="host-network-profile-local-routes"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="host-network-profile-forwarding-rules"]')).not.toBeNull();
    expect(profileApi.listNetworkProfilePresets).toHaveBeenCalledWith(expect.any(AbortSignal),{ targetCoreId:'core-a' });
    expect(profileApi.listNetworkProfiles).toHaveBeenCalledWith(expect.any(AbortSignal),{ targetCoreId:'core-a' });

    fireEvent.click(screen.getByRole('button',{ name:'Add route' }));
    fireEvent.click(screen.getByRole('button',{ name:'Add route' }));
    expect(container.querySelectorAll('[data-xgc-role="host-network-profile-local-route"]')).toHaveLength(2);
    fireEvent.change(container.querySelector('[data-xgc-role="host-network-profile-local-route-gateway"][data-xgc-id="0"] input')!,{
      target:{ value:'192.168.51.1' },
    });
    expect(container.querySelector('[data-xgc-role="host-network-profile-local-route-gateway"][data-xgc-id="0"] input'))
      .toHaveValue('192.168.51.1');
    fireEvent.click(container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="host-network-profile-local-route-interface-select"][data-xgc-id="0"] button',
    )!);
    fireEvent.click(screen.getByRole('option',{ name:'Robot LAN' }));
    expect(container.querySelector(
      '[data-xgc-role="host-network-profile-local-route-interface-select"][data-xgc-id="0"]',
    )).toHaveAttribute('data-value','robot-lan');
    fireEvent.click(screen.getByRole('button',{ name:'Remove local route 1' }));
    expect(container.querySelectorAll('[data-xgc-role="host-network-profile-local-route"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button',{ name:'Add forwarding rule' }));
    fireEvent.click(screen.getByRole('button',{ name:'Add forwarding rule' }));
    expect(container.querySelectorAll('[data-xgc-role="host-network-profile-forwarding-rule"]')).toHaveLength(2);
    fireEvent.click(container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="host-network-profile-forwarding-egress-select"][data-xgc-id="0"] button',
    )!);
    fireEvent.click(screen.getByRole('option',{ name:'Robot LAN' }));
    expect(container.querySelector(
      '[data-xgc-role="host-network-profile-forwarding-egress-select"][data-xgc-id="0"]',
    )).toHaveAttribute('data-value','robot-lan');
    fireEvent.click(screen.getByRole('button',{ name:'Remove forwarding rule 1' }));
    expect(container.querySelectorAll('[data-xgc-role="host-network-profile-forwarding-rule"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('switch',{ name:'Share Internet' }));
    expect(screen.getByText('Shared source network')).toBeInTheDocument();
    expect(screen.getByText('Uplink interface')).toBeInTheDocument();
  });

  it('preserves an unsaved profile while navigating diagnostics and issues no save', async () => {
    const { container } = render(<HostNetworkSystemLeaf executionTargetId="local" isRemote={false} requestsAllowed actionsEnabled />);
    expect(await screen.findByText('1 ready / 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:'Profiles' }));
    const name = await screen.findByDisplayValue('Auto');
    fireEvent.change(name,{ target:{ value:'Field network draft' } });
    fireEvent.click(screen.getByRole('button',{ name:'Path' }));
    fireEvent.change(screen.getByPlaceholderText('Enter URL, hostname, or IP'),{
      target:{ value:'camera.robot.lan' },
    });
    fireEvent.click(screen.getByRole('button',{ name:'Profiles' }));
    expect(screen.getByDisplayValue('Field network draft')).toBe(name);
    expect(container.querySelector('[data-xgc-role="host-network-view-surface"][data-xgc-id="path"]')).toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('button',{ name:'Path' }));
    expect(screen.getByPlaceholderText('Enter URL, hostname, or IP')).toHaveValue('camera.robot.lan');
    expect(profileApi.listNetworkProfilePresets).toHaveBeenCalledTimes(1);
    expect(profileApi.createNetworkProfile).not.toHaveBeenCalled();
    expect(profileApi.commitNetworkProfile).not.toHaveBeenCalled();
  });

});

function networkPresets() {
  return [
    {
      id:'auto',profile: {
        schema:'xgc2.system.network-profile/v1',name:'Auto',role:'core-router',
        interfaces:[{ id:'robot-lan',selector:{ mode:'auto' } }],
        addresses:[],localRoutes:[],forwarding:[],
      },
    },
    {
      id:'agent-direct',profile: {
        schema:'xgc2.system.network-profile/v1',name:'Agent Direct',role:'agent-egress',
        interfaces:[],addresses:[],localRoutes:[],forwarding:[],
        agentEgress:{ mode:'direct',preserveManagementRoute:true },
      },
    },
  ];
}

function networkSnapshot(): HostNetworkSnapshot {
  return {
    interfaces: [{
      name: 'eth0',up: true,address: '192.168.8.20',rxBytes: 100,txBytes: 200,
      macAddress: '02:00:00:00:00:01',mtu: 1500,
      addresses: [{ address: '192.168.8.20',prefixLength: 24,family: 'ipv4' }],
      rxPackets: 10,txPackets: 20,rxErrors: 0,txErrors: 0,
    }],
    routes: [{
      destination: '0.0.0.0',prefixLength: 0,gateway: '192.168.8.1',
      interfaceName: 'eth0',metric: 100,table: 'main',
    }],
    listeners: [{
      type: 'tcp',protocol: 'tcp',pid: 41,process: 'sshd',
      local: '0.0.0.0:22',remote: '',state: 'LISTEN',
    }],
    diagnostics: {
      dns: { nameServers: ['192.168.8.1'],searchDomains: ['robot.lan'],options: [],source: '/etc/resolv.conf' },
      proxy: { httpProxy: '',httpsProxy: '',allProxy: '',noProxy: [],source: '' },
      assignments: [{ interfaceName: 'eth0',address: '192.168.8.20',mode: 'static',source: 'ip address flags' }],
      remoteAccess: [
        remoteAccess({ kind: 'ssh',state: 'active',pid: 42,processName: 'sshd',remoteAddress: '192.168.8.5' }),
        remoteAccess({ kind: 'remoteDesktop',state: 'active',pid: 84,processName: 'gnome-remote-desktop',localPort: 3389 }),
        remoteAccess({ kind: 'ssh',state: 'listening',pid: 41,processName: 'sshd',remoteAddress: '' }),
      ],
      collectedAt: '2026-08-09T00:00:00Z',
    },
  };
}

function remoteAccess(
  partial: Partial<HostNetworkSnapshot['diagnostics']['remoteAccess'][number]>,
): HostNetworkSnapshot['diagnostics']['remoteAccess'][number] {
  return {
    kind: 'ssh',state: 'active',protocol: 'tcp',localAddress: '192.168.8.20',localPort: 22,
    remoteAddress: '192.168.8.5',remotePort: 50000,pid: 42,processStartTicks: 99,
    processName: 'sshd',user: 'robot',cpuPercent: 1.5,memoryBytes: 64 * 1024 * 1024,
    processCount: 3,startedAt: '2026-08-09T00:00:00Z',detectedBy: 'process:sshd',
    ...partial,
  };
}
