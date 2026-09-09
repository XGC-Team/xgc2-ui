import type { ReactNode } from 'react';
import type { AutomationPanelContext } from '../../../panels/types';
import { useAutomationWorkspace } from '../../automation/automationPublic';
import { PanelAutomationRuntimes,type PanelAutomationRuntimeMap } from './panelAutomationRuntimeContext';

/**
 * Materializes at most one Automation workspace per distinct additional Panel
 * target. Known dashboard/Core runtimes are reused, so ten Panels on one Agent
 * share one snapshot + SSE channel instead of opening ten observers.
 */
export function PanelAutomationRuntimeProvider({ targetIds,known,children }: {
  targetIds:readonly string[];
  known:readonly AutomationPanelContext['automation'][];
  children:ReactNode;
}) {
  const initial = new Map<string,AutomationPanelContext['automation']>();
  known.forEach((runtime) => {
    // Known runtimes are ordered: dashboard owner first, additional target
    // fallbacks second. Do not overwrite the owner with a second observer of
    // the same target (its independently failed catalog can disable the body
    // while the header still operates successfully).
    if (runtime.targetId && !initial.has(runtime.targetId)) initial.set(runtime.targetId,runtime);
  });
  const missing = [...new Set(targetIds.map((target) => target.trim()).filter(Boolean))]
    .filter((target) => !initial.has(target))
    .sort();
  return <AdditionalPanelAutomationRuntime
    targets={missing}
    index={0}
    runtimes={initial}
  >{children}</AdditionalPanelAutomationRuntime>;
}

function AdditionalPanelAutomationRuntime({ targets,index,runtimes,children }: {
  targets:readonly string[];
  index:number;
  runtimes:PanelAutomationRuntimeMap;
  children:ReactNode;
}) {
  const targetId = targets[index];
  if (!targetId) {
    return <PanelAutomationRuntimes.Provider value={runtimes}>{children}</PanelAutomationRuntimes.Provider>;
  }
  return <PanelAutomationRuntimeLayer
    key={targetId}
    targetId={targetId}
    targets={targets}
    index={index}
    runtimes={runtimes}
  >{children}</PanelAutomationRuntimeLayer>;
}

function PanelAutomationRuntimeLayer({ targetId,targets,index,runtimes,children }: {
  targetId:string;
  targets:readonly string[];
  index:number;
  runtimes:PanelAutomationRuntimeMap;
  children:ReactNode;
}) {
  const workspace = useAutomationWorkspace(targetId);
  const next = new Map(runtimes);
  next.set(targetId,workspace);
  return <AdditionalPanelAutomationRuntime
    targets={targets}
    index={index+1}
    runtimes={next}
  >{children}</AdditionalPanelAutomationRuntime>;
}
