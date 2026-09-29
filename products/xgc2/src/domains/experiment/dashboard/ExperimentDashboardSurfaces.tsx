import { memo,useState,type ReactNode } from 'react';
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
  return dashboards.filter((dashboard) => visited.includes(dashboard.id) || dashboard.id===selectedId).map((dashboard) => (
    <VisitedDashboardSurface
      key={dashboard.id}
      dashboard={dashboard}
      selected={dashboard.id===selectedId}
      surfaceVisible={surfaceVisible}
      render={children}
    />
  ));
}

/**
 * Per-dashboard render boundary: a route render with unchanged inputs skips
 * hidden tabs entirely. The branch stays mounted with the same DOM identity;
 * memo only defers render, and real prop updates still propagate.
 */
const VisitedDashboardSurface = memo(function VisitedDashboardSurface({ dashboard,selected,surfaceVisible,render }: {
  dashboard:ExperimentDashboard;
  selected:boolean;
  surfaceVisible:boolean;
  render:(dashboard:ExperimentDashboard,selected:boolean) => ReactNode;
}) {
  return <div hidden={!selected} inert={!selected ? true : undefined}
    aria-hidden={!selected} data-xgc-role="experiment-dashboard-tab-surface" data-xgc-id={dashboard.id}>
    <ExperimentSurfaceVisibilityProvider visible={surfaceVisible && selected}>
      {render(dashboard,selected)}
    </ExperimentSurfaceVisibilityProvider>
  </div>;
});
