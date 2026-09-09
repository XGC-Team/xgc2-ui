import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigSection } from '../../components/ConfigSection';
import { FormField } from '../../components/FormPrimitives';
import type { ProductSettingsContext } from '../../shared/productWebComposition';
import { isAppLanguage,languageOptions } from '../../shared/localization/languagePreference';
import { settingsCopy } from './settingsCopy';
import { isSkinName,skinOptions } from './settingsModel';

export function AppearanceSettingsSection({
  skin,
  language,
  onLanguageChange,
  onSkinChange,
}: ProductSettingsContext) {
  const copy = settingsCopy[language];
  return (
    <ConfigSection title={copy.sectionAppearance} dataXgcRole="station-skin-settings" dataXgcId="appearance">
      <FormField label={copy.appearanceLanguage} dataXgcRole="station-language-setting" dataXgcId="station-language-setting">
        <SelectControl
          value={language}
          options={languageOptions.map((option) => ({ value: option.id,label: option.label }))}
          onChange={(value) => onLanguageChange(isAppLanguage(value) ? value : 'en-US')}
          ariaLabel={copy.appearanceLanguage}
          dataXgcRole="station-language" dataXgcId="station-language"
          fill
        />
      </FormField>
      <FormField label={copy.appearanceTheme} dataXgcRole="station-theme-setting" dataXgcId="station-theme-setting">
        <SelectControl
          value={skin}
          options={skinOptions.map((option) => ({ value: option.id,label: copy.skins[option.id].name }))}
          onChange={(value) => onSkinChange(isSkinName(value) ? value : 'light')}
          ariaLabel={copy.appearanceTheme}
          dataXgcRole="skin-options" dataXgcId="skin-options"
          fill
        />
      </FormField>
    </ConfigSection>
  );
}
