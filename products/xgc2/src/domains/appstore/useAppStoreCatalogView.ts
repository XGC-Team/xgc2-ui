import { useMemo,useState } from 'react';
import {
  projectAppStoreCatalog,
  type AppStoreTab,
} from './appStoreCatalogModel';
import type { AppStoreApp,AppStoreDetail,AppStoreInstall } from './appStoreModel';

export function useAppStoreCatalogView({
  apps,details,installed,initialSnapshotLoading,syncing,sync,
}: {
  apps: AppStoreApp[];
  details: AppStoreDetail[];
  installed: AppStoreInstall[];
  initialSnapshotLoading: boolean;
  syncing: boolean;
  sync: () => Promise<unknown>;
}) {
  const [tab, setTab] = useState<AppStoreTab>('available');
  const [query, setQuery] = useState('');
  const filters = useMemo(() => ({ query,tag: 'all' as const,category: 'all' as const }), [query]);
  const catalog = useMemo(() => projectAppStoreCatalog({
    apps,
    details,
    installed,
    filters,
  }), [apps,details,filters,installed]);
  const catalogState = initialSnapshotLoading
    ? 'loading'
    : syncing && catalog.emptyReason === 'empty'
      ? 'syncing'
      : catalog.emptyReason;

  function clearFilters() {
    setQuery('');
  }

  async function syncCatalog() {
    await sync();
    clearFilters();
  }

  return {
    tab,
    setTab,
    query,
    setQuery,
    catalog,
    catalogState,
    clearFilters,
    syncCatalog,
  };
}
