import { useEffect,useSyncExternalStore } from 'react';
import type { ManagedHost,ManagedHostOption } from './managedHostModel';
import { managedHostSelectable } from './managedHostModel';
import { listManagedHosts,revokeManagedHost as revokeManagedHostRequest } from './managedHostService';
import { useProductWebComposition } from '../../shared/productWebComposition';

export const LOCAL_MANAGED_HOST_ID = 'local';

const listeners = new Set<() => void>();
let snapshot: ManagedHost[] = [];
const disabledSnapshot: ManagedHost[] = [];
type ManagedHostRegistryRuntimeStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ManagedHostRegistryStatus = Exclude<ManagedHostRegistryRuntimeStatus,'idle'> | 'disabled';

let status: ManagedHostRegistryRuntimeStatus = 'idle';
let registryError = '';
let initialLoad: Promise<ManagedHost[]> | undefined;

export function useManagedHosts() {
  const { agentLinkComputeTargets } = useProductWebComposition();
  useEffect(() => {
    if (agentLinkComputeTargets && status !== 'ready') void loadInitialManagedHosts().catch(() => undefined);
  }, [agentLinkComputeTargets]);
  return useSyncExternalStore(
    subscribe,
    () => agentLinkComputeTargets ? snapshot : disabledSnapshot,
    () => agentLinkComputeTargets ? snapshot : disabledSnapshot,
  );
}

export function useManagedHostRegistryStatus(): ManagedHostRegistryStatus {
  const { agentLinkComputeTargets } = useProductWebComposition();
  useEffect(() => {
    if (agentLinkComputeTargets && status !== 'ready') void loadInitialManagedHosts().catch(() => undefined);
  }, [agentLinkComputeTargets]);
  return useSyncExternalStore(
    subscribe,
    () => agentLinkComputeTargets ? visibleStatus(status) : 'disabled',
    () => agentLinkComputeTargets ? visibleStatus(status) : 'disabled',
  );
}

export function useManagedHostRegistryError() {
  const { agentLinkComputeTargets } = useProductWebComposition();
  return useSyncExternalStore(
    subscribe,
    () => agentLinkComputeTargets ? registryError : '',
    () => agentLinkComputeTargets ? registryError : '',
  );
}

export async function refreshManagedHosts() {
  status = 'loading';
  registryError = '';
  emit();
  try {
    snapshot = await listManagedHosts();
    status = 'ready';
    emit();
    return snapshot;
  } catch (cause) {
    status = 'error';
    registryError = cause instanceof Error ? cause.message : String(cause);
    emit();
    throw cause;
  }
}

export async function revokeManagedHost(hostId: string) {
  await revokeManagedHostRequest(hostId);
  return refreshManagedHosts();
}

export function managedHostOptions(hosts: ManagedHost[]): ManagedHostOption[] {
  return hosts
    .filter((host) => host.id !== LOCAL_MANAGED_HOST_ID)
    .slice()
    .sort(compareManagedHosts)
    .map((host) => ({
      id: host.id,
      label: managedHostLabel(host),
      stateLabel: managedHostStateLabel(host),
      disabled: !managedHostSelectable(host),
      host,
    }));
}

export function isLocalManagedHost(hostId: string | undefined) {
  return !hostId || hostId === LOCAL_MANAGED_HOST_ID;
}

export function managedHostLabel(host: ManagedHost) {
  return host.displayName || host.id;
}

export function managedHostStateLabel(host: ManagedHost) {
  if (host.enrollment !== 'enrolled') return host.enrollment;
  return host.connectivity;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function loadInitialManagedHosts() {
  if (initialLoad) return initialLoad;
  initialLoad = refreshManagedHosts().finally(() => {
    initialLoad = undefined;
  });
  return initialLoad;
}

function visibleStatus(value: ManagedHostRegistryRuntimeStatus): ManagedHostRegistryStatus {
  return value === 'idle' ? 'loading' : value;
}

function compareManagedHosts(a: ManagedHost, b: ManagedHost) {
  const aSelectable = managedHostSelectable(a);
  const bSelectable = managedHostSelectable(b);
  if (aSelectable !== bSelectable) return aSelectable ? -1 : 1;
  return managedHostLabel(a).localeCompare(managedHostLabel(b));
}
