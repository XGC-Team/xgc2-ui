import { useCallback,useSyncExternalStore,type Dispatch,type SetStateAction } from 'react';

/**
 * Browser-local panel state, keyed by panel instance.
 *
 * A panel that keeps its view preferences in a store keyed by experiment alone
 * makes two instances of the same plugin on one dashboard share one page, one
 * view mode, one everything: paging the left instruments panel paged the right
 * one too. Keying by {experiment, dashboard, panel} gives every instance its own
 * slot, and components that name the same key still see one value because they
 * subscribe to the same store rather than to their own useState.
 *
 * Plugins whose selection genuinely is an experiment-wide choice declare
 * `sharedStateScope: 'experiment'` in the manifest. That declaration is the
 * only thing that widens a key: `usePanelState` routes on the scope the render
 * path resolved from the manifest, so the store never has to know which plugin
 * is asking and no plugin can quietly widen its own state.
 *
 * Keys written before this module existed are neither read nor migrated: an
 * absent key falls back to the caller's initial value and the next write lands
 * on the new key.
 */
const panelStateEvent = 'xgc-panel-state';
const snapshots = new Map<string,{ raw: string | null;value: unknown }>();
const listeners = new Map<string,Set<() => void>>();

export type PanelPrivateStateScope = {
  experimentId?: string;
  dashboardId?: string;
  panelId?: string;
};

/**
 * A panel instance plus the width its plugin declared for this piece of state.
 * `shared` carries the manifest's `sharedStateScope` verbatim: absent means the
 * default, per-instance keying.
 */
export type PanelStateScope = PanelPrivateStateScope & {
  shared?: 'experiment';
};

export function panelPrivateStateKey(scope: PanelPrivateStateScope, key: string) {
  return ['xgc.panel',segment(scope.experimentId),segment(scope.dashboardId),segment(scope.panelId),key].join('.');
}

/** The storage key the declared scope routes to. */
export function panelStateKey(scope: PanelStateScope, key: string) {
  return scope.shared === 'experiment'
    ? ['xgc.experiment',segment(scope.experimentId),key].join('.')
    : panelPrivateStateKey(scope, key);
}

/** Per-instance state: two panels of the same plugin never collide. */
export function usePanelPrivateState<T>(scope: PanelPrivateStateScope, key: string, initial: T) {
  return usePersistedState(panelPrivateStateKey(scope, key), initial);
}

/**
 * Manifest-routed state. A plugin declaring `sharedStateScope: 'experiment'`
 * reads one experiment-wide slot; every other plugin reads its own instance's.
 */
export function usePanelState<T>(scope: PanelStateScope, key: string, initial: T) {
  return usePersistedState(panelStateKey(scope, key), initial);
}

function usePersistedState<T>(storageKey: string, initial: T): [T,Dispatch<SetStateAction<T>>] {
  const value = useSyncExternalStore(
    (listener) => subscribe(storageKey, listener),
    () => snapshot(storageKey, initial),
  );
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    const current = snapshot(storageKey, initial);
    const next = typeof update === 'function' ? (update as (previous: T) => T)(current) : update;
    const raw = JSON.stringify(next);
    if (raw === window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, raw);
    snapshots.set(storageKey, { raw,value: next });
    notify(storageKey);
    window.dispatchEvent(new CustomEvent(panelStateEvent, { detail: { key: storageKey } }));
  }, [initial,storageKey]);
  return [value,setValue];
}

function subscribe(storageKey: string, listener: () => void) {
  let bucket = listeners.get(storageKey);
  if (!bucket) {
    bucket = new Set();
    listeners.set(storageKey, bucket);
  }
  bucket.add(listener);
  const syncCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    if (detail?.key === storageKey) notify(storageKey);
  };
  const syncStorageEvent = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage && event.key === storageKey) notify(storageKey);
  };
  window.addEventListener(panelStateEvent, syncCustomEvent);
  window.addEventListener('storage', syncStorageEvent);
  return () => {
    window.removeEventListener(panelStateEvent, syncCustomEvent);
    window.removeEventListener('storage', syncStorageEvent);
    const current = listeners.get(storageKey);
    current?.delete(listener);
    if (current?.size === 0) listeners.delete(storageKey);
  };
}

/**
 * Cached by the exact raw string so repeated reads return the same object
 * identity: useSyncExternalStore re-renders forever when getSnapshot hands back
 * a fresh object every call. The first caller's `initial` is what an absent key
 * resolves to for every later caller of the same key.
 */
function snapshot<T>(storageKey: string, initial: T): T {
  const raw = window.localStorage.getItem(storageKey);
  const cached = snapshots.get(storageKey);
  if (cached && cached.raw === raw) return cached.value as T;
  const value = raw === null ? initial : parse(raw, initial);
  snapshots.set(storageKey, { raw,value });
  return value;
}

function parse<T>(raw: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed as T;
  } catch {
    return fallback;
  }
}

function notify(storageKey: string) {
  listeners.get(storageKey)?.forEach((listener) => listener());
}

function segment(value: string | undefined) {
  return value?.trim() || 'default';
}
