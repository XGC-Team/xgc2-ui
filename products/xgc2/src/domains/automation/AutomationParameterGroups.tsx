import type { ReactNode } from 'react';
import type { AutomationParameterGroup } from './automationParameterGroupModel';

export type AutomationParameterGroupContent = AutomationParameterGroup & {
  content: ReactNode[];
};

export function AutomationParameterGroups({ nodeId,groups }: {
  nodeId: string;
  groups: AutomationParameterGroupContent[];
}) {
  const visibleGroups = groups.filter((group) => group.content.length > 0);
  if (visibleGroups.length === 0) return null;
  return (
    <section className="automation-parameter-groups" data-xgc-role="automation-parameter-groups" data-xgc-id={nodeId}>
      {visibleGroups.map((group) => (
        <details
          key={group.id}
          className="automation-parameter-group"
          data-xgc-role="automation-parameter-group"
          data-xgc-id={`${nodeId}:${group.id}`}
          data-xgc-collapsed={group.collapsed ? 'true' : 'false'}
          open={!group.collapsed}
        >
          <summary>
            <span>{group.label}</span>
            <small>{group.content.length} parameters</small>
          </summary>
          <div className="automation-parameter-group-content">
            {group.content}
          </div>
        </details>
      ))}
    </section>
  );
}
