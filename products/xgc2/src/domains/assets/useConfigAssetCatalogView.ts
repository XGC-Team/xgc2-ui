import { useCallback,useState } from 'react';
import type { ConfigAssetSortMode,ConfigAssetViewMode } from './configAssetCatalog';

export type ConfigAssetCatalogView = {
  search: string;
  setSearch: (value: string) => void;
  tagFilter: string;
  setTagFilter: (value: string) => void;
  viewMode: ConfigAssetViewMode;
  setViewMode: (value: ConfigAssetViewMode) => void;
  sortMode: ConfigAssetSortMode;
  setSortMode: (value: ConfigAssetSortMode) => void;
  hideSystem: boolean;
  setHideSystem: (value: boolean) => void;
  hideTemplates: boolean;
  setHideTemplates: (value: boolean) => void;
  collapsedFolders: string[];
  toggleFolder: (folderId: string) => void;
};

export function useConfigAssetCatalogView(options: {
  hideSystem?: boolean;
  hideTemplates?: boolean;
  viewMode?: ConfigAssetViewMode;
} = {}): ConfigAssetCatalogView {
  const [search,setSearch] = useState('');
  const [tagFilter,setTagFilter] = useState('all');
  const [viewMode,setViewMode] = useState<ConfigAssetViewMode>(options.viewMode ?? 'folder');
  const [sortMode,setSortMode] = useState<ConfigAssetSortMode>('updated-desc');
  const [hideSystem,setHideSystem] = useState(options.hideSystem ?? true);
  const [hideTemplates,setHideTemplates] = useState(options.hideTemplates ?? false);
  const [collapsedFolders,setCollapsedFolders] = useState<string[]>([]);
  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((folders) => folders.includes(folderId)
      ? folders.filter((item) => item !== folderId)
      : [...folders,folderId]);
  }, []);

  return {
    search,
    setSearch,
    tagFilter,
    setTagFilter,
    viewMode,
    setViewMode,
    sortMode,
    setSortMode,
    hideSystem,
    setHideSystem,
    hideTemplates,
    setHideTemplates,
    collapsedFolders,
    toggleFolder,
  };
}
