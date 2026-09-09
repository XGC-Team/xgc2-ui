import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { applyHostSettings,getHostSettings,subscribeHostSettings,type HostSettings } from './hostSettingsService';

vi.mock('../../api/http',async (importOriginal) => {
  const actual = await importOriginal() as Record<string,unknown>;
  return {
    ...actual,
    request: vi.fn(() => Promise.resolve({})),
    withTerminalAuth: vi.fn((options?: object) => ({ ...options,auth: 'terminal' })),
  };
});

describe('hostSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads and writes local Core host policy', async () => {
    await getHostSettings();
    await applyHostSettings({ mask: ['timezone'],timezone: 'Asia/Shanghai' });

    expect(request).toHaveBeenNthCalledWith(1,'/host/settings',undefined,{ auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(2,'/host/settings',{
      method: 'PUT',
      body: JSON.stringify({ mask: ['timezone'],timezone: 'Asia/Shanghai' }),
    },{ auth: 'terminal' });
  });

  it('routes Agent host policy through managed-hosts', async () => {
    await getHostSettings({ managedHostId: 'agent-a' });
    await applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'performance' },{ managedHostId: 'agent-a' });

    expect(request).toHaveBeenNthCalledWith(1,'/managed-hosts/agent-a/settings',undefined,{
      managedHostId: 'agent-a',
      auth: 'terminal',
    });
    expect(request).toHaveBeenNthCalledWith(2,'/managed-hosts/agent-a/settings',{
      method: 'PUT',
      body: JSON.stringify({ mask: ['cpuGovernor'],cpuGovernor: 'performance' }),
    },{
      managedHostId: 'agent-a',
      auth: 'terminal',
    });
  });

  it('includes a one-shot host password on the apply body when provided', async () => {
    await applyHostSettings({
      mask: ['timezone'],
      timezone: 'Asia/Shanghai',
      privilegePassword: 'secret',
    }, { managedHostId: 'agent-a' });

    expect(request).toHaveBeenCalledWith('/managed-hosts/agent-a/settings',{
      method: 'PUT',
      body: JSON.stringify({
        mask: ['timezone'],
        timezone: 'Asia/Shanghai',
        privilegePassword: 'secret',
      }),
    },{
      managedHostId: 'agent-a',
      auth: 'terminal',
    });
  });

  it('shares an applied snapshot only with consumers on the same Core and host', async () => {
    const selected = vi.fn();
    const otherCore = vi.fn();
    const target = { targetCoreId: 'core-a',managedHostId: 'agent-a' };
    const unsubscribe = subscribeHostSettings(target,selected);
    const unsubscribeOther = subscribeHostSettings({ ...target,targetCoreId: 'core-b' },otherCore);
    const snapshot = { cpuGovernor: 'performance',availableGovernors: ['performance','powersave'] };
    vi.mocked(request).mockResolvedValueOnce(snapshot);
    try {
      await applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'performance',privilegePassword: 'one-shot' },target);
      expect(selected).toHaveBeenCalledExactlyOnceWith(snapshot);
      expect(selected.mock.calls[0][0]).not.toHaveProperty('privilegePassword');
      expect(otherCore).not.toHaveBeenCalled();
      unsubscribe();
      await applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'powersave' },target);
      expect(selected).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      unsubscribeOther();
    }
  });

  it('does not publish a rejected performance change', async () => {
    const changed = vi.fn();
    const unsubscribe = subscribeHostSettings({},changed);
    vi.mocked(request).mockRejectedValueOnce(new Error('host password required'));
    try {
      await expect(applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'performance' })).rejects.toThrow('host password required');
      expect(changed).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('serializes same-target mutations and returns each accepted result to its caller',async () => {
    const first = deferred<HostSettings>();
    const snapshots = vi.fn();
    const target = { targetCoreId: 'core-a',managedHostId: 'agent-a' };
    const unsubscribe = subscribeHostSettings(target,snapshots);
    const firstSnapshot = { timezone: 'UTC',cpuGovernor: 'powersave' } as HostSettings;
    const secondSnapshot = { ...firstSnapshot,cpuGovernor: 'performance' };
    vi.mocked(request).mockReturnValueOnce(first.promise).mockResolvedValueOnce(secondSnapshot);
    try {
      const changeTimezone = applyHostSettings({ mask: ['timezone'],timezone: 'UTC' },target);
      const changeGovernor = applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'performance' },target);
      expect(request).toHaveBeenCalledTimes(1);
      first.resolve(firstSnapshot);
      expect(await changeTimezone).toBe(firstSnapshot);
      expect(await changeGovernor).toBe(secondSnapshot);
      expect(request).toHaveBeenCalledTimes(2);
      expect(snapshots.mock.calls).toEqual([[firstSnapshot],[secondSnapshot]]);
    } finally { unsubscribe(); }
  });

  it.each([
    { targetCoreId: 'core-a',managedHostId: 'agent-b' },
    { targetCoreId: 'core-b',managedHostId: 'agent-a' },
  ])('does not block an independent Core/host target %j',async (otherTarget) => {
    const first = deferred<HostSettings>();
    const snapshot = {} as HostSettings;
    vi.mocked(request).mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot);
    const pending = applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'performance' },{ targetCoreId: 'core-a',managedHostId: 'agent-a' });
    const other = applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'powersave' },otherTarget);
    expect(request).toHaveBeenCalledTimes(2);
    expect(await other).toBe(snapshot);
    first.resolve(snapshot);
    await pending;
  });

  it('rejects the failed caller and releases the next same-target mutation',async () => {
    const first = deferred<HostSettings>();
    const snapshot = {} as HostSettings;
    vi.mocked(request).mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot);
    const rejected = applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'performance' });
    const rejection = expect(rejected).rejects.toThrow('host password required');
    const accepted = applyHostSettings({ mask: ['cpuGovernor'],cpuGovernor: 'powersave' });
    expect(request).toHaveBeenCalledTimes(1);
    first.reject(new Error('host password required'));
    await rejection;
    expect(await accepted).toBe(snapshot);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve,onReject) => { resolve = onResolve;reject = onReject; });
  return { promise,resolve,reject };
}
