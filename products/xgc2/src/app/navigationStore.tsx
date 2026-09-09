import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useSkin } from '@xgc2/ui-react';
import { usePersistentState } from '../hooks/usePersistentState';
import { configurationListHash,configurationLocationFromHash,type ConfigurationLocationDomain } from '../shared/configurationLocation';
import { isAppLanguage,type AppLanguage } from '../shared/localization/languagePreference';
import { LanguageProvider } from '../shared/localization/LanguageProvider';
import { useProductWebComposition,type Page } from '../shared/productWebComposition';
import { NavigationContext,type NavigationState } from './navigationContext';
import { validPagesFor,validSectionsFor } from './navigation/navConfig';
import { xgcSkinStorageOptions } from './skin';

function sectionStorageKey(page: Page): string {
  return `xgc.nav.section.${page}`;
}

function readStoredSection(page: Page, valid: ReadonlySet<string>, fallback: string): string {
  try {
    const raw = window.localStorage.getItem(sectionStorageKey(page));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'string' && valid.has(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const composition = useProductWebComposition();
  const validPages = useMemo(() => validPagesFor(composition),[composition]);
  const sectionPages = useMemo(() => {
    const pages = new Set<Page>();
    for (const page of Object.keys(composition.navigation.sections) as Page[]) {
      if ((composition.navigation.sections[page] ?? []).length > 0) pages.add(page);
    }
    for (const page of Object.keys(composition.navigation.sectionDefaults) as Page[]) {
      pages.add(page);
    }
    return pages;
  }, [composition.navigation.sectionDefaults,composition.navigation.sections]);
  const defaultPage = composition.navigation.defaultPage;
  const [page, setPage] = usePersistentState<Page>('xgc.nav.page', defaultPage, isOneOf(validPages));
  const [pageSections, setPageSections] = useState<Partial<Record<Page,string>>>(() => {
    const initial: Partial<Record<Page,string>> = {};
    for (const sectionPage of sectionPages) {
      const valid = validSectionsFor(composition, sectionPage);
      const fallback = composition.navigation.sectionDefaults[sectionPage] ?? [...valid][0] ?? '';
      initial[sectionPage] = readStoredSection(sectionPage, valid, fallback);
    }
    return initial;
  });
  // Product default: English. Operators may switch language in Settings; browser locale is not the default.
  const [language, setLanguage] = usePersistentState<AppLanguage>('xgc-language', 'en-US', isAppLanguage);
  const [targetCoreId, setTargetCoreId] = usePersistentState('xgc.nav.targetCoreId', '', isString);
  const [managedHostId, setManagedHostId] = usePersistentState(
    'xgc.nav.managedHostId',
    'local',
    (value): value is string => typeof value === 'string'
      && (composition.agentLinkComputeTargets || value === 'local'),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState(
    'xgc.nav.sidebarCollapsed',
    false,
    isBoolean,
  );
  const [gcsMode, setGcsMode] = useSharedGcsMode();
  // Shared UI owns persistence and the document-level skin contract.
  const [skin, setSkin] = useSkin(xgcSkinStorageOptions);
  const navigatePage = useCallback((nextPage: Page) => {
    if (nextPage !== 'automations' && isAutomationLocationHash(window.location.hash)) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    const configurationPage = pageForConfigurationLocation(window.location.hash);
    if (configurationPage && nextPage !== configurationPage) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setPage(nextPage);
  }, [setPage]);

  const pageSection = useCallback((sectionPage: Page) => {
    return pageSections[sectionPage]
      ?? composition.navigation.sectionDefaults[sectionPage]
      ?? '';
  }, [composition.navigation.sectionDefaults,pageSections]);

  const setPageSection = useCallback((sectionPage: Page, sectionId: string) => {
    setPageSections((current) => {
      if (current[sectionPage] === sectionId) return current;
      return { ...current, [sectionPage]: sectionId };
    });
  }, []);

  useLayoutEffect(() => {
    const restoreDeepLocation = () => {
      const assignPage = (nextPage: Page) => {
        setPage(nextPage);
      };
      const targetId = automationTargetFromHash(window.location.hash);
      if (targetId) {
        if (!validPages.has('automations')) {
          clearDeepLocation();
          assignPage(defaultPage);
          return;
        }
        assignPage('automations');
        if (!composition.agentLinkComputeTargets
          && targetId !== 'local'
          && !targetId.startsWith('core:')) {
          replaceAutomationTargetHash('local');
          setManagedHostId('local');
          setTargetCoreId('');
          return;
        }
        if (targetId === 'local') {
          setManagedHostId('local');
          setTargetCoreId('');
        } else if (targetId.startsWith('core:')) {
          setManagedHostId('local');
          setTargetCoreId(targetId.slice('core:'.length));
        } else {
          setManagedHostId(targetId);
          setTargetCoreId('');
        }
        return;
      }
      const configurationLocation = configurationLocationFromHash(window.location.hash);
      if (configurationLocation) {
        if (!configurationLocation.resourceId && window.location.hash !== configurationListHash(configurationLocation.domain)) {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${configurationListHash(configurationLocation.domain)}`);
        }
        const configurationPage = configurationPageByDomain[configurationLocation.domain];
        if (!validPages.has(configurationPage)) {
          clearDeepLocation();
          assignPage(defaultPage);
          return;
        }
        assignPage(configurationPage);
      } else if (/^#\/assets(?:\/.*)?$/.test(window.location.hash)) {
        clearDeepLocation();
        assignPage(defaultPage);
      }
    };
    restoreDeepLocation();
    const onHashChange = () => restoreDeepLocation();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [composition.agentLinkComputeTargets,defaultPage,setManagedHostId,setPage,setTargetCoreId,validPages]);

  useEffect(() => {
    if (!validPages.has(page)) setPage(defaultPage);
  }, [defaultPage,page,setPage,validPages]);

  useEffect(() => {
    setPageSections((current) => {
      let changed = false;
      const next: Partial<Record<Page,string>> = { ...current };
      for (const sectionPage of sectionPages) {
        const valid = validSectionsFor(composition, sectionPage);
        const fallback = composition.navigation.sectionDefaults[sectionPage] ?? [...valid][0] ?? '';
        const active = next[sectionPage];
        if (!active || (valid.size > 0 && !valid.has(active))) {
          next[sectionPage] = fallback;
          changed = true;
        }
      }
      for (const key of Object.keys(next) as Page[]) {
        if (!sectionPages.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [composition,sectionPages]);

  useEffect(() => {
    for (const sectionPage of sectionPages) {
      const value = pageSections[sectionPage];
      if (value === undefined) continue;
      window.localStorage.setItem(sectionStorageKey(sectionPage), JSON.stringify(value));
    }
  }, [pageSections,sectionPages]);

  useEffect(() => {
    document.documentElement.lang = language === 'zh-CN' ? 'zh-CN' : 'en';
  }, [language]);

  const value = useMemo<NavigationState>(() => ({
    page,
    setPage,
    navigatePage,
    pageSection,
    setPageSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    skin,
    setSkin,
    language,
    setLanguage,
    gcsMode,
    setGcsMode,
    targetCoreId,
    setTargetCoreId,
    managedHostId,
    setManagedHostId,
  }), [
    gcsMode,
    language,
    managedHostId,
    navigatePage,
    page,
    pageSection,
    setLanguage,
    setGcsMode,
    setManagedHostId,
    setPage,
    setPageSection,
    setSidebarCollapsed,
    setSkin,
    setTargetCoreId,
    sidebarCollapsed,
    skin,
    targetCoreId,
  ]);

  return (
    <NavigationContext.Provider value={value}>
      <LanguageProvider language={language}>{children}</LanguageProvider>
    </NavigationContext.Provider>
  );
}

function isOneOf<T extends string>(values: ReadonlySet<T>) {
  return (value: unknown): value is T => typeof value === 'string' && values.has(value as T);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

const EXPERIMENT_GCS_MODE_STORAGE_KEY = 'xgc.nav.experimentGcsMode';

function useSharedGcsMode() {
  const [value,setValue] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(EXPERIMENT_GCS_MODE_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as unknown;
      return isBoolean(parsed) ? parsed : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== EXPERIMENT_GCS_MODE_STORAGE_KEY) return;
      if (event.newValue === null) {
        setValue(false);
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue) as unknown;
        if (isBoolean(parsed)) setValue(parsed);
      } catch {
        return;
      }
    };
    window.addEventListener('storage',handleStorage);
    return () => window.removeEventListener('storage',handleStorage);
  },[]);

  useEffect(() => {
    window.localStorage.setItem(EXPERIMENT_GCS_MODE_STORAGE_KEY,JSON.stringify(value));
  },[value]);

  return [value,setValue] as const;
}

function isAutomationLocationHash(hash: string) {
  return /^#\/automations\/[^/]+\/workflows(?:\/.*)?$/.test(hash);
}

function clearDeepLocation() {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function automationTargetFromHash(hash: string) {
  const match = /^#\/automations\/([^/]+)\/workflows(?:\/.*)?$/.exec(hash);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}

function replaceAutomationTargetHash(targetId: string) {
  const nextHash = window.location.hash.replace(
    /^(#\/automations\/)[^/]+(\/workflows(?:\/.*)?)$/,
    `$1${encodeURIComponent(targetId)}$2`,
  );
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
}

function pageForConfigurationLocation(hash: string): Page | undefined {
  const domain = configurationLocationFromHash(hash)?.domain;
  return domain ? configurationPageByDomain[domain] : undefined;
}

const configurationPageByDomain: Record<ConfigurationLocationDomain,Page> = {
  experiment: 'experiment',
  robotAsset: 'robotAssets',
};
