import { useCallback, useRef, useSyncExternalStore } from 'react';

export type FrameStoreUpdate<T> = T | ((current: T) => T);
export type FrameStoreSchedule = 'frame' | 'microtask' | 'sync';

export type FrameStore<T> = {
  destroy: () => void;
  flush: () => void;
  getSnapshot: () => T;
  set: (update: FrameStoreUpdate<T>) => T;
  subscribe: (listener: () => void) => () => void;
};

export type CreateFrameStoreOptions = {
  /**
   * `frame` coalesces arbitrary producer frequency to at most one subscriber
   * notification per animation frame. `microtask` is useful for non-visual
   * stores and tests; `sync` exists for deterministic compatibility paths.
   */
  schedule?: FrameStoreSchedule;
};

/**
 * Tiny external store for high-frequency visual data such as telemetry,
 * streaming model output and runtime progress.
 *
 * Producers always update the latest snapshot immediately, but subscribers
 * are notified on the selected schedule. With the default frame schedule,
 * 100 network events arriving inside one frame become one React notification.
 */
export function createFrameStore<T>(
  initialSnapshot: T,
  { schedule = 'frame' }: CreateFrameStoreOptions = {},
): FrameStore<T> {
  let snapshot = initialSnapshot;
  let scheduled = false;
  let destroyed = false;
  let cancelScheduled: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    scheduled = false;
    cancelScheduled = undefined;
    if (destroyed) return;
    for (const listener of [...listeners]) listener();
  };

  const scheduleNotify = () => {
    if (scheduled || destroyed) return;
    if (schedule === 'sync') {
      notify();
      return;
    }
    scheduled = true;
    if (schedule === 'microtask' || typeof requestAnimationFrame !== 'function') {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) notify();
      });
      cancelScheduled = () => {
        cancelled = true;
        scheduled = false;
      };
      return;
    }
    const frame = requestAnimationFrame(notify);
    cancelScheduled = () => {
      cancelAnimationFrame(frame);
      scheduled = false;
    };
  };

  return {
    destroy() {
      destroyed = true;
      cancelScheduled?.();
      listeners.clear();
    },
    flush() {
      if (!scheduled || destroyed) return;
      cancelScheduled?.();
      scheduled = false;
      cancelScheduled = undefined;
      notify();
    },
    getSnapshot() {
      return snapshot;
    },
    set(update) {
      if (destroyed) return snapshot;
      const next = typeof update === 'function'
        ? (update as (current: T) => T)(snapshot)
        : update;
      if (Object.is(next, snapshot)) return snapshot;
      snapshot = next;
      scheduleNotify();
      return snapshot;
    },
    subscribe(listener) {
      if (destroyed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useFrameStore<T>(store: FrameStore<T>) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useFrameStoreSelector<T, Selection>(
  store: FrameStore<T>,
  selector: (snapshot: T) => Selection,
  isEqual: (left: Selection, right: Selection) => boolean = Object.is,
) {
  const cacheRef = useRef<{
    hasValue: boolean;
    selection?: Selection;
    snapshot?: T;
  }>({ hasValue: false });

  const getSelection = useCallback(() => {
    const snapshot = store.getSnapshot();
    const cache = cacheRef.current;
    if (cache.hasValue && Object.is(cache.snapshot, snapshot)) {
      return cache.selection as Selection;
    }
    const next = selector(snapshot);
    if (cache.hasValue && isEqual(cache.selection as Selection, next)) {
      cache.snapshot = snapshot;
      return cache.selection as Selection;
    }
    cache.snapshot = snapshot;
    cache.selection = next;
    cache.hasValue = true;
    return next;
  }, [isEqual, selector, store]);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
