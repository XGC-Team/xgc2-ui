import { forwardRef, useImperativeHandle, useRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { ComponentSize } from './Button';
import { classNames } from '../utils';

type DataAttributes = {
  [key: `data-${string}`]: boolean | number | string | undefined;
};

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  containerProps?: Omit<HTMLAttributes<HTMLSpanElement>, 'className'> & DataAttributes;
  icon?: ReactNode;
  onValueChange?: (value: string) => void;
  uiSize?: ComponentSize;
  unit?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  className,
  containerProps,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const numeric = props.type === 'number';
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  function stepNumber(direction: 1 | -1) {
    const input = inputRef.current;
    if (!input || inactive) return;
    if (input.step === 'any') {
      const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      const minimum = input.min === '' ? Number.NEGATIVE_INFINITY : Number(input.min);
      const maximum = input.max === '' ? Number.POSITIVE_INFINITY : Number(input.max);
      input.valueAsNumber = Math.min(maximum, Math.max(minimum, current + direction));
    } else if (direction > 0) {
      input.stepUp();
    } else {
      input.stepDown();
    }
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input', { bubbles: true }));
  }

  return (
    <span
      {...containerProps}
      className={classNames('xgc-input', className)}
      data-disabled={disabled || undefined}
      data-invalid={props['aria-invalid'] === true || props['aria-invalid'] === 'true' || undefined}
      data-readonly={readOnly || undefined}
      data-size={uiSize}
      data-unit={unit ? true : undefined}
      data-number={numeric || undefined}
    >
      {icon ? <span className="xgc-input-icon">{icon}</span> : null}
      <input
        ref={inputRef}
        {...props}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => {
          onChange?.(event);
          if (!inactive) onValueChange?.(event.target.value);
        }}
      />
      {unit ? <span className="xgc-input-unit" aria-hidden="true">{unit}</span> : null}
      {numeric ? (
        <span className="xgc-input-stepper">
          <button
            type="button"
            className="xgc-input-stepper-button"
            tabIndex={-1}
            disabled={inactive}
            aria-label="Increase value"
            onMouseDown={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onClick={() => stepNumber(1)}
          >
            <svg viewBox="0 0 8 5"><path d="M1 4 4 1l3 3" /></svg>
          </button>
          <button
            type="button"
            className="xgc-input-stepper-button"
            tabIndex={-1}
            disabled={inactive}
            aria-label="Decrease value"
            onMouseDown={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onClick={() => stepNumber(-1)}
          >
            <svg viewBox="0 0 8 5"><path d="m1 1 3 3 3-3" /></svg>
          </button>
        </span>
      ) : null}
    </span>
  );
});
