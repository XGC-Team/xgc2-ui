import { Folder } from 'lucide-react';
import { useCallback,useRef,useState,type ReactNode } from 'react';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { Notice } from '@xgc2/ui-react';
import { FormActions } from '../../components/FormPrimitives';
import type { ResourceMetadataValue } from '../../components/ResourceMetadataFields';
import { SegmentedControl } from '../../components/SegmentedControl';
import { listLabeledFieldChanges } from '../../shared/draftChangeSummary';
import { ConfigAssetFields } from './ConfigAssetFields';
import {
  configAssetTagsIssue,
  parseConfigAssetTags,
} from '../../shared/configAssetTags';
import type { ConfigAssetNamespace } from './configAssetCatalog';
import { useAssetsText } from './assetsMessages';

type ConfigAssetMetadata = {
  name: string;
  description: string;
  tags: string[];
};

type ConfigAssetDocument<Spec extends ConfigAssetMetadata> = {
  head: { resourceId: string;namespaceId?: string };
  spec: Spec;
};

export function ConfigAssetCreateDrawer<
  AssetKind extends string,
  Spec,
  Namespace extends ConfigAssetNamespace,
>({
  assetKind,
  assetLabel,
  assetIcon,
  rolePrefix,
  tagsPlaceholder,
  namespaces,
  onClose,
  createSpec,
  onCreateAsset,
  onCreateNamespace,
  presentError,
  onError,
}: {
  assetKind: AssetKind;
  assetLabel: string;
  assetIcon: ReactNode;
  rolePrefix: string;
  tagsPlaceholder: string;
  namespaces: Namespace[];
  onClose: () => void;
  createSpec: (metadata: ConfigAssetMetadata) => Spec;
  onCreateAsset: (namespaceId: string, spec: Spec) => Promise<void>;
  onCreateNamespace: (name: string, parentNamespaceId: string) => Promise<void>;
  presentError: (cause: unknown) => string;
  onError?: (message: string) => void;
}) {
  type ResourceKind = AssetKind | 'namespace';
  const t = useAssetsText();
  const [kind,setKind] = useState<ResourceKind>(assetKind);
  const [metadata,setMetadata] = useState<ResourceMetadataValue>({ name: '',description: '',tags: '' });
  const [namespaceId,setNamespaceId] = useState('');
  const submission = useConfigAssetSubmission(presentError, onError);

  function create() {
    const name = metadata.name.trim();
    if (!name) return;
    void submission.run(async () => {
      if (kind === 'namespace') {
        await onCreateNamespace(name, namespaceId);
        return;
      }
      const tags = parseConfigAssetTags(metadata.tags);
      const tagIssue = configAssetTagsIssue(tags);
      if (tagIssue) throw new Error(tagIssue);
      await onCreateAsset(namespaceId, createSpec({
        name,
        description: metadata.description.trim(),
        tags,
      }));
    });
  }

  return (
    <ConfigDrawer
      title={t('New')}
      onClose={onClose}
      closeOnBackdrop={!submission.saving}
      dismissible={!submission.saving}
      bodyClassName="xgc-config-form"
      dataXgcRole={`${rolePrefix}-drawer`}
      dataXgcId="new"
    >
      {!onError && submission.error && <Notice tone="danger">{submission.error}</Notice>}
      <SegmentedControl<ResourceKind>
        value={kind}
        options={[
          { value: assetKind,label: assetLabel,icon: assetIcon },
          { value: 'namespace',label: t('Folder'),icon: <Folder size={15} /> },
        ]}
        onChange={setKind}
        ariaLabel={t('Resource kind')}
        dataXgcRole={`${rolePrefix}-kind`} dataXgcId={`${rolePrefix}-kind`}
      />
      <ConfigAssetFields
        metadata={metadata}
        onMetadataChange={setMetadata}
        namespaces={namespaces}
        namespaceId={namespaceId}
        onNamespaceChange={setNamespaceId}
        rolePrefix={rolePrefix}
        folderLabel={kind === assetKind ? t('Folder') : t('Parent folder')}
        userFolderLabel={t('User scripts')}
        autoFocusName
        showDetails={kind === assetKind}
        tagsPlaceholder={tagsPlaceholder}
      />
      <FormActions>
        <ControlButton disabled={submission.saving} onClick={onClose} dataXgcRole={`${rolePrefix}-cancel`} dataXgcId={`${rolePrefix}-cancel`}>{t('Cancel')}</ControlButton>
        <ControlButton
          tone="primary"
          dataXgcRole={`${rolePrefix}-submit`} dataXgcId={`${rolePrefix}-submit`}
          disabled={submission.saving || !metadata.name.trim()}
          onClick={create}
        >{submission.saving ? t('Creating') : t('Create')}</ControlButton>
      </FormActions>
    </ConfigDrawer>
  );
}

export function ConfigAssetSettingsDrawer<
  Document extends ConfigAssetDocument<ConfigAssetMetadata>,
  Namespace extends ConfigAssetNamespace,
>({
  document,
  namespaces,
  title,
  rolePrefix,
  tagsPlaceholder = 'Optional',
  onClose,
  onSave,
  presentError,
  onError,
}: {
  document: Document;
  namespaces: Namespace[];
  title: string;
  rolePrefix: string;
  tagsPlaceholder?: string;
  onClose: () => void;
  onSave: (spec: Document['spec'], namespaceId: string) => Promise<void>;
  presentError: (cause: unknown) => string;
  onError?: (message: string) => void;
}) {
  const t = useAssetsText();
  const [metadata,setMetadata] = useState<ResourceMetadataValue>({
    name: document.spec.name,
    description: document.spec.description,
    tags: document.spec.tags.join(', '),
  });
  const [namespaceId,setNamespaceId] = useState(document.head.namespaceId ?? '');
  const submission = useConfigAssetSubmission(presentError, onError);
  const baselineNamespaceId = document.head.namespaceId ?? '';
  const dirty = metadata.name !== document.spec.name
    || metadata.description !== document.spec.description
    || metadata.tags !== document.spec.tags.join(', ')
    || namespaceId !== baselineNamespaceId;
  const discardChanges = dirty
    ? listLabeledFieldChanges(
      {
        name: document.spec.name,
        description: document.spec.description,
        tags: document.spec.tags.join(', '),
        namespaceId: baselineNamespaceId,
      },
      {
        name: metadata.name,
        description: metadata.description,
        tags: metadata.tags,
        namespaceId,
      },
      {
        name: t('Name'),
        description: t('Description'),
        tags: t('Tags'),
        namespaceId: t('Folder'),
      },
    )
    : [];

  function save() {
    if (!dirty) return;
    const name = metadata.name.trim();
    if (!name) return;
    void submission.run(async () => {
      const tags = parseConfigAssetTags(metadata.tags);
      const tagIssue = configAssetTagsIssue(tags);
      if (tagIssue) throw new Error(tagIssue);
      const spec = {
        ...document.spec,
        name,
        description: metadata.description.trim(),
        tags,
      } as Document['spec'];
      await onSave(spec, namespaceId);
    });
  }

  return (
    <ConfigDrawer
      title={title}
      onClose={onClose}
      closeOnBackdrop={!submission.saving}
      dismissible={!submission.saving}
      bodyClassName="xgc-config-form"
      dataXgcRole={`${rolePrefix}-drawer`}
      dataXgcId={document.head.resourceId}
      dirty={dirty}
      discardChanges={discardChanges}
    >
      {!onError && submission.error && <Notice tone="danger">{submission.error}</Notice>}
      <ConfigAssetFields
        metadata={metadata}
        onMetadataChange={setMetadata}
        namespaces={namespaces}
        namespaceId={namespaceId}
        onNamespaceChange={setNamespaceId}
        rolePrefix={rolePrefix}
        folderLabel={t('Folder')}
        userFolderLabel={t('User scripts')}
        autoFocusName
        tagsPlaceholder={tagsPlaceholder}
      />
      <FormActions>
        <ConfigDrawerDismissButton disabled={submission.saving}>{t('Cancel')}</ConfigDrawerDismissButton>
        <ControlButton
          tone="primary"
          dataXgcRole={`${rolePrefix}-submit`} dataXgcId={`${rolePrefix}-submit`}
          disabled={submission.saving || !dirty || !metadata.name.trim()}
          onClick={save}
        >{submission.saving ? t('Saving') : t('Save')}</ControlButton>
      </FormActions>
    </ConfigDrawer>
  );
}

function useConfigAssetSubmission(
  presentError: (cause: unknown) => string,
  onError?: (message: string) => void,
) {
  const activeRef = useRef(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const run = useCallback(async (action: () => Promise<void>) => {
    if (activeRef.current) return;
    setError('');
    onError?.('');
    activeRef.current = true;
    setSaving(true);
    try {
      await action();
    } catch (cause) {
      const message = presentError(cause);
      setError(message);
      onError?.(message);
    } finally {
      activeRef.current = false;
      setSaving(false);
    }
  }, [onError,presentError]);
  return { saving,error,run };
}
