// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import type { ReactElement,ReactNode } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../profiles/core-dev';
import { agentEffectiveFixture,managedHostFixture } from '../test/managedHostTestFixture';
import { ProductWebCompositionProvider } from '../shared/productWebComposition';
import type { ProductWebComposition } from '../shared/productWebComposition';
import { AppFrame } from './AppFrame';

function renderWithComposition(
  ui: ReactElement,
  composition: ProductWebComposition = productWebComposition,
) {
  const CompositionWrapper = ({ children }: { children: ReactNode }) => (
    <ProductWebCompositionProvider composition={composition}>{children}</ProductWebCompositionProvider>
  );
  return render(ui, { wrapper: CompositionWrapper });
}

const navigationMock = vi.hoisted(() => ({
  navigatePage: vi.fn(),
  setManagedHostId: vi.fn(),
  setTargetCoreId: vi.fn(),
  setPageSection: vi.fn(),
  state: {} as Record<string, unknown>,
}));

const targetCoreMock = vi.hoisted(() => ({
  coreNodes: [] as Array<Record<string, unknown>>,
  selectedTargetCore: undefined as Record<string, unknown> | undefined,
}));

const managedHostMock = vi.hoisted(() => ({
  hosts: [] as Array<Record<string, unknown>>,
  status: 'ready' as 'loading' | 'ready' | 'error',
}));

vi.mock('./navigationContext', () => ({
  useNavigation: () => navigationMock.state,
}));

vi.mock('./useTargetCore', () => ({
  useTargetCore: () => ({
    coreNodes: targetCoreMock.coreNodes,
    selectedTargetCore: targetCoreMock.selectedTargetCore,
  }),
}));

vi.mock('../domains/groundStationInteraction/groundStationInteractionPublic', () => ({
  GroundStationNativeAgentProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  GroundStationNotificationCenter: ({ targetId }: { targetId: string }) => <button data-xgc-role="ground-station-notifications-trigger" data-xgc-id={targetId}>Notifications</button>,
  GroundStationLocalNotificationHost: () => <div data-xgc-role="ground-station-local-notifications-test" />,
  GroundStationInteractionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  GroundStationInteractionHost: ({ targetId,showDecisionDialog = true }: { targetId: string;showDecisionDialog?: boolean }) => (
    <div
      data-xgc-role="ground-station-interaction-host-test"
      data-xgc-id={targetId}
      data-show-decision-dialog={showDecisionDialog ? 'true' : 'false'}
    />
  ),
}));

vi.mock('../domains/managedHost/managedHostStore', () => ({
  LOCAL_MANAGED_HOST_ID: 'local',
  useManagedHosts: () => managedHostMock.hosts,
  useManagedHostRegistryStatus: () => managedHostMock.status,
  isLocalManagedHost: (hostId: string | undefined) => !hostId || hostId === 'local',
  managedHostOptions: (hosts: Array<Record<string, unknown>>) => (
    hosts.filter((host) => host.id !== 'local').map((host) => ({
      id: String(host.id),
      label: String(host.displayName || host.id),
      stateLabel: host.enrollment === 'enrolled' ? String(host.connectivity) : String(host.enrollment),
      disabled: host.enrollment !== 'enrolled' || host.connectivity !== 'ready',
      host,
    }))
  ),
}));

describe('AppFrame target selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
    managedHostMock.hosts = [];
    managedHostMock.status = 'ready';
    targetCoreMock.coreNodes = [];
    targetCoreMock.selectedTargetCore = undefined;
    navigationMock.state = navigationState();
  });

  it.each(['home','automations','experiment'])('keeps %s free of the retired screen recorder while preserving notifications', (page) => {
    navigationMock.state = navigationState({ page });
    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(container.querySelector('[data-xgc-role="app-topbar"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-control"][data-xgc-id="recording-start"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record ground station' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('renders one selector for Core and Agent targets without icons or duplicate host controls', () => {
    targetCoreMock.coreNodes = [
      coreNode({ id: 'core-xgc', name: 'Local GCS', status: 'online' }),
    ];
    managedHostMock.hosts = [
      managedHostFixture({ id: 'agent-a', displayName: 'Agent A' }),
      managedHostFixture({ id: 'agent-b', displayName: 'Agent B',enrollment: 'known',effectiveProfile: null }),
    ];

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    const selector = container.querySelector('[data-xgc-role="target-selector"]');
    const control = selector?.querySelector('[data-xgc-role="target-selector-control"][data-xgc-id="global"]');
    const trigger = screen.getByRole('button', { name: 'Target' });

    expect(control).toHaveAttribute('data-xgc-control', 'select');
    expect(control).toHaveAttribute('data-xgc-size', 'compact');
    expect(control).toHaveAttribute('data-xgc-menu-placement', 'above');
    expect(control).toHaveAttribute('data-value', 'core:core-xgc');
    expect(trigger).toHaveTextContent('Core · Local GCS (local)');
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'Core · Local GCS (local)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Agent · Agent A (ready)' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Agent · Agent B (known)' })).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Core' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Agent' })).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="target-core-selector"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="managed-host-selector"]')).toBeNull();
    expect(selector?.querySelector('.xgc-select-leading')).toBeNull();
    expect(selector?.querySelector('.xgc-select-chevron')).toBeInTheDocument();
    expect(selector).not.toHaveTextContent(/trusted|discovered/i);
  });

  it('does not expose legacy Agent-shaped or remote CoreNode entries', () => {
    targetCoreMock.coreNodes = [
      coreNode({ id: 'core-xgc', name: 'Local GCS', status: 'online' }),
      coreNode({ id: 'xgc14-rk3588', name: 'xgc14-rk3588', profile: 'agent', baseUrl: 'http://192.168.51.14:8787', status: 'online' }),
    ];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    fireEvent.click(screen.getByRole('button', { name: 'Target' }));
    expect(screen.getByRole('option', { name: 'Core · Local GCS (local)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /xgc14-rk3588/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('clamps a persisted remote Core selection to the local Core identity', () => {
    navigationMock.state = navigationState({ targetCoreId: 'core-remote' });
    targetCoreMock.coreNodes = [
      coreNode({ id: 'core-remote',name: 'Remote Core',profile: 'remote',baseUrl: 'http://core.example.test' }),
    ];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(navigationMock.setTargetCoreId).toHaveBeenCalledWith('local');
    expect(screen.getByRole('button', { name: 'Target' })).toHaveTextContent('Core · Local GCS (local)');
  });

  it('opens the target selector without discovery or pairing controls', () => {
    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    fireEvent.click(screen.getByRole('button', { name: 'Target' }));

    expect(screen.queryByRole('button', { name: 'Discover agents' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pairing token')).not.toBeInTheDocument();
  });

  it('routes unified target selections to core or agent navigation state', () => {
    targetCoreMock.coreNodes = [
      coreNode({ id: 'core-xgc', name: 'Local GCS', status: 'online' }),
      coreNode({ id: 'core-remote', name: 'Remote Core', status: 'online', profile: 'remote', baseUrl: 'http://core.example.test' }),
    ];
    managedHostMock.hosts = [
      managedHostFixture({ id: 'agent-a', displayName: 'Agent A',effectiveProfile: profileWithSurfaces('System') }),
    ];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    const selector = screen.getByRole('button', { name: 'Target' });

    fireEvent.click(selector);
    fireEvent.click(screen.getByRole('option', { name: 'Agent · Agent A (ready)' }));
    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('agent-a');

    fireEvent.click(selector);
    expect(screen.queryByRole('option', { name: 'Core · Remote Core (online)' })).not.toBeInTheDocument();
  });

  it('retargets an Automation deep link when switching from Mocap Rotor to B2', () => {
    window.location.hash = '#/automations/xgc2-dev-lab-agent-mocap-rotor/workflows/rotor-start';
    navigationMock.state = navigationState({
      page: 'automations',
      managedHostId: 'xgc2-dev-lab-agent-mocap-rotor',
    });
    targetCoreMock.coreNodes = [coreNode({})];
    managedHostMock.hosts = [
      managedHostFixture({
        id: 'xgc2-dev-lab-agent-b2',
        displayName: 'XGC2 Dev B2 Agent',
        effectiveProfile: profileWithSurfaces('Automations'),
      }),
      managedHostFixture({
        id: 'xgc2-dev-lab-agent-mocap-rotor',
        displayName: 'Mocap Rotor',
        effectiveProfile: profileWithSurfaces('Automations'),
      }),
    ];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    fireEvent.click(screen.getByRole('button', { name: 'Target' }));
    fireEvent.click(screen.getByRole('option', { name: 'Agent · XGC2 Dev B2 Agent (ready)' }));

    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('xgc2-dev-lab-agent-b2');
    expect(window.location.hash).toBe('#/automations/xgc2-dev-lab-agent-b2/workflows');
  });

  it('retargets an Agent Automation deep link when returning to local Core', () => {
    window.location.hash = '#/automations/xgc2-dev-lab-agent-b2/workflows/b2-start';
    navigationMock.state = navigationState({
      page: 'automations',
      managedHostId: 'xgc2-dev-lab-agent-b2',
    });
    targetCoreMock.coreNodes = [coreNode({})];
    managedHostMock.hosts = [managedHostFixture({
      id: 'xgc2-dev-lab-agent-b2',
      displayName: 'XGC2 Dev B2 Agent',
      effectiveProfile: profileWithSurfaces('Automations'),
    })];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    fireEvent.click(screen.getByRole('button', { name: 'Target' }));
    fireEvent.click(screen.getByRole('option', { name: 'Core · Local GCS (local)' }));

    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('local');
    expect(window.location.hash).toBe('#/automations/local/workflows');
  });

  it('jumps to the first compiled page enabled by a selected Agent profile', () => {
    navigationMock.state = navigationState({ page: 'home' });
    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-a',
      displayName: 'Operations Agent',
      effectiveProfile: profileWithSurfaces('Operations'),
    })];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    fireEvent.click(screen.getByRole('button', { name: 'Target' }));
    fireEvent.click(screen.getByRole('option', { name: 'Agent · Operations Agent (ready)' }));
    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('agent-a');
    expect(navigationMock.navigatePage).toHaveBeenCalledWith('operations');
  });

  it('enters an Agent view even when the current control-plane page is shared', () => {
    navigationMock.state = navigationState({ page: 'robotAssets' });
    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-a',
      displayName: 'Operations Agent',
      effectiveProfile: profileWithSurfaces('Operations'),
    })];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    fireEvent.click(screen.getByRole('button', { name: 'Target' }));
    fireEvent.click(screen.getByRole('option', { name: 'Agent · Operations Agent (ready)' }));

    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('agent-a');
    expect(navigationMock.navigatePage).toHaveBeenCalledWith('operations');
  });

  it('returns to local Core when a selected Agent has a valid all-disabled profile', () => {
    navigationMock.state = navigationState({ page: 'home' });
    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-a',
      displayName: 'Closed Agent',
      effectiveProfile: agentEffectiveFixture(false),
    })];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    fireEvent.click(screen.getByRole('button', { name: 'Target' }));
    fireEvent.click(screen.getByRole('option', { name: 'Agent · Closed Agent (ready)' }));
    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('local');
    expect(navigationMock.setManagedHostId).not.toHaveBeenCalledWith('agent-a');
    expect(navigationMock.navigatePage).not.toHaveBeenCalled();
  });

  it('does not render inline discovery or trust controls in the global selector', () => {
    navigationMock.state = navigationState({ managedHostId: 'agent-b' });
    managedHostMock.hosts = [
      managedHostFixture({ id: 'agent-b', displayName: 'Agent B',enrollment: 'known',effectiveProfile: null }),
    ];

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(screen.queryByRole('button', { name: 'Discover agents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Trust/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pairing token')).not.toBeInTheDocument();
  });

  it('projects the focused local GCS profile without deleting closed page identities', () => {
    targetCoreMock.selectedTargetCore = coreNode({ capabilities: focusedGcsCapabilities() });
    targetCoreMock.coreNodes = [targetCoreMock.selectedTargetCore];

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(screen.getByRole('button', { name: 'Robot assets' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Robot links' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="robotAssets"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="connections"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="automations"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="usernodeAssets"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="appStore"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="containers"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="terminal"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="operations"]')).toBeInTheDocument();
  });

  it('keeps App Store and Containers out of ops nav when the composition omits them even if capabilities advertise both', () => {
    targetCoreMock.selectedTargetCore = coreNode({
      capabilities: [
        ...focusedGcsCapabilities(),
        'product.app-store',
        'app-store',
        'product.containers',
        'containers.read',
      ],
    });
    targetCoreMock.coreNodes = [targetCoreMock.selectedTargetCore];

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    // Core Dev composition does not contribute appStore/containers; capability ads alone cannot invent ops items.
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="appStore"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="containers"]')).toBeNull();
  });

  it('uses the X brand mark as the collapsed navigation toggle', () => {
    const setSidebarCollapsed = vi.fn();
    navigationMock.state = navigationState({
      page: 'robotAssets',
      sidebarCollapsed: true,
      setSidebarCollapsed,
    });

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    const shell = container.querySelector('[data-xgc-role="app-shell"][data-xgc-id="robotAssets"]')!;
    const toggle = shell.querySelector<HTMLButtonElement>('[data-xgc-role="sidebar-toggle"]')!;

    expect(toggle).toHaveAccessibleName('Expand navigation');
    expect(toggle).toHaveClass('xgc-sidebar-toggle');
    expect(toggle.querySelector('.xgc-sidebar-brand-mark svg.brand-glyph')).toBeInTheDocument();
    expect(toggle.querySelector('.xgc-sidebar-collapse-indicator')).toBeInTheDocument();
    expect(toggle.querySelector('.xgc-sidebar-brand-label')).toHaveTextContent('XGC');
    expect(toggle.querySelector('.xgc-sidebar-brand-label')).toHaveAttribute('aria-hidden', 'true');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(setSidebarCollapsed).toHaveBeenCalledWith(false);
  });

  it('makes the expanded XGC brand and collapse indicator one click target', () => {
    const setSidebarCollapsed = vi.fn();
    navigationMock.state = navigationState({
      page: 'robotAssets',
      setSidebarCollapsed,
    });

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    const toggle = container.querySelector<HTMLButtonElement>('[data-xgc-role="sidebar-toggle"]')!;

    expect(toggle).toHaveAccessibleName('Collapse navigation');
    expect(toggle.querySelector('.xgc-sidebar-brand-mark svg.brand-glyph')).toBeInTheDocument();
    expect(toggle).toHaveTextContent('XGC');
    expect(toggle.querySelector('.xgc-sidebar-brand-label')).toHaveAttribute('aria-hidden', 'false');
    expect(toggle.querySelector('svg')).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(setSidebarCollapsed).toHaveBeenCalledWith(true);
  });

  it('fails closed instead of synthesizing remote navigation without AgentEffective', () => {
    navigationMock.state = navigationState({ managedHostId: 'agent-b' });
    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-b',
      displayName: 'Agent B',
      effectiveProfile: null,
    })];

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="robotAssets"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="automations"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="system"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="operations"]')).toBeNull();
    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('local');
  });

  it('maps Agent System navigation and tabs from the typed profile only', () => {
    const profile = profileWithSurfaces('System');
    profile.System.Files = true;
    navigationMock.state = navigationState({ managedHostId: 'agent-b' });
    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-b',
      effectiveProfile: profile,
    })];

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="system"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="nav-page-section"][data-xgc-id="files"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="nav-page-section"][data-xgc-id="maintenance"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /SSH/i })).not.toBeInTheDocument();
  });

  it('keeps a remote Automation detail hash while the registry is loading and when allowed', () => {
    const hash = '#/automations/agent-a/workflows/mission-a';
    window.location.hash = hash;
    navigationMock.state = navigationState({ page: 'automations',managedHostId: 'agent-a' });
    managedHostMock.status = 'loading';

    const view = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(navigationMock.navigatePage).not.toHaveBeenCalled();
    expect(navigationMock.setManagedHostId).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(hash);

    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-a',
      effectiveProfile: profileWithSurfaces('Automations'),
    })];
    managedHostMock.status = 'ready';
    view.rerender(<AppFrame><div>content</div></AppFrame>);

    expect(navigationMock.navigatePage).not.toHaveBeenCalled();
    expect(navigationMock.setManagedHostId).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(hash);
  });

  it('returns a persisted Agent missing from a loaded registry and its deep link to local Core', () => {
    window.location.hash = '#/automations/agent-a/workflows/mission-a';
    navigationMock.state = navigationState({ page: 'automations',managedHostId: 'agent-a' });
    managedHostMock.hosts = [];
    managedHostMock.status = 'ready';

    renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('local');
    expect(navigationMock.setTargetCoreId).toHaveBeenCalledWith('local');
    expect(navigationMock.navigatePage).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/automations/local/workflows');
  });

  it('never exposes a persisted Agent when AgentLink.ComputeTargets is disabled', () => {
    navigationMock.state = navigationState({ page: 'home',managedHostId: 'agent-a' });
    managedHostMock.status = 'loading';
    targetCoreMock.coreNodes = [coreNode({})];

    const { container } = renderWithComposition(
      <AppFrame><div>content</div></AppFrame>,
      { ...productWebComposition,agentLinkComputeTargets: false },
    );

    expect(navigationMock.setManagedHostId).toHaveBeenCalledWith('local');
    expect(container.querySelector('[data-xgc-role="ground-station-interaction-host-test"]'))
      .toHaveAttribute('data-xgc-id', 'local');
    expect(screen.getByRole('button', { name: 'Target' })).toHaveTextContent('Core · Local GCS (local)');
  });

  it('keeps an existing offline Agent selected and visible as a disabled option', () => {
    navigationMock.state = navigationState({ page: 'automations',managedHostId: 'agent-a' });
    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-a',
      displayName: 'Offline Agent',
      connectivity: 'offline',
      effectiveProfile: profileWithSurfaces('Automations'),
    })];

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(screen.getByRole('button', { name: 'Target' })).toHaveTextContent('Agent · Offline Agent (offline)');
    expect(container.querySelector('[data-xgc-role="primary-nav-item"][data-xgc-id="automations"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="ground-station-interaction-host-test"]')).toBeNull();
    expect(navigationMock.setManagedHostId).not.toHaveBeenCalled();
    expect(navigationMock.navigatePage).not.toHaveBeenCalled();
  });

  it('keeps a remote selection but suspends its global interaction stream when the registry fails', () => {
    navigationMock.state = navigationState({ page: 'automations',managedHostId: 'agent-a' });
    managedHostMock.hosts = [managedHostFixture({
      id: 'agent-a',
      effectiveProfile: profileWithSurfaces('Automations'),
    })];
    managedHostMock.status = 'error';

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);

    expect(navigationMock.setManagedHostId).not.toHaveBeenCalled();
    expect(container.querySelector('[data-xgc-role="ground-station-interaction-host-test"]')).toBeNull();
  });

  it('keeps Job and Event internals out of the Operations topbar', () => {
    navigationMock.state = navigationState({ page: 'operations' });

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    const topbar = container.querySelector('header.topbar');

    expect(topbar?.querySelector('nav.topbar-tabs')).not.toBeInTheDocument();
    expect(topbar).not.toHaveTextContent('Jobs');
    expect(topbar).not.toHaveTextContent('Events');
  });

  it('puts audit categories under the left nav parent instead of the topbar', () => {
    const setPageSection = vi.fn();
    navigationMock.state = navigationState({
      page: 'audit',
      pageSections: { audit: 'system' },
      setPageSection,
    });

    const { container } = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    const topbar = container.querySelector('header.topbar');
    expect(topbar?.querySelector('[data-xgc-role="topbar-tabs"]')).toBeNull();
    expect(topbar).not.toHaveTextContent('System logs');

    const sections = container.querySelector('[data-xgc-role="nav-page-sections"][data-xgc-id="audit"]');
    expect(sections).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="nav-page-section"][data-xgc-id="system"]')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Login logs' }));
    expect(navigationMock.navigatePage).toHaveBeenCalledWith('audit');
    expect(setPageSection).toHaveBeenCalledWith('audit','login');
  });

  it('keeps the sidebar and global topbar as siblings of an automation canvas inside content', () => {
    navigationMock.state = navigationState({ page: 'automations' });

    const { container } = renderWithComposition(<AppFrame><div className="automation-workflow-host xgc-workspace-full-span" data-xgc-role="orchestration-workflow-canvas" data-xgc-id="mission" /></AppFrame>);
    const shell = container.querySelector('.app-shell');
    const content = shell?.querySelector('.workspace > main.xgc-workspace-content');

    expect(shell).toHaveAttribute('data-xgc-role', 'app-shell');
    expect(shell).toHaveAttribute('data-xgc-id', 'automations');
    expect(shell?.querySelector(':scope > aside.sidebar')).toBeInTheDocument();
    expect(shell?.querySelector('.workspace > header.topbar')).toBeInTheDocument();
    expect(content?.querySelector('[data-xgc-role="orchestration-workflow-canvas"][data-xgc-id="mission"]')).toBeInTheDocument();
    expect(container.querySelector('nav.topbar-tabs')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Definitions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schedules' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Runs' })).not.toBeInTheDocument();
  });

  it('keeps the ground-station interaction host mounted outside page content on every route', () => {
    navigationMock.state = navigationState({ page: 'terminal' });

    const { container } = renderWithComposition(<AppFrame><div data-xgc-role="terminal-page-test">terminal</div></AppFrame>);
    const shell = container.querySelector('[data-xgc-role="app-shell"]')!;
    const content = shell.querySelector<HTMLElement>('.workspace > main.xgc-workspace-content')!;
    const host = shell.querySelector<HTMLElement>('[data-xgc-role="ground-station-interaction-host-test"][data-xgc-id="local"]')!;

    expect(host).toBeInTheDocument();
    expect(content).not.toContainElement(host);
    expect(content.querySelector('[data-xgc-role="terminal-page-test"]')).toBeInTheDocument();
  });

  it('keeps the workspace viewport mounted while primary navigation changes pages', () => {
    navigationMock.state = navigationState({ page: 'automations' });
    const view = renderWithComposition(<AppFrame><div data-xgc-role="automations-page-test">automations</div></AppFrame>);
    const content = view.container.querySelector<HTMLElement>('.workspace > main.xgc-workspace-content')!;

    navigationMock.state = navigationState({ page: 'robotAssets' });
    view.rerender(<AppFrame><div data-xgc-role="robot-assets-page-test">robots</div></AppFrame>);

    expect(view.container.querySelector('.workspace > main.xgc-workspace-content')).toBe(content);
    expect(content.querySelector('[data-xgc-role="robot-assets-page-test"]')).toBeInTheDocument();
  });

  it('enables the fallback decision dialog only on an Experiment dashboard route', () => {
    navigationMock.state = navigationState({ page: 'home' });
    const view = renderWithComposition(<AppFrame><div>home</div></AppFrame>);
    const host = () => view.container.querySelector('[data-xgc-role="ground-station-interaction-host-test"]');
    expect(host()).toHaveAttribute('data-show-decision-dialog', 'false');

    navigationMock.state = navigationState({ page: 'experiment' });
    view.rerender(<AppFrame><div>experiment list</div></AppFrame>);
    expect(host()).toHaveAttribute('data-show-decision-dialog', 'false');

    fireEvent(window, new CustomEvent('xgc:experiment-breadcrumb', { detail: { view: 'detail',name: 'Flight test' } }));
    expect(host()).toHaveAttribute('data-show-decision-dialog', 'true');

    fireEvent(window, new CustomEvent('xgc:experiment-breadcrumb', { detail: { view: 'list' } }));
    expect(host()).toHaveAttribute('data-show-decision-dialog', 'false');

    for (const page of ['system','terminal','operations','robotAssets','automations'] as const) {
      navigationMock.state = navigationState({ page });
      view.rerender(<AppFrame><div>{page}</div></AppFrame>);
      expect(host()).toHaveAttribute('data-show-decision-dialog', 'false');
    }
  });

  it('places the current automation name after Automations and before route actions', () => {
    navigationMock.state = navigationState({ page: 'automations' });
    const view = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    fireEvent(window, new CustomEvent('xgc:automation-breadcrumb', { detail: { view: 'detail',name: 'Mission workflow' } }));

    const topbar = view.container.querySelector('.topbar')!;
    const trail = topbar.querySelector('[data-xgc-role="product-breadcrumbs"]')!;
    const actions = topbar.querySelector('.page-topbar-actions');
    expect(trail).toHaveAttribute('data-xgc-id', 'automations');
    expect(trail.querySelector('[data-xgc-role="page-title-back"]')).toHaveTextContent('Automations');
    expect(trail.querySelector('[data-xgc-role="page-title-current"]')).toHaveTextContent('Mission workflow');
    expect(trail.querySelector('[data-xgc-role="page-title-current"]')).toHaveAttribute('aria-current', 'page');
    expect(actions).not.toBeNull();
    expect(trail.compareDocumentPosition(actions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    navigationMock.state = navigationState({ page: 'experiment' });
    view.rerender(<AppFrame><div>experiment</div></AppFrame>);
    navigationMock.state = navigationState({ page: 'automations' });
    view.rerender(<AppFrame><div>content</div></AppFrame>);
    expect(view.container.querySelector('[data-xgc-role="page-title-current"]')).toHaveTextContent('Mission workflow');
  });

  it('keeps a parked Experiment resource name out of other pages while preserving it on return', () => {
    navigationMock.state = navigationState({ page: 'experiment' });
    const view = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    fireEvent(window, new CustomEvent('xgc:experiment-breadcrumb', { detail: { view: 'detail',name: 'Flight test' } }));
    expect(view.container.querySelector('[data-xgc-role="page-title-current"]')).toHaveTextContent('Flight test');
    for (const page of ['robotAssets','automations','home']) {
      navigationMock.state = navigationState({ page });
      view.rerender(<AppFrame><div>content</div></AppFrame>);
      expect(view.container).not.toHaveTextContent('Flight test');
    }
    navigationMock.state = navigationState({ page: 'experiment' });
    view.rerender(<AppFrame><div>content</div></AppFrame>);
    expect(view.container.querySelector('[data-xgc-role="page-title-current"]')).toHaveTextContent('Flight test');
  });

  it('places the current experiment name after Experiments', () => {
    navigationMock.state = navigationState({ page: 'experiment' });
    const view = renderWithComposition(<AppFrame><div>content</div></AppFrame>);
    fireEvent(window, new CustomEvent('xgc:experiment-breadcrumb', { detail: { view: 'detail',name: 'Flight test' } }));

    const trail = view.container.querySelector('[data-xgc-role="product-breadcrumbs"]')!;
    expect(trail.querySelector('[data-xgc-role="page-title-back"]')).toHaveTextContent('Experiments');
    expect(trail.querySelector('[data-xgc-role="page-title-current"]')).toHaveTextContent('Flight test');
  });

  it.each([
    ['experiment','xgc:experiment-list','#/experiments/flight-test','#/experiments'],
    ['automations','xgc:automation-list','#/automations/local/workflows/mission-a',undefined],
    ['robotAssets','xgc:robot-list','#/assets/robots/scout-mini','#/assets/robots'],
  ] as const)('returns %s to its list when the topbar catalog title is clicked', (page,eventName,detailHash,listHash) => {
    window.location.hash = detailHash;
    navigationMock.state = navigationState({ page });
    const onList = vi.fn();
    window.addEventListener(eventName,onList);
    const { container } = renderWithComposition(<AppFrame><div>detail</div></AppFrame>);

    const title = container.querySelector<HTMLButtonElement>('[data-xgc-role="page-title-back"]')!;
    expect(title).toHaveAttribute('data-xgc-id', page);
    fireEvent.click(title);

    expect(navigationMock.navigatePage).toHaveBeenCalledWith(page);
    expect(onList).toHaveBeenCalledOnce();
    if (listHash) expect(window.location.hash).toBe(listHash);
    window.removeEventListener(eventName,onList);
  });

  it.each([
    ['automations','xgc:automation-list','#/automations/local/workflows/mission-a',undefined],
    ['experiment','xgc:experiment-list','#/experiments/flight-test','#/experiments'],
    ['robotAssets','xgc:robot-list','#/assets/robots/scout-mini','#/assets/robots'],
  ] as const)('returns an active %s primary route to its list contract', (page,eventName,detailHash,listHash) => {
    window.location.hash = detailHash;
    navigationMock.state = navigationState({ page });
    const onList = vi.fn();
    window.addEventListener(eventName,onList);
    const { container } = renderWithComposition(<AppFrame><div>detail</div></AppFrame>);

    const activeItem = container.querySelector<HTMLButtonElement>(
      `[data-xgc-role="primary-nav-item"][data-xgc-id="${page}"]`,
    )!;
    expect(activeItem).toHaveAttribute('aria-current','page');
    fireEvent.click(activeItem);

    expect(navigationMock.navigatePage).toHaveBeenCalledWith(page);
    expect(onList).toHaveBeenCalledOnce();
    if (listHash) expect(window.location.hash).toBe(listHash);
    window.removeEventListener(eventName,onList);
  });

  it.each([
    ['automations','xgc:automation-list'],
    ['experiment','xgc:experiment-list'],
    ['robotAssets','xgc:robot-list'],
  ] as const)('enters an inactive %s route without overriding its restored resource', (page,eventName) => {
    navigationMock.state = navigationState({ page: 'home' });
    const onList = vi.fn();
    window.addEventListener(eventName,onList);
    const { container } = renderWithComposition(<AppFrame><div>home</div></AppFrame>);

    const item = container.querySelector<HTMLButtonElement>(
      `[data-xgc-role="primary-nav-item"][data-xgc-id="${page}"]`,
    )!;
    fireEvent.click(item);

    expect(navigationMock.navigatePage).toHaveBeenCalledWith(page);
    expect(onList).not.toHaveBeenCalled();
    window.removeEventListener(eventName,onList);
  });

  it('applies a retained GCS preference only inside an Experiment detail route', () => {
    navigationMock.state = navigationState({ page: 'experiment',gcsMode: true });
    const experiment = renderWithComposition(<AppFrame><div>experiment</div></AppFrame>);
    expect(experiment.container.querySelector('[data-xgc-role="app-shell"]')).not.toHaveAttribute('data-xgc-mode');

    fireEvent(window, new CustomEvent('xgc:experiment-breadcrumb', { detail: { view: 'detail',name: 'Flight test' } }));
    expect(experiment.container.querySelector('[data-xgc-role="app-shell"]')).toHaveAttribute('data-xgc-mode', 'ground-station');

    fireEvent(window, new CustomEvent('xgc:experiment-breadcrumb', { detail: { view: 'list' } }));
    expect(experiment.container.querySelector('[data-xgc-role="app-shell"]')).not.toHaveAttribute('data-xgc-mode');
    experiment.unmount();

    navigationMock.state = navigationState({ page: 'automations',gcsMode: true });
    const automations = renderWithComposition(<AppFrame><div>automations</div></AppFrame>);
    expect(automations.container.querySelector('[data-xgc-role="app-shell"]')).not.toHaveAttribute('data-xgc-mode');
  });

  it('stamps ground-station from an experiment detail hash without waiting for the breadcrumb event', () => {
    window.location.hash = '#/experiments/flight-test/gcs';
    navigationMock.state = navigationState({ page: 'experiment',gcsMode: true });
    const view = renderWithComposition(<AppFrame><div>experiment</div></AppFrame>);

    expect(view.container.querySelector('[data-xgc-role="app-shell"]'))
      .toHaveAttribute('data-xgc-mode', 'ground-station');
    expect(view.container.querySelector('[data-xgc-role="page-title-back"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="page-title-current"]')).toBeNull();

    window.location.hash = '#/experiments';
    fireEvent(window, new Event('hashchange'));
    expect(view.container.querySelector('[data-xgc-role="app-shell"]')).not.toHaveAttribute('data-xgc-mode');
  });

  it('hides the Experiment catalog back control while GCS mode is on', () => {
    navigationMock.state = navigationState({ page: 'experiment',gcsMode: true });
    const view = renderWithComposition(<AppFrame><div>experiment</div></AppFrame>);
    fireEvent(window, new CustomEvent('xgc:experiment-breadcrumb', { detail: { view: 'detail',name: 'Flight test' } }));

    expect(view.container.querySelector('[data-xgc-role="page-title-back"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="page-title-current"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="product-breadcrumbs"]')).toBeNull();

    navigationMock.state = navigationState({ page: 'experiment',gcsMode: false });
    view.rerender(<AppFrame><div>experiment</div></AppFrame>);
    expect(view.container.querySelector('[data-xgc-role="page-title-back"]')).toHaveTextContent('Experiments');
    expect(view.container.querySelector('[data-xgc-role="page-title-current"]')).toHaveTextContent('Flight test');
  });

  it.each([
    ['terminal','Terminal'],
    ['home','Home'],
    ['system','System'],
    ['settings','Settings'],
    ['operations','Operations'],
  ] as const)('stamps a markable current page title on %s', (page,label) => {
    navigationMock.state = navigationState({ page });
    const { container } = renderWithComposition(<AppFrame><div>{page}</div></AppFrame>);
    const title = container.querySelector('[data-xgc-role="page-title-current"]');

    expect(title).toHaveAttribute('data-xgc-id', page);
    expect(title).toHaveAttribute('aria-current', 'page');
    expect(title).toHaveTextContent(label);
    expect(title).toHaveClass('topbar-page-title');
    expect(title?.tagName).toBe('H1');
    expect(container.querySelector('[data-xgc-role="page-title-back"]')).toBeNull();
    expect(container.querySelector('.xgc-topbar-title')).toBeNull();
  });

  it.each([
    ['automations','Automations'],
    ['experiment','Experiments'],
    ['robotAssets','Robot assets'],
  ] as const)('keeps %s list titles as markable back controls instead of current', (page,label) => {
    navigationMock.state = navigationState({ page });
    const { container } = renderWithComposition(<AppFrame><div>{page}</div></AppFrame>);
    const back = container.querySelector('[data-xgc-role="page-title-back"]');

    expect(back).toHaveAttribute('data-xgc-id', page);
    expect(back).toHaveTextContent(label);
    expect(container.querySelector('[data-xgc-role="product-breadcrumbs"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="page-title-current"]')).toBeNull();
    expect(container.querySelector('.xgc-topbar-title')).toBeNull();
  });

  it('keeps Automations catalog back while a retained GCS preference is on', () => {
    navigationMock.state = navigationState({ page: 'automations',gcsMode: true });
    const view = renderWithComposition(<AppFrame><div>automations</div></AppFrame>);
    fireEvent(window, new CustomEvent('xgc:automation-breadcrumb', { detail: { view: 'detail',name: 'Mission workflow' } }));

    expect(view.container.querySelector('[data-xgc-role="page-title-back"]')).toHaveTextContent('Automations');
    expect(view.container.querySelector('[data-xgc-role="page-title-current"]')).toHaveTextContent('Mission workflow');
  });
});

function navigationState(overrides: Record<string, unknown> = {}) {
  const pageSections: Record<string,string> = {
    terminal: 'terminal',
    system: 'files',
    audit: 'operation',
    ...(overrides.pageSections as Record<string,string> | undefined),
  };
  return {
    page: 'system',
    navigatePage: navigationMock.navigatePage,
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    gcsMode: false,
    skin: 'dark',
    language: 'en-US',
    targetCoreId: 'core-xgc',
    setTargetCoreId: navigationMock.setTargetCoreId,
    managedHostId: 'local',
    setManagedHostId: navigationMock.setManagedHostId,
    pageSection: (page: string) => pageSections[page] ?? '',
    setPageSection: navigationMock.setPageSection,
    ...overrides,
  };
}

function coreNode(overrides: Record<string, unknown>) {
  return {
    id: 'core-xgc',
    name: 'Local GCS',
    profile: 'local',
    baseUrl: '',
    status: 'online',
    capabilities: [],
    registeredAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function profileWithSurfaces(...surfaces: Array<keyof ReturnType<typeof agentEffectiveFixture>['Surfaces']>) {
  const profile = agentEffectiveFixture(false);
  for (const surface of surfaces) profile.Surfaces[surface] = true;
  return profile;
}

function focusedGcsCapabilities() {
  return [
    'product.home', 'core.view',
    'product.experiments', 'experiment.read',
    'product.robot-assets', 'robot.read',
    'product.usernode-assets', 'usernode.read',
    'product.calibration-assets', 'calibration.read',
    'product.automations', 'automations.read',
    'product.operations', 'operations.process.read',
    'product.system', 'host.read',
    'product.terminal', 'terminal.access',
    'product.maintenance', 'toolbox.maintenance',
    'product.audit', 'access.manage',
    'product.settings',
  ];
}
