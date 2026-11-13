import type { HTMLAttributes, ReactNode } from 'react';

export type WorkflowSubgraphFrameProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode;
  badge?: ReactNode;
  body?: ReactNode;
  dataXgcId?: string;
  dataXgcRole?: string;
  handles?: ReactNode;
  icon?: ReactNode;
  running?: boolean;
  selected?: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
};

/**
 * Neutral spatial frame for compound or inline-subgraph nodes (such as bounded
 * loops or scoped blocks) rendered on a WorkflowCanvas.
 */
export function WorkflowSubgraphFrame({
  actions,
  badge,
  body,
  children,
  className,
  dataXgcId,
  dataXgcRole = 'workflow-subgraph-frame',
  handles,
  icon,
  running = false,
  selected = false,
  subtitle,
  title,
  ...props
}: WorkflowSubgraphFrameProps) {
  return (
    <section
      {...props}
      className={classNames('xgc-workflow-subgraph-frame', className)}
      data-running={running || undefined}
      data-selected={selected || undefined}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      {handles ? (
        <div className="xgc-workflow-subgraph-frame-handles" data-xgc-slot="handles">
          {handles}
        </div>
      ) : null}
      <header className="xgc-workflow-subgraph-frame-header" data-xgc-slot="header">
        <div className="xgc-workflow-subgraph-frame-heading">
          {icon ? <span className="xgc-workflow-subgraph-frame-icon">{icon}</span> : null}
          <div className="xgc-workflow-subgraph-frame-titles">
            <span className="xgc-workflow-subgraph-frame-title">{title}</span>
            {subtitle ? <span className="xgc-workflow-subgraph-frame-subtitle">{subtitle}</span> : null}
          </div>
        </div>
        {(badge || actions) ? (
          <div className="xgc-workflow-subgraph-frame-controls">
            {badge ? <span className="xgc-workflow-subgraph-frame-badge">{badge}</span> : null}
            {actions}
          </div>
        ) : null}
      </header>
      {(body || children) ? (
        <div className="xgc-workflow-subgraph-frame-body" data-xgc-slot="body">
          {body ?? children}
        </div>
      ) : null}
    </section>
  );
}

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}
