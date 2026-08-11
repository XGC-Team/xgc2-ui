import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils';

export type PanelProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode;
  description?: ReactNode;
  padding?: 'default' | 'none';
  title?: ReactNode;
};

export function Panel({
  actions,
  children,
  className,
  description,
  padding = 'default',
  title,
  ...props
}: PanelProps) {
  const titleId = useId();
  return (
    <section
      {...props}
      className={classNames('xgc-panel', className)}
      aria-labelledby={title ? titleId : props['aria-labelledby']}
      data-padding={padding}
    >
      {title || description || actions ? (
        <header className="xgc-panel-header">
          <div className="xgc-panel-heading">
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="xgc-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="xgc-panel-body">{children}</div>
    </section>
  );
}
