import { useCallback, useEffect, useSyncExternalStore, type SetStateAction } from 'react';

export type XGCSkin = 'dark' | 'light';

/**
 * A product-owned, already initialized skin authority. Successful writes publish
 * the committed snapshot and notify subscribers before resolving. Failed writes
 * reject without replacing the authoritative snapshot. The owner defines commit
 * ordering/conflicts; ui-react does not queue, retry, or persist writes.
 */
export interface SkinStore {
  getSnapshot(): XGCSkin;
  subscribe(listener: () => void): () => void;
  setSkin(next: XGCSkin): Promise<void>;
}

export type SkinOptions = { store: SkinStore };

function checkedSkin(value: unknown): XGCSkin {
  if (value !== 'dark' && value !== 'light') {
    throw new TypeError(`Unsupported XGC skin: ${String(value)}`);
  }
  return value;
}

function applySkin(skin: XGCSkin) {
  if (typeof document !== 'undefined') document.documentElement.dataset.skin = skin;
}

/** An explicit, nonpersistent store for previews and applications without saved preferences. */
export function createMemorySkinStore(initialSkin: XGCSkin): SkinStore {
  let skin = checkedSkin(initialSkin);
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => skin,
    subscribe(listener) {
      // Each registration owns its cleanup, even if the callback is reused.
      const notify = () => listener();
      listeners.add(notify);
      return () => { listeners.delete(notify); };
    },
    async setSkin(next) {
      const resolved = checkedSkin(next);
      if (skin === resolved) return;
      skin = resolved;
      listeners.forEach((listener) => listener());
    },
  };
}

/** Call after the product restores its store, before the first React render. Never writes the store. */
export function initializeSkin({ store }: SkinOptions): XGCSkin {
  const skin = checkedSkin(store.getSnapshot());
  applySkin(skin);
  return skin;
}

/** Shared document skin and subscriptions; persistence belongs to the injected store. */
export function useSkin({ store }: SkinOptions) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => checkedSkin(store.getSnapshot()), [store]);
  const skin = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setSkin = useCallback(async (next: SetStateAction<XGCSkin>): Promise<void> => {
    const resolved = checkedSkin(typeof next === 'function' ? next(getSnapshot()) : next);
    await store.setSkin(resolved);
  }, [store, getSnapshot]);

  useEffect(() => {
    // Read the current authority, never a requested value from an older promise.
    applySkin(getSnapshot());
  }, [skin, getSnapshot]);

  return [skin, setSkin] as const;
}
