// @vitest-environment jsdom

import { act,cleanup,renderHook,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { useHostFirewallResource } from './useHostFirewallResource';

const {
  getHostFirewallStatus,
  listHostFirewallRules,
  operateHostFirewall,
  removeHostFirewallRule,
} = vi.hoisted(() => ({
  getHostFirewallStatus: vi.fn(),
  listHostFirewallRules: vi.fn(),
  operateHostFirewall: vi.fn(),
  removeHostFirewallRule: vi.fn(),
}));

vi.mock('./hostFirewallActions', () => ({
  getHostFirewallStatus,
  listHostFirewallRules,
  operateHostFirewall,
  removeHostFirewallRule,
}));

const apiTarget = { targetCoreId: 'core-a',managedHostId: 'agent-b' };
const firewallRule = {
  id: 'ssh',
  direction: 'in',
  protocol: 'tcp',
  port: 22,
  source: '10.0.0.0/8',
  action: 'allow',
  description: 'SSH',
};

describe('useHostFirewallResource', () => {
  beforeEach(() => {
    getHostFirewallStatus.mockResolvedValue({ enabled: true,backend: 'nftables' });
    listHostFirewallRules.mockResolvedValue([firewallRule]);
    operateHostFirewall.mockResolvedValue({ enabled: false,backend: 'nftables' });
    removeHostFirewallRule.mockResolvedValue({ id: firewallRule.id,removed: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads remote status and rules once across stable rerenders', async () => {
    const { result,rerender } = renderHook(() => useHostFirewallResource(apiTarget,{
      requestsAllowed: true,
      actionsEnabled: true,
    }));

    await waitFor(() => expect(result.current.rules).toEqual([firewallRule]));
    expect(getHostFirewallStatus).toHaveBeenCalledTimes(1);
    expect(getHostFirewallStatus).toHaveBeenCalledWith(apiTarget);
    expect(listHostFirewallRules).toHaveBeenCalledTimes(1);

    rerender();
    expect(getHostFirewallStatus).toHaveBeenCalledTimes(1);
    expect(listHostFirewallRules).toHaveBeenCalledTimes(1);
  });

  it('fails closed while requests or actions are disabled', async () => {
    const { result } = renderHook(() => useHostFirewallResource(apiTarget,{
      requestsAllowed: false,
      actionsEnabled: false,
    }));

    await act(async () => Promise.resolve());
    await act(async () => {
      await result.current.refresh();
      await result.current.operate('disable');
      await result.current.removeRule(firewallRule.id);
    });

    expect(getHostFirewallStatus).not.toHaveBeenCalled();
    expect(listHostFirewallRules).not.toHaveBeenCalled();
    expect(operateHostFirewall).not.toHaveBeenCalled();
    expect(removeHostFirewallRule).not.toHaveBeenCalled();
  });
});
