import { useState,type ReactNode } from 'react';
import type { ExperimentDashboard } from '../experimentModel';
import { ExperimentSurfaceVisibilityProvider,useExperimentSurfaceVisible } from '../experimentSurfaceVisibility';

/** Keep visited dashboard runtimes alive; changing tabs is not a lifecycle stop. */
export function ExperimentDashboardSurfaces({ dashboards,selectedId,children }: {
  dashboards:ExperimentDashboard[];
  selectedId:string;
  children:(dashboard:ExperimentDashboard,selected:boolean) => ReactNode;
}) {
  const surfaceVisible=useExperimentSurfaceVisible();
  const [visited,setVisited]=useState(() => [selectedId]);
  if (!visited.includes(selectedId)) setVisited([...visited,selectedId]);
  return dashboards.filter((dashboard) => visited.includes(dashboard.id) || dashboard.id===selectedId).map((dashboard) => {
    const selected=dashboard.id===selectedId;
    return <div key={dashboard.id} hidden={!selected} inert={!selected ? true : undefined}
      aria-hidden={!selected} data-xgc-role="experiment-dashboard-tab-surface" data-xgc-id={dashboard.id}>
      <ExperimentSurfaceVisibilityProvider visible={surfaceVisible && selected}>
        {children(dashboard,selected)}
      </ExperimentSurfaceVisibilityProvider>
    </div>;
  });
}
