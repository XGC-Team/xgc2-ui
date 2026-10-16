import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { AriaAttributes, CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentSize } from './Button';
import { usePresence } from '../hooks/usePresence';
import { classNames } from '../utils';
import { overlayStyleEquals, useOverlayStack } from './OverlayStack';

export type SelectMenuOption = {
  description?: string;
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
  const blurFrame = useRef<number | null>(null);
  const blurEpoch = useRef(0);
  const menuId = useId();
  const selected = options.find((option) => option.value === value);
  const optionGroups = groupSelectOptions(options);
  const cancelQueuedBlur = useCallback(() => {
    blurEpoch.current += 1;
    const frame = blurFrame.current;
    if (frame === null) return;
    blurFrame.current = null;
    cancelAnimationFrame(frame);
  }, []);
  useEffect(() => cancelQueuedBlur, [cancelQueuedBlur]);
  const closeMenu = useCallback(() => {
    cancelQueuedBlur();
    setOpen(false);
  }, [cancelQueuedBlur]);
  const closeAndRestoreFocus = useCallback(() => {
    closeMenu();
    triggerRef.current?.focus();
  }, [closeMenu]);
  const overlay = useOverlayStack({ close: closeAndRestoreFocus, open, rootRef: menuRef });
  // Keep a closing menu mounted for its exit animation; the overlay stack and
  // trigger aria still see the close immediately.
  const presence = usePresence(open, menuRef);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', closeFromOutside);
    return () => document.removeEventListener('mousedown', closeFromOutside);
  }, [closeMenu, open]);

  useEffect(() => {
    if (disabled) closeMenu();
  }, [closeMenu, disabled]);

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
      setResolvedPlacement((current) => (current === placement ? current : placement));
      setMenuStyle((current) => (overlayStyleEquals(current, next) ? current : next));
    };
    // Scroll and resize events fire per frame; coalesce them into one layout
    // read + one state write per animation frame.
    let positionFrame: number | null = null;
    const schedulePositionUpdate = () => {
      if (positionFrame !== null) return;
      positionFrame = requestAnimationFrame(() => {
        positionFrame = null;
        updatePosition();
      });
    };

    updatePosition();
    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    return () => {
      if (positionFrame !== null) cancelAnimationFrame(positionFrame);
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
    };
  }, [menuAlign, menuPlacement, open, options.length, value]);

  const isInsideSurface = (node: Node | null) => Boolean(node && (rootRef.current?.contains(node) || menuRef.current?.contains(node)));
  const openMenu = () => {
    if (disabled || open) return;
    cancelQueuedBlur();
    setOpen(true);
    void onOpen?.();
  };
  const moveOptionFocus = (direction: 1 | -1) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(current + direction + items.length) % items.length]?.focus();
  };

  const menu = presence.mounted ? (
    <div
      aria-hidden={presence.exiting || undefined}
      aria-label={ariaLabel}
      className="xgc-select-menu"
      data-xgc-menu-align={menuAlign}
      data-xgc-menu-placement={resolvedPlacement}
      data-xgc-overlay-root="true"
      data-xgc-portaled="true"
      data-xgc-presence={presence.exiting ? 'exit' : undefined}
      id={menuId}
      inert={presence.exiting ? true : undefined}
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
          {group.options.map((option, optionIndex) => {
            const description = option.description?.trim() ?? '';
            const labelId = description ? optionPartId(menuId, groupIndex, optionIndex, 'label') : undefined;
            const descriptionId = description ? optionPartId(menuId, groupIndex, optionIndex, 'description') : undefined;
            return (
              <button
                aria-describedby={descriptionId}
                aria-labelledby={labelId}
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
                <span className="xgc-select-option-copy">
                  <span id={labelId}>{option.label}</span>
                  {description ? <span className="xgc-select-option-description" id={descriptionId}>{description}</span> : null}
                </span>
                <svg aria-hidden="true" className="xgc-select-check" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg>
              </button>
            );
          })}
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
        // One owner epoch. Cancel, replacement, close, and unmount advance it.
        // The frame captures that epoch and must match before it clears the
        // handle or closes, so a forced old callback cannot drop a newer frame.
        cancelQueuedBlur();
        const epoch = blurEpoch.current;
        blurFrame.current = requestAnimationFrame(() => {
          if (epoch !== blurEpoch.current) return;
          blurFrame.current = null;
          if (!isInsideSurface(document.activeElement)) closeMenu();
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
        data-xgc-role={dataXgcRole ? `${dataXgcRole}-trigger` : undefined}
        data-xgc-id={dataXgcId}
        data-dialog-initial-focus={autoFocus || undefined}
        disabled={disabled}
        id={id}
        onClick={() => open ? closeMenu() : openMenu()}
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

function optionPartId(menuId: string, groupIndex: number, optionIndex: number, part: 'label' | 'description') {
  return `${menuId}-${part}-${groupIndex}-${optionIndex}`;
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
