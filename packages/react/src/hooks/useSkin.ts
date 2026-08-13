import { useEffect, useState } from 'react';

export type XGCSkin = 'dark' | 'light';

export type SkinStorageOptions = {
  defaultSkin?: XGCSkin;
  storageKey?: string;
};

function validSkin(value: string | null): value is XGCSkin {
  return value === 'dark' || value === 'light';
}

export function readStoredSkin({ defaultSkin = 'light', storageKey = 'xgc2.skin' }: SkinStorageOptions = {}): XGCSkin {
  if (typeof window === 'undefined') return defaultSkin;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return validSkin(stored) ? stored : defaultSkin;
  } catch {
    return defaultSkin;
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
  const [skin, setSkin] = useState<XGCSkin>(() => readStoredSkin({ defaultSkin, storageKey }));

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try {
      window.localStorage.setItem(storageKey, skin);
    } catch {
      // Storage can be blocked; the active document theme still remains valid.
    }
  }, [skin, storageKey]);

  return [skin, setSkin] as const;
}
