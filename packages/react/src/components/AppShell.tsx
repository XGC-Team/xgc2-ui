import {
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { classNames } from '../utils';

export type AppShellProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
  contentPadding?: 'default' | 'none';
  height?: 'viewport' | 'parent';
  sidebar?: ReactNode;
  topbar?: ReactNode;
};

export function AppShell({
  children,
  className,
  contentClassName,
  contentPadding = 'default',
  height = 'viewport',
  sidebar,
  topbar,
  ...props
}: AppShellProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-app-shell', className)}
      data-height={height}
      data-sidebar={sidebar ? 'present' : 'absent'}
    >
      {sidebar}
      <div className="xgc-app-workspace">
        {topbar}
        <main
          className={classNames('xgc-app-content', contentClassName)}
          data-padding={contentPadding}
        >
          {children}
        </main>
      </div>
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
  onCollapsedChange?: (collapsed: boolean) => void;
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
  onCollapsedChange,
  ...props
}: AppSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? internalCollapsed;
  const setCollapsed = (next: boolean) => {
    if (collapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  return (
    <aside
      {...props}
      className={classNames('xgc-app-sidebar', className)}
      data-collapsed={isCollapsed || undefined}
    >
      <div className="xgc-sidebar-brand">
        <button
          className="xgc-sidebar-toggle"
          type="button"
          aria-label={isCollapsed ? expandLabel : collapseLabel}
          aria-expanded={!isCollapsed}
          onClick={() => setCollapsed(!isCollapsed)}
        >
          <span className="xgc-sidebar-brand-mark" aria-hidden="true">{brandMark}</span>
          <span className="xgc-sidebar-brand-label" aria-hidden={isCollapsed}>{brandLabel}</span>
          <span className="xgc-sidebar-collapse-indicator" aria-hidden="true">‹</span>
        </button>
      </div>
      <div className="xgc-sidebar-body">{children}</div>
      {footer ? <div className="xgc-sidebar-footer">{footer}</div> : null}
    </aside>
  );
}

export function SidebarNav({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav {...props} className={classNames('xgc-sidebar-nav', className)} />;
}

export type SidebarNavItemProps = {
  active?: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  href?: string;
  icon?: ReactNode;
  label: ReactNode;
  onSelect?: () => void;
};

export function SidebarNavItem({
  active = false,
  badge,
  disabled = false,
  href,
  icon,
  label,
  onSelect,
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
    className: 'xgc-sidebar-nav-item',
    'data-active': active || undefined,
    title: typeof label === 'string' ? label : undefined,
  };

  if (href) {
    return (
      <a
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
      {...commonProps}
      type="button"
      disabled={disabled}
      onClick={onSelect}
    >
      {content}
    </button>
  );
}

export type TopbarProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  actions?: ReactNode;
  center?: ReactNode;
  leading?: ReactNode;
};

export function Topbar({ actions, center, className, leading, ...props }: TopbarProps) {
  return (
    <header {...props} className={classNames('xgc-topbar', className)}>
      {leading ? <div className="xgc-topbar-leading">{leading}</div> : null}
      {center ? <div className="xgc-topbar-center">{center}</div> : null}
      {actions ? <div className="xgc-topbar-actions">{actions}</div> : null}
    </header>
  );
}
