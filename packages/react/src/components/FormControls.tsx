import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { ComponentSize } from './Button';
import { classNames } from '../utils';
import { Tooltip } from './Tooltip';

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  onValueChange?: (value: string) => void;
  uiSize?: ComponentSize;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({
  children,
  className,
  disabled,
  onChange,
  onValueChange,
  uiSize = 'default',
  ...props
}, ref) {
  return (
    <span
      className={classNames('xgc-select', className)}
      data-disabled={disabled || undefined}
      data-invalid={props['aria-invalid'] === true || props['aria-invalid'] === 'true' || undefined}
      data-size={uiSize}
    >
      <select
        ref={ref}
        {...props}
        disabled={disabled}
        onChange={(event) => {
          onChange?.(event);
          if (!disabled) onValueChange?.(event.target.value);
        }}
      >
        {children}
      </select>
      <span className="xgc-select-indicator" aria-hidden="true">⌄</span>
    </span>
  );
});

type DescribedControlProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
};

export type FormFieldProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: ReactElement<DescribedControlProps>;
  description?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  /** @deprecated Use description. */
  hint?: ReactNode;
  label: ReactNode;
  required?: boolean;
  tooltip?: ReactNode;
  tooltipEnabled?: boolean;
};

export function FormField({
  children,
  className,
  description,
  error,
  htmlFor,
  hint,
  label,
  required = false,
  tooltip,
  tooltipEnabled = true,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = children.props.id ?? htmlFor ?? `${generatedId}-control`;
  const supportingCopy = description ?? hint;
  const descriptionId = supportingCopy ? `${generatedId}-description` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const control = isValidElement<DescribedControlProps>(children)
    ? cloneElement(children, {
      id: controlId,
      'aria-describedby': joinIds(children.props['aria-describedby'], descriptionId, errorId),
      'aria-invalid': error ? true : children.props['aria-invalid'],
    })
    : children;
  const field = (
    <div {...props} className={classNames('xgc-form-field', className)} data-invalid={Boolean(error) || undefined}>
      <label className="xgc-form-field-label" htmlFor={controlId}>
        {label}
        {required ? <span className="xgc-form-field-required" aria-hidden="true">*</span> : null}
      </label>
      {control}
      {supportingCopy ? <span className="xgc-form-field-hint" id={descriptionId}>{supportingCopy}</span> : null}
      {error ? <span className="xgc-form-field-error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
  return tooltip ? <Tooltip content={tooltip} enabled={tooltipEnabled}>{field}</Tooltip> : field;
}

export type FormGroupProps = HTMLAttributes<HTMLFieldSetElement> & {
  description?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  required?: boolean;
};

export function FormGroup({
  children,
  className,
  description,
  error,
  hint,
  label,
  required = false,
  ...props
}: FormGroupProps) {
  const generatedId = useId();
  const supportingCopy = description ?? hint;
  const descriptionId = supportingCopy ? `${generatedId}-description` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  return (
    <fieldset
      {...props}
      aria-describedby={joinIds(props['aria-describedby'], descriptionId, errorId)}
      className={classNames('xgc-form-field', 'xgc-form-group', className)}
      data-invalid={Boolean(error) || undefined}
      data-required={required || undefined}
    >
      <legend className="xgc-form-field-label">
        {label}
        {required ? <span className="xgc-form-field-required" aria-hidden="true">*</span> : null}
      </legend>
      {children}
      {supportingCopy ? <span className="xgc-form-field-hint" id={descriptionId}>{supportingCopy}</span> : null}
      {error ? <span className="xgc-form-field-error" id={errorId} role="alert">{error}</span> : null}
    </fieldset>
  );
}

export type SegmentedControlOption = {
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

export type SegmentedControlProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  ariaLabel: string;
  onValueChange: (value: string) => void;
  options: readonly SegmentedControlOption[];
  value: string;
};

export function SegmentedControl({
  ariaLabel,
  className,
  onValueChange,
  options,
  value,
  ...props
}: SegmentedControlProps) {
  return (
    <div {...props} className={classNames('xgc-segmented-control', className)} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          aria-pressed={option.value === value}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  onValueChange?: (value: string) => void;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({
  className,
  disabled,
  onChange,
  onValueChange,
  readOnly,
  ...props
}, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={classNames('xgc-textarea', className)}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) => {
        onChange?.(event);
        if (!disabled && !readOnly) onValueChange?.(event.target.value);
      }}
    />
  );
});

export type BooleanControlProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'role' | 'type'> & {
  checked: boolean;
  dataXgcId?: string;
  dataXgcRole?: string;
  description?: ReactNode;
  label?: ReactNode;
  layout?: 'field' | 'inline';
  onCheckedChange: (checked: boolean) => void;
  tooltip?: ReactNode;
  tooltipEnabled?: boolean;
};

function BooleanControl({
  checked,
  className,
  dataXgcId,
  dataXgcRole,
  description,
  disabled,
  id,
  label,
  layout = 'inline',
  onCheckedChange,
  role,
  tooltip,
  tooltipEnabled = true,
  ...props
}: BooleanControlProps & { role?: 'switch' }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelId = `${inputId}-label`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const hasLabel = label !== undefined && label !== null && label !== false;
  const ariaLabel = props['aria-label'];
  const input = (
    <input
      {...props}
      id={inputId}
      type="checkbox"
      role={role}
      aria-checked={role === 'switch' ? checked : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel || !hasLabel ? undefined : labelId}
      aria-describedby={descriptionId}
      checked={checked}
      data-dialog-initial-focus={props.autoFocus || undefined}
      disabled={disabled}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  );
  const control = layout === 'field' ? (
    <div
      className={classNames('xgc-boolean-control', className)}
      data-disabled={disabled || undefined}
      data-layout="field"
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      {hasLabel ? <label className="xgc-boolean-title" id={labelId} htmlFor={inputId}>{label}</label> : null}
      <span className="xgc-boolean-control-row">
        {input}
        {description ? <small className="xgc-boolean-status" id={descriptionId}>{description}</small> : null}
      </span>
    </div>
  ) : (
    <label
      className={classNames('xgc-boolean-control', className)}
      data-disabled={disabled || undefined}
      data-layout="inline"
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      {input}
      {hasLabel || description ? (
        <span className="xgc-boolean-control-copy">
          {hasLabel ? <strong id={labelId}>{label}</strong> : null}
          {description ? <small id={descriptionId}>{description}</small> : null}
        </span>
      ) : null}
    </label>
  );
  return tooltip ? <Tooltip content={tooltip} enabled={tooltipEnabled}>{control}</Tooltip> : control;
}

export function Checkbox(props: BooleanControlProps) {
  return <BooleanControl {...props} />;
}

export function Switch(props: BooleanControlProps) {
  return <BooleanControl {...props} role="switch" />;
}

export type FormActionsProps = HTMLAttributes<HTMLDivElement> & {
  status?: ReactNode;
};

export function FormActions({ children, className, status, ...props }: FormActionsProps) {
  return (
    <div {...props} className={classNames('xgc-form-actions', className)}>
      {status ? <span className="xgc-form-actions-status" role="status">{status}</span> : null}
      {children}
    </div>
  );
}

function joinIds(...ids: Array<string | undefined>) {
  return ids.filter(Boolean).join(' ') || undefined;
}
