import { FlaskConical,Folder } from 'lucide-react';
import { useState } from 'react';
import { ConfigDrawer,ConfigDrawerDismissButton } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { Notice } from '@xgc2/ui-react';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { FormActions,FormField,FormGroup } from '../../components/FormPrimitives';
import { ResourceMetadataFields,type ResourceMetadataValue } from '../../components/ResourceMetadataFields';
import { SegmentedControl } from '../../components/SegmentedControl';
import { configAssetTagsIssue,parseConfigAssetTags } from '../../shared/configAssetTags';
import { listLabeledFieldChanges } from '../../shared/draftChangeSummary';
import type {
  ExperimentDocument,
  ExperimentNamespace,
  ExperimentRunMode,
  ExperimentSpec,
} from './experimentModel';
import {
  normalizeExperimentRunModes,
  validateExperimentSpec,
} from './experimentModel';
import { useExperimentText } from './experimentMessages';
import { useRobotAssetKindComposition } from '../robot/robotAssetPublic';

export function ExperimentCreateDialog({
  onClose,
  onCreate,
  onCreateNamespace,
  namespaces,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    tags: string[];
    description: string;
    namespaceId?: string;
  }) => void;
  onCreateNamespace: (name: string) => void;
  namespaces: ExperimentNamespace[];
}) {
  const t = useExperimentText();
  const [kind,setKind] = useState<'experiment' | 'folder'>('experiment');
  const [metadata,setMetadata] = useState<ResourceMetadataValue>({ name: '',description: '',tags: '' });
  const [namespaceId,setNamespaceId] = useState('');
  const createTags = parseConfigAssetTags(metadata.tags);
  const createTagIssue = kind === 'experiment' ? configAssetTagsIssue(createTags) : '';
  const canCreate = Boolean(metadata.name.trim())
    && !createTagIssue;

  function submit() {
    if (kind === 'folder') return onCreateNamespace(metadata.name.trim());
    if (createTagIssue) return;
    onCreate({
      name: metadata.name.trim(),
      tags: createTags,
      description: metadata.description.trim(),
      namespaceId: namespaceId || undefined,
    });
  }

  return (
    <ConfigDrawer title={t('New')} onClose={onClose} closeOnBackdrop bodyClassName="xgc-config-form" dataXgcRole="experiment-create-drawer" dataXgcId="new">
      <SegmentedControl
        value={kind}
        options={[
          { value: 'experiment',label: t('Experiment'),icon: <FlaskConical size={15} /> },
          { value: 'folder',label: t('Folder'),icon: <Folder size={15} /> },
        ]}
        onChange={setKind}
        ariaLabel={t('Resource kind')}
        dataXgcRole="experiment-create-kind"
        dataXgcId="experiment-create-kind"
      />
      <ResourceMetadataFields
        value={metadata}
        onChange={setMetadata}
        rolePrefix="experiment-create"
        labels={{ name: t('Name'),description: t('Description'),tags: t('Tags') }}
        namePlaceholder={kind === 'experiment' ? t('Hover validation') : 'indoor-flight'}
        descriptionPlaceholder={t('Simulation setup, mission validation, or robot control scope.')}
        tagsPlaceholder={t('Optional')}
        showDetails={kind === 'experiment'}
        afterDetails={kind === 'experiment' ? (
          <>
            {createTagIssue && <Notice tone="warning" density="compact" data-xgc-role="experiment-create-tags-error" data-xgc-id="experiment-create-tags-error">{createTagIssue}</Notice>}
            <FormField label={t('Folder')} htmlFor="experiment-create-namespace" dataXgcRole="experiment-create-namespace-field" dataXgcId="experiment-create-namespace-field">
              <SelectControl id="experiment-create-namespace" value={namespaceId} options={[{ value: '',label: t('User experiments') },...namespaces.map((namespace) => ({ value: namespace.namespaceId,label: namespace.name }))]} onChange={setNamespaceId} ariaLabel={t('Folder')} dataXgcRole="experiment-create-namespace" dataXgcId="experiment-create-namespace" fill />
            </FormField>
          </>
        ) : undefined}
      />
      <FormActions>
        <ControlButton onClick={onClose} dataXgcRole="experiment-create-cancel" dataXgcId="experiment-create-cancel">{t('Cancel')}</ControlButton>
        <ControlButton tone="primary" disabled={!canCreate} onClick={submit} dataXgcRole="experiment-create-submit" dataXgcId="experiment-create-submit">{t('Create')}</ControlButton>
      </FormActions>
    </ConfigDrawer>
  );
}

export function ExperimentSettingsDrawer({
  experiment,
  conflict,
  onClose,
  onSave,
}: {
  experiment: ExperimentDocument;
  conflict?: string;
  onClose: () => void;
  onSave: (updates: Pick<ExperimentSpec, 'name' | 'description' | 'tags' | 'runModes'>) => void;
}) {
  const t = useExperimentText();
  const robotKindComposition = useRobotAssetKindComposition();
  const [metadata,setMetadata] = useState<ResourceMetadataValue>({
    name: experiment.spec.name,
    description: experiment.spec.description,
    tags: experiment.spec.tags.join(', '),
  });
  const [runModes,setRunModes] = useState<ExperimentRunMode[]>(() => (
    normalizeExperimentRunModes(experiment.spec.runModes)
  ));
  const settingsTags = parseConfigAssetTags(metadata.tags);
  const settingsTagIssue = configAssetTagsIssue(settingsTags);
  const submittedName = metadata.name.trim();
  const submittedDescription = metadata.description.trim();
  const baselineFingerprint = [
    experiment.spec.name,
    experiment.spec.description,
    experiment.spec.tags.join(', '),
    normalizeExperimentRunModes(experiment.spec.runModes).join(', '),
  ].join('\0');
  const draftFingerprint = [
    submittedName,
    submittedDescription,
    settingsTags.join(', '),
    runModes.join(', '),
  ].join('\0');
  const dirty = draftFingerprint !== baselineFingerprint;
  const definitionIssue = validateExperimentSpec({
    ...experiment.spec,
    name:submittedName,
    description:submittedDescription,
    tags:settingsTags,
    runModes,
  }, robotKindComposition);
  const canSave = Boolean(
    dirty
    && submittedName
    && !settingsTagIssue
    && !definitionIssue
  );
  const discardChanges = dirty
    ? listLabeledFieldChanges(
      {
        name: experiment.spec.name,
        description: experiment.spec.description,
        tags: experiment.spec.tags.join(', '),
        runModes: normalizeExperimentRunModes(experiment.spec.runModes).join(', '),
      },
      {
        name: submittedName,
        description: submittedDescription,
        tags: settingsTags.join(', '),
        runModes: runModes.join(', '),
      },
      {
        name: t('Name'),
        description: t('Description'),
        tags: t('Tags'),
        runModes: t('Run modes'),
      },
    )
    : [];

  function submit() {
    if (definitionIssue || settingsTagIssue) return;
    onSave({
      name: submittedName,
      description: submittedDescription,
      tags: settingsTags,
      runModes,
    });
  }

  return (
    <ConfigDrawer
      title={t('Configure experiment')}
      onClose={onClose}
      closeOnBackdrop
      bodyClassName="xgc-config-form"
      dataXgcRole="experiment-settings-drawer"
      dataXgcId={experiment.head.resourceId}
      dirty={dirty}
      discardChanges={discardChanges}
      discardConfirmLabel={t('Discard changes')}
      discardCancelLabel={t('Keep editing')}
    >
      {conflict && <Notice tone="danger" data-xgc-role="experiment-save-conflict" data-xgc-id={experiment.head.resourceId}>{conflict}</Notice>}
      {/* Operator decisions only: name, description, tags, runModes. */}
      <FormField
        label={t('Name')}
        htmlFor="experiment-settings-name"
        dataXgcRole="experiment-settings-name-field"
        dataXgcId={experiment.head.resourceId}
      >
        <InputControl
          id="experiment-settings-name"
          value={metadata.name}
          autoFocus
          dataXgcRole="experiment-settings-name"
          dataXgcId={experiment.head.resourceId}
          onChange={(name) => setMetadata({ ...metadata,name })}
        />
      </FormField>
      <FormField
        label={t('Description')}
        htmlFor="experiment-settings-description"
        dataXgcRole="experiment-settings-description-field"
        dataXgcId={experiment.head.resourceId}
      >
        <TextareaControl
          id="experiment-settings-description"
          value={metadata.description}
          dataXgcRole="experiment-settings-description"
          dataXgcId={experiment.head.resourceId}
          onChange={(description) => setMetadata({ ...metadata,description })}
        />
      </FormField>
      <FormField
        label={t('Tags')}
        htmlFor="experiment-settings-tags"
        dataXgcRole="experiment-settings-tags-field"
        dataXgcId={experiment.head.resourceId}
      >
        <InputControl
          id="experiment-settings-tags"
          value={metadata.tags}
          placeholder={t('Optional')}
          dataXgcRole="experiment-settings-tags"
          dataXgcId={experiment.head.resourceId}
          onChange={(tags) => setMetadata({ ...metadata,tags })}
        />
      </FormField>
      {settingsTagIssue && <Notice tone="warning" density="compact" data-xgc-role="experiment-settings-tags-error" data-xgc-id={experiment.head.resourceId}>{settingsTagIssue}</Notice>}
      <FormGroup
        legend={t('Run modes')}
        error={runModes.length === 0 ? t('At least one run mode is required') : undefined}
        dataXgcRole="experiment-settings-run-modes-field"
        dataXgcId={experiment.head.resourceId}
      >
        <InputControl
          value={runModes.join(', ')}
          placeholder="simulation, physical, night-field"
          dataXgcRole="experiment-settings-run-modes"
          dataXgcId={experiment.head.resourceId}
          onChange={(value) => setRunModes(value.split(',').map((mode) => mode.trim()).filter(Boolean))}
        />
      </FormGroup>
      {definitionIssue && <Notice tone="warning" density="compact">{definitionIssue}</Notice>}
      <FormActions>
        <ConfigDrawerDismissButton>{t('Cancel')}</ConfigDrawerDismissButton>
        <ControlButton tone="primary" disabled={!canSave} onClick={submit} dataXgcRole="experiment-settings-save" dataXgcId={experiment.head.resourceId}>{t('Save')}</ControlButton>
      </FormActions>
    </ConfigDrawer>
  );
}
