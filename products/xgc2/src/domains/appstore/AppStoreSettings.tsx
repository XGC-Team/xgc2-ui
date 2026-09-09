import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigSection } from '../../components/ConfigSection';
import { FormField } from '../../components/FormPrimitives';
import {
  imagePrefixForAppStoreRegistry,
  selectableAppStoreRegistry,
  withAppStoreRegistry,
  type AppStoreSelectableRegistry,
  type AppStoreSetting,
} from './appStoreModel';

export type AppStoreSettingsLabels = {
  registry: string;
  imagePrefix: string;
  registryAliyun: string;
  registryGhcr: string;
};

const DEFAULT_LABELS: AppStoreSettingsLabels = {
  registry: 'Registry',
  imagePrefix: 'Image prefix',
  registryAliyun: 'Aliyun ACR',
  registryGhcr: 'GitHub Container Registry',
};

export function AppStoreSettings({
  title,
  draft,
  labels,
  onChange,
}: {
  title: string;
  draft: AppStoreSetting;
  labels?: Partial<AppStoreSettingsLabels>;
  onChange: (draft: AppStoreSetting) => void;
}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const registry = selectableAppStoreRegistry(draft.registry);
  // Always show the prefix that matches the selected registry (not a stale stored value).
  const imagePrefix = imagePrefixForAppStoreRegistry(registry);

  return (
    <ConfigSection title={title} dataXgcRole="app-store-settings" dataXgcId="app-store">
      <FormField label={copy.registry} dataXgcRole="app-store-registry-field" dataXgcId="app-store-registry-field">
        <SelectControl
          value={registry}
          options={[
            { value: 'aliyun', label: copy.registryAliyun },
            { value: 'ghcr', label: copy.registryGhcr },
          ]}
          onChange={(next) => onChange(withAppStoreRegistry(draft, next as AppStoreSelectableRegistry))}
          ariaLabel={copy.registry}
          dataXgcRole="app-store-registry" dataXgcId="app-store-registry"
          fill
        />
      </FormField>
      <FormField label={copy.imagePrefix} dataXgcRole="app-store-image-prefix-field" dataXgcId="app-store-image-prefix-field">
        <InputControl
          value={imagePrefix}
          readOnly
          disabled
          aria-label={copy.imagePrefix}
          dataXgcRole="app-store-image-prefix" dataXgcId="app-store-image-prefix"
        />
      </FormField>
    </ConfigSection>
  );
}
