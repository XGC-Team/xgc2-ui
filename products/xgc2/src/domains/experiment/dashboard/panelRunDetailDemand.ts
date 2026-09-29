import { useEffect,useRef } from 'react';
import type { AutomationPanelContext } from '../../../panels/types';
import type { AutomationRunDetail } from '../../automation/automationPublic';
import type { ExperimentRunView } from '../experimentWorkflowModel';
import { experimentChildRunBindingId } from '../experimentChildRunBinding';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';
import {
  dataProjectionRequiresRunDetails,
  type PanelWorkflowInvocationFallback,
} from './panelContextFactory';

export type RunDetailDemand = { id:string;targetId:string;revision:number;frozenSnapshot?:true };

export function dataContractsDemandRunDetails(contracts:readonly string[]) {
  return contracts.some(dataProjectionRequiresRunDetails);
}

export function panelRunDetailDemands({
  panelId,targetId,activeRuns,fallback,rootDemands,runDetailsById,enabled,
}: {
  panelId:string;
  targetId:string;
  activeRuns:readonly ExperimentRunView[];
  fallback?:PanelWorkflowInvocationFallback;
  rootDemands?:readonly RunDetailDemand[];
  runDetailsById?:Readonly<Record<string,AutomationRunDetail>>;
  enabled:boolean;
}):RunDetailDemand[] {
  if (!enabled || !panelId || !targetId) return [];
  const demands=new Map<string,RunDetailDemand>();
  const queue:RunDetailDemand[]=[];
  const add=(demand:RunDetailDemand) => {
    const key=demandKey(demand);
    if (demands.has(key)) return;
    demands.set(key,demand);
    queue.push(demand);
  };
  activeRuns.forEach((run) => {
    if (run.targetId===targetId && run.panelId===panelId) {
      add({ id:run.id,targetId:run.targetId,revision:run.revision,frozenSnapshot:true });
    }
  });
  if (fallback?.targetId===targetId) {
    add({
      id:fallback.id,targetId:fallback.targetId,revision:fallback.revision,frozenSnapshot:true,
    });
  }
  rootDemands?.forEach((demand) => add({ ...demand,frozenSnapshot:true }));
  for (let index=0;index<queue.length;index+=1) {
    const demand=queue[index]!;
    const relations=runDetailsById?.[demand.id]?.relations;
    for (const child of relations?.childRuns ?? []) {
      const status=child.runStatus ?? child.observedStatus;
      const boundSucceeded=status==='succeeded' && Boolean(child.boundAt);
      if (!child.childRunId || !child.targetId || child.relation==='detached' || child.launchAbandonedAt
        || (!isRunStatusActive(status) && !boundSucceeded)) continue;
      add({
        id:child.childRunId,
        targetId:child.targetId,
        revision:child.runRevision ?? child.observedRevision ?? 1,
        ...(experimentChildRunBindingId(relations,child.childRunId) === 'xgc-world-runtime'
          ? { frozenSnapshot:true as const } : {}),
      });
    }
  }
  return [...demands.values()].sort((left,right) => (
    left.targetId.localeCompare(right.targetId) || left.id.localeCompare(right.id)
  ));
}

export function usePanelRunDetailDemand({
  demands,automation,runtimes,
}: {
  demands:readonly RunDetailDemand[];
  automation:AutomationPanelContext['automation'];
  runtimes?:ReadonlyMap<string,AutomationPanelContext['automation']>;
}) {
  const observations=useStableDemandBindings(resolveDemandBindings(demands,automation,runtimes,false));
  const snapshots=useStableDemandBindings(resolveDemandBindings(demands,automation,runtimes,true));
  useEffect(() => {
    const releases=observations.map(({ id,retainRunObservation }) => retainRunObservation(id));
    return () => releases.forEach((release) => release());
  },[observations]);
  // Observation bundles refresh live facts; root candidates also load the
  // immutable source snapshot once so the Panel projects the exact Run graph.
  useEffect(() => {
    snapshots.forEach(({ id,loadRunDetail }) => { void loadRunDetail(id).catch(() => undefined); });
  },[snapshots]);
}

function uniqueDemands(demands:readonly RunDetailDemand[]) {
  const unique=new Map<string,RunDetailDemand>();
  demands.forEach((demand) => {
    const key=demandKey(demand);
    const previous=unique.get(key);
    unique.set(key,previous?.frozenSnapshot ? previous : demand);
  });
  return [...unique.values()];
}

function resolveDemandBindings(
  demands:readonly RunDetailDemand[],
  automation:AutomationPanelContext['automation'],
  runtimes:ReadonlyMap<string,AutomationPanelContext['automation']>|undefined,
  snapshotsOnly:boolean,
):DemandBinding[] {
  return uniqueDemands(demands).flatMap(({ id,targetId,frozenSnapshot }) => {
    if (snapshotsOnly && !frozenSnapshot) return [];
    const runtime=runtimes?.get(targetId) ?? (targetId===automation.targetId ? automation : undefined);
    return runtime ? [{
      id,targetId,
      retainRunObservation:runtime.retainRunObservation,
      loadRunDetail:runtime.loadRunDetail,
    }] : [];
  });
}

type DemandBinding={
  id:string;
  targetId:string;
  retainRunObservation:AutomationPanelContext['automation']['retainRunObservation'];
  loadRunDetail:AutomationPanelContext['automation']['loadRunDetail'];
};

function useStableDemandBindings(next:readonly DemandBinding[]) {
  const previous=useRef(next);
  if (!sameDemandBindings(previous.current,next)) previous.current=next;
  return previous.current;
}

function sameDemandBindings(left:readonly DemandBinding[],right:readonly DemandBinding[]) {
  return left.length===right.length && left.every((binding,index) => {
    const candidate=right[index];
    return Boolean(candidate && binding.id===candidate.id && binding.targetId===candidate.targetId
      && binding.retainRunObservation===candidate.retainRunObservation
      && binding.loadRunDetail===candidate.loadRunDetail);
  });
}

function demandKey(demand:Pick<RunDetailDemand,'id'|'targetId'>) {
  return `${demand.targetId}\0${demand.id}`;
}
