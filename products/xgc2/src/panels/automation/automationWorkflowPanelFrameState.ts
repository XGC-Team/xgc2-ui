import { createContext,useContext } from 'react';
import type { AutomationWorkflowPanelView } from './automationWorkflowPanelModel';

export type AutomationWorkflowOption = {
  id: string;
  label: string;
  resourceId?: string;
};

export type AutomationWorkflowPanelFrameState = {
  panelId: string;
  view: AutomationWorkflowPanelView;
  setView: (view: AutomationWorkflowPanelView) => void;
  workflows: AutomationWorkflowOption[];
  setWorkflows: (workflows: AutomationWorkflowOption[]) => void;
  selectedWorkflowId: string;
  selectWorkflow: (workflowId: string) => void;
  selectedRunId: string;
  setSelectedRunId: (runId: string) => void;
};

export const AutomationWorkflowPanelFrameContext = createContext<AutomationWorkflowPanelFrameState | null>(null);

export function useAutomationWorkflowPanelFrame(panelId: string) {
  const frameState = useContext(AutomationWorkflowPanelFrameContext);
  if (!frameState || frameState.panelId !== panelId) {
    throw new Error(`Automation workflow panel ${panelId} must be rendered inside its registered frame provider.`);
  }
  return frameState;
}

export function useOptionalAutomationWorkflowPanelFrame(panelId: string) {
  const frameState = useContext(AutomationWorkflowPanelFrameContext);
  return frameState?.panelId === panelId ? frameState : undefined;
}
