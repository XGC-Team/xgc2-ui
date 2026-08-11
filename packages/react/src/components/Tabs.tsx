import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { classNames } from '../utils';

export type TabOption = {
  disabled?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  value: string;
};

export type TabsProps = {
  ariaLabel: string;
  className?: string;
  onValueChange: (value: string) => void;
  options: TabOption[];
  size?: 'default' | 'compact';
  value: string;
};

export function Tabs({
  ariaLabel,
  className,
  onValueChange,
  options,
  size = 'default',
  value,
}: TabsProps) {
  const id = useId();
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const enabled = options.filter((option) => !option.disabled);
    if (!enabled.length) return;
    const current = Math.max(0, enabled.findIndex((option) => option.value === value));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? enabled.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    event.preventDefault();
    onValueChange(next.value);
    Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((tab) => tab.dataset.tabValue === next.value)
      ?.focus();
  };

  return (
    <div
      aria-label={ariaLabel}
      className={classNames('xgc-tabs', className)}
      data-size={size}
      onKeyDown={moveFocus}
      role="tablist"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            aria-selected={selected}
            className="xgc-tab"
            data-tab-value={option.value}
            disabled={option.disabled}
            id={`${id}-tab-${index}`}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {option.icon ? <span className="xgc-tab-icon" aria-hidden="true">{option.icon}</span> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
