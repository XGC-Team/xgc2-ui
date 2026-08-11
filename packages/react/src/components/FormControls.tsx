import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import type { ComponentSize } from './Button';
import { classNames } from '../utils';

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

export type FormFieldProps = HTMLAttributes<HTMLLabelElement> & {
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  required?: boolean;
};

export function FormField({
  children,
  className,
  error,
  hint,
  label,
  required = false,
  ...props
}: FormFieldProps) {
  return (
    <label {...props} className={classNames('xgc-form-field', className)} data-invalid={Boolean(error) || undefined}>
      <span className="xgc-form-field-label">
        {label}
        {required ? <span className="xgc-form-field-required" aria-hidden="true">*</span> : null}
      </span>
      {children}
      {error ? <span className="xgc-form-field-error">{error}</span> : null}
      {!error && hint ? <span className="xgc-form-field-hint">{hint}</span> : null}
    </label>
  );
}

export type FormGroupProps = HTMLAttributes<HTMLFieldSetElement> & {
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
};

export function FormGroup({
  children,
  className,
  error,
  hint,
  label,
  ...props
}: FormGroupProps) {
  return (
    <fieldset {...props} className={classNames('xgc-form-field', 'xgc-form-group', className)} data-invalid={Boolean(error) || undefined}>
      <legend className="xgc-form-field-label">{label}</legend>
      {children}
      {error ? <span className="xgc-form-field-error">{error}</span> : null}
      {!error && hint ? <span className="xgc-form-field-hint">{hint}</span> : null}
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
