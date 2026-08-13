import { useCallback, useEffect, useSyncExternalStore, type SetStateAction } from 'react';

export type XGCSkin = 'dark' | 'light';

export type SkinStorageOptions = {
  defaultSkin?: XGCSkin;
  storageKey?: string;
};

function validSkin(value: string | null): value is XGCSkin {
  return value === 'dark' || value === 'light';
}

const skinSubscribers = new Map<string, Set<() => void>>();
const volatileSkinValues = new Map<string, XGCSkin>();
let listeningForStorage = false;

function emitSkinChange(storageKey: string) {
  skinSubscribers.get(storageKey)?.forEach((listener) => listener());
}

function handleSkinStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== window.localStorage) return;
  if (event.key === null) {
    volatileSkinValues.clear();
    skinSubscribers.forEach((listeners) => listeners.forEach((listener) => listener()));
  } else {
    if (validSkin(event.newValue)) volatileSkinValues.set(event.key, event.newValue);
    else volatileSkinValues.delete(event.key);
    emitSkinChange(event.key);
  }
}

function subscribeToSkin(storageKey: string, listener: () => void) {
  const subscribers = skinSubscribers.get(storageKey) ?? new Set<() => void>();
  subscribers.add(listener);
  skinSubscribers.set(storageKey, subscribers);
  if (!listeningForStorage) {
    window.addEventListener('storage', handleSkinStorage);
    listeningForStorage = true;
  }
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) skinSubscribers.delete(storageKey);
    if (listeningForStorage && !skinSubscribers.size) {
      window.removeEventListener('storage', handleSkinStorage);
      listeningForStorage = false;
    }
  };
}

export function readStoredSkin({ defaultSkin = 'light', storageKey = 'xgc2.skin' }: SkinStorageOptions = {}): XGCSkin {
  if (typeof window === 'undefined') return defaultSkin;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return validSkin(stored) ? stored : volatileSkinValues.get(storageKey) ?? defaultSkin;
  } catch {
    return volatileSkinValues.get(storageKey) ?? defaultSkin;
  }
}

/** Apply before the first React render to avoid a light/dark theme flash. */
export function initializeSkin(options: SkinStorageOptions = {}): XGCSkin {
  const skin = readStoredSkin(options);
  if (typeof document !== 'undefined') document.documentElement.dataset.skin = skin;
  return skin;
}

/** Shared skin state, persistence, and document contract for every product. */
export function useSkin(options: SkinStorageOptions = {}) {
  const { defaultSkin = 'light', storageKey = 'xgc2.skin' } = options;
  const subscribe = useCallback((listener: () => void) => subscribeToSkin(storageKey, listener), [storageKey]);
  const getSnapshot = useCallback(() => readStoredSkin({ defaultSkin, storageKey }), [defaultSkin, storageKey]);
  const getServerSnapshot = useCallback(() => defaultSkin, [defaultSkin]);
  const skin = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSkin = useCallback((next: SetStateAction<XGCSkin>) => {
    const current = readStoredSkin({ defaultSkin, storageKey });
    const resolved = typeof next === 'function' ? next(current) : next;
    if (!validSkin(resolved)) throw new TypeError(`Unsupported XGC skin: ${String(resolved)}`);
    try {
      window.localStorage.setItem(storageKey, resolved);
      volatileSkinValues.delete(storageKey);
    } catch {
      volatileSkinValues.set(storageKey, resolved);
    }
    if (typeof document !== 'undefined') document.documentElement.dataset.skin = resolved;
    emitSkinChange(storageKey);
  }, [defaultSkin, storageKey]);

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
  }, [skin]);

  return [skin, setSkin] as const;
}
