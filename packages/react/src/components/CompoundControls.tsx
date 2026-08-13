import type {
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { classNames } from '../utils';
import { Button, type ButtonProps } from './Button';
import { Input } from './Input';

export type FormSectionProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  bodyClassName?: string;
  columns?: 1 | 2;
  dataXgcId?: string;
  dataXgcRole?: string;
  title: ReactNode;
};

/** Static form grouping with one family-wide title, spacing, and field grid. */
export function FormSection({
  bodyClassName,
  children,
  className,
  columns = 2,
  dataXgcId,
  dataXgcRole = 'form-section',
  title,
  ...props
}: FormSectionProps) {
  return (
    <section
      {...props}
      className={classNames('xgc-form-section', className)}
      data-columns={columns}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      <h3 className="xgc-form-section-title">{title}</h3>
      <div className={classNames('xgc-form-section-body', bodyClassName)}>{children}</div>
    </section>
  );
}

export type FormSectionSpanProps = HTMLAttributes<HTMLDivElement>;

/** Marks a composite field as spanning every column of a FormSection. */
export function FormSectionSpan({ className, ...props }: FormSectionSpanProps) {
  return <div {...props} className={classNames('xgc-form-section-span', className)} />;
}

export type InputActionControlProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'size'> & {
  actionDisabled?: boolean;
  actionIcon?: ReactNode;
  actionLabel: string;
  actionProps?: Omit<ButtonProps, 'aria-label' | 'children' | 'disabled' | 'onClick'>;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  inputClassName?: string;
  onAction: () => void;
  onValueChange?: (value: string) => void;
  unit?: ReactNode;
};

/** Text/number input with one inset action and a single shared geometry. */
export function InputActionControl({
  actionDisabled = false,
  actionIcon,
  actionLabel,
  actionProps,
  className,
  dataXgcId,
  dataXgcRole = 'input-action',
  inputClassName,
  onAction,
  onValueChange,
  unit,
  ...inputProps
}: InputActionControlProps) {
  return (
    <div
      className={classNames('xgc-input-action-control', className)}
      data-icon-only={Boolean(actionIcon) || undefined}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      <Input
        {...inputProps}
        className={classNames('xgc-input-action-input', inputClassName)}
        onValueChange={onValueChange}
        unit={unit}
      />
      <Button
        {...actionProps}
        aria-label={actionIcon ? actionLabel : undefined}
        className={classNames('xgc-input-action-button', actionProps?.className)}
        disabled={actionDisabled}
        iconOnly={Boolean(actionIcon)}
        onClick={onAction}
        uiSize="compact"
      >
        {actionIcon ?? actionLabel}
      </Button>
    </div>
  );
}

export type Vector3ControlAxis = {
  ariaLabel?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  disabled?: boolean;
  label: string;
  max?: number;
  min?: number;
  step?: number | string;
  unit?: ReactNode;
  value: number | string;
};

export type Vector3ControlProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  axes: readonly [Vector3ControlAxis, Vector3ControlAxis, Vector3ControlAxis];
  dataXgcId?: string;
  dataXgcRole?: string;
  disabled?: boolean;
  onValueChange: (index: 0 | 1 | 2, value: string) => void;
  unit?: ReactNode;
};

/** Dense, reusable XYZ/RPY-style three-axis numeric control. */
export function Vector3Control({
  axes,
  className,
  dataXgcId,
  dataXgcRole = 'vector3',
  disabled = false,
  onValueChange,
  unit,
  ...props
}: Vector3ControlProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-vector3-control', className)}
      data-disabled={disabled || undefined}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      {axes.map((axis, index) => {
        const axisIndex = index as 0 | 1 | 2;
        const axisUnit = axis.unit ?? unit;
        return (
          <label
            className="xgc-vector3-cell"
            data-xgc-id={axis.dataXgcId}
            data-xgc-role={axis.dataXgcRole}
            key={`${axis.label}:${index}`}
          >
            <span className="xgc-vector3-label">{axis.label}</span>
            <Input
              aria-label={axis.ariaLabel ?? (axisUnit ? `${axis.label} (${String(axisUnit)})` : axis.label)}
              disabled={disabled || axis.disabled}
              max={axis.max}
              min={axis.min}
              onValueChange={(value) => onValueChange(axisIndex, value)}
              step={axis.step ?? 'any'}
              type="number"
              unit={axisUnit}
              value={axis.value}
            />
          </label>
        );
      })}
    </div>
  );
}
