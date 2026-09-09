import { Fragment } from 'react';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import {
  AutomationCatalogParameterField,
  AutomationJSONParameterField,
  AutomationParameterBindingField,
  type AutomationParameterOptions,
} from './AutomationParameterControls';
import type {
  AutomationDocument,
  AutomationNode,
  AutomationNodeCatalogEntry,
} from './automationDefinitionContracts';
import {
  automationSchemaProperties,
  parameterBindingTarget,
} from './automationDefinitionEditorModel';
import { automationInputFieldExpression } from './automationInputExpression';
import {
  automationFixedParameterFallback,
  automationParameterAllowsExpression,
  automationParameterValueMatchesSchema,
  isAutomationParameterRecord,
  isRequiredAutomationParameter,
} from './automationParameterAuthoring';
import { automationParameterLabel } from './automationParameterModel';
import { AutomationParameterGroups } from './AutomationParameterGroups';
import { automationParameterGroups } from './automationParameterGroupModel';
import { isAutomationTriggerKind } from './automationTriggerContracts';
import { ROSBagRecorderFields } from './ROSBagRecorderFields';
import {
  defaultROSPublishMessage,
  isROSPublishTopicKind,
  rosMessageTypeSuggestions,
} from './rosMessageTemplateModel';
import {
  defaultROSServiceRequest,
  isROSServiceCallKind,
  rosServiceTypeSuggestions,
} from './rosServiceRequestModel';
import { limitAutomationNodeDisplayName } from './automationSpecModel';
import { AutomationCallParameters } from './AutomationCallParameters';
import { usesAutomationCallInputs } from './automationCallModel';
import type { AutomationNodeEditorAdapter } from './nodes/automationNodeWebComposition';

export function AutomationNodeParameters({
  node,
  catalog,
  parameterSchema,
  parameterPath,
  parameterOptions,
  automationDocuments = [],
  inputSourceIds,
  executionTargetId,
  readOnly,
  editor,
  onChange,
  onError,
}: {
  node: AutomationNode;
  catalog?: AutomationNodeCatalogEntry;
  parameterSchema?: Record<string,unknown>;
  parameterPath: 'root' | 'parameters';
  parameterOptions?: AutomationParameterOptions;
  automationDocuments?: readonly AutomationDocument[];
  inputSourceIds: readonly string[];
  executionTargetId: string;
  readOnly: boolean;
  editor?: AutomationNodeEditorAdapter;
  onChange: (patch: Partial<AutomationNode>) => void;
  onError: (error: string) => void;
}) {
  const t = useAutomationAuthoringText();
  const isTrigger = isAutomationTriggerKind(node.kind);
  const manual = node.kind === 'trigger.manual';
  const schedule = node.kind === 'trigger.schedule';
  const scheduleKind = node.parameters.kind === 'once' ? 'once' : 'cron';
  const expressionBindingsEnabled = catalog?.kind === node.kind && catalog.typeVersion === node.typeVersion;
  const effectiveParameterSchema = parameterSchema ?? catalog?.parameterSchema;
  const emptyHostedEventTrigger = (
    node.kind === 'trigger.form-submission'
      || node.kind === 'trigger.chat-message'
      || node.kind === 'trigger.webhook'
  ) && Object.values(automationSchemaProperties(effectiveParameterSchema))
    .every((property) => property.readOnly === true);
  return (
    <div className="automation-node-parameters-editor">
      <div className="automation-node-identity-parameters" data-xgc-role="automation-node-identity-parameters" data-xgc-id={node.id}>
        <FormField className="automation-node-parameter-field" label={t('Node name')} required error={!node.displayName.trim() ? t('Node name is required') : undefined} dataXgcRole="automation-node-display-name" dataXgcId={node.id}>
          <InputControl
            aria-label={t('Node name')}
            required
            aria-invalid={!node.displayName.trim()}
            value={node.displayName}
            readOnly={readOnly}
            onChange={(value) => onChange({ displayName: limitAutomationNodeDisplayName(value) })}
          />
        </FormField>
      </div>

      {!isTrigger ? (
        editor?.renderParameters ? (
          editor.renderParameters({ node,readOnly,onChange })
        ) : usesAutomationCallInputs(node) ? (
          <AutomationCallParameters
            node={node}
            automationDocuments={automationDocuments}
            parameterOptions={parameterOptions}
            inputSourceIds={inputSourceIds}
            executionTargetId={executionTargetId}
            readOnly={readOnly}
            onChange={onChange}
            onError={onError}
          />
        ) : (
          <AutomationNodeParameterFields node={node} schema={effectiveParameterSchema} parameterPath={parameterPath} parameterOptions={parameterOptions} inputSourceIds={inputSourceIds} executionTargetId={executionTargetId} expressionBindingsEnabled={expressionBindingsEnabled} readOnly={readOnly} editor={editor} onChange={onChange} onError={onError} />
        )
      ) : (
        <div className="automation-trigger-parameters">
          {manual ? (
            null
          ) : schedule ? (
            <section className="automation-trigger-schedule" data-xgc-role="automation-schedule-trigger-parameters" data-xgc-id={node.id}>
              <p>{t('Run this Automation automatically at the configured time.')}</p>
              {scheduleParameterDescriptors(scheduleKind, node.parameters, t).map((field) => (
                <AutomationCatalogParameterField
                  key={field.name}
                  nodeId={node.id}
                  name={field.name}
                  property={field.property}
                  required
                  value={field.value}
                  executionTargetId={executionTargetId}
                  target={parameterBindingTarget('root', field.name)}
                  expressionBindingsEnabled={false}
                  readOnly={readOnly}
                  onChange={(value) => onChange({ parameters: { ...node.parameters,[field.name]: value } })}
                  onModeChange={() => undefined}
                  onExpressionChange={() => undefined}
                  onError={onError}
                />
              ))}
            </section>
          ) : emptyHostedEventTrigger ? (
            null
          ) : (
            <AutomationNodeParameterFields node={node} schema={effectiveParameterSchema} parameterPath={parameterPath} parameterOptions={parameterOptions} inputSourceIds={inputSourceIds} executionTargetId={executionTargetId} expressionBindingsEnabled={expressionBindingsEnabled} readOnly={readOnly} editor={editor} onChange={onChange} onError={onError} />
          )}
        </div>
      )}
    </div>
  );
}

function AutomationNodeParameterFields({
  node,
  schema,
  parameterPath,
  parameterOptions,
  inputSourceIds,
  executionTargetId,
  expressionBindingsEnabled,
  readOnly,
  editor,
  onChange,
  onError,
}: {
  node: AutomationNode;
  schema?: Record<string,unknown>;
  parameterPath: 'root' | 'parameters';
  parameterOptions?: AutomationParameterOptions;
  inputSourceIds: readonly string[];
  executionTargetId: string;
  expressionBindingsEnabled: boolean;
  readOnly: boolean;
  editor?: AutomationNodeEditorAdapter;
  onChange: (patch: Partial<AutomationNode>) => void;
  onError: (error: string) => void;
}) {
  const t = useAutomationAuthoringText();
  const properties = automationSchemaProperties(schema);
  const editableProperties = Object.fromEntries(Object.entries(properties)
    .filter(([name,property]) => property.readOnly !== true
      && (editor?.isParameterVisible?.(node, name) ?? true))
    .sort((left, right) => automationParameterOrder(left[1]) - automationParameterOrder(right[1])));
  const values = parameterPath === 'parameters' && isAutomationParameterRecord(node.parameters.parameters)
    ? node.parameters.parameters
    : parameterPath === 'parameters' ? {} : node.parameters;
  function updateParameter(name: string, value: unknown) {
    if (parameterPath === 'root') {
      const changesROSMessageType = isROSPublishTopicKind(node.kind)
        && name === 'messageType'
        && typeof value === 'string'
        && value !== values.messageType;
      const changesROSServiceType = isROSServiceCallKind(node.kind)
        && name === 'serviceType'
        && typeof value === 'string'
        && value !== values.serviceType;
      if (changesROSMessageType || changesROSServiceType) onError('');
      const profilePatch = node.kind === 'ros1.record-bag'
        && name === 'recordingProfile'
        && (value === 'general' || value === 'camera_scientific')
        ? rosBagRecordingProfilePatch(value, values)
        : { [name]: value };
      onChange({ parameters: {
        ...node.parameters,
        ...profilePatch,
        ...(changesROSMessageType && typeof value === 'string'
          ? { message: defaultROSPublishMessage(node.kind, value) }
          : {}),
        ...(changesROSServiceType && typeof value === 'string'
          ? { request: defaultROSServiceRequest(node.kind, value) }
          : {}),
      } });
      return;
    }
    onChange({ parameters: { ...node.parameters,parameters: { ...values,[name]: value } } });
  }

  function updateParameterBinding(
    name: string,
    property: Record<string,unknown>,
    required: boolean,
    mode: 'fixed' | 'expression',
  ) {
    const target = parameterBindingTarget(parameterPath, name);
    const existing = node.parameterBindings ?? [];
    const fixedParametersPatch = (required || parameterPath === 'parameters')
      && !automationParameterValueMatchesSchema(values[name], property)
      ? {
          parameters: parameterPath === 'root'
            ? { ...node.parameters,[name]: automationFixedParameterFallback(property) }
            : { ...node.parameters,parameters: { ...values,[name]: automationFixedParameterFallback(property) } },
        }
      : {};
    if (mode === 'fixed') {
      const parameterBindings = existing.filter((binding) => binding.target !== target);
      onChange({ parameterBindings: parameterBindings.length > 0 ? parameterBindings : undefined,...fixedParametersPatch });
      return;
    }
    if (existing.some((binding) => binding.target === target)) return;
    onChange({
      parameterBindings: [...existing,{
        target,
        expression: inputSourceIds.length > 1
          ? automationInputFieldExpression({ sourceId: inputSourceIds[0],multipleSources: true,segments: [] })
          : '{{ $input }}',
        language: 'xgc-expression-v2',
      }],
      ...fixedParametersPatch,
    });
  }

  function updateParameterExpression(target: string, expression: string) {
    onChange({
      parameterBindings: (node.parameterBindings ?? []).map((binding) => binding.target === target
        ? { ...binding,expression,language: 'xgc-expression-v2' }
        : binding),
    });
  }

  function renderParameterField(name: string, property: Record<string,unknown>) {
    const target = parameterBindingTarget(parameterPath, name);
    const binding = (node.parameterBindings ?? []).find((candidate) => candidate.target === target);
    const required = isRequiredAutomationParameter(schema, name);
    const visibleProperty = node.kind === 'ros1.publish-topic'
      && node.typeVersion >= 3
      && name === 'publishCount'
      ? { ...property,title: 'Publish count (0 = unlimited)' }
      : property;
    if (isROSPublishTopicKind(node.kind) && name === 'message') {
      const messageType = typeof values.messageType === 'string' ? values.messageType : '';
      return (
        <AutomationParameterBindingField
          key={name}
          nodeId={node.id}
          label={automationParameterLabel(name, property)}
          target={target}
          binding={binding}
          expressionBindingsEnabled={expressionBindingsEnabled && automationParameterAllowsExpression(name, property)}
          readOnly={readOnly}
          onModeChange={(mode) => updateParameterBinding(name, property, required, mode)}
          onExpressionChange={updateParameterExpression}
          fixedField={(
            <AutomationJSONParameterField
              key={messageType}
              label="Message"
              presentation="terminal-template"
              roleId={`${node.id}:message`}
              value={isAutomationParameterRecord(values.message) ? values.message : {}}
              expected="object"
              readOnly={readOnly}
              onValid={(value) => updateParameter(name, value)}
              onError={onError}
            />
          )}
        />
      );
    }
    if (isROSServiceCallKind(node.kind) && name === 'request') {
      const serviceType = typeof values.serviceType === 'string' ? values.serviceType : '';
      return (
        <AutomationParameterBindingField
          key={name}
          nodeId={node.id}
          label={automationParameterLabel(name, property)}
          target={target}
          binding={binding}
          expressionBindingsEnabled={expressionBindingsEnabled && automationParameterAllowsExpression(name, property)}
          readOnly={readOnly}
          onModeChange={(mode) => updateParameterBinding(name, property, required, mode)}
          onExpressionChange={updateParameterExpression}
          fixedField={(
            <AutomationJSONParameterField
              key={serviceType}
              label="Request"
              presentation="terminal-template"
              roleId={`${node.id}:request`}
              value={isAutomationParameterRecord(values.request) ? values.request : {}}
              expected="object"
              readOnly={readOnly}
              onValid={(value) => updateParameter(name, value)}
              onError={onError}
            />
          )}
        />
      );
    }
    if (isROSServiceCallKind(node.kind) && name === 'serviceType') {
      const label = automationParameterLabel(name, property);
      const controlId = `automation-parameter-${node.id}-${name}`;
      const suggestionsId = `${controlId}-suggestions`;
      const ros2 = node.kind === 'ros2.call-service';
      return (
        <AutomationParameterBindingField
          key={name}
          nodeId={node.id}
          label={label}
          target={target}
          binding={binding}
          expressionBindingsEnabled={expressionBindingsEnabled && automationParameterAllowsExpression(name, property)}
          readOnly={readOnly}
          onModeChange={(mode) => updateParameterBinding(name, property, required, mode)}
          onExpressionChange={updateParameterExpression}
          fixedField={(
            <Fragment>
              <FormField
                className="automation-node-parameter-field"
                label={label}
                required={required}
                htmlFor={controlId}
                dataXgcRole="automation-ros-service-type"
                dataXgcId={node.id}
              >
                <InputControl
                  id={controlId}
                  list={suggestionsId}
                  value={typeof values[name] === 'string' ? values[name] : ''}
                  placeholder={ros2 ? 'std_srvs/srv/SetBool' : 'std_srvs/SetBool'}
                  readOnly={readOnly}
                  onChange={(value) => updateParameter(name, value)}
                />
              </FormField>
              <datalist id={suggestionsId}>
                {rosServiceTypeSuggestions(node.kind).map((value) => <option key={value} value={value} />)}
              </datalist>
            </Fragment>
          )}
        />
      );
    }
    if (isROSPublishTopicKind(node.kind) && name === 'messageType') {
      const label = automationParameterLabel(name, property);
      const messageType = typeof values[name] === 'string' ? values[name] : '';
      const guidedMessageTypes = rosMessageTypeSuggestions(node.kind);
      const ros2 = node.kind === 'ros2.publish-topic';
      const messageTypeOptions = [
        ...(!messageType || guidedMessageTypes.includes(messageType)
          ? []
          : [ros2
              ? { value: messageType,label: messageType,group: 'Current installed type' }
              : { value: messageType,label: messageType }]),
        ...guidedMessageTypes.map((value) => (ros2
          ? { value,label: value,group: value.split('/')[0] }
          : { value,label: value })),
      ];
      return (
        <AutomationParameterBindingField
          key={name}
          nodeId={node.id}
          label={label}
          target={target}
          binding={binding}
          expressionBindingsEnabled={expressionBindingsEnabled && automationParameterAllowsExpression(name, property)}
          readOnly={readOnly}
          onModeChange={(mode) => updateParameterBinding(name, property, required, mode)}
          onExpressionChange={updateParameterExpression}
          fixedField={(
            <FormField
              className="automation-node-parameter-field"
              label={label}
              required={required}
              dataXgcRole={ros2 ? 'automation-ros2-message-type' : 'automation-ros1-message-type'}
              dataXgcId={node.id}
            >
              <SelectControl
                fill
                value={messageType}
                options={messageTypeOptions}
                placeholder="Select a message type"
                ariaLabel={label}
                dataXgcRole={ros2 ? 'automation-ros2-message-type-select' : 'automation-ros1-message-type-select'}
                dataXgcId={node.id}
                disabled={readOnly}
                onChange={(value) => updateParameter(name, value)}
              />
            </FormField>
          )}
        />
      );
    }
    return (
      <AutomationCatalogParameterField
        key={name}
        nodeId={node.id}
        name={name}
        property={visibleProperty}
        options={parameterOptions?.[name]}
        required={required}
        value={values[name]}
        executionTargetId={executionTargetId}
        target={target}
        binding={binding}
        expressionBindingsEnabled={expressionBindingsEnabled && automationParameterAllowsExpression(name, property)}
        readOnly={readOnly}
        onChange={(value) => updateParameter(name, value)}
        onModeChange={(mode) => updateParameterBinding(name, property, required, mode)}
        onExpressionChange={updateParameterExpression}
        onError={onError}
      />
    );
  }

  const parameterEntries = Object.entries(editableProperties);
  const rosBagCustomNames = new Set(['slotIds','robotTopics','globalTopics']);
  const configuredGroups = automationParameterGroups(schema);
  const groupedParameterNames = new Set(configuredGroups.flatMap((group) => group.parameters));
  const basicParameters = parameterEntries.filter(([name]) => !groupedParameterNames.has(name)
    && !(node.kind === 'ros1.record-bag' && rosBagCustomNames.has(name)));
  const rosBagLeadingNames = new Set(['assetResourceId','componentId','recordingProfile']);
  const rosBagTrailingOrder = new Map([['includeMotionCapture',0],['cameraTopicRoots',1]]);
  const showRosBagCameraTopics = values.recordingProfile === 'camera_scientific'
    || (node.parameterBindings ?? []).some((binding) => (
      binding.target === parameterBindingTarget(parameterPath, 'recordingProfile')
      || binding.target === parameterBindingTarget(parameterPath, 'cameraTopicRoots')
    ));
  const leadingParameters = node.kind === 'ros1.record-bag'
    ? basicParameters.filter(([name]) => rosBagLeadingNames.has(name))
    : basicParameters;
  const trailingParameters = node.kind === 'ros1.record-bag'
    ? basicParameters
      .filter(([name]) => !rosBagLeadingNames.has(name) && (name !== 'cameraTopicRoots' || showRosBagCameraTopics))
      .sort(([left], [right]) => (
        (rosBagTrailingOrder.get(left) ?? 100) - (rosBagTrailingOrder.get(right) ?? 100)
      ))
    : [];
  const groupedParameters = configuredGroups.map((group) => ({
    ...group,
    content: group.parameters.flatMap((name) => {
      const property = editableProperties[name];
      return property ? [renderParameterField(name, property)] : [];
    }),
  }));
  return (
    <section className="automation-parameter-fields" data-xgc-role="automation-node-parameters" data-xgc-id={node.id}>
      {leadingParameters.map(([name, property]) => renderParameterField(name, property))}
      {node.kind === 'ros1.record-bag' && (
        <ROSBagRecorderFields
          nodeId={node.id}
          robotOptions={parameterOptions?.slotIds ?? parameterOptions?.robotIds ?? []}
          slotIds={values.slotIds}
          robotTopics={values.robotTopics}
          globalTopics={values.globalTopics}
          readOnly={readOnly}
          renderField={(name, fixedField) => {
            const property = editableProperties[name];
            if (!property) return null;
            const target = parameterBindingTarget(parameterPath, name);
            const binding = (node.parameterBindings ?? []).find((candidate) => candidate.target === target);
            return (
              <AutomationParameterBindingField
                key={name}
                nodeId={node.id}
                label={automationParameterLabel(name, property)}
                target={target}
                binding={binding}
                expressionBindingsEnabled={expressionBindingsEnabled && automationParameterAllowsExpression(name, property)}
                readOnly={readOnly}
                onModeChange={(mode) => updateParameterBinding(name, property, isRequiredAutomationParameter(schema, name), mode)}
                onExpressionChange={updateParameterExpression}
                fixedField={fixedField}
              />
            );
          }}
          onChange={updateParameter}
          onError={onError}
        />
      )}
      {trailingParameters.map(([name, property]) => renderParameterField(name, property))}
      <AutomationParameterGroups nodeId={node.id} groups={groupedParameters} />
      {Object.keys(editableProperties).length === 0 && <p>{t('No parameters are required for this node.')}</p>}
    </section>
  );
}

function rosBagRecordingProfilePatch(
  profile: 'general' | 'camera_scientific',
  values: Record<string,unknown>,
): Record<string,unknown> {
  if (profile === 'general') {
    return {
      recordingProfile: profile,
      cameraTopicRoots: [],
      expectedDurationMinutes: 60,
      estimatedVideoBitrateMbps: 0,
      capacitySafetyFactor: 1.25,
      splitSizeMiB: 1024,
      maxSplits: 10,
      minFreeSpaceGiB: 2,
      compression: 'lz4',
    };
  }
  const cameraTopicRoots = Array.isArray(values.cameraTopicRoots)
    && values.cameraTopicRoots.some((value) => typeof value === 'string' && value.trim())
    ? values.cameraTopicRoots
    : ['/xgc/camera/world'];
  return {
    recordingProfile: profile,
    cameraTopicRoots,
    expectedDurationMinutes: 60,
    estimatedVideoBitrateMbps: 24,
    capacitySafetyFactor: 1.25,
    splitSizeMiB: 2048,
    maxSplits: 8,
    minFreeSpaceGiB: 4,
    compression: 'none',
  };
}

function automationParameterOrder(property: Record<string,unknown>) {
  return typeof property['x-xgc-order'] === 'number' && Number.isFinite(property['x-xgc-order'])
    ? property['x-xgc-order']
    : 0;
}

function scheduleParameterDescriptors(
  scheduleKind: 'once' | 'cron',
  parameters: AutomationNode['parameters'],
  t: (text: string) => string,
) {
  return [
    {
      name: 'kind',
      property: {
        type: 'string',
        title: t('Trigger type'),
        enum: ['cron','once'],
        enumNames: [t('Cron schedule'),t('Run once')],
      },
      value: scheduleKind,
    },
    {
      name: 'expression',
      property: {
        type: 'string',
        title: t(scheduleKind === 'once' ? 'Run at' : 'Cron expression'),
        placeholder: scheduleKind === 'once' ? '2026-07-14T12:00:00+08:00' : '0 9 * * 1-5',
      },
      value: typeof parameters.expression === 'string' ? parameters.expression : '',
    },
    {
      name: 'timezone',
      property: { type: 'string',title: t('Timezone'),placeholder: 'Asia/Shanghai' },
      value: typeof parameters.timezone === 'string' ? parameters.timezone : 'UTC',
    },
  ];
}
