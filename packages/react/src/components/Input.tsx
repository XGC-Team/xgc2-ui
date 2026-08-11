import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import type { ComponentSize } from './Button';
import { classNames } from '../utils';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  icon?: ReactNode;
  onValueChange?: (value: string) => void;
  uiSize?: ComponentSize;
  unit?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  className,
  disabled,
  icon,
  onChange,
  onValueChange,
  readOnly,
  uiSize = 'default',
  unit,
  ...props
}, ref) {
  const inactive = disabled || readOnly;
  return (
    <span
      className={classNames('xgc-input', className)}
      data-disabled={disabled || undefined}
      data-invalid={props['aria-invalid'] === true || props['aria-invalid'] === 'true' || undefined}
      data-readonly={readOnly || undefined}
      data-size={uiSize}
    >
      {icon ? <span className="xgc-input-icon">{icon}</span> : null}
      <input
        ref={ref}
        {...props}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => {
          onChange?.(event);
          if (!inactive) onValueChange?.(event.target.value);
        }}
      />
      {unit ? <span className="xgc-input-unit" aria-hidden="true">{unit}</span> : null}
    </span>
  );
});
