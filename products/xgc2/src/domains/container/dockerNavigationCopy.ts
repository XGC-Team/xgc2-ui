import type { AppLanguage } from '../../shared/localization/languagePreference';

export const dockerNavigationCopy = {
  'en-US': {
    navLabel: 'Containers',
    tabContainers: 'Containers',
    tabCompose: 'Compose',
    tabImages: 'Images',
    tabNetworks: 'Networks',
    tabVolumes: 'Volumes',
  },
  'zh-CN': {
    navLabel: '容器',
    tabContainers: '容器',
    tabCompose: 'Compose',
    tabImages: '镜像',
    tabNetworks: '网络',
    tabVolumes: '卷',
  },
} as const satisfies Record<AppLanguage,{
  navLabel: string;
  tabContainers: string;
  tabCompose: string;
  tabImages: string;
  tabNetworks: string;
  tabVolumes: string;
}>;
