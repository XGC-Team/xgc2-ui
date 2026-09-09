import { Play } from 'lucide-react';
import { useId,useState,type FormEvent } from 'react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl,TextareaControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { Notice } from '@xgc2/ui-react';
import { CheckboxControl,FormField } from '../../components/FormPrimitives';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import '../../styles/automation-parameter-controls.css';
import type {
  AutomationDocument,
  AutomationParameterField,
} from './automationDefinitionContracts';
import { messageOf } from './automationErrorModel';
import { serializeParameters } from './automationParameterModel';
import { automationActionForEntry,automationPrimaryAction } from './automationSpecModel';

export function AutomationRunParameterDialog({ document,entrypointNodeId,onClose,onRun }: {
  document: AutomationDocument;
  entrypointNodeId?: string;
  onClose: () => void;
  onRun: (parameters: Record<string,unknown>) => Promise<unknown>;
}) {
  const t = useAutomationAuthoringText();
  const action = automationActionForEntry(document.spec, entrypointNodeId) ?? automationPrimaryAction(document.spec);
  const fields = action?.inputSchema.fields ?? [];
  const [values, setValues] = useState<Record<string,unknown>>(() => initialValues(fields));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (!action) throw new Error('This Automation does not publish an invocable Action.');
      const parameters = serializeParameters(fields, values);
      setBusy(true);
      setError('');
      await onRun(parameters);
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfigDrawer
      ariaLabel={t('Run parameters for {name}', { name: document.spec.metadata.name })}
      className="automation-run-parameter-dialog"
      closeDataXgcId={document.head.resourceId}
      closeDataXgcRole="automation-run-parameter-close"
      closeLabel={t('Close run parameters')}
      dataXgcId={document.head.resourceId}
      dataXgcRole="automation-run-parameter-dialog"
      dismissible={!busy}
      footer={<>
        <ControlButton type="button" dataXgcRole="automation-run-parameter-cancel" dataXgcId={document.head.resourceId} disabled={busy} onClick={onClose}>{t('Cancel')}</ControlButton>
        <ControlButton tone="primary" type="submit" form={formId} dataXgcRole="automation-run-submit" dataXgcId={document.head.resourceId} disabled={busy}>
          <Play size={14} />{t(busy ? 'Starting' : 'Start run')}
        </ControlButton>
      </>}
      onClose={onClose}
      subtitle={document.spec.metadata.name}
      title={t('Start configuration run')}
    >
      <form
        className="xgc-config-form"
        id={formId}
        onSubmit={(event) => void submit(event)}
      >
        {!action && <span className="automation-run-parameter-empty">{t('This Automation does not publish an invocable Action.')}</span>}
        {fields.map((field) => (
          <ParameterField
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(value) => setValues((current) => ({ ...current,[field.name]: value }))}
          />
        ))}
        {action && fields.length === 0 && <span className="automation-run-parameter-empty">{t('This Action declares no inputs.')}</span>}
        {error && <Notice tone="danger" data-xgc-role="automation-run-parameter-error" data-xgc-id={document.head.resourceId} role="alert">{error}</Notice>}
      </form>
    </ConfigDrawer>
  );
}

function ParameterField({ field,value,onChange }: {
  field: AutomationParameterField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const t = useAutomationAuthoringText();
  const label = `${field.label || field.name}${field.required ? ' *' : ''}`;
  const enumValues = field.kind === 'string' ? field.string?.enum ?? [] : [];
  if (enumValues.length > 0) {
    return (
      <FormField label={label} description={field.description} dataXgcRole="automation-run-parameter" dataXgcId={field.name}>
        <SelectControl
          fill
          value={typeof value === 'string' ? value : ''}
          options={[
            ...(!field.required ? [{ value: '',label: t('Not set') }] : []),
            ...enumValues.map((option) => ({ value: option,label: option })),
          ]}
          onChange={onChange}
          ariaLabel={label}
          dataXgcRole="automation-run-parameter-select"
          dataXgcId={field.name}
        />
      </FormField>
    );
  }
  if (field.kind === 'boolean') {
    return (
      <CheckboxControl
        label={label}
        description={field.description}
        checked={Boolean(value)}
        dataXgcRole="automation-run-parameter"
        dataXgcId={field.name}
        onChange={onChange}
      />
    );
  }
  if (field.kind === 'object' || field.kind === 'array') {
    const controlId = `automation-run-parameter-${field.name}`;
    return (
      <FormField
        label={label}
        htmlFor={controlId}
        description={field.description || t('Enter a JSON {kind}. The saved recursive schema validates every field.', { kind: field.kind })}
        dataXgcRole="automation-run-parameter"
        dataXgcId={field.name}
      >
        <TextareaControl
          id={controlId}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? (field.kind === 'array' ? [] : {}), null, 2)}
          rows={6}
          spellCheck={false}
          onChange={onChange}
        />
      </FormField>
    );
  }
  const numeric = field.kind === 'integer' || field.kind === 'number';
  const bounds = field.kind === 'integer' ? field.integer : field.kind === 'number' ? field.number : undefined;
  const controlId = `automation-run-parameter-${field.name}`;
  return (
    <FormField label={label} htmlFor={controlId} description={field.description} dataXgcRole="automation-run-parameter" dataXgcId={field.name}>
      <InputControl
        id={controlId}
        type={field.sensitive ? 'password' : numeric ? 'number' : 'text'}
        autoComplete={field.sensitive ? 'new-password' : undefined}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        min={bounds?.minimum}
        max={bounds?.maximum}
        step={field.kind === 'integer' ? 1 : numeric ? 'any' : undefined}
        onChange={onChange}
      />
    </FormField>
  );
}

function initialValues(fields: AutomationParameterField[]) {
  const result: Record<string,unknown> = {};
  for (const field of fields) {
    const constraints = field.kind === 'string' ? field.string
      : field.kind === 'boolean' ? field.boolean
        : field.kind === 'integer' ? field.integer
          : field.number;
    if (constraints?.default !== undefined) result[field.name] = constraints.default;
    else if (field.kind === 'string' && field.required && field.string?.enum?.length) result[field.name] = field.string.enum[0];
    else if (field.kind === 'boolean') result[field.name] = false;
    else if (field.kind === 'object') result[field.name] = '{}';
    else if (field.kind === 'array') {
      const fallback = field.array?.default;
      result[field.name] = JSON.stringify(Array.isArray(fallback) ? fallback : [], null, 2);
    }
    else result[field.name] = '';
  }
  return result;
}
