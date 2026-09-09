import { createContext,useContext } from 'react';
import type { AutomationPanelContext } from '../../../panels/types';

export type PanelAutomationRuntimeMap = ReadonlyMap<string,AutomationPanelContext['automation']>;

export const PanelAutomationRuntimes = createContext<PanelAutomationRuntimeMap>(new Map());

export function usePanelAutomationRuntime(
  targetId:string,
  fallback:AutomationPanelContext['automation'],
) {
  return useContext(PanelAutomationRuntimes).get(targetId) ?? fallback;
}
