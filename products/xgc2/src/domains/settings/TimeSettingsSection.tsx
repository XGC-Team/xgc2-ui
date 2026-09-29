import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigSection } from '../../components/ConfigSection';
import { FormField } from '../../components/FormPrimitives';
import type { ProductSettingsContext } from '../../shared/productWebComposition';
import { operatorIanaTimeZones,TIMEZONE_PREFERENCE_SYSTEM } from '../../shared/operatorTime';
import { settingsCopy } from './settingsCopy';

export function TimeSettingsSection({
  language,
  timezonePreference = TIMEZONE_PREFERENCE_SYSTEM,
  timezoneResolved = 'UTC',
  onTimezoneChange = () => undefined,
}: ProductSettingsContext) {
  const copy = settingsCopy[language];
  const timezoneOptions = [
    {
      value: TIMEZONE_PREFERENCE_SYSTEM,
      label: timezoneResolved
        ? `${copy.timezoneSystem} (${timezoneResolved})`
        : copy.timezoneSystem,
    },
    ...operatorIanaTimeZones.map((zone) => ({ value: zone,label: zone })),
  ];
  if (timezonePreference && !timezoneOptions.some((item) => item.value === timezonePreference)) {
    timezoneOptions.unshift({ value: timezonePreference,label: timezonePreference });
  }
  return (
    <ConfigSection title={copy.sectionTime} dataXgcRole="station-time-settings" dataXgcId="time">
      <FormField label={copy.timezone} dataXgcRole="station-timezone-setting" dataXgcId="station-timezone-setting">
        <SelectControl
          value={timezonePreference || TIMEZONE_PREFERENCE_SYSTEM}
          options={timezoneOptions}
          onChange={(value) => onTimezoneChange(value || TIMEZONE_PREFERENCE_SYSTEM)}
          ariaLabel={copy.timezone}
          dataXgcRole="station-timezone" dataXgcId="station-timezone"
          fill
        />
      </FormField>
    </ConfigSection>
  );
}
