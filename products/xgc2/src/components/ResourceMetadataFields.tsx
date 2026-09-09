import type { ReactNode } from 'react';
import { InputControl,TextareaControl } from './controls/TextControls';
import { FormField } from './FormPrimitives';

export type ResourceMetadataValue = {
  name: string;
  description: string;
  tags: string;
};

export function ResourceMetadataFields({
  value,
  onChange,
  rolePrefix,
  labels = {},
  namePlaceholder,
  descriptionPlaceholder,
  tagsPlaceholder,
  autoFocusName = false,
  showDetails = true,
  betweenNameAndDetails,
  afterDetails,
}: {
  value: ResourceMetadataValue;
  onChange: (value: ResourceMetadataValue) => void;
  rolePrefix: string;
  labels?: Partial<Record<keyof ResourceMetadataValue,string>>;
  namePlaceholder?: string;
  descriptionPlaceholder?: string;
  tagsPlaceholder?: string;
  autoFocusName?: boolean;
  showDetails?: boolean;
  /** Inserted between name and description/tags (legacy slot). */
  betweenNameAndDetails?: ReactNode;
  /** Inserted after name + description + tags (preferred for asset selectors). */
  afterDetails?: ReactNode;
}) {
  const nameId = `${rolePrefix}-name`;
  const descriptionId = `${rolePrefix}-description`;
  const tagsId = `${rolePrefix}-tags`;
  return (
    <>
      <FormField label={labels.name ?? 'Name'} htmlFor={nameId} dataXgcRole={`${rolePrefix}-name-field`} dataXgcId={nameId}>
        <InputControl
          id={nameId}
          value={value.name}
          placeholder={namePlaceholder}
          autoFocus={autoFocusName}
          onChange={(name) => onChange({ ...value,name })}
        />
      </FormField>
      {betweenNameAndDetails}
      {showDetails && (
        <>
          <FormField label={labels.description ?? 'Description'} htmlFor={descriptionId} dataXgcRole={`${rolePrefix}-description-field`} dataXgcId={descriptionId}>
            <TextareaControl
              id={descriptionId}
              value={value.description}
              placeholder={descriptionPlaceholder}
              onChange={(description) => onChange({ ...value,description })}
            />
          </FormField>
          <FormField label={labels.tags ?? 'Tags'} htmlFor={tagsId} dataXgcRole={`${rolePrefix}-tags-field`} dataXgcId={tagsId}>
            <InputControl
              id={tagsId}
              value={value.tags}
              placeholder={tagsPlaceholder}
              onChange={(tags) => onChange({ ...value,tags })}
            />
          </FormField>
        </>
      )}
      {afterDetails}
    </>
  );
}
