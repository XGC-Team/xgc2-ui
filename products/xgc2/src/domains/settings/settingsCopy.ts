import type { AppLanguage } from '../../shared/localization/languagePreference';

export const settingsCopy = {
  'en-US': {
      sectionAppearance: 'Appearance',
      sectionTime: 'Time',
      sectionFieldTooltips: 'Field help',
      sectionTools: 'Tools',
      appearanceLanguage: 'Language',
      appearanceTheme: 'Theme',
      timezone: 'Timezone',
      timezoneSystem: 'System',
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
      sectionTime: '时间',
      sectionFieldTooltips: '字段帮助',
      sectionTools: '工具',
      appearanceLanguage: '语言',
      appearanceTheme: '主题',
      timezone: '时区',
      timezoneSystem: '跟随系统',
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
  sectionTime: string;
  sectionFieldTooltips: string;
  sectionTools: string;
  appearanceLanguage: string;
  appearanceTheme: string;
  timezone: string;
  timezoneSystem: string;
  appearanceFieldTooltips: string;
  toolsTextSelection: string;
  toolsMarkPromptDock: string;
  skins: { dark: { name: string }; light: { name: string } };
}>;
