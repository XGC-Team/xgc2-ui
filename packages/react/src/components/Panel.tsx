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
      {title || actions ? (
        <header className="xgc-panel-header">
          <div className="xgc-panel-heading">
            {title ? <h2 id={titleId}>{title}</h2> : null}
          </div>
          {actions ? <div className="xgc-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="xgc-panel-body">
        {description ? <p className="xgc-panel-description">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}
