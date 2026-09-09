import { useState,type FormEvent } from 'react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { SelectControl } from '../../../components/controls/SelectControl';
import { ConfigDrawer } from '../../../components/ConfigDrawer';
import { FormSection, FormSectionSpan, Notice } from '@xgc2/ui-react';
import { FormField,SwitchControl } from '../../../components/FormPrimitives';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import {
  localizedPanelPluginName,
  localizedPanelPortDescription,
  localizedPanelPortLabel,
} from '../../../panels/types';
import { AutomationParameterSchemaForm,automationActionById } from '../../automation/automationPublic';
import { canonicalJSON } from '../../../shared/canonicalJson';
import { useExperimentText } from '../experimentMessages';
import type { CoreNode } from '../../core/corePublic';
import type { AutomationDocument } from '../../automation/automationPublic';
import { executionTargetKeyForCore } from '../../execution/executionPublic';
import {
  PANEL_WORKFLOW_FAILURE_POLICIES,
  PANEL_WORKFLOW_RELATIONS,
  type ExperimentDocument,
  type ExperimentWorkflowInstance,
  type PanelActionPortBinding,
  type PanelInstance,
  type PanelPortBinding,
  type PanelWorkflowFailurePolicy,
  type PanelWorkflowPortBinding,
  type PanelWorkflowRelation,
} from '../experimentModel';
import { listPanelConfigChanges } from './panelConfigChangeSummary';
import { validatePanelInstance } from './panelValidation';
import { useAppLanguage } from '../../../shared/localization/localizedText';

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function dynamicActionPortId(presetId: string) {
  return `action-${presetId}`;
}

function panelActionLabel(
  presetId: string,
  instance: ExperimentWorkflowInstance,
  documents: AutomationDocument[],
) {
  const action = panelPresetAction(presetId,instance,documents);
  return action?.label || presetId;
}

function panelPresetAction(
  presetId:string,
  instance:ExperimentWorkflowInstance,
  documents:AutomationDocument[],
) {
  const document = documents.find((candidate) => (
    candidate.head.resourceId === instance.ref.resourceId && candidate.branch.name === instance.ref.branch
  ));
  const preset = instance.actionPresets.find((candidate) => candidate.id === presetId);
  return document && preset ? automationActionById(document.spec,preset.actionId) : undefined;
}

/**
 * Shared panel settings drawer. Shell matches the Robot asset editor:
 * wide ConfigDrawer + xgc-config-form + shared FormSection grid. Plugins only
 * supply optionsEditor field bodies — never their own drawer chrome.
 */
export function PanelConfigDrawer({
  panel,
  coreNodes,
  executionTargetId,
  automationDocuments = [],
  dashboardPanels = [],
  experiment,
  onClose,
  onSave,
}: {
  panel: PanelInstance;
  coreNodes: CoreNode[];
  executionTargetId: string;
  automationDocuments?: AutomationDocument[];
  dashboardPanels?: PanelInstance[];
  experiment?: ExperimentDocument;
  onClose: () => void;
  onSave: (panel: PanelInstance,workflowInstances: ExperimentWorkflowInstance[]) => void;
}) {
  const t = useExperimentText();
  const language = useAppLanguage();
  const plugin = getPanelPlugin(panel.pluginId);
  const targetPolicy = plugin?.executionTargetPolicy ?? 'configurable';
  // Freeze the open-time baseline so Save only enables when the author actually edits.
  const [baseline] = useState(() => ({
    options: cloneJsonValue(panel.options) as Record<string, unknown>,
    portBindings: cloneJsonValue(panel.portBindings ?? [] as PanelPortBinding[]),
    workflowInstances: cloneJsonValue(experiment?.spec.workflowInstances ?? []),
    targetCoreId: panel.targetCoreId ?? '',
  }));
  const [options, setOptions] = useState(() => cloneJsonValue(baseline.options));
  const [portBindings,setPortBindings] = useState(() => cloneJsonValue(baseline.portBindings));
  const [workflowInstances,setWorkflowInstances] = useState(() => cloneJsonValue(baseline.workflowInstances));
  const [targetCoreId, setPanelTargetCoreId] = useState(baseline.targetCoreId);
  const [error, setError] = useState('');
  const missingPluginError = `Panel plugin "${panel.pluginId}" is not registered. Remove this panel before saving the dashboard.`;
  const panelExecutionTargetId = targetPolicy === 'local'
    ? 'local'
    : targetPolicy === 'dashboard'
      ? executionTargetId
      : targetCoreId
        ? executionTargetKeyForCore(targetCoreId)
        : executionTargetId;
  const OptionsEditor = plugin?.optionsEditor;
  const ActionDefaultsEditor = plugin?.actionDefaultsEditor;
  const effectiveTargetCoreId = targetPolicy === 'configurable' ? targetCoreId : '';
  const baselineTargetCoreId = targetPolicy === 'configurable' ? baseline.targetCoreId : '';
  const dirty = canonicalJSON({
    options,
    portBindings,
    workflowInstances,
    targetCoreId: effectiveTargetCoreId,
  }) !== canonicalJSON({
    options: baseline.options,
    portBindings: baseline.portBindings,
    workflowInstances: baseline.workflowInstances,
    targetCoreId: baselineTargetCoreId,
  });
  const panelWorkflow = portBindings.find(
    (binding): binding is PanelWorkflowPortBinding => binding.kind === 'workflow',
  );
  const panelWorkflowInstance = workflowInstances.find(
    (instance) => instance.id === panelWorkflow?.workflowInstanceId,
  );
  const staticActionPortIds = new Set((plugin?.actionPorts ?? []).map((port) => port.id));
  const dynamicActionBindings = plugin?.dynamicActionPorts?.source === 'panel-action-bindings'
    ? portBindings.filter((binding): binding is PanelActionPortBinding => binding.kind === 'action' && !staticActionPortIds.has(binding.portId))
    : [];
  const actionPresetAuthoring = Object.fromEntries((plugin?.authoringPorts ?? []).flatMap((port) => {
    if (port.target !== 'action-preset' || !panelWorkflowInstance) return [];
    const binding = portBindings.find((candidate) => (
      candidate.kind === 'authoring'
      && candidate.portId === port.id
      && candidate.target === 'action-preset'
    ));
    if (binding?.kind !== 'authoring' || !binding.presetId) return [];
    const presetId = binding.presetId;
    const preset = panelWorkflowInstance.actionPresets.find((candidate) => candidate.id === presetId);
    if (!preset) return [];
    return [[port.id,{
      values:preset.inputs,
      onChange:(fieldName:string,value:unknown) => updateActionPresetAuthoringInput(
        panelWorkflowInstance.id,presetId,fieldName,value,
      ),
    }]];
  }));
  const connectionExposure = plugin?.configExposure?.connections ?? 'editable';
  const actionDefaultsExposure = plugin?.configExposure?.actionDefaults ?? 'editable';
  const sharedActionDefaultsEditable = actionDefaultsExposure === 'editable'
    || actionDefaultsExposure === 'shared-only';
  const perActionDefaultsEditable = actionDefaultsExposure === 'editable';
  const sharedActionDefaults = sharedActionDefaultsEditable ? plugin?.sharedActionDefaults : undefined;
  const sharedActionDefaultNames = new Set(sharedActionDefaults?.fieldNames ?? []);
  const runtimeBoundActionDefaultNames = new Set(plugin?.runtimeBoundActionDefaults ?? []);
  const sharedActionPresetOrder = panelWorkflowInstance ? [
    ...panelWorkflowInstance.actionPresets.filter((preset) => preset.id === panelWorkflow?.presetId),
    ...panelWorkflowInstance.actionPresets.filter((preset) => preset.id !== panelWorkflow?.presetId),
  ] : [];
  const sharedActionPresetContexts = panelWorkflowInstance ? sharedActionPresetOrder.flatMap((preset) => {
    const action = panelPresetAction(preset.id,panelWorkflowInstance,automationDocuments);
    return action ? [{ preset,action }] : [];
  }) : [];
  const sharedActionFields = (sharedActionDefaults?.fieldNames ?? []).flatMap((name) => {
    const field = sharedActionPresetContexts
      .flatMap(({ action }) => action.inputSchema.fields)
      .find((candidate) => candidate.name === name);
    return field ? [field] : [];
  });
  const sharedActionValues = Object.fromEntries(sharedActionFields.map((field) => {
    const context = sharedActionPresetContexts.find(({ preset }) => Object.hasOwn(preset.inputs,field.name));
    return [field.name,context?.preset.inputs[field.name]];
  }));

  function updateSharedActionDefault(fieldName:string,value:unknown) {
    setWorkflowInstances((current) => current.map((candidate) => {
      if (candidate.id !== panelWorkflowInstance?.id) return candidate;
      return {
        ...candidate,
        actionPresets:candidate.actionPresets.map((preset) => {
          const action = panelPresetAction(preset.id,candidate,automationDocuments);
          return action?.inputSchema.fields.some((field) => field.name === fieldName)
            ? { ...preset,inputs:{ ...preset.inputs,[fieldName]:value } }
            : preset;
        }),
      };
    }));
  }

  function updateActionPresetAuthoringInput(
    workflowInstanceId:string,
    presetId:string,
    fieldName:string,
    value:unknown,
  ) {
    setWorkflowInstances((current) => current.map((candidate) => (
      candidate.id !== workflowInstanceId ? candidate : {
        ...candidate,
        actionPresets:candidate.actionPresets.map((preset) => preset.id !== presetId ? preset : {
          ...preset,
          inputs:{ ...preset.inputs,[fieldName]:value },
        }),
      }
    )));
  }

  function setPanelWorkflow(nextValue:string) {
    const [workflowInstanceId,presetId] = nextValue.split('\u0000');
    if (!workflowInstanceId || !presetId) {
      setPortBindings((current) => current.filter((binding) => binding.kind !== 'workflow'));
      return;
    }
    const instance = workflowInstances.find((candidate) => candidate.id === workflowInstanceId);
    const presetIds = new Set(instance?.actionPresets.map((preset) => preset.id) ?? []);
    const relation:PanelWorkflowRelation = instance?.executionTargetId
      ? 'detached-observed'
      : panelWorkflow?.relation ?? 'supervised';
    const workflowBinding:PanelWorkflowPortBinding = {
      portId:panelWorkflow?.portId ?? 'panel-workflow',
      kind:'workflow',workflowInstanceId,presetId,
      managed:panelWorkflow?.managed ?? true,
      relation,
      failurePolicy:relation === 'detached-observed'
        ? 'keep-experiment'
        : panelWorkflow?.failurePolicy ?? 'keep-experiment',
    };
    setPortBindings((current) => [
      ...current.filter((binding) => (
        binding.kind !== 'workflow'
        && !((binding.kind === 'action' || (binding.kind === 'authoring' && binding.target === 'action-preset'))
          && (!binding.presetId || !presetIds.has(binding.presetId)))
      )),
      workflowBinding,
    ]);
  }

  function updatePanelWorkflow(patch:Partial<PanelWorkflowPortBinding>) {
    setPortBindings((current) => current.map((binding) => binding.kind !== 'workflow' ? binding : {
      ...binding,
      ...patch,
      ...(patch.relation === 'detached-observed' ? { failurePolicy:'keep-experiment' as const } : {}),
    }));
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!dirty) return;
    setError('');
    if (!plugin) return setError(missingPluginError);
    // Title is not authored: the frame no longer shows it; keep the existing value for a11y/IDs.
    const nextPanel: PanelInstance = {
      ...panel,
      targetCoreId: targetPolicy === 'configurable' ? targetCoreId || undefined : undefined,
      options,
      portBindings,
    };
    const validation = validatePanelInstance(nextPanel, plugin);
    if (!validation.valid) return setError(validation.error ?? t('Panel configuration is not valid.'));
    onSave(nextPanel,workflowInstances);
  }

  function formatExecutionTarget(coreId: string) {
    if (!coreId) return t('Local');
    return coreNodes.find((core) => core.id === coreId)?.name ?? coreId;
  }

  function resolveResourceName(id: string) {
    const automation = automationDocuments.find((document) => document.head.resourceId === id);
    if (automation) return automation.spec.metadata.name || automation.head.name || id;
    return undefined;
  }

  const workflowConnectionLabel = panelWorkflow && panelWorkflowInstance
    ? `${resolveResourceName(panelWorkflowInstance.ref.resourceId) ?? panelWorkflowInstance.id} — ${panelActionLabel(
      panelWorkflow.presetId,panelWorkflowInstance,automationDocuments,
    )}`
    : t('Not connected');
  const acceptedPanelActionKinds = new Set((plugin?.actionPorts ?? []).flatMap(
    (port) => [...(port.actionKinds ?? [])],
  ));
  const requiredPanelPresetIds = new Set(portBindings.flatMap((binding) => (
    binding.kind === 'action' && staticActionPortIds.has(binding.portId) ? [binding.presetId] : []
  )));
  const compatibleWorkflowChoices = workflowInstances.flatMap((instance) => {
    const document = automationDocuments.find((candidate) => (
      candidate.head.resourceId === instance.ref.resourceId && candidate.branch.name === instance.ref.branch
    ));
    const instancePresetIds = new Set(instance.actionPresets.map((preset) => preset.id));
    const currentInstance = panelWorkflow?.workflowInstanceId === instance.id;
    if (!currentInstance && [...requiredPanelPresetIds].some((presetId) => !instancePresetIds.has(presetId))) {
      return [];
    }
    return instance.actionPresets.flatMap((preset) => {
      const action = document && automationActionById(document.spec,preset.actionId);
      const current = panelWorkflow?.workflowInstanceId === instance.id && panelWorkflow.presetId === preset.id;
      if (!current && panelWorkflow?.presetId && preset.id !== panelWorkflow.presetId) return [];
      if (!current && (!action || (acceptedPanelActionKinds.size > 0 && !acceptedPanelActionKinds.has(action.kind)))) {
        return [];
      }
      return [{
        value:`${instance.id}\u0000${preset.id}`,
        label:`${resolveResourceName(instance.ref.resourceId) ?? instance.id} — ${action?.label ?? preset.id}`,
      }];
    });
  });

  const discardChanges = dirty
    ? listPanelConfigChanges(
      {
        options: baseline.options,
        portBindings: baseline.portBindings,
        targetCoreId: baselineTargetCoreId,
      },
      {
        options,
        portBindings,
        targetCoreId: effectiveTargetCoreId,
      },
      {
        includeExecutionTarget: targetPolicy === 'configurable',
        formatExecutionTarget,
        resolveName: resolveResourceName,
      },
    )
    : [];

  return (
    <ConfigDrawer
      title={plugin ? localizedPanelPluginName(plugin,language) : panel.title}
      className="config-drawer-wide panel-config-drawer"
      dataXgcRole="panel-config-drawer"
      dataXgcId={panel.id}
      dataXgcPlugin={panel.pluginId}
      onClose={onClose}
      closeOnBackdrop
      showClose={false}
      dirty={dirty}
      discardChanges={discardChanges}
      discardTitle={t('Discard panel changes?')}
      discardConfirmLabel={t('Discard changes')}
      discardCancelLabel={t('Keep editing')}
      actions={({ requestClose }) => (
        <div className="config-drawer-actions-pair" data-xgc-role="panel-config-actions" data-xgc-id={panel.id}>
          <ControlButton
            type="button"
            size="compact"
            tone="primary"
            disabled={!plugin || !dirty}
            onClick={() => submit()}
            dataXgcRole="panel-config-save"
            dataXgcId={panel.id}
          >
            {t('Save')}
          </ControlButton>
          <ControlButton
            type="button"
            size="compact"
            onClick={requestClose}
            dataXgcRole="panel-config-cancel"
            dataXgcId={panel.id}
          >
            {t('Cancel')}
          </ControlButton>
        </div>
      )}
    >
      {!plugin ? (
        <Notice tone="danger" density="compact">{missingPluginError}</Notice>
      ) : (
        <form className="xgc-config-form" onSubmit={submit}>
          {error && <Notice tone="danger" density="compact">{error}</Notice>}
          {targetPolicy === 'configurable' && (
            <FormSection title={t('Execution')} dataXgcRole="panel-config-execution" dataXgcId={panel.id}>
              <FormField
                label={t('Execution target')}
                tooltip="Core node that runs this panel's commands and bindings. Local uses the browser host."
              >
                <SelectControl
                  value={targetCoreId}
                  options={[{ value: '',label: t('Local') },...coreNodes.map((core) => ({ value: core.id,label: core.name }))]}
                  ariaLabel={t('Execution target')}
                  dataXgcRole="panel-execution-target"
                  dataXgcId={panel.id}
                  fill
                  onChange={setPanelTargetCoreId}
                />
              </FormField>
            </FormSection>
          )}
          {connectionExposure === 'workflow' ? (
            <FormSection
              title="Connections"
              dataXgcRole="panel-config-connections-workflow"
              dataXgcId={panel.id}
            >
              <FormField label={t('Workflow')}>
                <SelectControl
                  className="panel-workflow-binding-select"
                  value={panelWorkflow ? `${panelWorkflow.workflowInstanceId}\u0000${panelWorkflow.presetId}` : ''}
                  options={compatibleWorkflowChoices}
                  ariaLabel={t('Workflow')}
                  dataXgcRole="panel-workflow-binding"
                  dataXgcId={panel.id}
                  fill
                  onChange={setPanelWorkflow}
                />
              </FormField>
            </FormSection>
          ) : connectionExposure === 'summary' ? (
            <FormSection
              title="Connections"
              dataXgcRole="panel-config-connections-summary"
              dataXgcId={panel.id}
            >
              <FormField label={t('Panel workflow')}>
                <span data-xgc-role="panel-workflow-binding-summary" data-xgc-id={panel.id}>
                  {workflowConnectionLabel}
                </span>
              </FormField>
              <FormField label={t('Lifecycle')}>
                <span data-xgc-role="panel-workflow-lifecycle-summary" data-xgc-id={panel.id}>
                  {panelWorkflow?.managed ? t('Runs with the Experiment') : t('Run from this Panel')}
                </span>
              </FormField>
            </FormSection>
          ) : (
            <FormSection
              title="Connections"
              dataXgcRole="panel-config-connections"
              dataXgcId={panel.id}
            >
            <FormField label={t('Panel workflow')}>
              <SelectControl
                value={panelWorkflow ? `${panelWorkflow.workflowInstanceId}\u0000${panelWorkflow.presetId}` : ''}
                options={[
                  { value:'',label:t('Not connected') },
                  ...workflowInstances.flatMap((instance) => instance.actionPresets
                    .filter((preset) => preset.actionId === 'run')
                    .map((preset) => ({
                      value:`${instance.id}\u0000${preset.id}`,
                      label:`${instance.id} / ${preset.id}`,
                    }))),
                ]}
                ariaLabel={t('Panel workflow')}
                dataXgcRole="panel-workflow-binding"
                dataXgcId={panel.id}
                fill
                onChange={setPanelWorkflow}
              />
            </FormField>
            {panelWorkflow && <>
              <SwitchControl
                checked={panelWorkflow.managed}
                label={t('Run with experiment')}
                dataXgcRole="panel-workflow-managed"
                dataXgcId={panel.id}
                onChange={(managed) => updatePanelWorkflow({ managed })}
              />
              <FormField label={t('Run relation')}>
                <SelectControl
                  value={panelWorkflow.relation}
                  options={PANEL_WORKFLOW_RELATIONS.map((relation) => ({ value:relation,label:relation }))}
                  ariaLabel={t('Run relation')}
                  dataXgcRole="panel-workflow-relation"
                  dataXgcId={panel.id}
                  fill
                  onChange={(relation) => updatePanelWorkflow({ relation:relation as PanelWorkflowRelation })}
                />
              </FormField>
              <FormField label={t('Failure policy')}>
                <SelectControl
                  value={panelWorkflow.failurePolicy}
                  options={PANEL_WORKFLOW_FAILURE_POLICIES.map((failurePolicy) => ({
                    value:failurePolicy,label:failurePolicy,
                    disabled:panelWorkflow.relation === 'detached-observed' && failurePolicy === 'stop-experiment',
                  }))}
                  ariaLabel={t('Failure policy')}
                  dataXgcRole="panel-workflow-failure-policy"
                  dataXgcId={panel.id}
                  fill
                  onChange={(failurePolicy) => updatePanelWorkflow({
                    failurePolicy:failurePolicy as PanelWorkflowFailurePolicy,
                  })}
                />
              </FormField>
            </>}
            {(plugin.actionPorts ?? []).map((port) => {
              const portLabel = localizedPanelPortLabel(port,language);
              const portDescription = localizedPanelPortDescription(port,language);
              const binding = portBindings.find((candidate) => candidate.kind === 'action' && candidate.portId === port.id);
              const value = binding?.kind === 'action' ? binding.presetId : '';
              const choices = (panelWorkflowInstance?.actionPresets ?? []).map((preset) => {
                const document = automationDocuments.find((candidate) => (
                  candidate.head.resourceId === panelWorkflowInstance?.ref.resourceId
                  && candidate.branch.name === panelWorkflowInstance?.ref.branch
                ));
                const action = document && automationActionById(document.spec,preset.actionId);
                return {
                  value:preset.id,
                  label:`${preset.id}${action ? ` — ${action.label}` : ''}`,
                };
              });
              return (
                <FormField key={port.id} label={portLabel} description={portDescription}>
                  <SelectControl
                    value={value}
                    options={[{ value:'',label:'Not connected' },...choices]}
                    ariaLabel={portLabel}
                    dataXgcRole="panel-action-port-binding"
                    dataXgcId={port.id}
                    fill
                    onChange={(presetId) => {
                      setPortBindings((current) => [
                        ...current.filter((candidate) => candidate.portId !== port.id),
                        ...(presetId
                          ? [{ portId:port.id,kind:'action' as const,presetId }]
                          : []),
                      ]);
                    }}
                  />
                </FormField>
              );
            })}
            {plugin.dynamicActionPorts?.source === 'panel-action-bindings' && panelWorkflowInstance && (
              <FormSection
                title={t('Workflow Actions')}
                dataXgcRole="panel-dynamic-action-bindings"
                dataXgcId={panel.id}
              >
                <FormField label={t('Add Action')}>
                  <SelectControl
                    value=""
                    options={[
                      { value:'',label:t('Select an Action') },
                      ...panelWorkflowInstance.actionPresets
                        .filter((preset) => !dynamicActionBindings.some((binding) => binding.presetId === preset.id))
                        .map((preset) => ({
                          value:preset.id,label:panelActionLabel(preset.id,panelWorkflowInstance,automationDocuments),
                        })),
                    ]}
                    ariaLabel={t('Add workflow Action')}
                    dataXgcRole="panel-dynamic-action-add"
                    dataXgcId={panel.id}
                    fill
                    onChange={(presetId) => {
                      if (!presetId) return;
                      setPortBindings((current) => [
                        ...current,
                        { portId:dynamicActionPortId(presetId),kind:'action' as const,presetId },
                      ]);
                    }}
                  />
                </FormField>
                {dynamicActionBindings.map((binding) => (
                  <FormField key={binding.portId} label={panelActionLabel(binding.presetId,panelWorkflowInstance,automationDocuments)}>
                    <SelectControl
                      value={binding.presetId}
                      options={[
                        { value:'',label:'Not connected' },
                        ...panelWorkflowInstance.actionPresets.map((preset) => ({
                          value:preset.id,label:panelActionLabel(preset.id,panelWorkflowInstance,automationDocuments),
                        })),
                      ]}
                      ariaLabel={panelActionLabel(binding.presetId,panelWorkflowInstance,automationDocuments)}
                      dataXgcRole="panel-dynamic-action-binding"
                      dataXgcId={binding.portId}
                      fill
                      onChange={(presetId) => setPortBindings((current) => [
                        ...current.filter((candidate) => candidate.portId !== binding.portId),
                        ...(presetId ? [{ ...binding,presetId }] : []),
                      ])}
                    />
                  </FormField>
                ))}
              </FormSection>
            )}
            {(plugin.authoringPorts ?? []).filter((port) => port.target === 'action-preset').map((port) => {
              const portLabel = localizedPanelPortLabel(port,language);
              const binding = portBindings.find((candidate) => (
                candidate.kind === 'authoring' && candidate.portId === port.id
              ));
              return (
                <FormField key={port.id} label={portLabel}>
                  <SelectControl
                    value={binding?.kind === 'authoring' ? binding.presetId ?? '' : ''}
                    options={[
                      { value:'',label:t('Not connected') },
                      ...(panelWorkflowInstance?.actionPresets ?? []).map((preset) => ({
                        value:preset.id,label:preset.id,
                      })),
                    ]}
                    ariaLabel={portLabel}
                    dataXgcRole="panel-authoring-port-binding"
                    dataXgcId={port.id}
                    fill
                    onChange={(presetId) => setPortBindings((current) => [
                      ...current.filter((candidate) => candidate.portId !== port.id),
                      ...(presetId ? [{
                        portId:port.id,kind:'authoring' as const,target:'action-preset' as const,presetId,
                      }] : []),
                    ])}
                  />
                </FormField>
              );
            })}
            </FormSection>
          )}
          {sharedActionDefaultsEditable && sharedActionDefaults && sharedActionFields.length > 0 ? (
            <FormSection
              title={sharedActionDefaults.title}
              dataXgcRole="panel-shared-action-defaults"
              dataXgcId={panel.id}
            >
              <FormSectionSpan className="panel-config-parameter-schema">
                <AutomationParameterSchemaForm
                  roleId={`panel-${panel.id}-shared-action-defaults`}
                  fields={sharedActionFields}
                  values={sharedActionValues}
                  executionTargetId={panelExecutionTargetId}
                  onError={setError}
                  onChange={(field,value) => updateSharedActionDefault(field.name,value)}
                />
              </FormSectionSpan>
            </FormSection>
          ) : null}
          {perActionDefaultsEditable && (plugin.actionPorts ?? []).flatMap((port) => {
            const binding = portBindings.find((candidate) => candidate.kind === 'action' && candidate.portId === port.id);
            if (!binding || binding.kind !== 'action') return [];
            const instance = panelWorkflowInstance;
            const preset = instance?.actionPresets.find((candidate) => candidate.id === binding.presetId);
            const document = instance && automationDocuments.find((candidate) => (
              candidate.head.resourceId === instance.ref.resourceId && candidate.branch.name === instance.ref.branch
            ));
            const action = document && preset && automationActionById(document.spec,preset.actionId);
            const fields = action?.inputSchema.fields.filter((field) => (
              !sharedActionDefaultNames.has(field.name) && !runtimeBoundActionDefaultNames.has(field.name)
            )) ?? [];
            if (!instance || !preset || !action || fields.length === 0) return [];
            return [(
              <FormSection
                key={port.id}
                title={localizedPanelPortLabel(port,language)}
                dataXgcRole="panel-action-port-defaults"
                dataXgcId={port.id}
              >
                <FormSectionSpan className="panel-config-parameter-schema">
                  <AutomationParameterSchemaForm
                    roleId={`panel-${panel.id}-${port.id}`}
                    fields={fields}
                    values={preset.inputs}
                    executionTargetId={panelExecutionTargetId}
                    onError={setError}
                    onChange={(field,value) => setWorkflowInstances((current) => current.map((candidate) => (
                      candidate.id !== instance.id ? candidate : {
                        ...candidate,
                        actionPresets: candidate.actionPresets.map((item) => item.id === preset.id
                          ? { ...item,inputs: { ...item.inputs,[field.name]:value } }
                          : item),
                      }
                    )))}
                  />
                </FormSectionSpan>
              </FormSection>
            )];
          })}
          {actionDefaultsExposure === 'custom' && ActionDefaultsEditor
            ? (plugin.actionPorts ?? []).flatMap((port) => {
                const binding = portBindings.find((candidate) => (
                  candidate.kind === 'action' && candidate.portId === port.id
                ));
                if (!binding || binding.kind !== 'action') return [];
                const instance = panelWorkflowInstance;
                const preset = instance?.actionPresets.find((candidate) => candidate.id === binding.presetId);
                if (!instance || !preset) return [];
                return [<ActionDefaultsEditor
                  key={port.id}
                  panel={panel}
                  port={port}
                  values={preset.inputs}
                  options={options}
                  executionTargetId={panelExecutionTargetId}
                  onChange={(values) => setWorkflowInstances((current) => current.map((candidate) => (
                    candidate.id !== instance.id ? candidate : {
                      ...candidate,
                      actionPresets:candidate.actionPresets.map((item) => item.id === preset.id
                        ? { ...item,inputs:values }
                        : item),
                    }
                  )))}
                  onOptionsChange={setOptions}
                />];
              })
            : null}
          {perActionDefaultsEditable && dynamicActionBindings.flatMap((binding) => {
            const instance = panelWorkflowInstance;
            const preset = instance?.actionPresets.find((candidate) => candidate.id === binding.presetId);
            const document = instance && automationDocuments.find((candidate) => (
              candidate.head.resourceId === instance.ref.resourceId && candidate.branch.name === instance.ref.branch
            ));
            const action = document && preset && automationActionById(document.spec,preset.actionId);
            const fields = action?.inputSchema.fields.filter((field) => !sharedActionDefaultNames.has(field.name)) ?? [];
            if (!instance || !preset || !action || fields.length === 0) return [];
            return [(
              <FormSection
                key={binding.portId}
                title={panelActionLabel(binding.presetId,instance,automationDocuments)}
                dataXgcRole="panel-action-port-defaults"
                dataXgcId={binding.portId}
              >
                <FormSectionSpan className="panel-config-parameter-schema">
                  <AutomationParameterSchemaForm
                    roleId={`panel-${panel.id}-${binding.portId}`}
                    fields={fields}
                    values={preset.inputs}
                    executionTargetId={panelExecutionTargetId}
                    onError={setError}
                    onChange={(field,value) => setWorkflowInstances((current) => current.map((candidate) => (
                      candidate.id !== instance.id ? candidate : {
                        ...candidate,
                        actionPresets: candidate.actionPresets.map((item) => item.id === preset.id
                          ? { ...item,inputs: { ...item.inputs,[field.name]:value } }
                          : item),
                      }
                    )))}
                  />
                </FormSectionSpan>
              </FormSection>
            )];
          })}
          {OptionsEditor ? (
            <OptionsEditor
              panel={panel}
              experimentId={experiment?.head.resourceId}
              executionTargetId={panelExecutionTargetId}
              dashboardPanels={dashboardPanels}
              options={options}
              actionPresetAuthoring={actionPresetAuthoring}
              onChange={setOptions}
            />
          ) : null}
        </form>
      )}
    </ConfigDrawer>
  );
}
