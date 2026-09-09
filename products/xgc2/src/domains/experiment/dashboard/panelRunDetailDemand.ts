import { useEffect,useMemo } from 'react';
import type { AutomationPanelContext } from '../../../panels/types';
import type { ExperimentRunView } from '../experimentWorkflowModel';
import {
  dataProjectionRequiresRunDetails,
  type PanelWorkflowInvocationFallback,
} from './panelContextFactory';
import { useActiveExperimentRunHydration } from './useActiveExperimentRunHydration';
import { useRunRelationChildHydration } from './useRunRelationChildHydration';

export type RunDetailDemand = { id:string;targetId:string;revision:number };

export function dataContractsDemandRunDetails(contracts:readonly string[]) {
  return contracts.some(dataProjectionRequiresRunDetails);
}

export function panelRunDetailDemands({
  panelId,targetId,activeRuns,fallback,enabled,
}: {
  panelId:string;
  targetId:string;
  activeRuns:readonly ExperimentRunView[];
  fallback?:PanelWorkflowInvocationFallback;
  enabled:boolean;
}):RunDetailDemand[] {
  if (!enabled || !panelId || !targetId) return [];
  const demands=new Map<string,RunDetailDemand>();
  activeRuns.forEach((run) => {
    if (run.targetId===targetId && run.panelId===panelId) {
      demands.set(run.id,{ id:run.id,targetId:run.targetId,revision:run.revision });
    }
  });
  if (fallback?.targetId===targetId) {
    demands.set(fallback.id,{
      id:fallback.id,targetId:fallback.targetId,revision:fallback.revision,
    });
  }
  return [...demands.values()].sort((left,right) => left.id.localeCompare(right.id));
}

export function usePanelRunDetailDemand({
  demands,automation,
}: {
  demands:readonly RunDetailDemand[];
  automation:AutomationPanelContext['automation'];
}) {
  const signature=JSON.stringify(demands.map(({ id,targetId,revision }) => (
    [id,targetId,revision] as const
  )).sort(([left],[right]) => left.localeCompare(right)));
  const stableDemands=useMemo<RunDetailDemand[]>(() => (
    (JSON.parse(signature) as [string,string,number][]).map(([id,targetId,revision]) => ({
      id,targetId,revision,
    }))
  ),[signature]);
  const retainRunDetail=automation.retainRunDetail;
  useEffect(() => {
    const releases=stableDemands.map(({ id }) => retainRunDetail(id));
    return () => releases.forEach((release) => release());
  },[retainRunDetail,stableDemands]);
  const rootRunIds=useMemo(() => stableDemands.map(({ id }) => id),[stableDemands]);
  useActiveExperimentRunHydration({
    runs:stableDemands,
    targetId:automation.targetId,
    detailsById:automation.runDetailsById,
    loadRunDetail:automation.loadRunDetail,
  });
  useRunRelationChildHydration({
    rootRunIds,
    detailsById:automation.runDetailsById,
    loadRunDetail:automation.loadRunDetail,
  });
}
