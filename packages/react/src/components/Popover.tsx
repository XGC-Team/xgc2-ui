import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '../utils';
import { Button, type ButtonProps, type ButtonTone } from './Button';
import { OverlayOwner, useOverlayStack } from './OverlayStack';

const POPOVER_GAP = 6;
const POPOVER_VIEWPORT_MARGIN = 8;
const POPOVER_MIN_AVAILABLE_HEIGHT = 112;
const POPOVER_MAX_HEIGHT = 420;
const POPOVER_WIDE_WIDTH = 380;

type PopoverTriggerProps = {
  'aria-controls'?: string;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: 'dialog' | 'menu';
  onClick?: MouseEventHandler<HTMLElement>;
};

export type PopoverProps = {
  align?: 'end' | 'start';
  ariaLabel?: string;
  ariaLabelledBy?: string;
  autoFocus?: boolean;
  children: ReactNode;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  placement?: 'above' | 'auto' | 'below';
  role?: 'dialog' | 'menu';
  surfaceProps?: Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'>;
  trigger: ReactElement<PopoverTriggerProps>;
  width?: 'content' | 'trigger' | 'wide';
};

/** Portaled, viewport-aware non-modal overlay foundation. */
export function Popover({
  align = 'start',
  ariaLabel,
  ariaLabelledBy,
  autoFocus = true,
  children,
  className,
  dataXgcId,
  dataXgcRole = 'popover',
  onOpenChange,
  open,
  placement = 'auto',
  role = 'dialog',
  surfaceProps,
  trigger,
  width = 'content',
}: PopoverProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const previousOpen = useRef(open);
  const focusedForOpen = useRef(false);
  const popoverId = useId();
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const closeAndRestoreFocus = () => {
    onOpenChange(false);
    anchorRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
  };
  const overlay = useOverlayStack({ close: closeAndRestoreFocus, open, rootRef: surfaceRef });

  useEffect(() => {
    if (previousOpen.current && !open) {
      anchorRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    }
    previousOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || surfaceRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-xgc-overlay-root="true"]')) return;
      onOpenChange(false);
    };
    document.addEventListener('mousedown', closeFromOutside);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
    };
  }, [open, onOpenChange]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - POPOVER_GAP - POPOVER_VIEWPORT_MARGIN);
      const spaceAbove = Math.max(0, rect.top - POPOVER_GAP - POPOVER_VIEWPORT_MARGIN);
      const resolvedPlacement = placement === 'auto'
        ? (spaceBelow < POPOVER_MIN_AVAILABLE_HEIGHT && spaceAbove > spaceBelow ? 'above' : 'below')
        : placement;
      const availableHeight = resolvedPlacement === 'above' ? spaceAbove : spaceBelow;
      const measuredWidth = surfaceRef.current?.offsetWidth || rect.width;
      const resolvedWidth = width === 'wide'
        ? Math.min(POPOVER_WIDE_WIDTH, viewportWidth - POPOVER_VIEWPORT_MARGIN * 2)
        : width === 'trigger'
          ? rect.width
          : measuredWidth;
      const unclampedLeft = align === 'end' ? rect.right - resolvedWidth : rect.left;
      const left = Math.max(
        POPOVER_VIEWPORT_MARGIN,
        Math.min(unclampedLeft, viewportWidth - resolvedWidth - POPOVER_VIEWPORT_MARGIN),
      );
      const next: CSSProperties = {
        left,
        maxHeight: Math.max(0, Math.min(POPOVER_MAX_HEIGHT, availableHeight)),
        position: 'fixed',
        visibility: 'visible',
        width: width === 'content' ? undefined : resolvedWidth,
        zIndex: 'var(--z-portaled-control)',
      };
      if (resolvedPlacement === 'above') next.bottom = viewportHeight - rect.top + POPOVER_GAP;
      else next.top = rect.bottom + POPOVER_GAP;
      setPosition(next);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, open, placement, width]);

  useLayoutEffect(() => {
    if (!open) {
      focusedForOpen.current = false;
      return;
    }
    if (!autoFocus || focusedForOpen.current || position.visibility !== 'visible') return;
    focusedForOpen.current = true;
    surfaceRef.current?.querySelector<HTMLElement>(
      '[data-popover-initial-focus], button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )?.focus();
  }, [autoFocus, open, position]);

  if (!isValidElement<PopoverTriggerProps>(trigger)) return null;
  const triggerElement = cloneElement(trigger, {
    'aria-controls': open ? popoverId : undefined,
    'aria-expanded': open,
    'aria-haspopup': role,
    onClick: (event) => {
      trigger.props.onClick?.(event);
      if (!event.defaultPrevented) onOpenChange(!open);
    },
  });
  const surface = open && typeof document !== 'undefined' ? createPortal(
    <div
      {...surfaceProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={classNames('xgc-popover', className, surfaceProps?.className)}
      data-xgc-id={dataXgcId}
      data-xgc-overlay-root="true"
      data-xgc-placement={placement}
      data-xgc-role={dataXgcRole}
      id={popoverId}
      onKeyDown={(event) => {
        surfaceProps?.onKeyDown?.(event);
        overlay.closeTopOverlay(event);
      }}
      ref={surfaceRef}
      role={role}
      style={{ ...position, ...surfaceProps?.style }}
    >
      <OverlayOwner id={overlay.overlayId}>{children}</OverlayOwner>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <span
        className="xgc-popover-anchor"
        onKeyDown={(event) => {
          if (open) overlay.closeTopOverlay(event);
        }}
        ref={anchorRef}
      >{triggerElement}</span>
      {surface}
    </>
  );
}

export type ActionMenuItem = {
  disabled?: boolean;
  icon?: ReactNode;
  id: string;
  label: ReactNode;
  onSelect: () => void;
  tone?: Extract<ButtonTone, 'danger' | 'default'>;
};

export type ActionMenuProps = {
  align?: 'end' | 'start';
  ariaLabel: string;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  disabled?: boolean;
  items: readonly ActionMenuItem[];
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  placement?: 'above' | 'auto' | 'below';
  trigger: ReactNode;
  triggerDataXgcRole?: string;
  triggerProps?: Omit<ButtonProps, 'aria-label' | 'children' | 'disabled' | 'onClick'>;
};

/** Accessible action menu with shared portal, placement, and keyboard behavior. */
export function ActionMenu({
  align = 'end',
  ariaLabel,
  className,
  dataXgcId,
  dataXgcRole = 'action-menu',
  disabled = false,
  items,
  onOpenChange,
  open: controlledOpen,
  placement = 'auto',
  trigger,
  triggerDataXgcRole = 'action-menu-trigger',
  triggerProps,
}: ActionMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const enabled = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    if (!enabled.length) return;
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? enabled.length - 1
        : (Math.max(0, current) + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
    event.preventDefault();
    enabled[next]?.focus();
  };

  return (
    <Popover
      align={align}
      ariaLabel={ariaLabel}
      className={classNames('xgc-action-menu', className)}
      dataXgcId={dataXgcId}
      dataXgcRole={dataXgcRole}
      onOpenChange={setOpen}
      open={open}
      placement={placement}
      role="menu"
      trigger={(
        <Button
          {...triggerProps}
          aria-label={ariaLabel}
          data-xgc-id={dataXgcId}
          data-xgc-role={triggerDataXgcRole}
          disabled={disabled}
          iconOnly
          uiSize="compact"
        >
          {trigger}
        </Button>
      )}
    >
      <div className="xgc-action-menu-items" onKeyDown={moveFocus} role="presentation">
        {items.map((item) => (
          <Button
            appearance="ghost"
            className="xgc-action-menu-item"
            disabled={disabled || item.disabled}
            key={item.id}
            onClick={() => {
              item.onSelect();
              setOpen(false);
            }}
            role="menuitem"
            tabIndex={-1}
            tone={item.tone ?? 'default'}
            uiSize="compact"
          >
            {item.icon ? <span aria-hidden="true" className="xgc-action-menu-icon">{item.icon}</span> : null}
            <span>{item.label}</span>
          </Button>
        ))}
      </div>
    </Popover>
  );
}
