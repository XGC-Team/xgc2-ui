import { useCallback,useEffect,useRef,type Dispatch,type SetStateAction } from 'react';
import { createEventCoalescer,type EventCoalescer } from '../../shared/eventCoalescer';
import {
  isWorkflowRuntimeDefinitionEvent,
  isWorkflowRuntimeRunEvent,
  isWorkflowRuntimeRunLifecycleEvent,
  WORKFLOW_RUNTIME_ENTITY_TYPE,
} from '../../shared/workflowRuntimeProtocol';
import {
  useExecutionEventChannel,
  type ExecutionEvent,
  type ExecutionStreamState,
} from '../execution/executionPublic';
import type { AutomationExecutionHistoryEntry } from './automationHistoryTypes';
import type { AutomationRunDetail } from './automationExecutionContracts';
import type { AutomationRunLifecycleEventApplication } from './automationRunEventProjection';
import { messageOf } from './automationErrorModel';

const UNKNOWN_RUN_DISCOVERY_DELAY_MS = 100;
const KNOWN_RUN_REFRESH_DELAY_MS = 40;
const DEFINITION_REFRESH_DELAY_MS = 40;

type CurrentRef<T> = { current: T };

type AutomationExecutionEventReconciliationOptions = {
  targetId: string;
  historyEntriesRef: CurrentRef<AutomationExecutionHistoryEntry[]>;
  runDetailsByIdRef: CurrentRef<Record<string,AutomationRunDetail>>;
  hasExecutionHistoryRefresh: (resourceId?: string) => boolean;
  isExecutionHistoryObserved: (resourceId: string) => boolean;
  applyRunLifecycleEvent: (event:ExecutionEvent) => AutomationRunLifecycleEventApplication;
  refreshExecutionHistory: (resourceId: string) => Promise<AutomationExecutionHistoryEntry[]>;
  refreshObservedExecutionHistories: () => Promise<AutomationExecutionHistoryEntry[]>;
  refreshDefinitions: () => Promise<unknown>;
  refreshActivations: () => Promise<unknown>;
  loadRunDetail: (runId: string) => Promise<unknown>;
  resetExecutionHistoryForStream: () => void;
  resetRunDetails: () => void;
  setError: Dispatch<SetStateAction<string>>;
};

export function useAutomationExecutionEventReconciliation({
  targetId,
  historyEntriesRef,
  runDetailsByIdRef,
  hasExecutionHistoryRefresh,
  isExecutionHistoryObserved,
  applyRunLifecycleEvent,
  refreshExecutionHistory,
  refreshObservedExecutionHistories,
  refreshDefinitions,
  refreshActivations,
  loadRunDetail,
  resetExecutionHistoryForStream,
  resetRunDetails,
  setError,
}: AutomationExecutionEventReconciliationOptions): ExecutionStreamState {
  const runRefreshersRef = useRef(new Map<string,EventCoalescer>());
  const pendingUnknownRunIdsRef = useRef(new Set<string>());
  const pendingUnknownRunResourceIdsRef = useRef(new Map<string,string>());
  const ignoredUnknownRunIdsRef = useRef(new Set<string>());
  const unknownRunsInFlightRef = useRef(new Set<string>());
  const unknownRunRefresherRef = useRef<EventCoalescer | null>(null);
  const unknownRunDiscoveryActiveRef = useRef(false);
  const unknownRunDiscoveryGenerationRef = useRef(0);
  const eventSequencesRef = useRef(new Map<string,number>());
  const streamStateRef = useRef<ExecutionStreamState>('connecting');
  const replayInvalidatedRef = useRef(false);
  const replayDefinitionsInvalidatedRef = useRef(false);
  const replayActivationInvalidatedRef = useRef(false);
  const definitionRefresherRef = useRef<EventCoalescer | null>(null);
  const activationRefresherRef = useRef<EventCoalescer | null>(null);

  const clearEventTracking = useCallback(() => {
    runRefreshersRef.current.forEach((refresher) => refresher.cancel());
    runRefreshersRef.current.clear();
    unknownRunRefresherRef.current?.cancel();
    unknownRunRefresherRef.current = null;
    pendingUnknownRunIdsRef.current.clear();
    pendingUnknownRunResourceIdsRef.current.clear();
    ignoredUnknownRunIdsRef.current.clear();
    unknownRunsInFlightRef.current.clear();
    unknownRunDiscoveryActiveRef.current = false;
    unknownRunDiscoveryGenerationRef.current += 1;
    eventSequencesRef.current.clear();
    replayInvalidatedRef.current = false;
    replayDefinitionsInvalidatedRef.current = false;
    replayActivationInvalidatedRef.current = false;
    definitionRefresherRef.current?.cancel();
    definitionRefresherRef.current = null;
    activationRefresherRef.current?.cancel();
    activationRefresherRef.current = null;
  }, []);

  const refreshKnownRun = useCallback(async (runId: string,isCurrent:() => boolean,beforeRead:() => void) => {
    const detail=runDetailsByIdRef.current[runId];
    if (!detail) return;
    // A bundle already in flight predates this invalidation. Join it before
    // issuing the event's read, rather than treating its old relations as fresh.
    if (detail.loading) await loadRunDetail(runId);
    if (isCurrent() && runDetailsByIdRef.current[runId]) {
      beforeRead();
      await loadRunDetail(runId);
    }
  },[loadRunDetail,runDetailsByIdRef]);

  const discoverUnknownRuns = useCallback(async () => {
    if (unknownRunDiscoveryActiveRef.current) return;
    const runIds = [...pendingUnknownRunIdsRef.current];
    if (runIds.length === 0) return;
    const discoveryGeneration = unknownRunDiscoveryGenerationRef.current;
    unknownRunDiscoveryActiveRef.current = true;
    pendingUnknownRunIdsRef.current.clear();
    const resourceIds=new Set<string>();
    let needsObservedFallback=false;
    runIds.forEach((runId) => {
      const resourceId=pendingUnknownRunResourceIdsRef.current.get(runId);
      pendingUnknownRunResourceIdsRef.current.delete(runId);
      if (resourceId) resourceIds.add(resourceId);
      else needsObservedFallback=true;
    });
    runIds.forEach((runId) => unknownRunsInFlightRef.current.add(runId));
    try {
      const refreshed=needsObservedFallback
        ? await refreshUnknownRunsAcrossObservedHistories(
          hasExecutionHistoryRefresh,refreshObservedExecutionHistories,
        )
        : (await Promise.all([...resourceIds].map((resourceId) => (
          refreshUnknownRunsForResource(
            resourceId,hasExecutionHistoryRefresh,refreshExecutionHistory,
          )
        )))).flat();
      if (unknownRunDiscoveryGenerationRef.current !== discoveryGeneration) return;
      const discoveredRunIds = new Set([
        ...refreshed.map((entry) => entry.id),
        ...historyEntriesRef.current.map((entry) => entry.id),
      ]);
      runIds.forEach((runId) => {
        if (!discoveredRunIds.has(runId)) ignoredUnknownRunIdsRef.current.add(runId);
      });
    } catch (cause) {
      if (unknownRunDiscoveryGenerationRef.current === discoveryGeneration) throw cause;
    } finally {
      if (unknownRunDiscoveryGenerationRef.current === discoveryGeneration) {
        runIds.forEach((runId) => unknownRunsInFlightRef.current.delete(runId));
        unknownRunDiscoveryActiveRef.current = false;
        if (pendingUnknownRunIdsRef.current.size > 0) unknownRunRefresherRef.current?.schedule();
      }
    }
  }, [
    hasExecutionHistoryRefresh,historyEntriesRef,refreshExecutionHistory,
    refreshObservedExecutionHistories,
  ]);

  const handleExecutionEvent = useCallback((event: ExecutionEvent) => {
    if (event.entityType === 'schedule') {
      if (streamStateRef.current === 'replaying') {
        replayActivationInvalidatedRef.current = true;
        return;
      }
      if (!activationRefresherRef.current) {
        activationRefresherRef.current = createEventCoalescer(
          KNOWN_RUN_REFRESH_DELAY_MS,
          () => void refreshActivations().catch((cause) => setError(messageOf(cause))),
        );
      }
      activationRefresherRef.current.schedule();
      return;
    }
    if (event.entityType === WORKFLOW_RUNTIME_ENTITY_TYPE
      && isWorkflowRuntimeDefinitionEvent(event.type)) {
      if (streamStateRef.current === 'replaying') {
        replayDefinitionsInvalidatedRef.current = true;
        return;
      }
      if (!definitionRefresherRef.current) {
        definitionRefresherRef.current = createEventCoalescer(
          DEFINITION_REFRESH_DELAY_MS,
          () => void refreshDefinitions().catch((cause) => setError(messageOf(cause))),
        );
      }
      definitionRefresherRef.current.schedule();
      return;
    }
    if (event.entityType !== WORKFLOW_RUNTIME_ENTITY_TYPE || !isWorkflowRuntimeRunEvent(event.type)) return;
    const runId = event.entityId.trim();
    if (!runId) return;
    const sequenceKey = `${event.entityType}:${runId}`;
    const previousSequence = eventSequencesRef.current.get(sequenceKey) ?? 0;
    if (!Number.isSafeInteger(event.seq) || event.seq <= previousSequence) return;
    eventSequencesRef.current.set(sequenceKey, event.seq);
    if (streamStateRef.current === 'replaying') {
      replayInvalidatedRef.current = true;
      return;
    }

    const knownDetailRun=Boolean(runDetailsByIdRef.current[runId]);
    const lifecycleEvent=isWorkflowRuntimeRunLifecycleEvent(event.type);
    const lifecycleApplication=lifecycleEvent ? applyRunLifecycleEvent(event) : 'unresolved';
    if (lifecycleApplication==='applied' && !knownDetailRun) return;
    if (lifecycleApplication==='unobserved' && !knownDetailRun) {
      ignoredUnknownRunIdsRef.current.add(runId);
      return;
    }

    const knownHistoryRun=historyEntriesRef.current.some((candidate) => candidate.id===runId && candidate.run);
    const knownRun=knownHistoryRun || knownDetailRun;
    if (!knownRun) {
      if (!lifecycleEvent) return;
      const automationResourceId=runAutomationResourceId(event);
      if (automationResourceId && !isExecutionHistoryObserved(automationResourceId)) {
        ignoredUnknownRunIdsRef.current.add(runId);
        return;
      }
      if (ignoredUnknownRunIdsRef.current.has(runId) || unknownRunsInFlightRef.current.has(runId)) return;
      pendingUnknownRunIdsRef.current.add(runId);
      if (automationResourceId) pendingUnknownRunResourceIdsRef.current.set(runId,automationResourceId);
      if (!unknownRunRefresherRef.current) {
        unknownRunRefresherRef.current = createEventCoalescer(
          UNKNOWN_RUN_DISCOVERY_DELAY_MS,
          () => void discoverUnknownRuns().catch((cause) => setError(messageOf(cause))),
        );
      }
      unknownRunRefresherRef.current.schedule();
      return;
    }

    // Lifecycle facts merge directly above, but they do not carry relations
    // or occurrences. Only an observed exact detail needs those refreshed.
    if (!knownDetailRun) return;

    let refresher = runRefreshersRef.current.get(runId);
    if (!refresher) {
      let pending=false;
      let refreshing=false;
      const isCurrent=() => runRefreshersRef.current.get(runId)===scheduledRefresher;
      const coalescer = createEventCoalescer(KNOWN_RUN_REFRESH_DELAY_MS, () => {
        if (!isCurrent() || refreshing) return;
        pending=false;
        refreshing=true;
        void refreshKnownRun(runId,isCurrent,() => { pending=false; }).catch((cause) => {
          if (isCurrent()) setError(messageOf(cause));
        }).finally(() => {
          refreshing=false;
          if (!isCurrent()) return;
          // Events received during a read require one serial trailing read.
          if (pending) coalescer.schedule();
          else runRefreshersRef.current.delete(runId);
        });
      });
      const scheduledRefresher:EventCoalescer={
        schedule() {
          pending=true;
          if (!refreshing) coalescer.schedule();
        },
        cancel() { pending=false;coalescer.cancel(); },
      };
      refresher = scheduledRefresher;
      runRefreshersRef.current.set(runId, refresher);
    }
    refresher.schedule();
  }, [
    applyRunLifecycleEvent,discoverUnknownRuns,historyEntriesRef,isExecutionHistoryObserved,
    refreshActivations,refreshDefinitions,refreshKnownRun,runDetailsByIdRef,setError,
  ]);

  const eventChannel = useExecutionEventChannel(targetId, handleExecutionEvent);
  streamStateRef.current = eventChannel.streamState;
  const previousStreamStateRef = useRef(eventChannel.streamState);

  useEffect(() => {
    const previous = previousStreamStateRef.current;
    previousStreamStateRef.current = eventChannel.streamState;
    if (previous !== 'replaying' || eventChannel.streamState !== 'connected') return;
    const refreshRuns = replayInvalidatedRef.current;
    const refreshDefinitionCatalog = replayDefinitionsInvalidatedRef.current;
    const refreshActivationState = replayActivationInvalidatedRef.current;
    replayInvalidatedRef.current = false;
    replayDefinitionsInvalidatedRef.current = false;
    replayActivationInvalidatedRef.current = false;
    if (!refreshRuns && !refreshDefinitionCatalog && !refreshActivationState) return;
    const reconcileReplayBoundary = async () => {
      if (refreshRuns) await refreshObservedExecutionHistories();
      if (refreshDefinitionCatalog) await refreshDefinitions();
      if (refreshActivationState) await refreshActivations();
    };
    void reconcileReplayBoundary().catch((cause) => setError(messageOf(cause)));
  }, [
    eventChannel.streamState,
    refreshObservedExecutionHistories,
    refreshDefinitions,
    refreshActivations,
    setError,
  ]);

  const streamId = eventChannel.streamId;
  const previousStreamIdRef = useRef(streamId);
  useEffect(() => {
    if (previousStreamIdRef.current === streamId) return;
    previousStreamIdRef.current = streamId;
    clearEventTracking();
    resetExecutionHistoryForStream();
    resetRunDetails();
    void refreshDefinitions().catch((cause) => setError(messageOf(cause)));
    void refreshObservedExecutionHistories().catch((cause) => setError(messageOf(cause)));
    void refreshActivations().catch((cause) => setError(messageOf(cause)));
  }, [
    clearEventTracking,
    refreshDefinitions,
    refreshObservedExecutionHistories,
    refreshActivations,
    resetExecutionHistoryForStream,
    resetRunDetails,
    setError,
    streamId,
  ]);

  useEffect(() => clearEventTracking, [clearEventTracking,targetId]);

  return eventChannel.streamState;
}

function runAutomationResourceId(event:ExecutionEvent) {
  const run=event.payload.run;
  if (!run || typeof run!=='object' || Array.isArray(run)) return '';
  const resourceId=(run as Record<string,unknown>).automationResourceId;
  return typeof resourceId==='string' ? resourceId.trim() : '';
}

async function refreshUnknownRunsForResource(
  resourceId:string,
  hasRefresh:(resourceId?:string) => boolean,
  refresh:(resourceId:string) => Promise<AutomationExecutionHistoryEntry[]>,
) {
  const joinedInFlightRefresh=hasRefresh(resourceId);
  let entries=await refresh(resourceId);
  if (joinedInFlightRefresh) entries=await refresh(resourceId);
  return entries;
}

async function refreshUnknownRunsAcrossObservedHistories(
  hasRefresh:(resourceId?:string) => boolean,
  refresh:() => Promise<AutomationExecutionHistoryEntry[]>,
) {
  const joinedInFlightRefresh=hasRefresh();
  let entries=await refresh();
  if (joinedInFlightRefresh) entries=await refresh();
  return entries;
}
