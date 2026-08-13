import { Children, cloneElement, isValidElement, useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { classNames } from '../utils';

export type SelectableListProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical';
};

export function SelectableList({
  'aria-label': ariaLabel,
  children,
  className,
  onFocusCapture,
  onKeyDown,
  orientation = 'vertical',
  ...props
}: SelectableListProps) {
  const items = Children.toArray(children);
  const options = items.flatMap((child, index) => isSelectableListItem(child) ? [{
    child,
    enabled: !child.props.disabled,
    key: String(child.key ?? index),
  }] : []);
  const preferredTabStop = options.find((option) => option.enabled && option.child.props.tabIndex === 0)
    ?? options.find((option) => option.enabled && option.child.props.selected)
    ?? options.find((option) => option.enabled);
  const [activeKey, setActiveKey] = useState<string | null>(() => preferredTabStop?.key ?? null);
  const tabStopKey = options.some((option) => option.enabled && option.key === activeKey)
    ? activeKey
    : preferredTabStop?.key ?? null;

  useEffect(() => {
    if (activeKey !== tabStopKey) setActiveKey(tabStopKey);
  }, [activeKey, tabStopKey]);

  const rovingChildren = items.map((child) => {
    if (!isSelectableListItem(child)) return child;
    const option = options.find((candidate) => candidate.child === child);
    return cloneElement(child, { tabIndex: option?.enabled && option.key === tabStopKey ? 0 : -1 });
  });

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') !== 'option') return;
    const enabledOptions = options.filter((option) => option.enabled);
    const enabledElements = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not(:disabled)')];
    const current = enabledElements.indexOf(target);
    const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    let next = current;
    if (event.key === previousKey) next = Math.max(0, current - 1);
    else if (event.key === nextKey) next = Math.min(enabledOptions.length - 1, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabledOptions.length - 1;
    else return;
    event.preventDefault();
    setActiveKey(enabledOptions[next]?.key ?? null);
    enabledElements[next]?.focus();
    enabledElements[next]?.click();
  };

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={classNames('xgc-selectable-list', className)}
      data-orientation={orientation}
      onFocusCapture={(event) => {
        onFocusCapture?.(event);
        if (event.defaultPrevented) return;
        const target = event.target as HTMLElement;
        if (target.getAttribute('role') !== 'option' || target.matches(':disabled')) return;
        const optionIndex = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')].indexOf(target);
        setActiveKey(options[optionIndex]?.key ?? null);
      }}
      onKeyDown={moveFocus}
      role="listbox"
    >
      {rovingChildren}
    </div>
  );
}

export type SelectableListItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  description?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  title: ReactNode;
  trailing?: ReactNode;
};

export function SelectableListItem({
  className,
  description,
  leading,
  meta,
  selected = false,
  tabIndex,
  title,
  trailing,
  ...props
}: SelectableListItemProps) {
  return (
    <button
      {...props}
      aria-selected={selected}
      className={classNames('xgc-selectable-list-item', className)}
      role="option"
      tabIndex={props.disabled ? -1 : tabIndex ?? (selected ? 0 : -1)}
      type="button"
    >
      {leading ? <span className="xgc-selectable-list-leading" aria-hidden="true">{leading}</span> : null}
      <span className="xgc-selectable-list-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
        {meta ? <small>{meta}</small> : null}
      </span>
      {trailing ? <span className="xgc-selectable-list-trailing">{trailing}</span> : null}
    </button>
  );
}

function isSelectableListItem(node: ReactNode): node is ReactElement<SelectableListItemProps> {
  return isValidElement<SelectableListItemProps>(node) && node.type === SelectableListItem;
}
