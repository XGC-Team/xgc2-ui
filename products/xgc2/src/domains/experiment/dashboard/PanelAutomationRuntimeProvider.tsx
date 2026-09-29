import { memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import type { ConfigRef } from '../../../shared/configResource';
import { useProductRouteVisible } from '../../../shared/routeReady';
import { useAutomationBoundDocuments,useAutomationWorkspace } from '../../automation/automationPublic';
import {
  createDashboardRunStore,
  DashboardRunStoreProvider,
  type DashboardRunLifecycle,
  type DashboardRunSnapshot,
  type PanelAutomationRuntime,
  type PanelAutomationRuntimeMap,
} from './dashboardRunStore';
import type { ExperimentDashboardActions } from './useExperimentDashboardActions';

type BoundWorkflows={ scopeKey:string;refs:readonly ConfigRef[] };

/**
 * Materializes at most one Automation workspace per distinct additional Panel
 * target. The dashboard and local runtimes are reused, so ten Panels on one
 * Agent share one snapshot + SSE channel instead of opening ten observers.
 * The resolved runtimes and the Run lifecycle reach Panels through one
 * dashboard Run store, so a Run event never re-renders the grid or frames.
 */
export function PanelAutomationRuntimeProvider({ targetIds,lifecycle,scopeKey='',workflowRefs=[],children }: {
  targetIds:readonly string[];
  lifecycle:DashboardRunLifecycle;
  scopeKey?:string;
  workflowRefs?:readonly ConfigRef[];
  children:ReactNode;
}) {
  const stableKnown = useStableRuntimes([lifecycle.automation,lifecycle.localAutomation]);
  const known = useMemo(() => {
    const map = new Map<string,PanelAutomationRuntime>();
    stableKnown.forEach((runtime) => {
      // Known runtimes are ordered: dashboard owner first, local fallback
      // second. Do not overwrite the owner with a second observer of the same
      // target (its independently failed catalog can disable the body while
      // the header still operates successfully).
      if (runtime.targetId && !map.has(runtime.targetId)) map.set(runtime.targetId,runtime);
    });
    return map;
  },[stableKnown]);
  const [observed,setObserved]=useState<PanelAutomationRuntimeMap>(() => new Map());
  const { activeRun,activeRuns,sessionViews }=lifecycle.actions;
  const roots=useMemo(
    () => currentSessionRunRoots({ activeRun,activeRuns,sessionViews }),
    [activeRun,activeRuns,sessionViews],
  );
  const relationRuntimes=useMemo(() => {
    const runtimes=new Map(known);
    observed.forEach((runtime,targetId) => {
      if (!runtimes.has(targetId)) runtimes.set(targetId,runtime);
    });
    return runtimes;
  },[known,observed]);
  const relatedTargets=useMemo(
    () => currentRunRelationTargets(roots,relationRuntimes),
    [relationRuntimes,roots],
  );
  const targets=useStableList(uniqueTargets([...targetIds,...relatedTargets]));
  const observerTargets=useStableList(targets.filter((target) => !known.has(target)));
  const runtimes=useMemo(() => {
    const next=new Map(known);
    const activeObservers=new Set(observerTargets);
    observed.forEach((runtime,targetId) => {
      if (activeObservers.has(targetId) && !next.has(targetId)) next.set(targetId,runtime);
    });
    return next;
  },[known,observerTargets,observed]);
  const reportRuntime=useCallback((targetId:string,runtime:PanelAutomationRuntime) => {
    setObserved((current) => {
      if (current.get(targetId)===runtime) return current;
      const next=new Map(current);
      next.set(targetId,runtime);
      return next;
    });
  },[]);
  useEffect(() => {
    const retained=new Set(observerTargets);
    setObserved((current) => {
      const next=new Map([...current].filter(([targetId]) => retained.has(targetId)));
      return next.size===current.size ? current : next;
    });
  },[observerTargets]);
  const bindings={ scopeKey,refs:workflowRefs };
  return <>
    <BoundPanelAutomationRuntimes runtimes={runtimes} bindings={bindings} lifecycle={lifecycle}>
      {children}
    </BoundPanelAutomationRuntimes>
    {observerTargets.map((targetId) => (
      <AdditionalPanelAutomationRuntimeObserver key={targetId} targetId={targetId} onRuntime={reportRuntime} />
    ))}
  </>;
}

const AdditionalPanelAutomationRuntimeObserver=memo(function AdditionalPanelAutomationRuntimeObserver({ targetId,onRuntime }: {
  targetId:string;
  onRuntime:(targetId:string,runtime:PanelAutomationRuntime) => void;
}) {
  const workspace = useStableRuntime(useAutomationWorkspace(targetId));
  useEffect(() => onRuntime(targetId,workspace),[onRuntime,targetId,workspace]);
  return null;
});

type SessionRunRoot={targetId:string;runId:string};

function currentSessionRunRoots(actions:Pick<ExperimentDashboardActions,'activeRun'|'activeRuns'|'sessionViews'>):SessionRunRoot[] {
  const roots=new Map<string,SessionRunRoot>();
  const add=(targetId:string,runId:string) => {
    const target=targetId.trim();
    const id=runId.trim();
    if (target && id) roots.set(`${target}\0${id}`,{targetId:target,runId:id});
  };
  const activeRuns=actions.activeRuns ?? (actions.activeRun ? [actions.activeRun] : []);
  activeRuns.forEach((run) => {
    const rootRunId=run.rootRunId || run.id;
    add(run.targetId,rootRunId);
    add(run.targetId,run.id);
  });
  for (const view of actions.sessionViews ?? []) {
    if (!['opening','active','stopping'].includes(view.session.state)) continue;
    for (const member of view.members) {
      if (member.sessionId!==view.session.id || member.kind!=='workflow_run') continue;
      // Keep a completed dispatcher as a root while its Session remains open;
      // a supervised resident child can outlive that dispatcher Run.
      add(member.targetId,member.ownerId);
    }
  }
  return [...roots.values()];
}

function currentRunRelationTargets(
  roots:readonly SessionRunRoot[],
  runtimes:PanelAutomationRuntimeMap,
):string[] {
  const targets=new Set(roots.map((root) => root.targetId));
  const visited=new Set<string>();
  const queue=[...roots];
  for (let index=0;index<queue.length;index+=1) {
    const current=queue[index]!;
    const key=`${current.targetId}\0${current.runId}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const detail=runtimes.get(current.targetId)?.runDetailsById[current.runId];
    for (const child of detail?.relations?.childRuns ?? []) {
      if (!child.boundAt || child.launchAbandonedAt || child.relation==='detached'
        || !child.childRunId.trim() || !child.targetId.trim()) continue;
      targets.add(child.targetId);
      queue.push({targetId:child.targetId,runId:child.childRunId});
    }
  }
  return [...targets].sort();
}

function uniqueTargets(targets:readonly string[]) {
  return [...new Set(targets.map((target) => target.trim()).filter(Boolean))].sort();
}

function BoundPanelAutomationRuntimes({ runtimes,bindings,lifecycle,children }: {
  runtimes:PanelAutomationRuntimeMap;
  bindings:BoundWorkflows;
  lifecycle:DashboardRunLifecycle;
  children:ReactNode;
}) {
  const visible=useProductRouteVisible();
  // Definitions are Core-global; runtime observations/actions remain target-owned.
  const boundDocuments=useAutomationBoundDocuments({
    scopeKey:JSON.stringify([bindings.scopeKey,[...runtimes.keys()].sort()]),
    refs:bindings.refs,documents:[...runtimes.values()].flatMap((runtime) => runtime.documents),enabled:visible,
  });
  const documents=useStableList(boundDocuments);
  const resolved=useMemo(() => bindings.refs.length===0 ? runtimes
    : new Map([...runtimes].map(([targetId,runtime]) => [targetId,{ ...runtime,documents }] as const)),
    [bindings.refs.length,documents,runtimes]);
  const snapshot=useMemo<DashboardRunSnapshot>(() => ({ ...lifecycle,runtimes:resolved }),[lifecycle,resolved]);
  // The first snapshot seeds the store in the same render; later snapshots
  // publish after commit, before paint, to the subscribed Panel slots only.
  const [store]=useState(() => createDashboardRunStore(snapshot));
  useLayoutEffect(() => {
    store.publish(snapshot);
  },[snapshot,store]);
  return <DashboardRunStoreProvider value={store}>{children}</DashboardRunStoreProvider>;
}

/**
 * Workspace hooks return a fresh object per render even when nothing changed,
 * so reuse the previous reference while every field is shallowly identical;
 * real state updates always replace at least one field and keep flowing.
 */
function useStableRuntime<T extends object>(value:T):T {
  const ref=useRef(value);
  if (!shallowEqualRecord(ref.current,value)) ref.current=value;
  return ref.current;
}

function useStableRuntimes<T extends object>(values:readonly T[]):readonly T[] {
  const ref=useRef(values);
  const current=ref.current;
  if (current.length!==values.length
    || values.some((value,index) => !shallowEqualRecord(current[index] as T,value))) {
    ref.current=values;
  }
  return ref.current;
}

function useStableList<A extends readonly unknown[]>(values:A):A {
  const ref=useRef(values);
  const current=ref.current;
  if (current.length!==values.length || values.some((value,index) => current[index]!==value)) {
    ref.current=values;
  }
  return ref.current;
}

function shallowEqualRecord(left:object,right:object) {
  if (left===right) return true;
  const entries=Object.entries(left);
  const record=right as Record<string,unknown>;
  return entries.length===Object.keys(right).length
    && entries.every(([key,value]) => record[key]===value);
}
