// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type * as HttpModule from '../../api/http';
import { HTTPError,request } from '../../api/http';
import { selectControlOption } from '../../test/selectControlTestUtils';
import { HostSettingsPanel } from './HostSettingsPanel';
import { applyHostSettings,type HostSettings } from './hostSettingsService';

const notifyHostError = vi.hoisted(() => vi.fn());

vi.mock('../../api/http',async (importOriginal) => ({
  ...await importOriginal<typeof HttpModule>(),
  request: vi.fn(),
}));

vi.mock('../groundStationInteraction/groundStationInteractionPublic',() => ({
  useGroundStationErrorNotification: notifyHostError,
}));

beforeEach(() => {
  vi.mocked(request).mockReset();
  notifyHostError.mockClear();
});

describe('Host policy and Maintenance synchronization',() => {
  it.each(['resolve','reject'] as const)('keeps the applied snapshot when an older Host read later %ss',async (settlement) => {
    const olderRead = deferred<HostSettings>();
    vi.mocked(request)
      .mockReturnValueOnce(olderRead.promise)
      .mockResolvedValueOnce(policy())
      .mockResolvedValueOnce(policy({ cpuGovernor: 'performance' }));
    const target = { targetCoreId: 'core-a',managedHostId: 'agent-a' };
    const { container } = render(<>
      <HostSettingsPanel apiTarget={target} actionsEnabled />
      <HostSettingsPanel apiTarget={target} actionsEnabled presentation="performance" />
    </>);
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toBeEnabled());
    selectControlOption('Performance mode','performance');
    await waitFor(() => expect(screen.getAllByLabelText('Performance mode')).toHaveLength(2));
    expect(vi.mocked(request).mock.calls[2]).toEqual([
      '/managed-hosts/agent-a/settings',
      { method: 'PUT',body: expect.any(String) },
      { ...target,auth: 'terminal' },
    ]);
    expect(JSON.parse(vi.mocked(request).mock.calls[2][1]!.body as string)).toEqual(expect.objectContaining({
      mask: ['cpuGovernor'],cpuGovernor: 'performance',
    }));
    await act(async () => {
      if (settlement === 'resolve') olderRead.resolve(policy());
      else olderRead.reject(new Error('Old Host read failed'));
      await olderRead.promise.catch(() => undefined);
    });
    for (const control of screen.getAllByLabelText('Performance mode')) {
      expect(control).toHaveTextContent('performance');
      expect(control).toBeEnabled();
    }
    expect(container.querySelectorAll('[data-xgc-role="system-host-settings"]')).toHaveLength(1);
    expect(notifyHostError.mock.calls.some((call) => call[1] === 'Old Host read failed')).toBe(false);
  });

  it('does not deliver an old target apply to the newly selected target',async () => {
    vi.mocked(request).mockResolvedValue(policy());
    const oldTarget = { targetCoreId: 'core-a',managedHostId: 'agent-a' };
    const nextTarget = { ...oldTarget,managedHostId: 'agent-b' };
    const { rerender } = render(<HostSettingsPanel apiTarget={oldTarget} actionsEnabled presentation="performance" />);
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toBeEnabled());
    const pendingApply = deferred<HostSettings>();
    vi.mocked(request).mockReturnValueOnce(pendingApply.promise);
    selectControlOption('Performance mode','performance');
    rerender(<HostSettingsPanel apiTarget={nextTarget} actionsEnabled presentation="performance" />);
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toHaveTextContent('powersave'));
    await act(async () => pendingApply.resolve(policy({ cpuGovernor: 'performance' })));
    expect(screen.getByLabelText('Performance mode')).toHaveTextContent('powersave');
    expect(screen.getByLabelText('Performance mode')).toBeEnabled();
  });

  it('preserves edited Host text when Maintenance publishes an applied snapshot',async () => {
    vi.mocked(request).mockResolvedValue(policy());
    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    const user = await screen.findByLabelText('Autologin user');
    fireEvent.change(user,{ target: { value: 'draft-user' } });
    vi.mocked(request).mockResolvedValueOnce(policy({ cpuGovernor: 'performance' }));
    await act(async () => { await applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'performance' }); });
    expect(screen.getByLabelText('Performance mode')).toHaveTextContent('performance');
    expect(user).toHaveValue('draft-user');
  });

  it('applies concurrent changes from both presentations in request order without restoring an older snapshot',async () => {
    vi.mocked(request).mockResolvedValue(policy());
    const { container } = render(<>
      <HostSettingsPanel apiTarget={{}} actionsEnabled />
      <HostSettingsPanel apiTarget={{}} actionsEnabled presentation="performance" />
    </>);
    await screen.findByLabelText('Host timezone');
    await waitFor(() => expect(screen.getAllByLabelText('Performance mode').every((node) => !node.hasAttribute('disabled'))).toBe(true));
    const firstApply = deferred<HostSettings>();
    vi.mocked(request)
      .mockReturnValueOnce(firstApply.promise)
      .mockResolvedValueOnce(policy({ timezone: 'Asia/Tokyo',cpuGovernor: 'performance' }));
    selectControlOption('Host timezone','Asia/Tokyo');
    fireEvent.click(container.querySelector('[data-xgc-role="maintenance-performance-mode-trigger"]')!);
    fireEvent.click(screen.getByRole('option',{ name: 'performance' }));
    expect(vi.mocked(request).mock.calls.filter((call) => call[1]?.method === 'PUT')).toHaveLength(1);
    await act(async () => firstApply.resolve(policy({ timezone: 'Asia/Tokyo' })));
    await waitFor(() => expect(screen.getAllByLabelText('Performance mode').every((node) => node.textContent === 'performance')).toBe(true));
    expect(screen.getByLabelText('Host timezone')).toHaveTextContent('Asia/Tokyo');
    expect(vi.mocked(request).mock.calls.filter((call) => call[1]?.method === 'PUT')).toHaveLength(2);
  });

  it('drops the old host password and does not retry a late privilege challenge after switching hosts',async () => {
    vi.mocked(request).mockResolvedValue(policy());
    const firstTarget = { managedHostId: 'agent-a' };
    const { rerender } = render(<HostSettingsPanel apiTarget={firstTarget} actionsEnabled presentation="performance" />);
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toBeEnabled());
    vi.mocked(request)
      .mockRejectedValueOnce(new HTTPError(403,'Forbidden',{ code: 'privilege_required' }))
      .mockResolvedValueOnce(policy({ cpuGovernor: 'performance' }));
    selectControlOption('Performance mode','performance');
    const password = await screen.findByLabelText('Administrator password on this host');
    fireEvent.change(password,{ target: { value: 'host-a-password' } });
    fireEvent.click(screen.getByRole('button',{ name: 'Apply' }));
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toBeEnabled());
    expect(screen.getByLabelText('Performance mode')).toHaveTextContent('performance');

    const lateChallenge = deferred<HostSettings>();
    vi.mocked(request).mockReturnValueOnce(lateChallenge.promise);
    selectControlOption('Performance mode','powersave');
    rerender(<HostSettingsPanel apiTarget={{ managedHostId: 'agent-b' }} actionsEnabled presentation="performance" />);
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toBeEnabled());
    await act(async () => {
      lateChallenge.reject(new HTTPError(403,'Forbidden',{ code: 'privilege_required' }));
      await lateChallenge.promise.catch(() => undefined);
    });
    const writes = vi.mocked(request).mock.calls.filter((call) => call[1]?.method === 'PUT');
    expect(writes).toHaveLength(3);
    expect(writes.every((call) => call[0] === '/managed-hosts/agent-a/settings')).toBe(true);
    expect(JSON.parse(writes[1][1]!.body as string)).toHaveProperty('privilegePassword','host-a-password');
    expect(JSON.parse(writes[2][1]!.body as string)).not.toHaveProperty('privilegePassword');
    expect(screen.queryByLabelText('Administrator password on this host')).toBeNull();
    expect(screen.getByLabelText('Performance mode')).toHaveTextContent('powersave');
  });
});

function policy(overrides: Partial<HostSettings> = {}): HostSettings {
  return {
    timezone: 'Etc/UTC',ntpEnabled: false,cpuGovernor: 'powersave',availableGovernors: ['powersave','performance'],
    displayIdleSeconds: 0,autologinEnabled: true,autologinUser: 'operator',sleepEnabled: false,
    pendingRestart: false,collectedAt: '2026-09-06T00:00:00Z',...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve,onReject) => { resolve = onResolve;reject = onReject; });
  return { promise,resolve,reject };
}
