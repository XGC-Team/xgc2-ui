import type { ConfigAssetCatalogControlText } from './ConfigAssetCatalogControls';
import type { ConfigAssetCatalogFolderText } from './configAssetCatalog';
import { useLocalizedText,type LocalizedText,type MessageCatalog } from '../../shared/localization/localizedText';

export const assetsZhMessages: MessageCatalog = {
  'All calibrations': '全部标定',
  'All robots': '全部机器人',
  'All user scripts': '全部用户脚本',
  'Check management reachability': '检测管理地址可达性',
  'Checking management reachability…': '正在检测管理地址可达性…',
  'Filter calibrations by tag': '按标签筛选标定',
  'Filter user scripts by tag': '按标签筛选用户脚本',
  'Loading calibration': '正在加载标定',
  'Loading calibrations…': '正在加载标定…',
  'Loading user script': '正在加载用户脚本',
  'Loading user scripts…': '正在加载用户脚本…',
  'Last management reachability check': '上次管理地址可达性检测',
  'Management address reachable': '管理地址可达',
  'Management address unreachable': '管理地址不可达',
  'Management reachability check failed': '管理地址可达性检测失败',
  'Unknown error': '未知错误',
  'Search calibrations and folders': '搜索标定和文件夹',
  'Search robots': '搜索机器人',
  'Search user scripts and folders': '搜索用户脚本和文件夹',
  'Sort calibrations': '标定排序',
  'Sort robots': '机器人排序',
  'Sort user scripts': '用户脚本排序',
  'User script unavailable': '用户脚本不可用',
};

export function useAssetsText() {
  return useLocalizedText(assetsZhMessages);
}

/** Shared catalog chrome (tags / view / sort) — falls back to commonZhMessages for base labels. */
export function configAssetCatalogControlText(
  t: LocalizedText,
  domain: { filterByTag: string; sort: string },
): ConfigAssetCatalogControlText {
  return {
    allTags: t('All tags'),
    folderView: t('Folder view'),
    listView: t('List view'),
    recentlyUpdated: t('Recently updated'),
    oldestUpdated: t('Oldest updated'),
    nameAscending: t('Name A-Z'),
    filterByTag: t(domain.filterByTag),
    sort: t(domain.sort),
  };
}

/** User-script catalog folders. Functional names only — same as the Terminal rail. */
export function configAssetFolderText(t: LocalizedText): ConfigAssetCatalogFolderText {
  return {
    system: t('System scripts'),
    templates: t('Templates'),
    user: t('Ungrouped'),
    namespace: (path) => path || t('Ungrouped'),
  };
}
