import { createContext,useContext } from 'react';
import type { RosBasicServicesPanelView } from './rosBasicServicesPanelModel';

export type { RosBasicServicesPanelView };

export type RosBasicServicesWhiteboardOption = {
  value: string;
  label: string;
  group?: string;
  disabled: boolean;
};

/**
 * Whiteboard workflow selection for the panel header. PanelPluginHeaderActionsProps is
 * {panel, editing}, so the frame context is the only channel that can carry selection
 * state into the header. Zoom commands stay on the panel body (canvas overlay) and
 * never need this bridge. Configure/delete chrome stays on PanelFrame.
 */
export type RosBasicServicesWhiteboardControl = {
  options: RosBasicServicesWhiteboardOption[];
  selectedWorkflowId: string;
  selectWorkflow: (workflowId: string) => void;
};

type RosBasicServicesPanelFrameState = {
  panelId: string;
  view: RosBasicServicesPanelView;
  setView: (view: RosBasicServicesPanelView) => void;
  whiteboardControl: RosBasicServicesWhiteboardControl | null;
  setWhiteboardControl: (control: RosBasicServicesWhiteboardControl | null) => void;
};

export const RosBasicServicesPanelFrameContext = createContext<RosBasicServicesPanelFrameState | null>(null);

export function useRosBasicServicesPanelFrame(panelId: string) {
  const frameState = useContext(RosBasicServicesPanelFrameContext);
  if (!frameState || frameState.panelId !== panelId) {
    throw new Error(`ROS Control panel ${panelId} must be rendered inside its registered frame provider.`);
  }
  return frameState;
}
