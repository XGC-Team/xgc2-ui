import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { FormField } from '../../components/FormPrimitives';
import { Modal } from '../../components/Modal';
import {
  canAddConfigAssetTag,
  MAX_CONFIG_ASSET_TAG_RUNES,
  MAX_CONFIG_ASSET_TAGS,
} from '../../shared/configAssetTags';
import { useAssetsText } from './assetsMessages';

export function ConfigAssetTagDialog({
  name,
  resourceId,
  tags,
  rolePrefix,
  onClose,
  onSave,
}: {
  name: string;
  resourceId: string;
  tags: readonly string[];
  rolePrefix: string;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}) {
  const t = useAssetsText();
  const [tagName,setTagName] = useState('');
  const normalizedTagName = tagName.trim();
  const addIssue = canAddConfigAssetTag(tags, normalizedTagName);
  const canAdd = !addIssue;
  return (
    <Modal
      title={t('New tag')}
      description={name}
      size="small"
      onClose={onClose}
      closeLabel={t('Close tag dialog')}
      ariaLabel={t('Add tag to {name}', { name })}
      dataXgcRole={`${rolePrefix}-tag-dialog`}
      dataXgcId={resourceId}
      actions={(
        <>
          <ControlButton onClick={onClose} dataXgcRole={`${rolePrefix}-tag-cancel`} dataXgcId={resourceId}>{t('Cancel')}</ControlButton>
          <ControlButton tone="primary" disabled={!canAdd} onClick={() => onSave([...tags,normalizedTagName])} dataXgcRole={`${rolePrefix}-tag-add`} dataXgcId={resourceId}>{t('Add tag')}</ControlButton>
        </>
      )}
    >
      <FormField
        label={t('Name')}
        htmlFor={`${rolePrefix}-tag-name`}
        dataXgcRole={`${rolePrefix}-tag-name-field`}
        dataXgcId={resourceId}
        description={`Up to ${MAX_CONFIG_ASSET_TAGS} tags, ${MAX_CONFIG_ASSET_TAG_RUNES} characters each. No '.' (seed markers are not tags).`}
        error={normalizedTagName && addIssue ? addIssue : undefined}
      >
        <InputControl id={`${rolePrefix}-tag-name`} value={tagName} onChange={setTagName} placeholder={t('Tag name')} autoFocus />
      </FormField>
    </Modal>
  );
}
