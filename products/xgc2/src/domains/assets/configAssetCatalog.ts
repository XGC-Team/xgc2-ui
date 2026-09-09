import {
  CONFIG_SYSTEM_FOLDER_ID,
  CONFIG_TEMPLATES_FOLDER_ID,
  CONFIG_USER_FOLDER_ID,
  configResourceFolderId,
} from '../../shared/configResourceProtection';

export type ConfigAssetNamespace = {
  namespaceId: string;
  name: string;
  parentNamespaceId?: string;
};

export type ConfigAssetViewMode = 'folder' | 'list';
export type ConfigAssetSortMode = 'updated-desc' | 'updated-asc' | 'name-asc';

export type ConfigAssetProtectedCatalogFilter = {
  hideSystem?: boolean;
  hideTemplates?: boolean;
};

type ConfigAssetCatalogItem = {
  head: {
    namespaceId?: string;
    system?: boolean;
    updatedAt: string;
  };
  spec: {
    name: string;
    description: string;
    tags: string[];
  };
};

export type ConfigAssetCatalogFolder<Item> = {
  id: string;
  title: string;
  items: Item[];
  isSystem?: boolean;
  readOnly?: boolean;
};

export type ConfigAssetCatalog<Item> = {
  tags: string[];
  effectiveTagFilter: string;
  visibleAssets: Item[];
  folders: Array<ConfigAssetCatalogFolder<Item>>;
};

export type ConfigAssetCatalogProjection = {
  name: string;
  description: string;
  tags: readonly string[];
  updatedAt: string;
  folderId: string;
  searchTerms?: readonly string[];
};

export type ConfigAssetCatalogFolderText = {
  system?: string;
  templates: string;
  user: string;
  namespace: (path: string) => string;
};

/** Fixed catalog roots that replace System / Templates / User + namespaces. */
export type ConfigAssetCatalogRootFolder = {
  id: string;
  title: string;
  isSystem?: boolean;
  readOnly?: boolean;
};

export function configAssetNamespacePath(namespaces: readonly ConfigAssetNamespace[], namespaceId: string) {
  const byId = new Map(namespaces.map((namespace) => [namespace.namespaceId,namespace]));
  const path: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(namespaceId);

  while (current && !visited.has(current.namespaceId)) {
    visited.add(current.namespaceId);
    path.unshift(current.name);
    current = current.parentNamespaceId ? byId.get(current.parentNamespaceId) : undefined;
  }

  return path.join(' / ');
}

export function configAssetFolderTitle(namespaces: readonly ConfigAssetNamespace[], namespaceId: string) {
  const path = configAssetNamespacePath(namespaces, namespaceId);
  return path ? `User scripts / ${path}` : 'User scripts';
}

export function sortConfigAssetNamespaces<Namespace extends ConfigAssetNamespace>(namespaces: readonly Namespace[]) {
  return [...namespaces].sort((left, right) => (
    configAssetNamespacePath(namespaces, left.namespaceId)
      .localeCompare(configAssetNamespacePath(namespaces, right.namespaceId))
  ));
}

export { parseConfigAssetTags } from '../../shared/configAssetTags';

export function buildConfigAssetCatalog<
  Item extends ConfigAssetCatalogItem,
  Namespace extends ConfigAssetNamespace,
>({
  assets,
  namespaces,
  search,
  tagFilter,
  sortMode,
  viewMode,
  allAssetsTitle,
  folderText,
  hideSystem,
  hideTemplates,
}: {
  assets: readonly Item[];
  namespaces: readonly Namespace[];
  search: string;
  tagFilter: string;
  sortMode: ConfigAssetSortMode;
  viewMode: ConfigAssetViewMode;
  allAssetsTitle: string;
  folderText?: ConfigAssetCatalogFolderText;
  hideSystem?: boolean;
  hideTemplates?: boolean;
}): ConfigAssetCatalog<Item> {
  return buildProjectedConfigAssetCatalog({
    items: assets,
    namespaces,
    search,
    tagFilter,
    sortMode,
    viewMode,
    allAssetsTitle,
    folderText,
    hideSystem,
    hideTemplates,
    project: (asset) => ({
      name: asset.spec.name,
      description: asset.spec.description,
      tags: asset.spec.tags,
      updatedAt: asset.head.updatedAt,
      folderId: configResourceFolderId(asset.head, asset.spec.tags),
    }),
  });
}

export function buildProjectedConfigAssetCatalog<
  Item,
  Namespace extends ConfigAssetNamespace,
>({
  items,
  namespaces,
  search,
  tagFilter,
  sortMode,
  viewMode,
  allAssetsTitle,
  project,
  folderText = defaultConfigAssetCatalogFolderText,
  rootFolders,
  hideSystem = false,
  hideTemplates = false,
}: {
  items: readonly Item[];
  namespaces: readonly Namespace[];
  search: string;
  tagFilter: string;
  sortMode: ConfigAssetSortMode;
  viewMode: ConfigAssetViewMode;
  allAssetsTitle: string;
  project: (item: Item) => ConfigAssetCatalogProjection;
  folderText?: ConfigAssetCatalogFolderText;
  /** When set, folder view uses these fixed roots only (no System / Templates / User / namespaces). */
  rootFolders?: readonly ConfigAssetCatalogRootFolder[];
  hideSystem?: boolean;
  hideTemplates?: boolean;
}): ConfigAssetCatalog<Item> {
  const projectedItems = items.map((item) => ({ item,projection: project(item) }));
  const hiddenFolderIds = hiddenProtectedFolderIds({ hideSystem,hideTemplates });
  const protectionVisibleItems = projectedItems.filter(({ projection }) => !hiddenFolderIds.has(projection.folderId));
  const tags = Array.from(new Set(protectionVisibleItems.flatMap(({ projection }) => projection.tags))).sort();
  const effectiveTagFilter = tagFilter === 'all' || tags.includes(tagFilter) ? tagFilter : 'all';
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = protectionVisibleItems
    .filter(({ projection }) => {
      const matchesTag = effectiveTagFilter === 'all' || projection.tags.includes(effectiveTagFilter);
      const matchesSearch = !normalizedSearch || (projection.searchTerms ?? [projection.name,projection.description,...projection.tags])
        .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
      return matchesTag && matchesSearch;
    })
    .sort((left, right) => {
      if (sortMode === 'name-asc') return left.projection.name.localeCompare(right.projection.name);
      if (sortMode === 'updated-asc') return left.projection.updatedAt.localeCompare(right.projection.updatedAt);
      return right.projection.updatedAt.localeCompare(left.projection.updatedAt);
    });
  const visibleAssets = visibleItems.map(({ item }) => item);

  if (viewMode === 'list') {
    return {
      tags,
      effectiveTagFilter,
      visibleAssets,
      folders: visibleAssets.length > 0
        ? [{ id: 'all',title: allAssetsTitle,items: visibleAssets }]
        : [],
    };
  }

  const grouped = new Map<string,Item[]>();
  visibleItems.forEach(({ item,projection }) => {
    const folderId = projection.folderId;
    const items = grouped.get(folderId);
    if (items) items.push(item);
    else grouped.set(folderId, [item]);
  });

  if (rootFolders) {
    return {
      tags,
      effectiveTagFilter,
      visibleAssets,
      folders: rootFolders.map((folder) => ({
        id: folder.id,
        title: folder.title,
        items: grouped.get(folder.id) ?? [],
        isSystem: folder.isSystem,
        readOnly: folder.readOnly,
      })),
    };
  }

  return {
    tags,
    effectiveTagFilter,
    visibleAssets,
    folders: [
      ...(!hideSystem ? [{
        id: CONFIG_SYSTEM_FOLDER_ID,
        title: folderText.system ?? defaultConfigAssetCatalogFolderText.system,
        items: grouped.get(CONFIG_SYSTEM_FOLDER_ID) ?? [],
        isSystem: true,
        readOnly: true,
      }] : []),
      ...(!hideTemplates ? [{
        id: CONFIG_TEMPLATES_FOLDER_ID,
        title: folderText.templates,
        items: grouped.get(CONFIG_TEMPLATES_FOLDER_ID) ?? [],
        readOnly: true,
      }] : []),
      { id: CONFIG_USER_FOLDER_ID,title: folderText.user,items: grouped.get(CONFIG_USER_FOLDER_ID) ?? [] },
      ...sortConfigAssetNamespaces(namespaces).map((namespace) => ({
        id: namespace.namespaceId,
        title: folderText.namespace(configAssetNamespacePath(namespaces, namespace.namespaceId)),
        items: grouped.get(namespace.namespaceId) ?? [],
      })),
    ],
  };
}

function hiddenProtectedFolderIds({ hideSystem,hideTemplates }: ConfigAssetProtectedCatalogFilter) {
  const folderIds = new Set<string>();
  if (hideSystem) folderIds.add(CONFIG_SYSTEM_FOLDER_ID);
  if (hideTemplates) folderIds.add(CONFIG_TEMPLATES_FOLDER_ID);
  return folderIds;
}

const defaultConfigAssetCatalogFolderText: Required<ConfigAssetCatalogFolderText> = {
  system: 'System scripts',
  templates: 'Templates',
  user: 'User scripts',
  namespace: (path) => path ? `User scripts / ${path}` : 'User scripts',
};
