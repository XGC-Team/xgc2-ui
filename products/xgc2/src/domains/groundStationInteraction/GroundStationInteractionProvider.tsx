import { useMemo,useState,type ReactNode } from 'react';
import { useGroundStationActivityPanelCount } from './groundStationActivityPanelPresence';
import type { GroundStationOpenContext } from './GroundStationActivityViews';
import { GroundStationInteractionContext } from './GroundStationInteractionContext';
import { useGroundStationInteractions } from './useGroundStationInteractions';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

export function GroundStationInteractionProvider({
  targetId,
  onOpenContext,
  onOpenSource,
  notificationCenterOpen: controlledOpen,
  onNotificationCenterOpenChange,
  children,
}: {
  targetId: string;
  onOpenContext?: GroundStationOpenContext;
  onOpenSource?: (interaction: GroundStationInteraction) => Promise<boolean>;
  notificationCenterOpen?: boolean;
  onNotificationCenterOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const interactions = useGroundStationInteractions(targetId);
  const [localOpen,setLocalOpen] = useState(false);
  const notificationCenterOpen = controlledOpen ?? localOpen;
  const setNotificationCenterOpen = onNotificationCenterOpenChange ?? setLocalOpen;
  // The count comes from the generic panel presence registry, so any activity
  // panel for this target counts - including one mounted under a different
  // provider subtree. A panel watching another target does not.
  const activityPanelCount = useGroundStationActivityPanelCount(targetId);

  const scope = useMemo(() => ({
    interactions,onOpenContext,onOpenSource,activityPanelCount,notificationCenterOpen,setNotificationCenterOpen,
  }), [activityPanelCount,interactions,onOpenContext,onOpenSource,notificationCenterOpen,setNotificationCenterOpen]);
  return (
    <GroundStationInteractionContext.Provider value={scope}>
      {children}
    </GroundStationInteractionContext.Provider>
  );
}
