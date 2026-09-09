import { Ellipsis } from 'lucide-react';
import { useEffect,useState } from 'react';
import type { DragEvent as ReactDragEvent,ReactNode } from 'react';
import { InputActionControl } from '@xgc2/ui-react';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import { SegmentedControl } from '../../components/SegmentedControl';
import '../../styles/automation-parameter-controls.css';
import { AutomationPathPicker } from './AutomationPathPicker';
import {
  isGazeboWorldPathField,
  isROSBagPlayPathField,
  type AutomationPathKind,
  type AutomationPathPickerVariant,
} from './automationPathPickerModel';
import { listROSBagRecordings,type ROSBagRecording } from '../recording/recordingPublic';
import {
  automationInputFieldExpression,
  hasAutomationInputFieldDrag,
  readAutomationInputFieldDrag,
} from './automationInputExpression';
import type { AutomationParameterBinding } from './automationDefinitionContracts';
import { messageOf } from './automationErrorModel';
import { AutomationNumericInput } from './AutomationNumericInput';
import { automationParameterLabel } from './automationParameterModel';

export type AutomationParameterOption = {
  value: string;
  label: string;
};

export type AutomationParameterOptions = Record<string,readonly (string | AutomationParameterOption)[]>;

export function AutomationCatalogParameterField({ nodeId,name,property,options,required,value,executionTargetId,target,binding,expressionBindingsEnabled,readOnly,inlineDescription,onChange,onModeChange,onExpressionChange,onError }: {
  nodeId: string;
  name: string;
  property: Record<string,unknown>;
  options?: readonly (string | AutomationParameterOption)[];
  required: boolean;
  value: unknown;
  executionTargetId: string;
  target: string;
  binding?: AutomationParameterBinding;
  expressionBindingsEnabled: boolean;
  readOnly: boolean;
  /** Opt-in visible helper copy for scalar fields; schema descriptions remain hover help. */
  inlineDescription?: ReactNode;
  onChange: (value: unknown) => void;
  onModeChange: (mode: 'fixed' | 'expression') => void;
  onExpressionChange: (target: string, expression: string) => void;
  onError: (error: string) => void;
}) {
  const label = automationParameterLabel(name, property);
  return (
    <AutomationParameterBindingField
      nodeId={nodeId}
      label={label}
      target={target}
      binding={binding}
      expressionBindingsEnabled={expressionBindingsEnabled}
      readOnly={readOnly}
      onModeChange={onModeChange}
      onExpressionChange={onExpressionChange}
      fixedField={(
        <AutomationFixedParameterField
          nodeId={nodeId}
          name={name}
          property={property}
          options={options}
          required={required}
          value={value}
          executionTargetId={executionTargetId}
          readOnly={readOnly}
          inlineDescription={inlineDescription}
          onChange={onChange}
          onError={onError}
        />
      )}
    />
  );
}

export function AutomationParameterBindingField({ nodeId,label,target,binding,expressionBindingsEnabled,readOnly,onModeChange,onExpressionChange,fixedField }: {
  nodeId: string;
  label: string;
  target: string;
  binding?: AutomationParameterBinding;
  expressionBindingsEnabled: boolean;
  readOnly: boolean;
  onModeChange: (mode: 'fixed' | 'expression') => void;
  onExpressionChange: (target: string, expression: string) => void;
  fixedField: ReactNode;
}) {
  if (!expressionBindingsEnabled) return fixedField;
  const mode = binding ? 'expression' : 'fixed';
  return (
    <div
      className="automation-parameter-binding-field"
      data-xgc-role="automation-node-parameter-binding"
      data-xgc-id={`${nodeId}:${target}`}
      data-xgc-mode={mode}
      data-xgc-mode-placement="label-row"
    >
      <div className="automation-parameter-mode-row">
        <AutomationParameterModeSwitch
          nodeId={nodeId}
          target={target}
          label={label}
          mode={mode}
          readOnly={readOnly}
          onChange={onModeChange}
        />
      </div>
      {binding ? (
        <AutomationExpressionParameterField
          nodeId={nodeId}
          label={label}
          target={target}
          expression={binding.expression}
          readOnly={readOnly}
          onChange={onExpressionChange}
        />
      ) : fixedField}
    </div>
  );
}

export function AutomationParameterModeSwitch({ nodeId,target,label,mode,readOnly,onChange }: {
  nodeId: string;
  target: string;
  label: string;
  mode: 'fixed' | 'expression';
  readOnly: boolean;
  onChange: (mode: 'fixed' | 'expression') => void;
}) {
  return <SegmentedControl
    ariaLabel={`${label} value source`}
    className="automation-parameter-mode-switch"
    onChange={onChange}
    optionDataXgcRole="automation-node-parameter-mode"
    options={(['fixed', 'expression'] as const).map((option) => ({
      dataXgcId: `${nodeId}:${target}:${option}`,
      disabled: readOnly,
      label: option === 'fixed' ? 'Fixed' : 'Expression',
      value: option,
    }))}
    size="compact"
    value={mode}
  />;
}

export function AutomationJSONParameterField({ label,description,tooltip,value,readOnly,onValid,onError,roleId,expected = 'object',presentation = 'default' }: {
  label: string;
  description?: ReactNode;
  tooltip?: string;
  value: unknown;
  readOnly: boolean;
  onValid: (value: unknown) => void;
  onError: (error: string) => void;
  roleId: string;
  expected?: 'object' | 'array';
  presentation?: 'default' | 'terminal-template';
}) {
  const controlId = `automation-parameter-json-${roleId}`;
  return (
    <FormField
      label={label}
      description={description}
      htmlFor={controlId}
      tooltip={tooltip}
      className={`automation-node-parameter-field${presentation === 'terminal-template' ? ' automation-json-terminal-template' : ''}`}
      dataXgcRole="automation-node-parameter-json"
      dataXgcId={roleId}
    >
      <TextareaControl
        id={controlId}
        key={JSON.stringify(value)}
        defaultValue={JSON.stringify(value, null, 2)}
        readOnly={readOnly}
        spellCheck={false}
        onBlur={readOnly ? undefined : (event) => {
          try {
            const parsed: unknown = JSON.parse(event.target.value);
            if (expected === 'array' ? !Array.isArray(parsed) : !isRecord(parsed)) throw new Error(`value must be a JSON ${expected}`);
            onValid(parsed);
            onError('');
          } catch (cause) {
            onError(`${label}: ${messageOf(cause)}`);
          }
        }}
      />
    </FormField>
  );
}

function AutomationFixedParameterField({ nodeId,name,property,options,required,value,executionTargetId,readOnly,inlineDescription,onChange,onError }: {
  nodeId: string;
  name: string;
  property: Record<string,unknown>;
  options?: readonly (string | AutomationParameterOption)[];
  required: boolean;
  value: unknown;
  executionTargetId: string;
  readOnly: boolean;
  inlineDescription?: ReactNode;
  onChange: (value: unknown) => void;
  onError: (error: string) => void;
}) {
  const type = typeof property.type === 'string' ? property.type : 'string';
  const label = automationParameterLabel(name, property);
  const help = parameterHelpText(property);
  const enumValues = Array.isArray(property.enum) ? property.enum : [];
  const enumNames = Array.isArray(property.enumNames) ? property.enumNames : [];
  const selectionValues = options ?? enumValues;
  if (options !== undefined || enumValues.length > 0) {
    const encodedValue = encodeOption(value);
    const includesCurrent = selectionValues.some((option) => encodeOption(parameterOptionValue(option)) === encodedValue);
    return (
      <AutomationEnumParameterField
        nodeId={nodeId}
        name={name}
        label={label}
        tooltip={help}
        value={encodedValue}
        readOnly={readOnly}
        placeholder={options !== undefined ? (options.length > 0 ? 'Select an option' : 'No available options') : undefined}
        options={[
          ...(options === undefined && !required ? [{ value: '',label: 'Not set' }] : []),
          ...(encodedValue && !includesCurrent ? [{ value: encodedValue,label: String(value) }] : []),
          ...selectionValues.map((option, index) => ({
            value: encodeOption(parameterOptionValue(option)),
            label: isAutomationParameterOption(option)
              ? option.label
              : options === undefined && typeof enumNames[index] === 'string' ? String(enumNames[index]) : String(option),
          })),
        ]}
        onChange={(nextValue) => onChange(decodeOption(nextValue))}
      />
    );
  }
  const pathPresentation = automationParameterPathPresentation(name, property);
  if (pathPresentation) {
    return (
      <AutomationPathParameterField
        nodeId={nodeId}
        name={name}
        label={label}
        tooltip={help}
        kind={pathPresentation.kind}
        fileExtensions={pathPresentation.fileExtensions}
        variant={pathPresentation.variant}
        value={typeof value === 'string' ? value : ''}
        executionTargetId={executionTargetId}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }
  if (type === 'boolean') {
    const checked = Boolean(value);
    return (
      <SwitchControl
        className="automation-boolean-field"
        checked={checked}
        label={label}
        description={checked ? 'On' : 'Off'}
        tooltip={help}
        disabled={readOnly}
        dataXgcRole="automation-node-parameter"
        dataXgcId={`${nodeId}:${name}`}
        onChange={onChange}
      />
    );
  }
  if (type === 'object' || type === 'array') {
    return (
      <AutomationJSONParameterField
        label={label}
        tooltip={help}
        roleId={`${nodeId}:${name}`}
        value={value ?? (type === 'array' ? [] : {})}
        expected={type}
        readOnly={readOnly}
        onValid={onChange}
        onError={onError}
      />
    );
  }
  if (type === 'string' && property['x-xgc-control'] === 'textarea') {
    const controlId = `automation-parameter-${nodeId}-${name}`;
    return (
      <FormField className="automation-node-parameter-field" label={label} htmlFor={controlId} tooltip={help} dataXgcRole="automation-node-parameter" dataXgcId={`${nodeId}:${name}`}>
        <TextareaControl
          id={controlId}
          value={typeof value === 'string' ? value : ''}
          readOnly={readOnly}
          spellCheck={false}
          onChange={onChange}
        />
      </FormField>
    );
  }
  const numeric = type === 'integer' || type === 'number';
  const controlId = `automation-parameter-${nodeId}-${name}`;
  if (numeric) {
    const presentation = numericParameterPresentation(label);
    return (
      <FormField className="automation-node-parameter-field" label={presentation.label} description={inlineDescription} htmlFor={controlId} tooltip={help} dataXgcRole="automation-node-parameter" dataXgcId={`${nodeId}:${name}`}>
        <AutomationNumericInput
          id={controlId}
          ariaLabel={label}
          value={typeof value === 'number' ? value : undefined}
          integer={type === 'integer'}
          min={typeof property.minimum === 'number' ? property.minimum : undefined}
          max={typeof property.maximum === 'number' ? property.maximum : undefined}
          unit={presentation.unit}
          readOnly={readOnly}
          onValueChange={onChange}
          onEmpty={required ? undefined : () => onChange(undefined)}
        />
      </FormField>
    );
  }
  return (
    <FormField className="automation-node-parameter-field" label={label} description={inlineDescription} htmlFor={controlId} tooltip={help} dataXgcRole="automation-node-parameter" dataXgcId={`${nodeId}:${name}`}>
      <InputControl
        id={controlId}
        type={property.sensitive ? 'password' : 'text'}
        autoComplete={property.sensitive ? 'new-password' : undefined}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        readOnly={readOnly}
        placeholder={typeof property.placeholder === 'string' ? property.placeholder : undefined}
        onChange={onChange}
      />
    </FormField>
  );
}

function numericParameterPresentation(label: string): { label: string;unit?: string } {
  const match = /^(.*?)\s+\(([^()]+)\)$/.exec(label);
  const fieldLabel = match?.[1]?.trim();
  const unit = match?.[2]?.trim();
  return fieldLabel && unit ? { label:fieldLabel,unit } : { label };
}

function AutomationPathParameterField({ nodeId,name,label,tooltip,kind,fileExtensions,variant,value,executionTargetId,readOnly,onChange }: {
  nodeId: string;
  name: string;
  label: string;
  tooltip?: string;
  kind: AutomationPathKind;
  fileExtensions?: readonly string[];
  variant: AutomationPathPickerVariant;
  value: string;
  executionTargetId: string;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recordedBags,setRecordedBags] = useState<ROSBagRecording[]>([]);
  const offersRecordedBags = isROSBagPlayPathField(name,kind,fileExtensions);
  useEffect(() => {
    if (!offersRecordedBags) {
      setRecordedBags([]);
      return undefined;
    }
    const controller = new AbortController();
    listROSBagRecordings({ limit:100 },controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setRecordedBags(page.items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecordedBags([]);
      });
    return () => controller.abort();
  },[offersRecordedBags]);
  const controlId = `automation-path-parameter-${nodeId}-${name}`;
  return (
    <>
      {/*
        No helper text under path controls — drawer layout forbids below-field copy.
        Extension filters are shown only inside the browse dialog header.
      */}
      <FormField
        label={label}
        htmlFor={controlId}
        tooltip={tooltip}
        className="automation-node-parameter-field automation-path-parameter"
        dataXgcRole="automation-node-path-parameter"
        dataXgcId={`${nodeId}:${name}`}
      >
        <div className="automation-path-parameter-controls">
          {recordedBags.length > 0 && <SelectControl
            ariaLabel="Recorded bags"
            dataXgcRole="automation-node-recorded-bag"
            dataXgcId={`${nodeId}:${name}`}
            disabled={readOnly}
            fill
            placeholder="Recorded bags"
            value={recordedBags.some((bag) => bag.path === value) ? value : ''}
            options={recordedBags.map((bag) => ({
              value:bag.path,
              label:bag.experimentId ? `${bag.name} · ${bag.experimentId}` : bag.name,
            }))}
            onChange={onChange}
          />}
          <InputActionControl
            id={controlId}
            aria-label={label}
            value={value}
            readOnly={readOnly}
            actionLabel="Browse"
            actionIcon={<Ellipsis size={16} aria-hidden="true" />}
            actionDisabled={readOnly}
            onValueChange={onChange}
            onAction={() => setPickerOpen(true)}
          />
        </div>
      </FormField>
      {pickerOpen && (
        <AutomationPathPicker
          targetId={executionTargetId}
          kind={kind}
          fileExtensions={fileExtensions}
          variant={variant}
          value={value}
          onSelect={(path) => {
            onChange(path);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function AutomationExpressionParameterField({ nodeId,label,target,expression,readOnly,onChange }: {
  nodeId: string;
  label: string;
  target: string;
  expression: string;
  readOnly: boolean;
  onChange: (target: string, expression: string) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const controlId = `automation-expression-${nodeId}-${target}`;
  function acceptInputField(event: ReactDragEvent<HTMLTextAreaElement>) {
    if (readOnly || !hasAutomationInputFieldDrag(event.dataTransfer)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    return true;
  }
  return (
    <FormField
      label={label}
      htmlFor={controlId}
      className="automation-node-parameter-field automation-parameter-expression"
      dataXgcRole="automation-node-parameter-expression"
      dataXgcId={`${nodeId}:${target}`}
    >
      <TextareaControl
        id={controlId}
        aria-label={`${label} expression`}
        data-drag-active={dragActive ? 'true' : undefined}
        value={expression}
        readOnly={readOnly}
        maxLength={4_096}
        rows={3}
        spellCheck={false}
        placeholder="{{ $input }}"
        onChange={(value) => onChange(target, value)}
        onDragEnter={(event) => {
          if (acceptInputField(event)) setDragActive(true);
        }}
        onDragOver={acceptInputField}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={(event) => {
          setDragActive(false);
          if (!acceptInputField(event)) return;
          const reference = readAutomationInputFieldDrag(event.dataTransfer);
          if (!reference) return;
          const insertion = automationInputFieldExpression(reference);
          const current = event.currentTarget.value;
          const selectionStart = event.currentTarget.selectionStart ?? current.length;
          const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
          onChange(target, current.length === 0
            ? insertion
            : `${current.slice(0, selectionStart)}${insertion}${current.slice(selectionEnd)}`);
        }}
      />
    </FormField>
  );
}

function AutomationEnumParameterField({ nodeId,name,label,tooltip,value,options,placeholder,readOnly,onChange }: {
  nodeId: string;
  name: string;
  label: string;
  tooltip?: string;
  value: string;
  options: Array<{ value: string;label: string }>;
  placeholder?: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const controlOptions = options.length > 0
    ? options
    : [{ value: '',label: placeholder ?? 'No available options',disabled: true }];
  return (
    <FormField
      className="automation-node-parameter-field"
      label={label}
      tooltip={tooltip}
      dataXgcRole="automation-node-parameter"
      dataXgcId={`${nodeId}:${name}`}
    >
      <SelectControl
        fill
        value={value}
        options={controlOptions}
        placeholder={placeholder}
        onChange={onChange}
        ariaLabel={label}
        dataXgcRole="automation-node-parameter-select"
        dataXgcId={`${nodeId}:${name}`}
        disabled={readOnly || options.length === 0}
      />
    </FormField>
  );
}

function parameterHelpText(property: Record<string,unknown>): string | undefined {
  return typeof property.description === 'string' && property.description.trim()
    ? property.description.trim()
    : undefined;
}

function automationParameterPathKind(property: Record<string,unknown>): AutomationPathKind | undefined {
  const kind = property['x-xgc-path-kind'];
  return kind === 'file' || kind === 'directory' ? kind : undefined;
}

function automationParameterFileExtensions(property: Record<string,unknown>) {
  const extensions = property['x-xgc-file-extensions'];
  if (!Array.isArray(extensions)) return undefined;
  const normalized = extensions
    .filter((extension): extension is string => typeof extension === 'string' && /^\.[a-z0-9]+$/i.test(extension))
    .map((extension) => extension.toLowerCase());
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Schema-declared path fields use x-xgc-path-kind (+ optional fileExtensions).
 * Older ROS Control process fields may still be plain strings — keep host path
 * pickers for those names until they are re-provisioned with path metadata.
 *
 * Gazebo world uses the dedicated world picker (catalog + scene preview).
 * Every other path field uses the generic browser with optional suffix filters.
 */
function automationParameterPathPresentation(name: string, property: Record<string,unknown>): {
  kind: AutomationPathKind;
  fileExtensions?: readonly string[];
  variant: AutomationPathPickerVariant;
} | undefined {
  const kind = automationParameterPathKind(property);
  if (kind) {
    const fileExtensions = automationParameterFileExtensions(property);
    return {
      kind,
      fileExtensions,
      variant: isGazeboWorldPathField(name, kind, fileExtensions) ? 'world' : 'path',
    };
  }
  if (name === 'gazeboWorld') return { kind: 'file',fileExtensions: ['.world'],variant: 'world' };
  if (name === 'rvizConfigPath') return { kind: 'file',fileExtensions: ['.rviz'],variant: 'path' };
  return undefined;
}

function encodeOption(value: unknown) {
  return value === '' || value === undefined ? '' : JSON.stringify(value);
}

function decodeOption(value: string) {
  return value === '' ? '' : JSON.parse(value) as unknown;
}

function parameterOptionValue(option: string | AutomationParameterOption | unknown) {
  return isAutomationParameterOption(option) ? option.value : option;
}

function isAutomationParameterOption(option: unknown): option is AutomationParameterOption {
  return isRecord(option) && typeof option.value === 'string' && typeof option.label === 'string';
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
