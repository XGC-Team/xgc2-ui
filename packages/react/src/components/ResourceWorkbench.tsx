import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import { WorkspaceTabs, type WorkspaceTabItem } from './WorkspaceTabs';
import './ResourceWorkbench.css';

export type WorkbenchResource = {
  disabled?: boolean;
  dirty?: boolean;
  icon?: ReactNode;
  id: string;
  label: string;
  prefix?: ReactNode;
};

export type ResourceWorkbenchProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  activeResourceId?: string;
  ariaLabel: string;
  empty?: ReactNode;
  onActiveResourceChange: (id: string) => void;
  onCloseResource?: (id: string) => void;
  onReorderResources?: (orderedIds: string[]) => void;
  renderResource: (resource: WorkbenchResource) => ReactNode;
  resources: readonly WorkbenchResource[];
};

/**
 * Shared tabs + editor-host composition for documents, files, robots,
 * experiments and other XGC2 resources. The product decides what a resource
 * means and renders the actual editor/viewer; this layer owns only workspace
 * interaction and persistent tab mechanics.
 */
export function ResourceWorkbench({
  activeResourceId,
  ariaLabel,
  className,
  empty,
  onActiveResourceChange,
  onCloseResource,
  onReorderResources,
  renderResource,
  resources,
  ...props
}: ResourceWorkbenchProps) {
  const active = resources.find((resource) => resource.id === activeResourceId)
    ?? resources.find((resource) => !resource.disabled)
    ?? resources[0];
  const tabs: WorkspaceTabItem[] = resources.map((resource) => ({
    disabled: resource.disabled,
    icon: resource.icon,
    id: resource.id,
    label: resource.label,
    prefix: resource.dirty
      ? <span className="xgc-resource-workbench-dirty" aria-hidden="true">*</span>
      : resource.prefix,
  }));

  return (
    <div {...props} className={classNames('xgc-resource-workbench', className)}>
      {resources.length ? (
        <WorkspaceTabs
          ariaLabel={ariaLabel}
          getTabTitle={(item) => {
            const resource = resources.find((candidate) => candidate.id === item.id);
            return resource?.dirty ? `${item.label} — unsaved changes` : item.label;
          }}
          items={tabs}
          minimumItems={0}
          onDelete={onCloseResource}
          onReorder={onReorderResources}
          onValueChange={onActiveResourceChange}
          readOnly={false}
          showCreate={false}
          value={active?.id ?? ''}
        />
      ) : null}
      <div
        aria-label={active ? active.label : undefined}
        className="xgc-resource-workbench-content"
        data-empty={!active || undefined}
        role={active ? 'tabpanel' : undefined}
      >
        {active ? renderResource(active) : empty}
      </div>
    </div>
  );
}
