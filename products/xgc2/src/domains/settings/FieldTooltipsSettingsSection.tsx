import { useState } from 'react';
import { ConfigSection } from '../../components/ConfigSection';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import type { ProductSettingsContext } from '../../shared/productWebComposition';
import {
  readFieldTooltipsEnabled,
  writeFieldTooltipsEnabled,
} from '../../shared/preferences/fieldTooltipPreference';
import { settingsCopy } from './settingsCopy';

export function FieldTooltipsSettingsSection({ language }: ProductSettingsContext) {
  const [enabled,setEnabled] = useState(readFieldTooltipsEnabled);
  const copy = settingsCopy[language];
  return (
    <ConfigSection
      title={copy.sectionFieldTooltips}
      dataXgcRole="station-field-tooltips-settings"
      dataXgcId="field-tooltips"
    >
      <FormField label={copy.appearanceFieldTooltips} dataXgcRole="station-field-tooltips-setting" dataXgcId="station-field-tooltips-setting">
        <SwitchControl
          ariaLabel={copy.appearanceFieldTooltips}
          checked={enabled}
          description={enabled ? 'On' : 'Off'}
          onChange={(next) => {
            setEnabled(next);
            writeFieldTooltipsEnabled(next);
          }}
          dataXgcRole="station-field-tooltips" dataXgcId="station-field-tooltips"
        />
      </FormField>
    </ConfigSection>
  );
}
