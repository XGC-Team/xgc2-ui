import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { classNames } from '../utils';

type ChoiceCardDataAttributes = {
  [key: `data-${string}`]: boolean | number | string | undefined;
};

export type ChoiceCardOption = {
  ariaLabel?: string;
  content?: ReactNode;
  dataAttributes?: ChoiceCardDataAttributes;
  disabled?: boolean;
  label: ReactNode;
  title?: string;
  value: string;
};

export type ChoiceCardGroupProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
  ariaLabel: string;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  id?: string;
  onValueChange: (value: string) => void;
  optionClassName?: string;
  optionDataXgcRole?: string;
  options: readonly ChoiceCardOption[];
  value: string;
};

/** A keyboard-operable radio group for choices that need a visual preview. */
export function ChoiceCardGroup({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ariaLabel,
  className,
  dataXgcId,
  dataXgcRole = 'choice-card-group',
  id,
  onValueChange,
  optionClassName,
  optionDataXgcRole = 'choice-card',
  options,
  value,
}: ChoiceCardGroupProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const enabled = options.filter((option) => !option.disabled);
  const selectedIndex = enabled.findIndex((option) => option.value === value);
  const tabbableValue = enabled[Math.max(0, selectedIndex)]?.value;

  const move = (event: KeyboardEvent<HTMLButtonElement>, direction: -1 | 1 | 'first' | 'last') => {
    if (!enabled.length) return;
    const current = Math.max(0, enabled.findIndex((option) => option.value === event.currentTarget.dataset.value));
    const nextIndex = direction === 'first'
      ? 0
      : direction === 'last'
        ? enabled.length - 1
        : (current + direction + enabled.length) % enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    event.preventDefault();
    onValueChange(next.value);
    refs.current.get(next.value)?.focus();
  };

  return (
    <div
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      className={classNames('xgc-choice-card-group', className)}
      data-value={value}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
      id={id}
      role="radiogroup"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            {...option.dataAttributes}
            aria-checked={selected}
            aria-label={option.ariaLabel ?? (typeof option.label === 'string' ? option.label : undefined)}
            className={classNames('xgc-choice-card', optionClassName)}
            data-value={option.value}
            data-xgc-id={option.value}
            data-xgc-role={optionDataXgcRole}
            data-xgc-selected={selected || undefined}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(event, 1);
              else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(event, -1);
              else if (event.key === 'Home') move(event, 'first');
              else if (event.key === 'End') move(event, 'last');
            }}
            ref={(node) => {
              if (node) refs.current.set(option.value, node);
              else refs.current.delete(option.value);
            }}
            role="radio"
            tabIndex={option.disabled ? -1 : option.value === tabbableValue ? 0 : -1}
            title={option.title}
            type="button"
          >
            {option.content ? <span className="xgc-choice-card-content">{option.content}</span> : null}
            <span className="xgc-choice-card-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
