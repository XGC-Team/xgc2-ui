import { request } from '../../api/http';
import { segment } from '../../shared/url';
import type { ManagedHost } from './managedHostModel';

export function listManagedHosts(): Promise<ManagedHost[]> {
  return request<ManagedHost[]>('/managed-hosts');
}

export function revokeManagedHost(agentId: string): Promise<void> {
  return request<void>(`/managed-hosts/${segment(agentId)}`, { method: 'DELETE' });
}
