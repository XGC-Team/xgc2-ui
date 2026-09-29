// @vitest-environment jsdom
import { useEffect } from 'react';
import { cleanup,render,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { TerminalPage } from './TerminalPage';

const mocks = vi.hoisted(() => ({
  mounts: vi.fn(),unmounts: vi.fn(),hosts: vi.fn(),robots: vi.fn(),workspace: vi.fn(),
  takeIntent: vi.fn(),openHost: vi.fn(),restore: vi.fn(),
  intent: { scope: 'local__local',robotAssetId: 'other-robot' },
}));
vi.mock('@xgc2/ui-react',() => ({ Notice: () => null,useTextPromptDialog: () => ({ prompt: vi.fn(),dialog: null }) }));
vi.mock('../../shared/routeReady',() => ({ useProductRouteVisible: () => true }));
vi.mock('./terminalMessages',() => ({ useTerminalText: () => (text: string) => text }));
vi.mock('./terminalRobotLoginIntent',() => ({
  subscribeTerminalRobotLogin: () => () => {},peekTerminalRobotLogin: () => mocks.intent,takeTerminalRobotLogin: mocks.takeIntent,
}));
vi.mock('./terminalRobotHosts',() => ({ TERMINAL_ROBOT_HOST_ID_PREFIX: 'robot-asset:' }));
vi.mock('./terminalLoginHosts',() => ({
  terminalLoginIdentity: (id?: string) => !id || id === 'local' ? 'core' : 'agent',
  isTerminalDirectShellHostId: (id: string) => id === 'default-direct-shell',
  buildTerminalLoginHosts: ({ customHosts,robotHosts }: { customHosts: unknown[];robotHosts: unknown[] }) => [
    { id: 'default-direct-shell',name: 'Direct shell' },...customHosts,...robotHosts,
  ],
}));
vi.mock('./useTerminalHostCatalog',() => ({ useTerminalHostCatalog: (options: unknown) => {
  mocks.hosts(options);
  return { items: [{ id: 'other-host' }],error: '' };
} }));
vi.mock('./useTerminalRobotHosts',() => ({ useTerminalRobotHosts: (...args: unknown[]) => {
  mocks.robots(...args);
  return { hosts: [{ id: 'robot-asset:other-robot' }],ready: true,error: '' };
} }));
vi.mock('./useTerminalSettingSnapshot',() => ({ useTerminalSettingSnapshot: () => ({ setting: {},error: '' }) }));
vi.mock('./useTerminalSessionController',() => ({ useTerminalSessionController: () => ({
  sessions: [],restoreSessions: mocks.restore,openHost: mocks.openHost,error: '',terminalRefs: { current: {} },
}) }));
vi.mock('./TerminalWorkspace',() => ({ TerminalWorkspace: (props: { managedHostId?: string;hosts: { id: string }[] }) => {
  mocks.workspace(props);
  useEffect(() => {
    mocks.mounts(props.managedHostId);
    return () => { mocks.unmounts(props.managedHostId); };
  },[props.managedHostId]);
  return <div data-testid={`workspace-${props.managedHostId ?? 'local'}`} />;
} }));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('embedded TerminalPage',() => {
  const props = { activeTab: 'terminal' as const,onTabChange: vi.fn(),embedded: true,workspaceId: 'experiment',composition: { LocalShell: true as const } };
  it('keeps A mounted while selecting B, then reuses A on return',async () => {
    const view = render(<TerminalPage {...props} managedHostId="agent-A" />);
    await waitFor(() => expect(mocks.openHost).toHaveBeenCalledTimes(1));
    view.rerender(<TerminalPage {...props} managedHostId="agent-B" />);
    await waitFor(() => expect(mocks.openHost).toHaveBeenCalledTimes(2));
    view.rerender(<TerminalPage {...props} managedHostId="agent-A" />);
    expect(mocks.mounts.mock.calls.map(([host]) => host)).toEqual(['agent-A','agent-B']);
    expect(mocks.unmounts).not.toHaveBeenCalled();
    expect(mocks.openHost).toHaveBeenCalledTimes(2);
    expect(view.getByTestId('workspace-agent-A').closest('[data-xgc-role="terminal-page"]')).not.toHaveAttribute('hidden');
    expect(view.getByTestId('workspace-agent-B').closest('[data-xgc-role="terminal-page"]')).toHaveAttribute('hidden');
  });

  it('excludes global Core inventories and does not consume global login intent',async () => {
    render(<TerminalPage {...props} />);
    await waitFor(() => expect(mocks.openHost).toHaveBeenCalledTimes(1));
    expect(mocks.hosts.mock.calls.every(([options]) => options.enabled === false)).toBe(true);
    expect(mocks.robots.mock.calls.every(([,options]) => options.enabled === false)).toBe(true);
    expect(mocks.workspace.mock.calls.every(([options]) => options.hosts.length === 1 && options.hosts[0].id === 'default-direct-shell')).toBe(true);
    expect(mocks.takeIntent).not.toHaveBeenCalled();
  });

  it('does not restore or open an initially hidden embedded pane',async () => {
    const view = render(<TerminalPage {...props} visible={false} managedHostId="agent-A" />);
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.openHost).not.toHaveBeenCalled();
    view.rerender(<TerminalPage {...props} visible managedHostId="agent-A" />);
    await waitFor(() => expect(mocks.openHost).toHaveBeenCalledTimes(1));
  });
});
