import { Copy,Plus } from 'lucide-react';
import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { Notice } from '@xgc2/ui-react';
import { FormActions,FormField } from '../../components/FormPrimitives';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import type {
  AutomationDocument,
  AutomationNamespace,
} from './automationDefinitionContracts';
import { messageOf } from './automationErrorModel';
import { folderMessage,localizedUserWorkflowFolderTitle,splitValues } from './automationPageModel';

export function DuplicateAutomationDrawer({ document,namespaces,onClose,onDuplicate }: {
  document: AutomationDocument;
  namespaces: AutomationNamespace[];
  onClose: () => void;
  onDuplicate: (namespaceId: string, name: string) => Promise<void>;
}) {
  const t = useAutomationAuthoringText();
  const [namespaceId,setNamespaceId] = useState('');
  const [name,setName] = useState(`${document.spec.metadata.name} copy`);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function submit() {
    if (!name.trim()) return setError(t('Name is required.'));
    setBusy(true);
    setError('');
    try {
      await onDuplicate(namespaceId, name.trim());
    } catch (cause) {
      setError(folderMessage(messageOf(cause)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConfigDrawer
      title={t('Duplicate Automation')}
      subtitle={t('Create an editable copy in User workflows')}
      open
      onClose={onClose}
      closeOnBackdrop={!busy}
      dismissible={!busy}
      className="automation-page-duplicate-drawer"
      bodyClassName="xgc-config-form automation-page-duplicate-form"
      dataXgcRole="automation-definition-duplicate-drawer"
      dataXgcId={document.head.resourceId}
      footer={<>
        <ControlButton type="button" disabled={busy} onClick={onClose} dataXgcRole="automation-definition-duplicate-cancel" dataXgcId={document.head.resourceId}>{t('Cancel')}</ControlButton>
        <ControlButton tone="primary" type="button" data-xgc-role="automation-definition-duplicate-submit" data-xgc-id={document.head.resourceId} disabled={busy || !name.trim()} onClick={() => void submit()}><Copy size={14} />{busy ? t('Duplicating') : t('Duplicate')}</ControlButton>
      </>}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <FormField label={t('Name')} htmlFor="automation-duplicate-name" dataXgcRole="automation-duplicate-name-field" dataXgcId="automation-duplicate-name-field"><InputControl id="automation-duplicate-name" autoFocus value={name} onChange={setName} /></FormField>
      <FormField label={t('Folder')} dataXgcRole="automation-duplicate-folder-field" dataXgcId="automation-duplicate-folder-field">
        <SelectControl
          fill
          value={namespaceId}
          options={[{ value: '',label: t('User workflows') },...namespaces.map((namespace) => ({
            value: namespace.namespaceId,
            label: localizedUserWorkflowFolderTitle(t, namespaces, namespace.namespaceId),
          }))]}
          onChange={setNamespaceId}
          ariaLabel={t('Folder')}
          dataXgcRole="automation-duplicate-folder-control" dataXgcId="automation-duplicate-folder-control"
        />
      </FormField>
    </ConfigDrawer>
  );
}

export function CreateAutomationResourceDrawer({ namespaces,canCreateAutomation,onClose,onCreateAutomation,onCreateFolder }: {
  namespaces: AutomationNamespace[];
  canCreateAutomation: boolean;
  onClose: () => void;
  onCreateAutomation: (namespaceId: string, name: string, description: string, tags: string[]) => Promise<void>;
  onCreateFolder: (name: string, parentId: string) => Promise<void>;
}) {
  const t = useAutomationAuthoringText();
  const [kind,setKind] = useState<'automation' | 'namespace'>('automation');
  const [namespaceId,setNamespaceId] = useState('');
  const [name,setName] = useState('');
  const [description,setDescription] = useState('');
  const [tags,setTags] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function submit() {
    if (!name.trim()) return setError(t('Name is required.'));
    setBusy(true);
    setError('');
    try {
      if (kind === 'namespace') await onCreateFolder(name.trim(), namespaceId);
      else await onCreateAutomation(namespaceId, name.trim(), description.trim(), splitValues(tags));
    } catch (cause) {
      setError(folderMessage(messageOf(cause)));
    } finally {
      setBusy(false);
    }
  }
  const folderOptions = [{ value: '',label: t('User workflows') },...namespaces.map((namespace) => ({
    value: namespace.namespaceId,
    label: localizedUserWorkflowFolderTitle(t, namespaces, namespace.namespaceId),
  }))];
  return (
    <ConfigDrawer
      title={t('New')}
      subtitle={kind === 'namespace' ? t('Organize Automation definitions') : undefined}
      open
      onClose={onClose}
      closeOnBackdrop={!busy}
      dismissible={!busy}
      bodyClassName="xgc-config-form"
      dataXgcRole="automation-definition-create-drawer"
      dataXgcId="new"
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <FormField label={t('Type')} dataXgcRole="automation-create-kind" dataXgcId="automation-create-kind">
        <SelectControl fill value={kind} options={[{ value: 'automation',label: t('Automation') },{ value: 'namespace',label: t('Folder') }]} onChange={(value) => setKind(value as typeof kind)} ariaLabel={t('Type')} dataXgcRole="automation-create-kind-control" dataXgcId="new" />
      </FormField>
      <FormField
        label={t('Name')}
        htmlFor="automation-create-name"
        dataXgcRole="automation-create-name-field" dataXgcId="automation-create-name-field"
      >
        <InputControl id="automation-create-name" autoFocus value={name} maxLength={48} onChange={setName} />
      </FormField>
      <FormField label={t(kind === 'automation' ? 'Folder' : 'Parent folder')} dataXgcRole="automation-create-folder-field" dataXgcId="automation-create-folder-field">
        <SelectControl fill value={namespaceId} options={folderOptions} onChange={setNamespaceId} ariaLabel={t(kind === 'automation' ? 'Folder' : 'Parent folder')} dataXgcRole="automation-create-folder-control" dataXgcId="new" />
      </FormField>
      {kind === 'automation' && <>
        <FormField label={t('Description')} htmlFor="automation-create-description" dataXgcRole="automation-create-description-field" dataXgcId="automation-create-description-field"><TextareaControl id="automation-create-description" value={description} onChange={setDescription} /></FormField>
        <FormField label={t('Tags')} htmlFor="automation-create-tags" dataXgcRole="automation-create-tags-field" dataXgcId="automation-create-tags-field"><InputControl id="automation-create-tags" value={tags} placeholder={t('flight, simulation')} onChange={setTags} /></FormField>
      </>}
      <FormActions>
        <ControlButton disabled={busy} onClick={onClose} dataXgcRole={kind === 'automation' ? 'automation-definition-create-cancel' : 'automation-namespace-create-cancel'} dataXgcId="new">{t('Cancel')}</ControlButton>
        <ControlButton tone="primary" dataXgcRole={kind === 'automation' ? 'automation-definition-create-submit' : 'automation-namespace-create-submit'} dataXgcId="new" disabled={busy || !name.trim() || (kind === 'automation' && !canCreateAutomation)} onClick={() => void submit()}><Plus size={14} />{busy ? t('Creating') : t('Create')}</ControlButton>
      </FormActions>
    </ConfigDrawer>
  );
}
