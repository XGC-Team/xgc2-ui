export type AppLanguage = 'en-US' | 'zh-CN';

export const languageOptions: ReadonlyArray<{ id: AppLanguage; label: string }> = [
  { id: 'en-US',label: 'English' },
  { id: 'zh-CN',label: '简体中文' },
];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'en-US' || value === 'zh-CN';
}

export function browserLanguagePreference(): AppLanguage {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}
