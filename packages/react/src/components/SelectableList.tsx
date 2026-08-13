import { Children, cloneElement, isValidElement } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { classNames } from '../utils';

export type SelectableListProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical';
};

export function SelectableList({
  'aria-label': ariaLabel,
  children,
  className,
  onKeyDown,
  orientation = 'vertical',
  ...props
}: SelectableListProps) {
  const items = Children.toArray(children);
  const options = items.filter(isSelectableListItem);
  const hasTabStop = options.some((option) => (
    option.props.tabIndex === 0 || (option.props.selected && !option.props.disabled)
  ));
  let assignedFallback = false;
  const rovingChildren = items.map((child) => {
    if (!isSelectableListItem(child)) return child;
    const explicit = child.props.tabIndex;
    const selected = Boolean(child.props.selected && !child.props.disabled);
    const fallback = !hasTabStop && !assignedFallback && !child.props.disabled;
    if (fallback) assignedFallback = true;
    return cloneElement(child, { tabIndex: explicit ?? (selected || fallback ? 0 : -1) });
  });

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') !== 'option') return;
    const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not(:disabled)')];
    const current = options.indexOf(target);
    const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    let next = current;
    if (event.key === previousKey) next = Math.max(0, current - 1);
    else if (event.key === nextKey) next = Math.min(options.length - 1, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    options[next]?.focus();
    options[next]?.click();
  };

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={classNames('xgc-selectable-list', className)}
      data-orientation={orientation}
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
      tabIndex={tabIndex ?? (selected ? 0 : -1)}
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
