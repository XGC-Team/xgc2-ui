import type { AppLanguage } from '../../shared/localization/languagePreference';

export const appStoreNavigationCopy = {
  'en-US': {
    navLabel: 'App store',
  },
  'zh-CN': {
    navLabel: '应用商店',
  },
} as const satisfies Record<AppLanguage,{
  navLabel: string;
}>;
