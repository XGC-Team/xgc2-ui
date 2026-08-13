import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { AriaAttributes, CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentSize } from './Button';
import { classNames } from '../utils';
import { useOverlayStack } from './OverlayStack';

export type SelectMenuOption = {
  disabled?: boolean;
  group?: string;
  label: string;
  value: string;
};

export type SelectMenuProps = Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid'> & {
  ariaLabel: string;
  autoFocus?: boolean;
  busy?: boolean;
  className?: string;
  compact?: boolean;
  dataXgcId?: string;
  dataXgcRole?: string;
  disabled?: boolean;
  fill?: boolean;
  icon?: ReactNode;
  id?: string;
  menuAlign?: 'end' | 'start';
  menuPlacement?: 'above' | 'below';
  onOpen?: () => Promise<void> | void;
  onValueChange: (value: string) => void;
  options: readonly SelectMenuOption[];
  placeholder?: string;
  uiSize?: ComponentSize;
  value: string;
};

const MENU_GAP_PX = 5;
const MENU_MAX_HEIGHT_PX = 260;
const MENU_FLIP_MIN_PX = 120;

export function SelectMenu({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ariaLabel,
  autoFocus = false,
  busy = false,
  className,
  compact = false,
  dataXgcId,
  dataXgcRole,
  disabled = false,
  fill = false,
  icon,
  id,
  menuAlign = compact ? 'end' : 'start',
  menuPlacement = 'below',
  onOpen,
  onValueChange,
  options,
  placeholder,
  uiSize = 'default',
  value,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [resolvedPlacement, setResolvedPlacement] = useState<'above' | 'below'>(menuPlacement);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value);
  const optionGroups = groupSelectOptions(options);
  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  const overlay = useOverlayStack({ close: closeAndRestoreFocus, open, rootRef: menuRef });

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', closeFromOutside);
    return () => document.removeEventListener('mousedown', closeFromOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const selectedOption = menuRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]:not(:disabled)');
    (selectedOption ?? menuRef.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)'))?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - MENU_GAP_PX);
      const spaceAbove = Math.max(0, rect.top - MENU_GAP_PX);
      let placement: 'above' | 'below' = menuPlacement;
      if (menuPlacement === 'below' && spaceBelow < MENU_FLIP_MIN_PX && spaceAbove > spaceBelow) placement = 'above';
      else if (menuPlacement === 'above' && spaceAbove < MENU_FLIP_MIN_PX && spaceBelow > spaceAbove) placement = 'below';
      const available = placement === 'above' ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(80, Math.min(MENU_MAX_HEIGHT_PX, available || MENU_MAX_HEIGHT_PX));
      const next: CSSProperties = {
        maxHeight,
        minWidth: rect.width,
        position: 'fixed',
        zIndex: 'var(--z-portaled-control)',
      };
      if (placement === 'above') {
        next.bottom = window.innerHeight - rect.top + MENU_GAP_PX;
        next.top = 'auto';
      } else {
        next.bottom = 'auto';
        next.top = rect.bottom + MENU_GAP_PX;
      }
      if (menuAlign === 'end') {
        next.left = 'auto';
        next.right = window.innerWidth - rect.right;
      } else {
        next.left = rect.left;
        next.right = 'auto';
      }
      setResolvedPlacement(placement);
      setMenuStyle(next);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuAlign, menuPlacement, open, options.length, value]);

  const isInsideSurface = (node: Node | null) => Boolean(node && (rootRef.current?.contains(node) || menuRef.current?.contains(node)));
  const openMenu = () => {
    if (disabled || open) return;
    setOpen(true);
    void onOpen?.();
  };
  const moveOptionFocus = (direction: 1 | -1) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(current + direction + items.length) % items.length]?.focus();
  };

  const menu = open ? (
    <div
      aria-label={ariaLabel}
      className="xgc-select-menu"
      data-xgc-menu-align={menuAlign}
      data-xgc-menu-placement={resolvedPlacement}
      data-xgc-overlay-root="true"
      data-xgc-portaled="true"
      id={menuId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          overlay.closeTopOverlay(event);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveOptionFocus(event.key === 'ArrowDown' ? 1 : -1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          menuRef.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')?.focus();
        } else if (event.key === 'End') {
          event.preventDefault();
          const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)');
          items?.item(items.length - 1)?.focus();
        }
      }}
      ref={menuRef}
      role="listbox"
      style={menuStyle}
    >
      {optionGroups.map((group, groupIndex) => (
        <div
          aria-label={group.label || undefined}
          className="xgc-select-option-group"
          key={`${group.label || 'options'}-${groupIndex}`}
          role={group.label ? 'group' : undefined}
        >
          {group.label ? <span aria-hidden="true" className="xgc-select-group-label">{group.label}</span> : null}
          {group.options.map((option) => (
            <button
              aria-selected={option.value === value}
              className="xgc-select-option"
              data-xgc-id={dataXgcId ? `${dataXgcId}:${option.value}` : option.value}
              data-xgc-role="select-option"
              disabled={option.disabled}
              key={option.value}
              onClick={() => {
                onValueChange(option.value);
                closeAndRestoreFocus();
              }}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              <svg aria-hidden="true" className="xgc-select-check" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg>
            </button>
          ))}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div
      className={classNames('xgc-select-control', className)}
      data-disabled={disabled || undefined}
      data-size={uiSize}
      data-value={value}
      data-xgc-compact={compact || undefined}
      data-xgc-control="select"
      data-xgc-fill={fill || undefined}
      data-xgc-id={dataXgcId}
      data-xgc-menu-align={menuAlign}
      data-xgc-menu-placement={menuPlacement}
      data-xgc-open={open || undefined}
      data-xgc-role={dataXgcRole}
      data-xgc-size={uiSize}
      onBlur={(event) => {
        if (isInsideSurface(event.relatedTarget as Node | null)) return;
        requestAnimationFrame(() => {
          if (!isInsideSurface(document.activeElement)) setOpen(false);
        });
      }}
      ref={rootRef}
    >
      <button
        aria-busy={busy || undefined}
        aria-controls={menuId}
        aria-describedby={ariaDescribedBy}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="xgc-select-trigger"
        data-dialog-initial-focus={autoFocus || undefined}
        disabled={disabled}
        id={id}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu();
          } else if (event.key === 'Escape' && open) {
            overlay.closeTopOverlay(event);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {icon ? <span className="xgc-select-leading">{icon}</span> : null}
        <span className="xgc-select-value">{selected?.label ?? placeholder ?? value}</span>
        <svg aria-hidden="true" className="xgc-select-chevron" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

function groupSelectOptions(options: readonly SelectMenuOption[]) {
  const groups: Array<{ label: string; options: SelectMenuOption[] }> = [];
  for (const option of options) {
    const label = option.group ?? '';
    const group = groups.find((candidate) => candidate.label === label);
    if (group) group.options.push(option);
    else groups.push({ label, options: [option] });
  }
  return groups;
}
