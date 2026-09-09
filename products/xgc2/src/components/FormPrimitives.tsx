import {
  Checkbox as SharedCheckbox,
  FormActions as SharedFormActions,
  FormField as SharedFormField,
  FormGroup as SharedFormGroup,
  Switch as SharedSwitch,
} from '@xgc2/ui-react';
import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';

function fieldLeafLabelRole(fieldRole: string): string {
  return fieldRole.endsWith('-field')
    ? `${fieldRole.slice(0, -'-field'.length)}-label`
    : `${fieldRole}-label`;
}

function useStampFieldLabel(role?: string, id?: string) {
  const hostRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const label = root.querySelector<HTMLElement>(':scope > .xgc-form-field-label');
    if (!label) return;
    if (role && id) {
      label.setAttribute('data-xgc-role', fieldLeafLabelRole(role));
      label.setAttribute('data-xgc-id', id);
      return;
    }
    label.removeAttribute('data-xgc-role');
    label.removeAttribute('data-xgc-id');
  }, [id, role]);
  return hostRef as React.MutableRefObject<HTMLDivElement | null>;
}

type DescribedControlProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
};

type FieldCommonProps = {
  label: ReactNode;
  description?: ReactNode;
  /** Hover/focus help for the whole field (label + control). */
  tooltip?: string;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: ReactElement<DescribedControlProps>;
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
  dataXgcLayout?: string;
};

/** XGC2 metadata/preference adapter over the family-wide form field. */
export function FormField({
  label,
  description,
  tooltip,
  error,
  required = false,
  htmlFor,
  children,
  className = '',
  dataXgcRole,
  dataXgcId,
  dataXgcLayout,
}: FieldCommonProps) {
  const hostRef = useStampFieldLabel(dataXgcRole, dataXgcId);
  const field = (
    <SharedFormField
      ref={hostRef}
      className={className}
      description={description}
      error={error}
      htmlFor={htmlFor}
      label={label}
      required={required}
      data-invalid={error ? 'true' : undefined}
      data-required={required ? 'true' : undefined}
      data-xgc-role={dataXgcRole}
      data-xgc-id={dataXgcId}
      data-xgc-layout={dataXgcLayout}
    >
      {children}
    </SharedFormField>
  );
  return tooltip ? <Tooltip content={tooltip} dataXgcId={dataXgcId}>{field}</Tooltip> : field;
}

export function FormGroup({
  legend,
  description,
  error,
  required = false,
  children,
  className = '',
  dataXgcRole,
  dataXgcId,
}: {
  legend: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
}) {
  const hostRef = useStampFieldLabel(dataXgcRole, dataXgcId);
  return (
    <SharedFormGroup
      ref={hostRef as React.MutableRefObject<HTMLFieldSetElement | null>}
      className={className}
      description={description}
      error={error}
      label={legend}
      required={required}
      data-invalid={error ? 'true' : undefined}
      data-required={required ? 'true' : undefined}
      data-xgc-role={dataXgcRole}
      data-xgc-id={dataXgcId}
    >
      {children}
    </SharedFormGroup>
  );
}

export function FormActions({
  status,
  children,
  className = '',
  dataXgcRole,
  dataXgcId,
}: {
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
}) {
  return (
    <SharedFormActions
      className={className}
      status={status}
      data-xgc-role={dataXgcRole}
      data-xgc-id={dataXgcId}
    >
      {children}
    </SharedFormActions>
  );
}

type CheckboxControlProps = {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  /** Hover/focus help; distinct from description (On/Off status). */
  tooltip?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  name?: string;
  value?: string;
  className?: string;
  dataXgcRole?: string;
  dataXgcId?: string;
} & (
  | { label: ReactNode; ariaLabel?: string }
  | { label?: undefined; ariaLabel: string }
);

export function CheckboxControl(props: CheckboxControlProps) {
  return <BooleanControl {...props} kind="checkbox" />;
}

export function SwitchControl(props: CheckboxControlProps) {
  return <BooleanControl {...props} kind="switch" />;
}

function BooleanControl({
  id,
  checked,
  onChange,
  label,
  description,
  tooltip,
  disabled = false,
  autoFocus = false,
  ariaLabel,
  name,
  value,
  className = '',
  dataXgcRole,
  dataXgcId,
  kind,
}: CheckboxControlProps & { kind: 'checkbox' | 'switch' }) {
  const status = description !== undefined
    ? description
    : kind === 'switch'
      ? (checked ? 'On' : 'Off')
      : undefined;
  const SharedControl = kind === 'switch' ? SharedSwitch : SharedCheckbox;
  const control = (
    <SharedControl
      id={id}
      checked={checked}
      className={className}
      dataXgcId={dataXgcId}
      dataXgcRole={dataXgcRole}
      description={status}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      label={label}
      layout="field"
      name={name}
      value={value}
      onCheckedChange={onChange}
    />
  );
  return tooltip ? <Tooltip content={tooltip} dataXgcId={dataXgcId}>{control}</Tooltip> : control;
}
