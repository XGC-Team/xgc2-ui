import {
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { classNames } from '../utils';
import { XGC_MEDIA_QUERIES, useMediaQuery } from '../hooks/useMediaQuery';

type DataAttributes = {
  [key: `data-${string}`]: boolean | number | string | undefined;
};

export type AppShellProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
  contentPadding?: 'default' | 'none';
  height?: 'viewport' | 'parent';
  mobileBreakpoint?: 'compact' | 'mobile';
  mobileLayout?: 'document' | 'fixed';
  overlays?: ReactNode;
  sidebar?: ReactNode;
  topbar?: ReactNode;
  workspaceClassName?: string;
};

export function AppShell({
  children,
  className,
  contentClassName,
  contentPadding = 'default',
  height = 'viewport',
  mobileBreakpoint = 'mobile',
  mobileLayout = 'fixed',
  overlays,
  sidebar,
  topbar,
  workspaceClassName,
  ...props
}: AppShellProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-app-shell', className)}
      data-height={height}
      data-mobile-breakpoint={mobileBreakpoint}
      data-mobile-layout={mobileLayout}
      data-sidebar={sidebar ? 'present' : 'absent'}
    >
      {sidebar}
      <div className={classNames('xgc-app-workspace', workspaceClassName)}>
        {topbar}
        <main
          className={classNames('xgc-app-content', contentClassName)}
          data-padding={contentPadding}
        >
          {children}
        </main>
      </div>
      {overlays ? <div className="xgc-app-overlays">{overlays}</div> : null}
    </div>
  );
}

export type ResponsiveSplitProps = HTMLAttributes<HTMLDivElement> & {
  primary: ReactNode;
  ratio?: 'balanced' | 'primary' | 'secondary';
  secondary: ReactNode;
};

export function ResponsiveSplit({
  className,
  primary,
  ratio = 'primary',
  secondary,
  ...props
}: ResponsiveSplitProps) {
  return (
    <div {...props} className={classNames('xgc-responsive-split', className)} data-ratio={ratio}>
      <div className="xgc-responsive-split-pane">{primary}</div>
      <div className="xgc-responsive-split-pane">{secondary}</div>
    </div>
  );
}

export type AppSidebarProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  brandLabel: ReactNode;
  /** Remains visible as the collapse/expand affordance when the sidebar is collapsed. */
  brandMark: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  collapseLabel?: string;
  defaultCollapsed?: boolean;
  expandLabel?: string;
  footer?: ReactNode;
  footerProps?: HTMLAttributes<HTMLDivElement>;
  mobileDismissLabel?: string;
  mobileMode?: 'drawer' | 'rail';
  mobileOpen?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onMobileOpenChange?: (open: boolean) => void;
  toggleProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-expanded' | 'children' | 'onClick' | 'type'> & DataAttributes;
};

export function AppSidebar({
  brandLabel,
  brandMark,
  children,
  className,
  collapsed,
  collapseLabel = 'Collapse navigation',
  defaultCollapsed = false,
  expandLabel = 'Expand navigation',
  footer,
  footerProps,
  mobileDismissLabel = 'Close navigation',
  mobileMode = 'rail',
  mobileOpen = false,
  onCollapsedChange,
  onKeyDown,
  onMobileOpenChange,
  toggleProps,
  ...props
}: AppSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const focusEpochRef = useRef(0);
  const focusMountedRef = useRef(true);
  const mobileDrawerOpenRef = useRef(false);
  const mobileOpenTriggerRef = useRef<HTMLElement | null>(null);
  const wasMobileOpenRef = useRef(false);
  const mobileViewport = useMediaQuery(XGC_MEDIA_QUERIES.mobile);
  const isMobileDrawer = mobileMode === 'drawer' && mobileViewport;
  const isMobileDrawerOpen = isMobileDrawer && mobileOpen;
  mobileDrawerOpenRef.current = isMobileDrawerOpen;
  const isMobileDrawerClosed = isMobileDrawer && !mobileOpen;
  const isCollapsed = collapsed ?? internalCollapsed;
  const visuallyCollapsed = isCollapsed && !(mobileMode === 'drawer' && mobileOpen);
  const setCollapsed = (next: boolean) => {
    if (collapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };
  const { className: toggleClassName, ...sidebarToggleProps } = toggleProps ?? {};

  useEffect(() => {
    const wasOpen = wasMobileOpenRef.current;
    const focusEpoch = ++focusEpochRef.current;
    if (isMobileDrawerOpen && !wasOpen) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && !sidebarRef.current?.contains(activeElement)) {
        mobileOpenTriggerRef.current = activeElement;
      }
      queueMicrotask(() => {
        if (focusMountedRef.current
          && focusEpochRef.current === focusEpoch
          && mobileDrawerOpenRef.current) sidebarToggleRef.current?.focus();
      });
    } else if (!isMobileDrawerOpen && wasOpen) {
      const trigger = mobileOpenTriggerRef.current;
      queueMicrotask(() => {
        if (focusMountedRef.current
          && focusEpochRef.current === focusEpoch
          && !mobileDrawerOpenRef.current) {
          trigger?.focus();
          if (mobileOpenTriggerRef.current === trigger) mobileOpenTriggerRef.current = null;
        }
      });
    }
    wasMobileOpenRef.current = isMobileDrawerOpen;
  }, [isMobileDrawerOpen]);

  useEffect(() => {
    focusMountedRef.current = true;
    return () => {
      focusMountedRef.current = false;
      focusEpochRef.current += 1;
      mobileOpenTriggerRef.current?.focus();
      mobileOpenTriggerRef.current = null;
    };
  }, []);

  return (
    <>
      <aside
        {...props}
        ref={sidebarRef}
        aria-hidden={isMobileDrawerClosed || undefined}
        className={classNames('xgc-app-sidebar', className)}
        data-collapsed={visuallyCollapsed || undefined}
        data-mobile-mode={mobileMode}
        data-mobile-open={mobileMode === 'drawer' && mobileOpen || undefined}
        inert={isMobileDrawerClosed || undefined}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || !isMobileDrawerOpen) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            onMobileOpenChange?.(false);
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = focusableElements(sidebarRef.current);
          if (!focusable.length) {
            event.preventDefault();
            return;
          }
          const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
          const movingBeforeStart = event.shiftKey && activeIndex <= 0;
          const movingAfterEnd = !event.shiftKey && activeIndex === focusable.length - 1;
          if (movingBeforeStart || movingAfterEnd || activeIndex === -1) {
            event.preventDefault();
            focusable[movingBeforeStart ? focusable.length - 1 : 0]?.focus();
          }
        }}
      >
      <div className="xgc-sidebar-brand">
        <button
          {...sidebarToggleProps}
          ref={sidebarToggleRef}
          className={classNames('xgc-sidebar-toggle', toggleClassName)}
          type="button"
          aria-label={mobileMode === 'drawer' && mobileOpen ? mobileDismissLabel : isCollapsed ? expandLabel : collapseLabel}
          aria-expanded={mobileMode === 'drawer' && mobileOpen ? true : !isCollapsed}
          onClick={() => {
            if (mobileMode === 'drawer' && mobileOpen) onMobileOpenChange?.(false);
            else setCollapsed(!isCollapsed);
          }}
        >
          <span className="xgc-sidebar-brand-mark" aria-hidden="true">{brandMark}</span>
          <span className="xgc-sidebar-brand-label" aria-hidden={visuallyCollapsed}>{brandLabel}</span>
          <span className="xgc-sidebar-collapse-indicator" aria-hidden="true">‹</span>
        </button>
      </div>
      <div className="xgc-sidebar-body">{children}</div>
      {footer ? (
        <div
          {...footerProps}
          className={classNames('xgc-sidebar-footer', footerProps?.className)}
        >
          {footer}
        </div>
      ) : null}
      </aside>
      {mobileMode === 'drawer' ? (
        <button
          aria-label={mobileDismissLabel}
          className="xgc-sidebar-backdrop"
          data-open={mobileOpen || undefined}
          hidden={!mobileOpen}
          onClick={() => onMobileOpenChange?.(false)}
          type="button"
        />
      ) : null}
    </>
  );
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  return container
    ? [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => (
      !element.closest('[hidden], [aria-hidden="true"], [inert]')
    ))
    : [];
}
export function SidebarNav({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav {...props} className={classNames('xgc-sidebar-nav', className)} />;
}

export type SidebarNavItemProps = {
  active?: boolean;
  badge?: ReactNode;
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'disabled' | 'onClick' | 'type'>;
  className?: string;
  dataAttributes?: DataAttributes;
  depth?: 0 | 1;
  disabled?: boolean;
  href?: string;
  icon?: ReactNode;
  label: ReactNode;
  linkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href' | 'onClick'>;
  onSelect?: () => void;
  size?: 'compact' | 'default';
};

export function SidebarNavItem({
  active = false,
  badge,
  buttonProps,
  className,
  dataAttributes,
  depth = 0,
  disabled = false,
  href,
  icon,
  label,
  linkProps,
  onSelect,
  size = 'default',
}: SidebarNavItemProps) {
  const content = (
    <>
      {icon ? <span className="xgc-sidebar-nav-icon" aria-hidden="true">{icon}</span> : null}
      <span className="xgc-sidebar-nav-label">{label}</span>
      {badge ? <span className="xgc-sidebar-nav-badge">{badge}</span> : null}
    </>
  );
  const commonProps = {
    'aria-current': active ? 'page' as const : undefined,
    className: classNames('xgc-sidebar-nav-item', className),
    'data-active': active || undefined,
    'data-depth': depth,
    'data-size': size,
    title: typeof label === 'string' ? label : undefined,
  };

  if (href) {
    return (
      <a
        {...linkProps}
        {...dataAttributes}
        {...commonProps}
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onSelect?.();
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      {...buttonProps}
      {...dataAttributes}
      {...commonProps}
      type="button"
      disabled={disabled}
      onClick={onSelect}
    >
      {content}
    </button>
  );
}

export type TopbarProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
  actions?: ReactNode;
  brand?: ReactNode;
  navigation?: ReactNode;
  title?: ReactNode;
};

export function Topbar({ actions, brand, className, navigation, title, ...props }: TopbarProps) {
  return (
    <header {...props} className={classNames('xgc-topbar', className)}>
      {brand || title || navigation ? (
        <div className="xgc-topbar-leading">
          {navigation ? <div className="xgc-topbar-navigation">{navigation}</div> : null}
          {brand ?? <h1 className="xgc-topbar-title">{title}</h1>}
        </div>
      ) : null}
      {actions ? <div className="xgc-topbar-actions">{actions}</div> : null}
    </header>
  );
}
