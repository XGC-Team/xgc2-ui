import { createContext,useContext,useRef,useSyncExternalStore } from 'react';
import type { SkinName } from '../domains/settings/settingsModel';
import type { AppLanguage } from '../shared/localization/languagePreference';
import type { Page } from './navigation/navConfig';

export type NavigationState = {
  page: Page;
  setPage: (page: Page) => void;
  navigatePage: (page: Page) => void;
  /** Active secondary section for any composition page that declares sections. */
  pageSection: (page: Page) => string;
  setPageSection: (page: Page, sectionId: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  skin: SkinName;
  setSkin: (skin: SkinName) => void;
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  gcsMode: boolean;
  setGcsMode: (value: boolean | ((current: boolean) => boolean)) => void;
  targetCoreId: string;
  setTargetCoreId: (id: string) => void;
  managedHostId: string;
  setManagedHostId: (id: string) => void;
};

/**
 * Navigation state behind a subscription. Every parked route reads it, so a
 * single Context value would re-render all of them on any change (a sidebar
 * toggle re-rendered every mounted page); consumers select what they read.
 */
export type NavigationStore = {
  get: () => NavigationState;
  subscribe: (listener: () => void) => () => void;
};

export type NavigationPublisher = NavigationStore & {
  publish: (state: NavigationState) => void;
};

export function createNavigationStore(initial: NavigationState): NavigationPublisher {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(state) {
      if (state === current) return;
      current = state;
      listeners.forEach((listener) => listener());
    },
  };
}

export const NavigationContext = createContext<NavigationStore | null>(null);

/** The whole navigation state: re-renders on every navigation change. */
export function useNavigation(): NavigationState;
/**
 * Only the selected navigation facts: re-renders when the selection changes
 * (shallowly, so a selector may return a small object of fields).
 */
export function useNavigation<T>(select: (state: NavigationState) => T): T;
export function useNavigation<T>(select?: (state: NavigationState) => T): T | NavigationState {
  const store = useContext(NavigationContext);
  if (!store) throw new Error('useNavigation must be used within NavigationProvider');
  const last = useRef<{ state: NavigationState;select: unknown;value: unknown } | undefined>(undefined);
  const read = () => {
    const state = store.get();
    if (!select) return state;
    const cached = last.current;
    if (cached && cached.state === state && cached.select === select) return cached.value as T;
    const next = select(state);
    const value = cached && shallowEqual(cached.value,next) ? cached.value as T : next;
    last.current = { state,select,value };
    return value;
  };
  return useSyncExternalStore(store.subscribe,read,read);
}

function shallowEqual(left: unknown,right: unknown) {
  if (Object.is(left,right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
    || Array.isArray(left) || Array.isArray(right)) return false;
  const leftRecord = left as Record<string,unknown>;
  const rightRecord = right as Record<string,unknown>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length
    && keys.every((key) => Object.hasOwn(rightRecord,key) && Object.is(leftRecord[key],rightRecord[key]));
}
