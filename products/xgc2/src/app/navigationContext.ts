import { createContext,useContext } from 'react';
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

export const NavigationContext = createContext<NavigationState | null>(null);

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be used within NavigationProvider');
  return value;
}
