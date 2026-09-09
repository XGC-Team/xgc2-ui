import { Plus,Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button,FormSection,FormSectionSpan,Notice } from '@xgc2/ui-react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import '../../styles/automation-run-parameters.css';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import {
  AUTHORABLE_AUTOMATION_PARAMETER_KINDS,
  isAuthorableAutomationParameterField,
  type AuthorableAutomationParameterKind,
} from './automationRunParameterAuthoring';
import { automationParameterSchemaError } from './automationValidation';
import { AutomationNumericInput } from './AutomationNumericInput';
import type {
  AutomationParameterField,
  AutomationParameterSchema,
} from './automationDefinitionContracts';

/**
 * Authoring surface for one public Action's input schema.
 *
 * It edits the scalar kinds the shared run-parameter form can render. A field a
 * seed declared with a nested kind stays visible and untouched rather than
 * being dropped, because deleting a parameter the workflow reads would break
 * the run rather than the form.
 */
export function AutomationRunParameterSchemaEditor({
  resourceId,
  actionId,
  actionLabel,
  schema,
  readOnly,
  disabled,
  onChange,
}: {
  resourceId: string;
  actionId: string;
  actionLabel: string;
  schema: AutomationParameterSchema;
  readOnly: boolean;
  disabled: boolean;
  onChange: (schema: AutomationParameterSchema) => void;
}) {
  const t = useAutomationAuthoringText();
  const fields = schema.fields;
  const [open,setOpen] = useState(false);
  const summary = fields.length === 0
    ? t('Action inputs')
    : fields.length === 1
      ? t('1 action input')
      : t('{count} action inputs', { count: fields.length });
  const accessibleSummary = t('Action inputs for {name}', { name: actionLabel });
  const error = automationParameterSchemaError(schema);
  const replaceField = (index: number, next: AutomationParameterField) => {
    onChange({ ...schema,fields: fields.map((field, position) => position === index ? next : field) });
  };
  if (readOnly && fields.length === 0) return null;
  return (
    <div
      className="automation-run-parameters-setting"
      data-xgc-role="automation-action-inputs-editor"
      data-xgc-id={`${resourceId}:${actionId}`}
      data-xgc-readonly={readOnly ? 'true' : 'false'}
    >
      <Button
        appearance="ghost"
        aria-label={accessibleSummary}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-xgc-id={`${resourceId}:${actionId}`}
        data-xgc-role="automation-action-inputs-summary"
        title={accessibleSummary}
        type="button"
        onClick={() => setOpen(true)}
      >
        <span className="automation-run-parameters-summary-label">{t('Action inputs')}</span>
      </Button>
      <ConfigDrawer
        ariaLabel={accessibleSummary}
        bodyClassName="automation-run-parameters-drawer-body"
        className="config-drawer-wide automation-run-parameters-drawer"
        closeDataXgcId={`${resourceId}:${actionId}`}
        closeDataXgcRole="automation-action-inputs-close"
        closeLabel={t('Close run parameters')}
        closeOnBackdrop
        dataXgcId={`${resourceId}:${actionId}`}
        dataXgcRole="automation-action-inputs-fields"
        onClose={() => setOpen(false)}
        open={open}
        subtitle={actionLabel}
        title={summary}
      >
        <div
          className="automation-run-parameters-fields"
          data-xgc-role="automation-action-inputs-field-list"
          data-xgc-id={`${resourceId}:${actionId}`}
          data-xgc-readonly={readOnly ? 'true' : 'false'}
        >
          {error && <Notice tone="danger" density="compact">{error}</Notice>}
          {/*
            The row key is the position alone. Keying it by the field name would
            change the key on every keystroke in the Name box, remounting the row
            and dropping focus after each character — the operator could not type
            a parameter name at all.
          */}
          {fields.map((field, index) => (
            <AutomationRunParameterFieldRow
              key={index}
              resourceId={resourceId}
              field={field}
              disabled={disabled || readOnly}
              removable={!readOnly}
              onChange={(next) => replaceField(index, next)}
              onRemove={() => onChange({ ...schema,fields: fields.filter((_item, position) => position !== index) })}
            />
          ))}
          {!readOnly && <ControlButton
            appearance="ghost"
            size="compact"
            type="button"
            disabled={disabled}
            dataXgcRole="automation-run-parameters-add"
            dataXgcId={resourceId}
            onClick={() => onChange({ ...schema,fields: [...fields,newAutomationParameterField(fields)] })}
          ><Plus size={14} />{t('Add action input')}</ControlButton>}
        </div>
      </ConfigDrawer>
    </div>
  );
}

function AutomationRunParameterFieldRow({
  resourceId,
  field,
  disabled,
  removable,
  onChange,
  onRemove,
}: {
  resourceId: string;
  field: AutomationParameterField;
  disabled: boolean;
  removable: boolean;
  onChange: (field: AutomationParameterField) => void;
  onRemove: () => void;
}) {
  const t = useAutomationAuthoringText();
  const authorable = isAuthorableAutomationParameterField(field);
  return (
    <FormSection
      bodyClassName="automation-run-parameters-row-fields"
      className="automation-run-parameters-row"
      columns={2}
      dataXgcRole="automation-run-parameter"
      dataXgcId={`${resourceId}:${field.name}`}
      data-xgc-authorable={authorable ? 'true' : 'false'}
      title={field.label || field.name || t('Parameters')}
    >
      {field.description && (
        <FormSectionSpan
          className="automation-run-parameter-description"
          data-xgc-role="automation-run-parameter-description"
          data-xgc-id={`${resourceId}:${field.name}`}
        >{field.description}</FormSectionSpan>
      )}
      <FormField label={t('Name')}>
        <InputControl
          value={field.name}
          disabled={disabled || !authorable}
          aria-label={t('Run parameter name')}
          onChange={(name) => onChange({ ...field,name })}
        />
      </FormField>
      <FormField label={t('Label')}>
        <InputControl
          value={field.label ?? ''}
          disabled={disabled || !authorable}
          aria-label={t('Run parameter label')}
          onChange={(label) => onChange({ ...field,label: label || undefined })}
        />
      </FormField>
      <FormField label={t('Kind')}>
        <SelectControl
          value={field.kind}
          disabled={disabled || !authorable}
          ariaLabel={t('Run parameter kind')}
          dataXgcRole="automation-run-parameter-kind"
          dataXgcId={field.name}
          options={AUTHORABLE_AUTOMATION_PARAMETER_KINDS.map((kind) => ({ value: kind,label: kind }))}
          onChange={(kind) => onChange(retypeAutomationParameterField(field, kind as AuthorableAutomationParameterKind))}
        />
      </FormField>
      {authorable && <AutomationRunParameterDefault field={field} disabled={disabled} onChange={onChange} />}
      {authorable && field.kind === 'string' && (
        <FormField label={t('Allowed values')}>
          <InputControl
            value={(field.string?.enum ?? []).join(', ')}
            disabled={disabled}
            aria-label={t('Run parameter allowed values')}
            placeholder={t('value-a, value-b')}
            onChange={(raw) => onChange({ ...field,string: withStringEnum(field, raw) })}
          />
        </FormField>
      )}
      <SwitchControl
        checked={Boolean(field.required)}
        label={t('Required')}
        disabled={disabled || !authorable}
        dataXgcRole="automation-run-parameter-required"
        dataXgcId={`${resourceId}:${field.name}`}
        onChange={(required) => onChange({ ...field,required: required || undefined })}
      />
      {removable && <FormSectionSpan className="automation-run-parameters-row-actions">
        <ControlButton
          appearance="ghost"
          size="compact"
          iconOnly
          tone="danger"
          type="button"
          disabled={disabled}
          aria-label={t('Remove run parameter {name}', { name: field.name })}
          dataXgcRole="automation-run-parameter-remove"
          dataXgcId={`${resourceId}:${field.name}`}
          onClick={onRemove}
        ><Trash2 size={14} /></ControlButton>
      </FormSectionSpan>}
    </FormSection>
  );
}

function AutomationRunParameterDefault({
  field,
  disabled,
  onChange,
}: {
  field: AutomationParameterField;
  disabled: boolean;
  onChange: (field: AutomationParameterField) => void;
}) {
  const t = useAutomationAuthoringText();
  if (field.kind === 'boolean') {
    return (
      <SwitchControl
        checked={Boolean(field.boolean?.default)}
        label={t('Default value')}
        disabled={disabled}
        dataXgcRole="automation-run-parameter-default"
        dataXgcId={field.name}
        onChange={(next) => onChange({ ...field,boolean: { default: next } })}
      />
    );
  }
  if (field.kind === 'string') {
    return (
      <FormField label={t('Default value')}>
        <InputControl
          value={field.string?.default ?? ''}
          disabled={disabled}
          aria-label={t('Run parameter default')}
          onChange={(next) => onChange({ ...field,string: { ...field.string,default: next || undefined } })}
        />
      </FormField>
    );
  }
  const numeric = field.kind === 'integer' ? field.integer : field.number;
  return (
    <FormField label={t('Default value')}>
      <AutomationNumericInput
        value={numeric?.default}
        integer={field.kind === 'integer'}
        disabled={disabled}
        ariaLabel={t('Run parameter default')}
        onValueChange={(value) => onChange(withNumericDefault(field, value))}
        onEmpty={() => onChange(withNumericDefault(field, undefined))}
      />
    </FormField>
  );
}

function newAutomationParameterField(fields: readonly AutomationParameterField[]): AutomationParameterField {
  const taken = new Set(fields.map((field) => field.name));
  let name = 'parameter';
  let index = 1;
  while (taken.has(name)) {
    index += 1;
    name = `parameter${index}`;
  }
  return { name,kind: 'string' };
}

// Changing the kind drops the previous kind's constraints: keeping them would
// produce a field whose constraints do not match its kind, which both trust
// boundaries refuse.
function retypeAutomationParameterField(
  field: AutomationParameterField,
  kind: AuthorableAutomationParameterKind,
): AutomationParameterField {
  return { name: field.name,label: field.label,description: field.description,required: field.required,kind };
}

function withStringEnum(field: AutomationParameterField, raw: string) {
  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  return { ...field.string,...(values.length > 0 ? { enum: values } : { enum: undefined }) };
}

function withNumericDefault(field: AutomationParameterField, value: number | undefined): AutomationParameterField {
  const bounds = field.kind === 'integer' ? field.integer : field.number;
  const next = { ...bounds,default: value };
  return field.kind === 'integer' ? { ...field,integer: next } : { ...field,number: next };
}
