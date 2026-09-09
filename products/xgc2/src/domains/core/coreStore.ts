import { useEffect,useSyncExternalStore } from 'react';
import type { CoreNode } from './coreModel';
import { listCores } from './coreService';

const listeners = new Set<() => void>();
let snapshot: CoreNode[] = [];
let loaded = false;

export function useCoreNodes() {
  useEffect(() => {
    if (!loaded) void refreshCoreNodes().catch(() => undefined);
  }, []);
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export async function refreshCoreNodes() {
  snapshot = await listCores();
  loaded = true;
  emit();
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}
