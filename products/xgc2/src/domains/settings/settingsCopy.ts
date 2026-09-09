import type { AppLanguage } from '../../shared/localization/languagePreference';

export const settingsCopy = {
  'en-US': {
      sectionAppearance: 'Appearance',
      sectionFieldTooltips: 'Field help',
      sectionTools: 'Tools',
      appearanceLanguage: 'Language',
      appearanceTheme: 'Theme',
      appearanceFieldTooltips: 'Field help tooltips',
      toolsTextSelection: 'Select and copy page text',
      toolsMarkPromptDock: 'Mark prompt hover control',
      skins: {
        dark: { name: 'Dark' },
        light: { name: 'Light' },
      },
    },
  'zh-CN': {
      sectionAppearance: '外观',
      sectionFieldTooltips: '字段帮助',
      sectionTools: '工具',
      appearanceLanguage: '语言',
      appearanceTheme: '主题',
      appearanceFieldTooltips: '字段帮助提示',
      toolsTextSelection: '选择并复制页面文字',
      toolsMarkPromptDock: 'Mark Prompt 悬停控件',
      skins: {
        dark: { name: '深色' },
        light: { name: '浅色' },
      },
    },
} as const satisfies Record<AppLanguage,{
  sectionAppearance: string;
  sectionFieldTooltips: string;
  sectionTools: string;
  appearanceLanguage: string;
  appearanceTheme: string;
  appearanceFieldTooltips: string;
  toolsTextSelection: string;
  toolsMarkPromptDock: string;
  skins: { dark: { name: string }; light: { name: string } };
}>;
