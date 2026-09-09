// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { TerminalPage } from './TerminalPage';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import { peekTerminalRobotLogin,requestTerminalRobotLogin,takeTerminalRobotLogin } from './terminalRobotLoginIntent';
import { connectTerminalTransport } from '../../features/terminal/terminalTransport';
import { listRobotAssets } from '../robot/robotAssetPublic';
import {
  deleteTerminalHost,
  getTerminalSetting,
  getTerminalWebSocketTicket,
  listTerminalHosts,
  placeUserScript,
  saveTerminalHost,
} from './terminalService';
import type { TerminalHost,TerminalSetting } from './terminalModel';
import { defineTerminalComposition } from './terminalComposition';
import { TerminalLocalShellLeaf } from './leaves/localShell';
import { TerminalRemoteSSHLeaf } from './leaves/remoteSsh';
import { TerminalUserScriptsLeaf } from './leaves/userScripts';
import { replaceTerminalInputLine } from './terminalInsertLine';
import {
  listUsernodeAssets,
  listUsernodeNamespaces,
  useUsernodeAssetsStore,
  type UsernodeAssetDocument,
} from '../usernode/usernodePublic';

const workspaceComposition = defineTerminalComposition({
  LocalShell: TerminalLocalShellLeaf,
  RemoteSSH: TerminalRemoteSSHLeaf,
  UserScripts: TerminalUserScriptsLeaf,
});

const hostsOnlyComposition = defineTerminalComposition({
  LocalShell: TerminalLocalShellLeaf,
  RemoteSSH: TerminalRemoteSSHLeaf,
});

vi.mock('../usernode/usernodePublic', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    listUsernodeAssets: vi.fn(),
    listUsernodeNamespaces: vi.fn(),
  };
});

vi.mock('../usernode/usernodeStore', async (loadOriginal) => {
  const original = await loadOriginal() as Record<string, unknown>;
  return { ...original, useUsernodeAssetsStore: vi.fn() };
});

vi.mock('../robot/robotAssetPublic', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    listRobotAssets: vi.fn(),
  };
});

vi.mock('./terminalService', () => ({
  deleteTerminalHost: vi.fn(),
  getTerminalSetting: vi.fn(),
  getTerminalWebSocketTicket: vi.fn(),
  listTerminalHosts: vi.fn(),
  placeUserScript: vi.fn(() => Promise.resolve({ path: '', target: 'local' })),
  saveTerminalHost: vi.fn(),
}));

vi.mock('../../features/terminal/terminalTransport', () => ({
  connectTerminalTransport: vi.fn(),
}));

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
    clearSelection() {}
    dispose() {}
    focus() {}
    getSelection() { return ''; }
    loadAddon() {}
    onData() {}
    onSelectionChange() { return { dispose() {} }; }
    open() {}
    write() {}
  },
}));

describe('TerminalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const pendingLogin = peekTerminalRobotLogin();
    if (pendingLogin) takeTerminalRobotLogin(pendingLogin);
    window.localStorage.clear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    vi.mocked(listTerminalHosts).mockResolvedValue([uavHostFixture()]);
    vi.mocked(listRobotAssets).mockResolvedValue([]);
    vi.mocked(listUsernodeAssets).mockResolvedValue([]);
    vi.mocked(listUsernodeNamespaces).mockResolvedValue([]);
    vi.mocked(useUsernodeAssetsStore).mockReturnValue(usernodeStoreMock());
    vi.mocked(getTerminalSetting).mockResolvedValue(terminalSettingFixture());
    vi.mocked(saveTerminalHost).mockResolvedValue(uavHostFixture());
    vi.mocked(getTerminalWebSocketTicket).mockResolvedValue({ ticket: 'ticket',expiresAt: Date.now() + 60000 });
    vi.mocked(deleteTerminalHost).mockResolvedValue({ deleted: 'host-1' });
    vi.mocked(placeUserScript).mockResolvedValue({ path: '', target: 'local' });
    vi.mocked(connectTerminalTransport).mockResolvedValue({
      sendCommand: vi.fn(),
      sendClose: vi.fn(),
      sendResize: vi.fn(),
      close: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => {
      await Promise.all(
        vi.mocked(listUsernodeAssets).mock.results.map((result) => (
          result.type === 'return' ? result.value : undefined
        )),
      );
    });
  });

  it('uses native hidden semantics for an inactive terminal page', () => {
    const { container } = render(
      <TerminalPage activeTab="terminal" visible={false} onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    const page = container.querySelector('[data-xgc-role="terminal-page"]');

    expect(page).toHaveAttribute('hidden');
    expect(page).toHaveClass('terminal-page','xgc-workspace-full-span');
  });

  it('drops resume-only before reconnecting a restored session after it closes', async () => {
    const sessionId = 'ssh-6b1ec96f-bf55-4bdd-b6c3-5706fc27e680-restored';
    window.localStorage.setItem('xgc.terminal.local__local.sessions', JSON.stringify([{
      id: sessionId,
      title: 'UAV 4',
      hostId: '6b1ec96f-bf55-4bdd-b6c3-5706fc27e680',
      status: 'closed',
      refresh: 0,
      resumeOnly: true,
    }]));
    window.localStorage.setItem('xgc.terminal.local__local.active-session', JSON.stringify(sessionId));

    render(<TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />);

    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalled());
    const restoredCallIndex = vi.mocked(connectTerminalTransport).mock.calls
      .map(([options]) => options.resumeOnly === true)
      .lastIndexOf(true);
    expect(restoredCallIndex).toBeGreaterThanOrEqual(0);
    const restoredConnection = vi.mocked(connectTerminalTransport).mock.calls[restoredCallIndex][0];

    act(() => restoredConnection.onClose());

    await waitFor(() => {
      const reconnectCalls = vi.mocked(connectTerminalTransport).mock.calls.slice(restoredCallIndex + 1);
      expect(reconnectCalls.some(([options]) => options.resumeOnly === false)).toBe(true);
    });
  });

  it('never restores sessions belonging to another routed Core', async () => {
    window.localStorage.setItem('xgc.terminal.edge-a__local.sessions', JSON.stringify([{
      id: 'ssh-edge-a-restored',
      title: 'Edge A host',
      hostId: '6b1ec96f-bf55-4bdd-b6c3-5706fc27e680',
      status: 'closed',
      refresh: 0,
      resumeOnly: true,
    }]));
    window.localStorage.setItem('xgc.terminal.edge-a__local.active-session', JSON.stringify('ssh-edge-a-restored'));

    render(<TerminalPage activeTab="terminal" targetCoreId="edge-b" onTabChange={vi.fn()} composition={workspaceComposition} />);

    await waitFor(() => expect(listTerminalHosts).toHaveBeenCalledWith({ targetCoreId: 'edge-b' }));
    expect(screen.getByText('No terminal session')).toBeInTheDocument();
    expect(screen.getByText(/Select Direct shell, loopback, a Host, or a robot/)).toBeInTheDocument();
    expect(connectTerminalTransport).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('xgc.terminal.edge-a__local.sessions')).toContain('ssh-edge-a-restored');
  });

  it('does not expose SSH host credentials as a browser login form', async () => {
    const { container } = render(<TerminalPage activeTab="hosts" onTabChange={vi.fn()} composition={workspaceComposition} />);
    const row = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('[data-xgc-role="terminal-host-row"][data-xgc-id="6b1ec96f-bf55-4bdd-b6c3-5706fc27e680"]');
      if (!element) throw new Error('host row missing');
      return element;
    });

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

    const passwordInput = screen.getByLabelText('Password');
    const userInput = screen.getByLabelText(/^User/);
    const form = screen.getByRole('form', { name: 'Host credentials' });

    expect(passwordInput.closest('form')).toBeNull();
    expect(form).toHaveAttribute('autocomplete', 'off');
    expect(form).toHaveAttribute('data-form-type', 'other');
    expect(userInput).toHaveAttribute('autocomplete', 'off');
    expect(userInput).toHaveAttribute('data-lpignore', 'true');
    expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
    expect(passwordInput).toHaveAttribute('data-1p-ignore', 'true');
    expect(passwordInput).toHaveAttribute('data-bwignore', 'true');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');

    // Key auth is withdrawn for this stage — only password login is authored.
    expect(screen.queryByLabelText('Authentication method')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Private key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Passphrase')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Remember password/i })).toBeInTheDocument();
  });

  it('uses a plain text hint and one toolbar action when the Host catalog is empty', async () => {
    vi.mocked(listTerminalHosts).mockResolvedValueOnce([]);
    const { container } = render(
      <TerminalPage activeTab="hosts" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );

    expect(await screen.findByText('No hosts yet')).toHaveClass('xgc-empty-state-title');
    expect(screen.getByText('Use New to add an SSH host.')).toHaveClass('xgc-empty-state-description');
    const empty = container.querySelector('[data-xgc-role="terminal-hosts-list"] .xgc-list-empty');
    expect(empty).toHaveAttribute('data-appearance','plain');
    expect(empty?.parentElement).toHaveClass('terminal-list-shell');
    expect(empty?.querySelector('.xgc-list-empty-mark')).toBeNull();
    expect(screen.getAllByRole('button',{ name: 'New' })).toHaveLength(1);
    expect(screen.queryByRole('button',{ name: 'New host' })).not.toBeInTheDocument();
  });

  it('shows a failed Host save, re-enables the action and preserves the open draft', async () => {
    vi.mocked(saveTerminalHost).mockRejectedValueOnce(new Error('Host save failed visibly'));
    render(<TerminalPage activeTab="hosts" onTabChange={vi.fn()} composition={workspaceComposition} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Unsaved host' } });
    fireEvent.change(screen.getByLabelText(/^Address/), { target: { value: '10.0.0.44' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Mutation status stays in drawer FormActions (role=status), not a page toast/alert.
    expect(await screen.findByRole('status')).toHaveTextContent('Host save failed visibly');
    expect(screen.getByRole('dialog', { name: 'New host' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Unsaved host');
    expect(screen.getByLabelText(/^Address/)).toHaveValue('10.0.0.44');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('creates a host from the right drawer and shows the new list row', async () => {
    const created: TerminalHost = {
      ...uavHostFixture(),
      id: 'host-created',
      name: 'Edge lab',
      address: '10.0.0.55',
      user: 'pi',
      port: 22,
    };
    vi.mocked(saveTerminalHost).mockResolvedValueOnce(created);
    const { container } = render(<TerminalPage activeTab="hosts" onTabChange={vi.fn()} composition={workspaceComposition} />);

    fireEvent.click(await screen.findByRole('button', { name: 'New' }));
    expect(screen.getByRole('dialog', { name: 'New host' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: created.name } });
    fireEvent.change(screen.getByLabelText(/^Address/), { target: { value: created.address } });
    fireEvent.change(screen.getByLabelText(/^User/), { target: { value: created.user } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const row = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        `[data-xgc-role="terminal-host-row"][data-xgc-id="${created.id}"]`,
      );
      if (!element) throw new Error('created host row missing');
      return element;
    });
    expect(within(row).getByText(created.name)).toBeInTheDocument();
    expect(within(row).getByText(`${created.user}@${created.address}:${created.port}`)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'New host' })).not.toBeInTheDocument();
  });

  it('does not expose a Host Test action on the Hosts catalog', async () => {
    const { container } = render(<TerminalPage activeTab="hosts" onTabChange={vi.fn()} composition={workspaceComposition} />);
    const row = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-host-row"][data-xgc-id="6b1ec96f-bf55-4bdd-b6c3-5706fc27e680"]',
      );
      if (!element) throw new Error('host row missing');
      return element;
    });

    expect(within(row).queryByRole('button', { name: 'Test' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="terminal-host-test"]')).toBeNull();
    expect(within(row).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('replaces the Quick commands tab with a User scripts authoring subpage', async () => {
    const warmUp = usernodeFixture('warm-up', 'Warm up', { system: false, tags: [], source: 'echo ready' });
    const systemLs = usernodeFixture('default-system-ls', 'ls', { system: true, tags: ['built-in'], source: 'ls' });
    vi.mocked(listUsernodeAssets).mockResolvedValue([warmUp, systemLs]);
    vi.mocked(useUsernodeAssetsStore).mockReturnValue(usernodeStoreMock([warmUp, systemLs]));
    const { container } = render(
      <TerminalPage activeTab="usernode" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    const page = await waitFor(() => {
      const element = container.querySelector(
        '[data-xgc-role="terminal-usernode-scripts-page"][data-xgc-id="usernode"]',
      );
      if (!element) throw new Error('user scripts page missing');
      return element;
    });
    expect(page.querySelector('[data-xgc-role="usernode-assets-page"][data-xgc-id="usernode"]')).not.toBeNull();
    expect(page.querySelector('[data-xgc-role="usernode-asset-create"]')).not.toBeNull();
    expect(page.querySelector('[data-xgc-role="usernode-asset-row"][data-xgc-id="warm-up"]'))
      .toHaveAttribute('data-xgc-protection', 'user');
    expect(container.querySelector('[data-xgc-role="terminal-commands-page"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-command-row"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-sidebar-command"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-workspace"]')).toHaveAttribute('hidden');
  });

  it('shows an empty authoring catalog on the User scripts subpage', async () => {
    const { container } = render(
      <TerminalPage activeTab="usernode" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    const page = await waitFor(() => {
      const element = container.querySelector(
        '[data-xgc-role="terminal-usernode-scripts-page"][data-xgc-id="usernode"]',
      );
      if (!element) throw new Error('user scripts page missing');
      return element;
    });
    const catalog = page.querySelector('[data-xgc-role="usernode-assets-page"][data-xgc-id="usernode"]');
    expect(catalog).not.toBeNull();
    expect(catalog?.querySelector('[data-xgc-role="usernode-folder-empty"]')).not.toBeNull();
    expect(catalog).toHaveTextContent('No items');
    expect(container.querySelector('[data-xgc-role="terminal-usernode-script-empty"]')).toBeNull();
  });

  it('keeps the User scripts authoring catalog free of insert/play into the current terminal', async () => {
    const onTabChange = vi.fn();
    const warmUp = usernodeFixture('warm-up', 'Warm up', { source: 'echo ready' });
    vi.mocked(listUsernodeAssets).mockResolvedValue([warmUp]);
    vi.mocked(useUsernodeAssetsStore).mockReturnValue(usernodeStoreMock([warmUp]));
    const { container } = render(
      <TerminalPage activeTab="usernode" onTabChange={onTabChange} composition={workspaceComposition} />,
    );
    const row = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="usernode-asset-row"][data-xgc-id="warm-up"]',
      );
      if (!element) throw new Error('user script row missing');
      return element;
    });
    expect(container.querySelector('[data-xgc-role="usernode-asset-use"]')).toBeNull();
    expect(row.querySelector('[data-xgc-role="usernode-asset-settings"]')).not.toBeNull();
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('keeps the User scripts subpage usable when the Host catalog is unavailable', async () => {
    vi.mocked(listTerminalHosts).mockRejectedValue(new Error('403 host catalog denied'));
    const warmUp = usernodeFixture('warm-up', 'Warm up', { source: 'echo ready' });
    vi.mocked(listUsernodeAssets).mockResolvedValue([warmUp]);
    vi.mocked(useUsernodeAssetsStore).mockReturnValue(usernodeStoreMock([warmUp]));

    const { container } = render(
      <TerminalPage activeTab="usernode" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    const script = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="usernode-asset-row"][data-xgc-id="warm-up"]',
      );
      if (!element) throw new Error('user script row missing');
      return element;
    });

    expect(script).toHaveTextContent('Warm up');
    expect(await screen.findByText(/Terminal access was rejected/)).toBeInTheDocument();
  });

  it('restores Host sessions even when Setting snapshots fail', async () => {
    const sessionId = 'ssh-6b1ec96f-bf55-4bdd-b6c3-5706fc27e680-independent';
    window.localStorage.setItem('xgc.terminal.local__local.sessions', JSON.stringify([{
      id: sessionId,
      title: 'UAV 4',
      hostId: '6b1ec96f-bf55-4bdd-b6c3-5706fc27e680',
      status: 'closed',
      refresh: 0,
      resumeOnly: true,
    }]));
    window.localStorage.setItem('xgc.terminal.local__local.active-session', JSON.stringify(sessionId));
    vi.mocked(getTerminalSetting).mockRejectedValue(new Error('Terminal setting unavailable'));

    render(<TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />);

    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: uavHostFixture().id,resumeOnly: true }),
    ));
    expect(screen.queryByText('Terminal setting unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('consumes a late SSH intent only when the parked Terminal becomes visible', async () => {
    vi.mocked(listRobotAssets).mockResolvedValue([robotAssetFixture()]);
    const tree = (visible: boolean) => <ProductRouteVisibilityProvider visible={visible}>
      <TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />
    </ProductRouteVisibilityProvider>;
    const view = render(tree(false));
    await waitFor(() => expect(view.container.querySelector('[data-xgc-id="robot-asset:robot-uav-1"]')).not.toBeNull());
    act(() => requestTerminalRobotLogin('robot-uav-1',{}));
    expect(connectTerminalTransport).not.toHaveBeenCalled();
    expect(peekTerminalRobotLogin()).toBeDefined();
    view.rerender(tree(true));
    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalledWith(expect.objectContaining({ hostId:'robot-asset:robot-uav-1' })));
    expect(peekTerminalRobotLogin()).toBeUndefined();
    view.rerender(tree(false));view.rerender(tree(true));
    expect(connectTerminalTransport).toHaveBeenCalledOnce();
  });

  it('never consumes a Robot SSH intent on another Core with the same asset ID', async () => {
    vi.mocked(listRobotAssets).mockResolvedValue([robotAssetFixture()]);
    requestTerminalRobotLogin('robot-uav-1',{ targetCoreId:'edge-a' });
    const view=render(<TerminalPage activeTab="terminal" targetCoreId="edge-b" onTabChange={vi.fn()} composition={workspaceComposition} />);
    await waitFor(() => expect(view.container.querySelector('[data-xgc-id="robot-asset:robot-uav-1"]')).not.toBeNull());
    expect(connectTerminalTransport).not.toHaveBeenCalled();
    expect(peekTerminalRobotLogin()?.scope).toBe('edge-a__local');
    view.rerender(<TerminalPage activeTab="terminal" targetCoreId="edge-a" onTabChange={vi.fn()} composition={workspaceComposition} />);
    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalledWith(expect.objectContaining({ hostId:'robot-asset:robot-uav-1',targetCoreId:'edge-a' })));
    expect(peekTerminalRobotLogin()).toBeUndefined();
  });

  it('lists robot assets beside free-form Hosts for quick terminal login', async () => {
    vi.mocked(listRobotAssets).mockResolvedValue([robotAssetFixture()]);
    const { container } = render(<TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />);

    const robotEntry = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-sidebar-host"][data-xgc-id="robot-asset:robot-uav-1"]',
      );
      if (!element) throw new Error('robot host missing from terminal sidebar');
      return element;
    });
    expect(robotEntry).toHaveAttribute('data-xgc-source','robot-asset');
    expect(robotEntry).toHaveTextContent('UAV 01');
    expect(robotEntry).toHaveTextContent('marvsmart@192.168.51.11:22');
    expect(container.querySelector('[data-xgc-role="terminal-sidebar-host"][data-xgc-id="default-direct-shell"]'))
      .toHaveAttribute('data-xgc-source','direct-shell');

    const customEntry = container.querySelector(
      `[data-xgc-role="terminal-sidebar-host"][data-xgc-id="${uavHostFixture().id}"]`,
    );
    expect(customEntry).toHaveAttribute('data-xgc-source','host');
    expect(customEntry).toHaveTextContent('UAV 4');
    expect(customEntry).toHaveTextContent('mavrsmart@192.168.51.14:22');

    fireEvent.click(robotEntry);
    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: 'robot-asset:robot-uav-1' }),
    ));
  });

  it('when Agent is selected only shows Direct shell and never loads Core robots', async () => {
    vi.mocked(listRobotAssets).mockResolvedValue([robotAssetFixture()]);
    const { container } = render(
      <TerminalPage
        activeTab="terminal"
        onTabChange={vi.fn()}
        composition={workspaceComposition}
        managedHostId="agent-edge-1"
        agentLabel="edge-1"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-xgc-id="default-direct-shell"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-xgc-id="default-local-loopback"]')).toBeNull();
    expect(listRobotAssets).not.toHaveBeenCalled();
    expect(listTerminalHosts).not.toHaveBeenCalled();
    expect(container.querySelector('[data-xgc-id="robot-asset:robot-uav-1"]')).toBeNull();
    expect(container.querySelector('[data-xgc-id="6b1ec96f-bf55-4bdd-b6c3-5706fc27e680"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-page"]')).toHaveAttribute('data-xgc-identity', 'agent');
  });

  it('when Agent is selected never mounts Hosts management and redirects away from hosts tab', async () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <TerminalPage
        activeTab="hosts"
        onTabChange={onTabChange}
        composition={workspaceComposition}
        managedHostId="agent-edge-1"
        agentLabel="edge-1"
      />,
    );

    await waitFor(() => expect(onTabChange).toHaveBeenCalledWith('terminal'));
    expect(container.querySelector('[data-xgc-role="terminal-hosts-page"]')).toBeNull();
    expect(listTerminalHosts).not.toHaveBeenCalled();
    // Workspace still available under the default Terminal surface.
    expect(container.querySelector('[data-xgc-role="terminal-workspace"]')).not.toBeNull();
  });

  it('keeps a unified chrome row and session navigation in the center slot', async () => {
    const { container } = render(<TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />);
    await waitFor(() => expect(listTerminalHosts).toHaveBeenCalled());

    const workspace = container.querySelector('[data-xgc-role="terminal-workspace"]');
    expect(workspace).toBeTruthy();
    expect(workspace).not.toHaveClass('xgc-workspace-panel');
    const chrome = workspace?.querySelector('[data-xgc-role="terminal-chrome"]');
    const toolbar = workspace?.querySelector('[data-xgc-role="terminal-toolbar"]');
    const targetsHeading = workspace?.querySelector('[data-xgc-role="terminal-targets-heading"]');
    const userScriptsHeading = workspace?.querySelector('[data-xgc-role="terminal-user-scripts-heading"]');
    expect(chrome).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(chrome).toContainElement(toolbar as HTMLElement);
    expect(chrome).toContainElement(targetsHeading as HTMLElement);
    expect(chrome).toContainElement(userScriptsHeading as HTMLElement);
    expect(toolbar).toHaveClass('terminal-toolbar');
    expect(workspace).toHaveAccessibleName('Terminal');
    expect(targetsHeading).toHaveTextContent('Targets');
    expect(userScriptsHeading).toHaveTextContent('User scripts');
    expect(workspace?.querySelector('[data-xgc-role="terminal-sidebar"] [data-xgc-role="terminal-targets-heading"]')).toBeNull();
    expect(workspace?.querySelector('[data-xgc-role="terminal-user-scripts-rail"] [data-xgc-role="terminal-user-scripts-heading"]')).toBeNull();
    const consoleRegion = workspace?.querySelector('[data-xgc-role="terminal-console"]');
    expect(consoleRegion).not.toContainElement(toolbar as HTMLElement);
    expect(visibleText(toolbar)).not.toMatch(/\bTerminal\b/);
    expect(toolbar?.querySelector('[data-xgc-role="terminal-targets-header"]')).toBeNull();
    expect(toolbar?.querySelector('[data-xgc-role="terminal-commands-header"]')).toBeNull();
    expect(toolbar?.querySelector('[data-xgc-role="terminal-session-tabs"]')).not.toBeNull();
    const layoutToggle = toolbar?.querySelector('[data-xgc-role="terminal-layout-toggle"]');
    expect(layoutToggle).not.toBeNull();
    expect(layoutToggle?.querySelector('.xgc-tab-icon')).toBeNull();
    expect(layoutToggle).toHaveTextContent('Tabs');
    expect(layoutToggle).toHaveTextContent('Grid');
    expect(layoutToggle?.querySelector('[data-xgc-role="terminal-layout-toggle-option"][data-xgc-id="tabs"]')).toHaveTextContent('Tabs');
    expect(layoutToggle?.querySelector('[data-xgc-role="terminal-layout-toggle-option"][data-xgc-id="grid"]')).toHaveTextContent('Grid');
    expect(workspace?.querySelector('[data-xgc-role="terminal-sidebar"][data-xgc-rail="targets"]')).not.toBeNull();
    expect(workspace?.querySelector('[data-xgc-role="terminal-console"]')).not.toBeNull();
    expect(workspace?.querySelector('[data-xgc-role="terminal-user-scripts-rail"][data-xgc-rail="usernode"]')).not.toBeNull();
  });

  it('does not paint online on a live session tab', async () => {
    const { container } = render(
      <TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    fireEvent.click(await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-sidebar-host"][data-xgc-id="default-direct-shell"]',
      );
      if (!element) throw new Error('direct shell target missing');
      return element;
    }));
    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalled());
    act(() => {
      vi.mocked(connectTerminalTransport).mock.calls[0][0].onOpen();
    });
    const tab = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('[data-xgc-role="terminal-session-tab"]');
      if (!element) throw new Error('session tab missing');
      return element;
    });
    const label = tab.querySelector('.xgc-workspace-tab-label');
    expect(label).toHaveTextContent(/./);
    expect(tab.querySelector('[data-xgc-role="terminal-session-attention"]')).toBeNull();
    expect(tab.querySelector('.terminal-session-status[data-status="online"]')).toBeNull();
    expect(tab.textContent).not.toMatch(/online/i);
  });

  it('lists ordinary scripts in functional folders and does not render Quick commands', async () => {
    vi.mocked(listUsernodeAssets).mockResolvedValue([
      usernodeFixture('warm-up', 'Warm up', { system: false, tags: [], source: 'echo ready' }),
      usernodeFixture('default-system-ls', 'ls', { system: true, tags: ['built-in'], source: 'ls' }),
    ]);
    const { container } = render(
      <TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    const group = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-usernode-script-group"][data-xgc-id="user"]',
      );
      if (!element) throw new Error('functional folder missing');
      return element;
    });
    const userItem = container.querySelector<HTMLElement>(
      '[data-xgc-role="terminal-usernode-script"][data-xgc-id="warm-up"]',
    );
    expect(container.querySelector<HTMLElement>('[data-xgc-role="terminal-user-scripts-rail"]')).toContainElement(group);
    expect(container.querySelectorAll('[data-xgc-role="terminal-usernode-script-group"]')).toHaveLength(1);
    expect(group.querySelector('[data-xgc-role="terminal-usernode-script"][data-xgc-id="warm-up"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-usernode-script"][data-xgc-id="default-system-ls"]'))
      .toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-sidebar-command"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-commands-page"]')).toBeNull();
    expect(container.textContent).not.toContain('System scripts');
    expect(container.textContent).not.toContain('Templates');
    expect(userItem?.querySelector('.terminal-usernode-script-name')).toHaveTextContent('Warm up');
    expect(userItem).toHaveAttribute(
      'aria-label',
      'Insert Warm up into the current terminal: echo ready',
    );
  });

  it('inserts the selected User script into the active Terminal session', async () => {
    const sendCommand = vi.fn();
    vi.mocked(connectTerminalTransport).mockResolvedValue({
      sendCommand,
      sendClose: vi.fn(),
      sendResize: vi.fn(),
      close: vi.fn(),
    });
    vi.mocked(listUsernodeAssets).mockResolvedValue([
      usernodeFixture('warm-up', 'Warm up', { source: 'echo ready' }),
    ]);

    const onTabChange = vi.fn();
    const { container } = render(
      <TerminalPage activeTab="terminal" onTabChange={onTabChange} composition={workspaceComposition} />,
    );
    const directShell = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-sidebar-host"][data-xgc-id="default-direct-shell"]',
      );
      if (!element) throw new Error('direct shell target missing');
      return element;
    });
    fireEvent.click(directShell);
    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalled());

    const script = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-usernode-script"][data-xgc-id="warm-up"]',
      );
      if (!element) throw new Error('user script missing');
      return element;
    });
    fireEvent.click(script);

    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith(replaceTerminalInputLine('echo ready')));
    expect(onTabChange).toHaveBeenCalledWith('terminal');
    expect(placeUserScript).not.toHaveBeenCalled();
  });

  it('does not insert a User script when Enter is pressed on the rail list', async () => {
    const sendCommand = vi.fn();
    vi.mocked(connectTerminalTransport).mockResolvedValue({
      sendCommand,
      sendClose: vi.fn(),
      sendResize: vi.fn(),
      close: vi.fn(),
    });
    vi.mocked(listUsernodeAssets).mockResolvedValue([
      usernodeFixture('warm-up', 'Warm up', { source: 'echo ready' }),
    ]);

    const { container } = render(
      <TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    fireEvent.click(await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-sidebar-host"][data-xgc-id="default-direct-shell"]',
      );
      if (!element) throw new Error('direct shell target missing');
      return element;
    }));
    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalled());

    const script = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-user-scripts-list"] [data-xgc-role="terminal-usernode-script"][data-xgc-id="warm-up"]',
      );
      if (!element) throw new Error('user script missing');
      return element;
    });
    script.focus();
    expect(fireEvent.keyDown(script, { key: 'Enter' })).toBe(false);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('places the public file on the current terminal before inserting a file invoke', async () => {
    const sendCommand = vi.fn();
    vi.mocked(connectTerminalTransport).mockResolvedValue({
      sendCommand,
      sendClose: vi.fn(),
      sendResize: vi.fn(),
      close: vi.fn(),
    });
    vi.mocked(listUsernodeAssets).mockResolvedValue([
      usernodeFixture('check-px4', 'FS150 · check PX4 params', {
        source: 'python3 "$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py" --endpoint 127.0.0.1:14561',
      }),
    ]);

    const { container } = render(
      <TerminalPage activeTab="terminal" onTabChange={vi.fn()} composition={workspaceComposition} />,
    );
    fireEvent.click(await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-sidebar-host"][data-xgc-id="default-direct-shell"]',
      );
      if (!element) throw new Error('direct shell target missing');
      return element;
    }));
    await waitFor(() => expect(connectTerminalTransport).toHaveBeenCalled());
    fireEvent.click(await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-usernode-script"][data-xgc-id="check-px4"]',
      );
      if (!element) throw new Error('user script missing');
      return element;
    }));

    await waitFor(() => expect(placeUserScript).toHaveBeenCalledWith(
      {
        sessionId: expect.stringMatching(/^ssh-default-direct-shell-/),
        hostId: 'default-direct-shell',
        path: '$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py',
        managedHostId: '',
      },
      { targetCoreId: undefined },
    ));
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith(
      replaceTerminalInputLine('python3 "$HOME/Documents/XGC/UserScripts/FS150/check-px4-params.py" --endpoint 127.0.0.1:14561'),
    ));
  });

  it('returns to a usable Terminal without a phantom rail when the User scripts leaf is absent', async () => {
    const onTabChange = vi.fn();
    const { container,rerender } = render(
      <TerminalPage
        activeTab="usernode"
        onTabChange={onTabChange}
        composition={hostsOnlyComposition}
      />,
    );
    await waitFor(() => expect(onTabChange).toHaveBeenCalledWith('terminal'));
    rerender(<TerminalPage activeTab="terminal" onTabChange={onTabChange} composition={hostsOnlyComposition} />);
    const workspace = container.querySelector('[data-xgc-role="terminal-workspace"]');
    expect(workspace).not.toHaveAttribute('hidden');
    expect(workspace?.querySelector('[data-xgc-role="terminal-chrome"] [data-xgc-role="terminal-targets-heading"]')).toHaveTextContent('Targets');
    expect(workspace?.querySelector('[data-xgc-role="terminal-user-scripts-rail"]')).toBeNull();
    expect(workspace?.querySelector('[data-xgc-role="terminal-user-scripts-heading"]')).toBeNull();
    expect(workspace?.querySelector('[data-xgc-role="terminal-chrome"]:not(:has([data-xgc-role="terminal-user-scripts-heading"]))')).not.toBeNull();
    expect(workspace?.querySelector('[data-xgc-role="terminal-console"]')).toHaveTextContent('No terminal session');
    expect(listUsernodeAssets).not.toHaveBeenCalled();
    expect(container.querySelector('[data-xgc-role="terminal-commands-page"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-command-row"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-usernode-scripts-page"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-usernode-script-group"]')).toBeNull();
  });
});

function usernodeStoreMock(assets: UsernodeAssetDocument[] = []) {
  return {
    assets,
    namespaces: [],
    selected: null,
    loading: false,
    error: '',
    refresh: vi.fn(),
    open: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    commit: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
    archive: vi.fn(),
    addNamespace: vi.fn(),
    renameNamespace: vi.fn(),
    archiveNamespace: vi.fn(),
    close: vi.fn(),
  };
}

function visibleText(element: Element | null | undefined): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.xgc-visually-hidden, .xgc-workspace-panel-title').forEach((node) => node.remove());
  return clone.textContent ?? '';
}

function usernodeFixture(
  resourceId: string,
  name: string,
  extras: { system?: boolean; tags?: string[]; source?: string },
): UsernodeAssetDocument {
  const timestamp = '2026-08-22T00:00:00Z';
  return {
    head: {
      domain: 'usernode', resourceId, name, description: '', tags: extras.tags ?? [],
      mainCommitId: 'commit-1', currentVersion: 1, digest: 'a'.repeat(64), revision: 1,
      createdAt: timestamp, updatedAt: timestamp, system: extras.system,
    },
    branch: {
      domain: 'usernode', resourceId, name: 'main', headCommitId: 'commit-1', headVersion: 1, revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
    spec: {
      schemaVersion: 1,
      name,
      description: '',
      tags: extras.tags ?? [],
      interpreter: 'bash',
      source: extras.source ?? 'echo ready',
      package: '',
      executable: '',
      launchFile: '',
      defaultArgs: [],
      setupScripts: [],
      env: {},
      timeoutSeconds: 600,
      inputs: [],
    },
  };
}

function uavHostFixture(): TerminalHost {
  return {
    id: '6b1ec96f-bf55-4bdd-b6c3-5706fc27e680',
    name: 'UAV 4',
    group: 'Hosts',
    address: '192.168.51.14',
    port: 22,
    user: 'mavrsmart',
    authMode: 'password',
    password: 'stored-password',
    privateKey: '',
    passphrase: '',
    rememberPassword: true,
    hasPassword: true,
    hostKey: '',
    description: '',
  };
}

function robotAssetFixture() {
  const timestamp = '2026-08-05T00:00:00Z';
  const resourceId = 'robot-uav-1';
  return {
    head: {
      domain: 'robot',resourceId,name: 'UAV 01',description: '',tags: [],system: true,
      mainCommitId: `${resourceId}-commit`,currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'robot',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec: {
      name: 'UAV 01',description: '',tags: [],kind: 'px4_multirotor' as const,
      profileId: 'px4.multirotor.ros1.v9',
      px4: {
        modelId:'fs150' as const,mavSystemId: 1,managementIp: '192.168.51.11',sshUsername: 'marvsmart',sshPassword: 'lab',
        mocapRigidBodyName: 'uav1',physicalMavrosLocalPort: 9010,physicalFcuRemotePort: 14560,
        simulationLocalPort: 15000,simulationRemotePort: 15300,
        simulation: {
          productId: 'xgc2-gazebo-sim-fs150-sitl',
          launchPackage: 'gazebo_sim_fs150_sitl',
          launchFile: 'fs150.launch',
        },
      },
    },
  };
}

function terminalSettingFixture(): TerminalSetting {
  return {
    id: 'default',
    fontFamily: 'Monaco',
    fontSize: 13,
    lineHeight: 1.2,
    letterSpacing: 0,
    backgroundColor: '#05070a',
    foregroundColor: '#f5f5f5',
    cursorStyle: 'block',
    cursorBlink: true,
    scrollback: 2000,
    scrollSensitivity: 6,
    defaultHostId: '',
  };
}
