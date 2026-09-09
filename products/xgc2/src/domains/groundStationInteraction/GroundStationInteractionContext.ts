import { createContext,useContext } from 'react';
import { normalizeExecutionTargetId } from '../execution/executionPublic';
import type { GroundStationOpenContext } from './GroundStationActivityViews';
import type { GroundStationInteractions } from './useGroundStationInteractions';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

type GroundStationInteractionScope = {
  interactions: GroundStationInteractions;
  onOpenContext?: GroundStationOpenContext;
  onOpenSource?: (interaction: GroundStationInteraction) => Promise<boolean>;
  activityPanelCount: number;
  notificationCenterOpen: boolean;
  setNotificationCenterOpen: (open: boolean) => void;
};

export const GroundStationInteractionContext = createContext<GroundStationInteractionScope | undefined>(undefined);

export function useGroundStationInteractionScope(targetId: string) {
  const scope = useContext(GroundStationInteractionContext);
  return scope?.interactions.targetId === normalizeExecutionTargetId(targetId) ? scope : undefined;
}
