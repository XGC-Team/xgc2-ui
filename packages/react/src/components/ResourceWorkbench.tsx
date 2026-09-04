import { Activity, useMemo, type HTMLAttributes, type ReactNode } from 'react';
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
  /**
   * Keep opened resources mounted with React 19.2 Activity boundaries so
   * editor/view state survives tab switches while hidden effects are torn
   * down and hidden updates are deprioritized. Disable only for consumers
   * whose resource implementation must be recreated on every activation.
   */
  preserveInactive?: boolean;
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
  preserveInactive = true,
  renderResource,
  resources,
  ...props
}: ResourceWorkbenchProps) {
  const active = resources.find((resource) => resource.id === activeResourceId)
    ?? resources.find((resource) => !resource.disabled)
    ?? resources[0];
  const tabs = useMemo<WorkspaceTabItem[]>(() => resources.map((resource) => ({
    disabled: resource.disabled,
    icon: resource.icon,
    id: resource.id,
    label: resource.label,
    prefix: resource.dirty
      ? <span className="xgc-resource-workbench-dirty" aria-hidden="true">*</span>
      : resource.prefix,
  })), [resources]);
  const resourceById = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource])),
    [resources],
  );

  return (
    <div {...props} className={classNames('xgc-resource-workbench', className)}>
      {resources.length ? (
        <WorkspaceTabs
          ariaLabel={ariaLabel}
          getTabTitle={(item) => {
            const resource = resourceById.get(item.id);
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
        {active ? (
          preserveInactive ? resources.map((resource) => (
            <Activity
              key={resource.id}
              mode={resource.id === active.id ? 'visible' : 'hidden'}
            >
              <div
                className="xgc-resource-workbench-activity"
                data-active={resource.id === active.id || undefined}
                data-resource-id={resource.id}
              >
                {renderResource(resource)}
              </div>
            </Activity>
          )) : renderResource(active)
        ) : empty}
      </div>
    </div>
  );
}
