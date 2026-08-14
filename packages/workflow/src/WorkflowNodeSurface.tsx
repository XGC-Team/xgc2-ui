import type { HTMLAttributes, ReactNode } from 'react';

export type WorkflowNodeSurfacePadding = 'default' | 'none';

export type WorkflowNodeSurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'content'> & {
  content: ReactNode;
  contentClassName?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  handles?: ReactNode;
  padding?: WorkflowNodeSurfacePadding;
  /**
   * Functional "currently executing" indicator: a restrained highlight
   * travelling clockwise along the node border. It never replaces the
   * readable status text the product renders inside the node.
   */
  running?: boolean;
  selected?: boolean;
};

/** Neutral node chrome for product-owned workflow node renderers. */
export function WorkflowNodeSurface({
  className,
  content,
  contentClassName,
  dataXgcId,
  dataXgcRole = 'workflow-node-surface',
  handles,
  padding = 'default',
  running = false,
  selected = false,
  ...props
}: WorkflowNodeSurfaceProps) {
  return (
    <div
      {...props}
      className={classNames('xgc-workflow-node-surface', className)}
      data-padding={padding}
      data-running={running || undefined}
      data-selected={selected || undefined}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      {handles ? (
        <div className="xgc-workflow-node-surface-handles" data-xgc-slot="handles">
          {handles}
        </div>
      ) : null}
      <div
        className={classNames('xgc-workflow-node-surface-content', contentClassName)}
        data-xgc-slot="content"
      >
        {content}
      </div>
    </div>
  );
}

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}
