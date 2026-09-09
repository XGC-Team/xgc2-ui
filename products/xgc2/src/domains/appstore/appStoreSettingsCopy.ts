import type { AppLanguage } from '../../shared/localization/languagePreference';
import type { AppStoreSettingsLabels } from './AppStoreSettings';

export const appStoreSettingsCopy = {
  'en-US': {
    title: 'App store',
    labels: {
      registry: 'Registry',
      imagePrefix: 'Image prefix',
      registryAliyun: 'Aliyun ACR',
      registryGhcr: 'GitHub Container Registry',
    } satisfies AppStoreSettingsLabels,
  },
  'zh-CN': {
    title: '应用商店',
    labels: {
      registry: '镜像仓库',
      imagePrefix: '镜像前缀',
      registryAliyun: '阿里云 ACR',
      registryGhcr: 'GitHub Container Registry',
    } satisfies AppStoreSettingsLabels,
  },
} as const satisfies Record<AppLanguage,{
  title: string;
  labels: AppStoreSettingsLabels;
}>;
