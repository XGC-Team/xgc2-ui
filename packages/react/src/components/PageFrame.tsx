import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils';
import { Heading, Text } from './Typography';
import './PageFrame.css';

export type PageFrameProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
  description?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  padding?: 'none' | 'compact' | 'default';
  title?: ReactNode;
  width?: 'full' | 'wide' | 'readable';
};

/**
 * Canonical route/page frame. It owns page inset and heading geometry so page
 * families cannot gradually invent their own margins, title sizes or loading
 * chrome. Async work marks the existing frame busy instead of replacing the
 * whole route with a blank fallback.
 */
export function PageFrame({
  actions,
  breadcrumbs,
  busy = false,
  busyLabel = 'Loading',
  children,
  className,
  description,
  headingLevel = 1,
  padding = 'default',
  title,
  width = 'full',
  ...props
}: PageFrameProps) {
  const titleId = useId();
  const HeadingElement = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  const hasHeader = Boolean(breadcrumbs || title || description || actions);

  return (
    <section
      {...props}
      aria-busy={busy || undefined}
      aria-labelledby={title ? titleId : props['aria-labelledby']}
      className={classNames('xgc-page-frame', className)}
      data-busy={busy || undefined}
      data-padding={padding}
      data-width={width}
    >
      {busy ? (
        <div className="xgc-page-frame-progress" role="status">
          <span className="xgc-visually-hidden">{busyLabel}</span>
        </div>
      ) : null}
      {hasHeader ? (
        <header className="xgc-page-frame-header">
          <div className="xgc-page-frame-heading">
            {breadcrumbs ? <div className="xgc-page-frame-breadcrumbs">{breadcrumbs}</div> : null}
            {title ? (
              <Heading as={HeadingElement} id={titleId} variant="page">{title}</Heading>
            ) : null}
            {description ? <Text as="p" variant="secondary">{description}</Text> : null}
          </div>
          {actions ? <div className="xgc-page-frame-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="xgc-page-frame-body">{children}</div>
    </section>
  );
}
