import { registerPanelPresence,usePanelPresenceCount } from '../../panels/usePanelPresence';

/** Panel plugin identity this domain publishes; the presence registry keys on it. */
export const GROUND_STATION_ACTIVITY_PANEL_ID = 'ground-station-activity';

/** Registers one mounted activity panel for targetId and returns its unmount callback. */
export function registerGroundStationActivityPanel(targetId: string) {
  return registerPanelPresence(GROUND_STATION_ACTIVITY_PANEL_ID, targetId);
}

/** How many activity panels are mounted for targetId anywhere in the ground station. */
export function useGroundStationActivityPanelCount(targetId: string) {
  return usePanelPresenceCount(GROUND_STATION_ACTIVITY_PANEL_ID, targetId);
}
