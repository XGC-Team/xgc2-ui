import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { segment } from '../../shared/url';
import type { HostFirewallRule,HostFirewallStatus } from './hostModel';

export type HostFirewallOperation = 'enable' | 'disable' | 'reload';

export function getHostFirewallStatus(options?: ApiTargetOptions): Promise<HostFirewallStatus> {
  if (options?.managedHostId) {
    return request<HostFirewallStatus>(
      `/managed-hosts/${segment(options.managedHostId)}/firewall`,
      undefined,
      withTerminalAuth(options),
    );
  }
  return request<{ exists?: boolean;active?: boolean;name?: string;output?: string }>(
    '/host/firewall',
    undefined,
    withTerminalAuth(options),
  ).then((info) => ({
    enabled: Boolean(info.active),
    backend: info.name || 'local',
    exists: info.exists,
    active: info.active,
    name: info.name,
    output: info.output,
  }));
}

export function listHostFirewallRules(options?: ApiTargetOptions): Promise<HostFirewallRule[]> {
  if (!options?.managedHostId) return Promise.resolve([]);
  return request<HostFirewallRule[]>(
    `/managed-hosts/${segment(options.managedHostId)}/firewall/rules`,
    undefined,
    withTerminalAuth(options),
  );
}

export function operateHostFirewall(
  operation: HostFirewallOperation,
  options?: ApiTargetOptions,
): Promise<HostFirewallStatus> {
  if (options?.managedHostId) {
    return request<HostFirewallStatus>(
      `/managed-hosts/${segment(options.managedHostId)}/firewall/${segment(operation)}`,
      { method: 'POST' },
      withTerminalAuth(options),
    );
  }
  return request<{ operation?: string;output?: string }>(
    `/host/firewall/${segment(operation)}`,
    { method: 'POST',body: JSON.stringify({}) },
    withTerminalAuth(options),
  ).then(() => getHostFirewallStatus(options));
}

export function removeHostFirewallRule(
  ruleId: string,
  options?: ApiTargetOptions,
): Promise<{ id: string;removed: boolean }> {
  if (!options?.managedHostId) {
    return Promise.reject(new Error(
      'Structured firewall rule removal is available on remote managed hosts.',
    ));
  }
  return request<{ id: string;removed: boolean }>(
    `/managed-hosts/${segment(options.managedHostId)}/firewall/rules/${segment(ruleId)}`,
    { method: 'DELETE' },
    withTerminalAuth(options),
  );
}
