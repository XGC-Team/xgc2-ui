import { useMemo,type ReactNode } from 'react';
import {
  StationExperimentOccupancyProvider,
  useExperimentStationOccupancy,
} from '../useExperimentListRunningIds';

/** Project local Total Stop before its request can remove Panel projections. */
export function DashboardStationOccupancyProvider({ experimentResourceId,executionTargetId,stopping,children }: {
  experimentResourceId?:string;
  executionTargetId:string;
  stopping:boolean;
  children:ReactNode;
}) {
  const occupancy = useExperimentStationOccupancy();
  const scopedOccupancy = useMemo(() => {
    if (!stopping || !experimentResourceId) return occupancy;
    let changed = false;
    const sessions = occupancy.sessions.map(view => {
      const session = view.session;
      if (session.experimentResourceId !== experimentResourceId
        || session.targetId !== executionTargetId
        || (session.state !== 'opening' && session.state !== 'active')) return view;
      changed = true;
      return { ...view,session:{ ...session,state:'stopping' as const } };
    });
    // Stopping still occupies the station. Preserve its IDs and the route's
    // read/convergence authority; only Panel subscription demand changes here.
    return changed ? { ...occupancy,sessions } : occupancy;
  },[executionTargetId,experimentResourceId,occupancy,stopping]);
  return <StationExperimentOccupancyProvider value={scopedOccupancy}>
    {children}
  </StationExperimentOccupancyProvider>;
}
