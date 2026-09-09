import { useCallback,useEffect,useRef,useState } from 'react';
import { mergeExecutionRelations,mergeRevisioned } from './automationExecutionMerge';
import type { AutomationRunDetail } from './automationExecutionContracts';
import { projectAutomationRunLifecycleEvent } from './automationRunEventProjection';
import type { ExecutionEvent } from '../execution/executionPublic';
import { messageOf } from './automationErrorModel';
import { validateAutomationRelationLedger } from './automationRelationsModel';
import type { AutomationRun } from './automationRunContracts';
import {
  getAutomationExecutionRelations,
  getAutomationRun,
  getAutomationRunSnapshot,
  listAutomationNodeExecutionSummaries,
  listAutomationNodeInvocations,
} from './automationRunService';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';
import { retainAutomationRunDetails } from './automationRunDetailRetention';

type UseAutomationRunDetailsOptions = {
  targetId: string;
  markExecutionHistoryObserved: (resourceId: string) => void;
};
type RunDetailsSnapshot = {
  scope: AutomationTargetScope;
  details: Record<string,AutomationRunDetail>;
};
type RunDetailRequest = { scope: AutomationTargetScope;generation: number };
type RunDetailInFlight = { scope: AutomationTargetScope;promise: Promise<AutomationRunDetail> };

const emptyRunDetail = ():AutomationRunDetail => ({
  invocations: [],nodeSummaries: [],loading: false,error: '',
});

export function useAutomationRunDetails({
  targetId,
  markExecutionHistoryObserved,
}: UseAutomationRunDetailsOptions) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const [snapshot,setSnapshot] = useState<RunDetailsSnapshot>(() => emptyRunDetails(targetScope));
  const snapshotRef = useRef(snapshot);
  const runDetailsByIdRef = useRef<Record<string,AutomationRunDetail>>({});
  const requestSequenceRef = useRef(0);
  const requestsRef = useRef(new Map<string,RunDetailRequest>());
  const inFlightRef = useRef(new Map<string,RunDetailInFlight>());
  const retentionRef = useRef<{ scope:AutomationTargetScope;counts:Map<string,number> }>({
    scope:targetScope,counts:new Map(),
  });

  if (snapshotRef.current.scope !== targetScope) runDetailsByIdRef.current = {};
  if (retentionRef.current.scope!==targetScope) {
    retentionRef.current={ scope:targetScope,counts:new Map() };
  }

  const replaceSnapshot = useCallback((
    requestScope: AutomationTargetScope,
    update: (current: RunDetailsSnapshot) => RunDetailsSnapshot,
  ) => {
    if (targetScopeRef.current !== requestScope) return false;
    const current = snapshotRef.current.scope === requestScope
      ? snapshotRef.current
      : emptyRunDetails(requestScope);
    const updated = update(current);
    const pinnedRunIds=new Set([...retentionRef.current.counts.entries()].flatMap(([runId,count]) => (
      count>0 ? [runId] : []
    )));
    const retainedDetails = retainAutomationRunDetails(
      updated.details,undefined,pinnedRunIds,
    );
    const next = retainedDetails === updated.details
      ? updated
      : { ...updated,details:retainedDetails };
    snapshotRef.current = next;
    runDetailsByIdRef.current = next.details;
    setSnapshot(next);
    return true;
  }, [targetScopeRef]);

  const resetRunDetails = useCallback(() => {
    if (targetScopeRef.current !== targetScope) return;
    requestsRef.current.clear();
    inFlightRef.current.clear();
    replaceSnapshot(targetScope, () => emptyRunDetails(targetScope));
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  useEffect(() => {
    requestsRef.current.clear();
    inFlightRef.current.clear();
    replaceSnapshot(targetScope, () => emptyRunDetails(targetScope));
  }, [replaceSnapshot,targetScope]);

  const retainRunDetail=useCallback((rawRunId:string) => {
    const runId=rawRunId.trim();
    if (!runId || runId!==rawRunId) throw new Error('Automation Run detail retention requires one exact Run ID.');
    const requestScope=targetScope;
    assertCurrentTargetScope(targetScopeRef,requestScope);
    if (retentionRef.current.scope!==requestScope) {
      retentionRef.current={ scope:requestScope,counts:new Map() };
    }
    const counts=retentionRef.current.counts;
    counts.set(runId,(counts.get(runId)??0)+1);
    let released=false;
    return () => {
      if (released) return;
      released=true;
      if (retentionRef.current.scope!==requestScope) return;
      const current=retentionRef.current.counts.get(runId)??0;
      if (current<=1) retentionRef.current.counts.delete(runId);
      else retentionRef.current.counts.set(runId,current-1);
      replaceSnapshot(requestScope,(snapshot) => snapshot);
    };
  },[replaceSnapshot,targetScope,targetScopeRef]);

  const cacheExactRun = useCallback((run: AutomationRun, onlyExisting = false) => {
    replaceSnapshot(targetScope, (current) => {
      const previous = current.details[run.id];
      if (onlyExisting && !previous) return current;
      const retainedRun = previous?.run && previous.run.revision > run.revision ? previous.run : run;
      return {
        ...current,
        details: {
          ...current.details,
          [run.id]: { ...(previous ?? emptyRunDetail()),run: retainedRun },
        },
      };
    });
  }, [replaceSnapshot,targetScope]);

  const applyRunLifecycleEvent = useCallback((event:ExecutionEvent) => {
    const existing=runDetailsByIdRef.current[event.entityId]?.run;
    if (!existing) return false;
    const projected=projectAutomationRunLifecycleEvent(existing,event);
    if (!projected) return false;
    if (projected!==existing) cacheExactRun(projected,true);
    return true;
  },[cacheExactRun]);

  const requestRunDetail = useCallback(async (runId: string) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const request: RunDetailRequest = {
      scope: requestScope,generation: requestSequenceRef.current + 1,
    };
    requestSequenceRef.current = request.generation;
    requestsRef.current.set(runId, request);
    replaceSnapshot(requestScope, (current) => ({
      ...current,
      details: {
        ...current.details,
        [runId]: { ...(current.details[runId] ?? emptyRunDetail()),loading: true,error: '' },
      },
    }));
    try {
      const previousSnapshot = runDetailsByIdRef.current[runId]?.snapshot;
      const [run,invocations,nodeSummaries,relations,runSnapshot] = await Promise.all([
        getAutomationRun(requestScope.targetId, runId),
        listAutomationNodeInvocations(requestScope.targetId, runId),
        listAutomationNodeExecutionSummaries(requestScope.targetId, runId),
        getAutomationExecutionRelations(requestScope.targetId, runId),
        previousSnapshot
          ? Promise.resolve(previousSnapshot)
          : getAutomationRunSnapshot(requestScope.targetId, runId),
      ]);
      if (targetScopeRef.current !== requestScope || requestsRef.current.get(runId) !== request) {
        return runDetailsByIdRef.current[runId] ?? emptyRunDetail();
      }
      markExecutionHistoryObserved(run.automationResourceId);
      const previous = runDetailsByIdRef.current[runId];
      const mergedInvocations = mergeRevisioned(invocations, previous?.invocations ?? [], (item) => item.id);
      const mergedNodeSummaries = mergeRevisioned(nodeSummaries, previous?.nodeSummaries ?? [], (item) => item.nodeId);
      const mergedRelations = mergeExecutionRelations(relations, previous?.relations);
      validateAutomationRelationLedger(mergedRelations, mergedInvocations, `/runs/${runId}/relations`);
      const effectiveSnapshot = previous?.snapshot ?? runSnapshot;
      const detail = {
        // A lifecycle SSE may arrive while the parallel bundle is reading.
        // Preserve its newer run facts when the older GET finally completes.
        run: previous?.run && previous.run.revision > run.revision ? previous.run : run,
        invocations: mergedInvocations,
        nodeSummaries: mergedNodeSummaries,
        relations: mergedRelations,
        snapshot: effectiveSnapshot,
        loading: false,
        error: '',
      };
      replaceSnapshot(requestScope, (current) => ({
        ...current,details: { ...current.details,[runId]: detail },
      }));
      return detail;
    } catch (cause) {
      if (targetScopeRef.current !== requestScope || requestsRef.current.get(runId) !== request) {
        return runDetailsByIdRef.current[runId] ?? emptyRunDetail();
      }
      const previous = runDetailsByIdRef.current[runId] ?? emptyRunDetail();
      const detail = {
        run: previous.run,
        invocations: previous.invocations,
        nodeSummaries: previous.nodeSummaries,
        relations: previous.relations,
        snapshot: previous.snapshot,
        loading: false,
        error: messageOf(cause),
      };
      replaceSnapshot(requestScope, (current) => ({
        ...current,details: { ...current.details,[runId]: detail },
      }));
      return detail;
    } finally {
      if (requestsRef.current.get(runId) === request) requestsRef.current.delete(runId);
    }
  }, [markExecutionHistoryObserved,replaceSnapshot,targetScope,targetScopeRef]);

  const loadRunDetail = useCallback(async (runId: string,expectedRevision?:number) => {
    const requestScope=targetScope;
    assertCurrentTargetScope(targetScopeRef,requestScope);
    if (expectedRevision!==undefined
      && (!Number.isSafeInteger(expectedRevision) || expectedRevision<1)) {
      throw new Error('Automation Run detail expected revision must be a positive integer.');
    }
    // Revision-keyed Panel hydration is a cache demand, not an operator
    // refresh. A complete current detail satisfies every consumer that saw
    // this Run revision; explicit calls without a revision still refresh.
    const cached=runDetailsByIdRef.current[runId];
    if (expectedRevision!==undefined && runDetailCoversRevision(cached,expectedRevision)) {
      return cached;
    }
    for (let attempt=0;attempt<2;attempt+=1) {
      let active=inFlightRef.current.get(runId);
      if (active?.scope!==requestScope) {
        const promise=requestRunDetail(runId);
        active={ scope:requestScope,promise };
        inFlightRef.current.set(runId,active);
        void promise.then(() => {
          if (inFlightRef.current.get(runId)===active) inFlightRef.current.delete(runId);
        },() => {
          if (inFlightRef.current.get(runId)===active) inFlightRef.current.delete(runId);
        });
      }
      const detail=await active.promise;
      if (inFlightRef.current.get(runId)===active) inFlightRef.current.delete(runId);
      if (expectedRevision===undefined || runDetailCoversRevision(detail,expectedRevision)
        || detail.error) return detail;
      // A newer revision arrived while the shared request was in flight. Its
      // callers join one bounded follow-up instead of issuing parallel bundles.
    }
    return runDetailsByIdRef.current[runId] ?? emptyRunDetail();
  },[requestRunDetail,targetScope,targetScopeRef]);

  const refreshRun = useCallback((runId: string) => loadRunDetail(runId), [loadRunDetail]);

  const loadRun = useCallback(async (runId: string) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const run = await getAutomationRun(requestScope.targetId, runId);
    cacheExactRun(run);
    return run;
  }, [cacheExactRun,targetScope,targetScopeRef]);

  const active = snapshot.scope === targetScope ? snapshot : emptyRunDetails(targetScope);
  return {
    runDetailsById: active.details,
    runDetailsByIdRef,
    cacheExactRun,
    applyRunLifecycleEvent,
    loadRunDetail,
    retainRunDetail,
    refreshRun,
    loadRun,
    resetRunDetails,
  };
}

export function runDetailCoversRevision(
  detail:AutomationRunDetail|undefined,
  expectedRevision:number,
) {
  return Boolean(detail && !detail.loading && !detail.error
    && detail.run && detail.run.revision>=expectedRevision
    && detail.relations && detail.snapshot);
}

function emptyRunDetails(scope: AutomationTargetScope): RunDetailsSnapshot {
  return { scope,details: {} };
}

function assertCurrentTargetScope(
  reference: { current: AutomationTargetScope },
  scope: AutomationTargetScope,
) {
  if (reference.current !== scope) throw new Error('Automation execution target changed.');
}
