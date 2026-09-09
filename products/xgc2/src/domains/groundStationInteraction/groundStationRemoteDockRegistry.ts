import { useSyncExternalStore } from 'react';

const docks = new Map<string, HTMLElement>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function registerGroundStationRemoteDock(experimentId: string,host: HTMLElement) {
  docks.set(experimentId,host);
  emit();
  return () => {
    if (docks.get(experimentId) === host) docks.delete(experimentId);
    emit();
  };
}

/** Chat and Robot control are sibling panels; the dock host is an Experiment-scoped registry, not React context. */
export function useGroundStationRemoteDock(experimentId: string) {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => { listeners.delete(onStoreChange); };
    },
    () => (experimentId ? docks.get(experimentId) ?? null : null),
    () => null,
  );
}
