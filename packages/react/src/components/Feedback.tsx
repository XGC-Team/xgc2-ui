import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import { Button } from './Button';
import type { StatusTone } from './StatusText';

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
  density?: 'default' | 'compact';
  dismissLabel?: string;
  heading?: ReactNode;
  onDismiss?: () => void;
  tone?: StatusTone;
};

export function Notice({
  actions,
  children,
  className,
  density = 'default',
  dismissLabel = 'Dismiss',
  heading,
  onDismiss,
  role,
  tone = 'neutral',
  ...props
}: NoticeProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-notice', className)}
      data-density={density}
      data-tone={tone}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
    >
      <div className="xgc-notice-content">
        {heading ? <strong>{heading}</strong> : null}
        <div className="xgc-notice-message">{children}</div>
      </div>
      {actions || onDismiss ? (
        <div className="xgc-notice-actions">
          {actions}
          {onDismiss ? (
            <Button appearance="ghost" iconOnly uiSize="compact" aria-label={dismissLabel} onClick={onDismiss}>
              <span aria-hidden="true">×</span>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type EmptyStateProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode;
  appearance?: 'surface' | 'plain';
  as?: 'div' | 'section';
  description?: ReactNode;
  density?: 'default' | 'compact';
  fill?: boolean;
  /** @deprecated Empty states are text-only (title + description + actions);
   * decorative icons are no longer rendered. */
  icon?: ReactNode;
  title: ReactNode;
};

export function EmptyState({
  actions,
  appearance = 'surface',
  as = 'div',
  className,
  description,
  density = 'default',
  fill = false,
  title,
  ...props
}: EmptyStateProps) {
  const Element = as;
  return (
    <Element
      {...props}
      className={classNames('xgc-empty-state', className)}
      data-appearance={appearance}
      data-density={density}
      data-fill={fill || undefined}
    >
      <strong className="xgc-empty-state-title">{title}</strong>
      {description ? <p className="xgc-empty-state-description">{description}</p> : null}
      {actions ? <div className="xgc-empty-state-actions">{actions}</div> : null}
    </Element>
  );
}
