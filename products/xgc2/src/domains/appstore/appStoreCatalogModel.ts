import type { AppStoreApp,AppStoreDetail,AppStoreInstall } from './appStoreModel';

export type AppStoreTab = 'available' | 'installed' | 'updates';
export type AppStoreCatalogTab = AppStoreTab;
export type AppStoreCategory = 'all' | 'simulation' | 'deployment' | 'development';

export type AppStoreFilters = {
  query: string;
  tag: string;
  category: AppStoreCategory;
};

export function appCategoryLabel(type: string) {
  if (type === 'simulation') return 'Simulation';
  if (type === 'deployment') return 'Deployment';
  if (type === 'development') return 'Development';
  return type || 'App';
}

export function isInstalledApp(install: AppStoreInstall) {
  return ['running', 'stopped', 'installing', 'upgrading', 'error'].includes(install.status);
}

export function isVisibleInstallState(install: AppStoreInstall) {
  return isInstalledApp(install);
}

export function isBlockingInstallState(install: AppStoreInstall) {
  return ['running', 'stopped', 'installing', 'upgrading'].includes(install.status);
}

export function latestAppDetail(details: AppStoreDetail[], appKey: string) {
  return details.find((detail) => detail.appKey === appKey && detail.status === 'normal')
    ?? details.find((detail) => detail.appKey === appKey);
}

export function appDetailForVersion(details: AppStoreDetail[], appKey: string, version?: string) {
  return details.find((detail) => detail.appKey === appKey && detail.version === version)
    ?? latestAppDetail(details, appKey);
}

export function projectAppStoreCatalog({
  apps,
  details,
  installed,
  filters,
}: {
  apps: AppStoreApp[];
  details: AppStoreDetail[];
  installed: AppStoreInstall[];
  filters: AppStoreFilters;
}) {
  const activeInstalls = installed.filter(isInstalledApp);
  const visibleInstallStateByKey = new Map(installed.filter(isVisibleInstallState).map((item) => [item.appKey, item]));
  const blockingInstallByKey = new Map(installed.filter(isBlockingInstallState).map((item) => [item.appKey, item]));
  const presentCategories = new Set(apps.map((app) => app.type));
  const categories = (['simulation', 'deployment', 'development'] as AppStoreCategory[])
    .filter((item) => presentCategories.has(item));
  const tags = Array.from(new Set(apps.flatMap((app) => app.tags))).sort();
  const normalizedQuery = filters.query.trim().toLowerCase();
  const filteredApps = apps.filter((app) => {
    const haystack = `${app.name} ${app.key} ${app.description}`.toLowerCase();
    return haystack.includes(normalizedQuery)
      && (filters.category === 'all' || app.type === filters.category)
      && (filters.tag === 'all' || app.tags.includes(filters.tag));
  });
  const availableApps = filteredApps.filter((app) => !blockingInstallByKey.has(app.key));
  const updateApps = filteredApps.filter((app) => {
    const install = blockingInstallByKey.get(app.key);
    const latest = latestAppDetail(details, app.key);
    return Boolean(install && latest && install.version !== latest.version);
  });
  const hasFilters = normalizedQuery !== '' || filters.category !== 'all' || filters.tag !== 'all';
  const emptyReason = apps.length === 0 ? 'empty' : filteredApps.length === 0 ? 'filtered' : 'installed';

  return {
    activeInstalls,
    availableApps,
    blockingInstallByKey,
    categories,
    emptyReason,
    hasFilters,
    tags,
    updateApps,
    visibleInstallStateByKey,
  };
}
