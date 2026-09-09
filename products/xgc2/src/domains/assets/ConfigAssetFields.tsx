import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import { ResourceMetadataFields,type ResourceMetadataValue } from '../../components/ResourceMetadataFields';
import { configAssetNamespacePath,type ConfigAssetNamespace } from './configAssetCatalog';

export function ConfigAssetFields({
  metadata,
  onMetadataChange,
  namespaces,
  namespaceId,
  onNamespaceChange,
  rolePrefix,
  folderLabel = 'Folder',
  userFolderLabel = 'User scripts',
  showDetails = true,
  autoFocusName = false,
  namePlaceholder,
  descriptionPlaceholder,
  tagsPlaceholder,
}: {
  metadata: ResourceMetadataValue;
  onMetadataChange: (value: ResourceMetadataValue) => void;
  namespaces: ConfigAssetNamespace[];
  namespaceId: string;
  onNamespaceChange: (namespaceId: string) => void;
  rolePrefix: string;
  folderLabel?: string;
  /** Root option for the folder combobox (default catalog root). */
  userFolderLabel?: string;
  showDetails?: boolean;
  autoFocusName?: boolean;
  namePlaceholder?: string;
  descriptionPlaceholder?: string;
  tagsPlaceholder?: string;
}) {
  return (
    <ResourceMetadataFields
      value={metadata}
      onChange={onMetadataChange}
      rolePrefix={rolePrefix}
      autoFocusName={autoFocusName}
      showDetails={showDetails}
      namePlaceholder={namePlaceholder}
      descriptionPlaceholder={descriptionPlaceholder}
      tagsPlaceholder={tagsPlaceholder}
      betweenNameAndDetails={(
        <FormField label={folderLabel} dataXgcRole={`${rolePrefix}-folder-field`} dataXgcId={`${rolePrefix}-folder-field`}>
          <SelectControl
            fill
            value={namespaceId}
            options={[
              { value: '',label: userFolderLabel },
              ...namespaces.map((namespace) => {
                const path = configAssetNamespacePath(namespaces, namespace.namespaceId);
                return {
                  value: namespace.namespaceId,
                  label: path ? `${userFolderLabel} / ${path}` : userFolderLabel,
                };
              }),
            ]}
            onChange={onNamespaceChange}
            ariaLabel={folderLabel}
            dataXgcRole={`${rolePrefix}-folder`} dataXgcId={`${rolePrefix}-folder`}
          />
        </FormField>
      )}
    />
  );
}
