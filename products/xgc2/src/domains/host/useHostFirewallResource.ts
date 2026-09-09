import { useCallback,useEffect,useState } from 'react';
import type { HostFirewallRule,HostFirewallStatus } from './hostModel';
import {
  getHostFirewallStatus,
  listHostFirewallRules,
  operateHostFirewall,
  removeHostFirewallRule,
  type HostFirewallOperation,
} from './hostFirewallActions';
import { useHostTask } from './useHostTask';

type HostFirewallTarget = {
  targetCoreId?: string;
  managedHostId?: string;
};

export function useHostFirewallResource(
  apiTarget: HostFirewallTarget,
  {
    requestsAllowed,
    actionsEnabled,
  }: {
    requestsAllowed: boolean;
    actionsEnabled: boolean;
  },
) {
  const [status,setStatus] = useState<HostFirewallStatus | null>(null);
  const [rules,setRules] = useState<HostFirewallRule[]>([]);
  const task = useHostTask('firewall');
  const { run } = task;

  const refresh = useCallback(async () => {
    if (!requestsAllowed) return;
    await run('firewall-refresh',async () => {
      const nextStatus = await getHostFirewallStatus(apiTarget);
      setStatus(nextStatus);
      if (apiTarget.managedHostId) {
        setRules(await listHostFirewallRules(apiTarget));
      } else {
        setRules([]);
      }
    });
  }, [apiTarget,requestsAllowed,run]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const operate = useCallback(async (operation: HostFirewallOperation) => {
    if (!actionsEnabled || !requestsAllowed) return;
    await run(`firewall:${operation}`,async () => {
      setStatus(await operateHostFirewall(operation,apiTarget));
      if (apiTarget.managedHostId) setRules(await listHostFirewallRules(apiTarget));
    });
  }, [actionsEnabled,apiTarget,requestsAllowed,run]);

  const removeRule = useCallback(async (ruleId: string) => {
    if (!actionsEnabled || !requestsAllowed || !apiTarget.managedHostId) return;
    await run(`firewall-rule-remove:${ruleId}`,async () => {
      await removeHostFirewallRule(ruleId,apiTarget);
      setRules(await listHostFirewallRules(apiTarget));
    });
  }, [actionsEnabled,apiTarget,requestsAllowed,run]);

  return {
    status,
    rules,
    busy: task.isBusy() || !actionsEnabled,
    message: task.message,
    messageTone: task.messageTone,
    clearMessage: task.clearMessage,
    refresh,
    operate,
    removeRule,
  };
}
