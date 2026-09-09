import type { ExperimentSessionView } from './experimentWorkflowModel';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import { createEventCoalescer,type EventCoalescer } from '../../shared/eventCoalescer';
import {
  useExecutionEventChannel,
  type ExecutionEvent,
} from '../execution/executionPublic';
import {
  isWorkflowRuntimeRunEvent,
  WORKFLOW_RUNTIME_ENTITY_TYPE,
} from '../../shared/workflowRuntimeProtocol';
import {
  listActiveExperimentSessions,
  runningExperimentIdsFromSessions,
} from './experimentWorkflowService';
import { convergeStoppedExperimentSession } from './experimentSessionConvergenceService';

const EMPTY_RUNNING_IDS:ReadonlySet<string> = new Set();
const EMPTY_SESSIONS:readonly ExperimentSessionView[] = [];

export type StationExperimentOccupancy = {
  runningExperimentIds:ReadonlySet<string>;
  sessions:readonly ExperimentSessionView[];
  resolved:boolean;
  error:string;
  refresh:() => Promise<void>;
  convergeStoppedExperiment:(experimentResourceId:string) => Promise<void>;
};

export type ExperimentSessionSnapshot = (
  targetId:string,
  experimentResourceId?:string,
  signal?:AbortSignal,
) => Promise<ExperimentSessionView[]>;

/**
 * Loads one bounded authoritative live-Session snapshot. The shared execution
 * SSE invalidates that snapshot for every workflow transition, including roots
 * started by another browser, an Agent, or the public API. This hook never
 * probes Experiments one-by-one and never refreshes on a timer or visibility
 * change.
 */
export function useStationExperimentOccupancy(
  targetId:string,
  loadSessions:ExperimentSessionSnapshot = listActiveExperimentSessions,
):StationExperimentOccupancy {
  const scopeKey = targetId;
  const beginLoad = useLatestAsyncRequest(`station-experiment-occupancy:${scopeKey}`);
  const convergenceRef=useRef<{
    scopeKey:string;
    controller:AbortController;
  }|undefined>(undefined);
  const eventRefreshRef=useRef<EventCoalescer|undefined>(undefined);
  const [snapshot,setSnapshot] = useState<{
    scopeKey:string;
    sessions:readonly ExperimentSessionView[];
    resolved:boolean;
    error:string;
  }>(() => ({ scopeKey,sessions:EMPTY_SESSIONS,resolved:false,error:'' }));

  const load = useCallback(async (signal?:AbortSignal) => {
    const isCurrent = beginLoad();
    try {
      let sessions:ExperimentSessionView[];
      try {
        sessions = await loadSessions(targetId,'',signal);
      } catch (cause) {
        // This snapshot is a read. Retry a dropped transport once, never an
        // HTTP/validation failure or an Experiment operation with side effects.
        if (!isNetworkFailure(cause) || signal?.aborted || !isCurrent()) throw cause;
        sessions = await loadSessions(targetId,'',signal);
      }
      if (signal?.aborted || !isCurrent()) return;
      setSnapshot({ scopeKey,sessions,resolved:true,error:'' });
      return sessions;
    } catch (cause) {
      if (signal?.aborted || isAbortError(cause) || !isCurrent()) return;
      setSnapshot({ scopeKey,sessions:EMPTY_SESSIONS,resolved:false,error:messageOf(cause) });
      throw cause;
    }
  },[beginLoad,loadSessions,scopeKey,targetId]);
  const genericLoad=useCallback(async (signal?:AbortSignal) => {
    // An accepted Stop owns Session reconciliation until its selected
    // Experiment disappears. Root-revision effects must not repeatedly take
    // the shared latest-request ticket away from that bounded convergence.
    if (convergenceRef.current?.scopeKey===scopeKey) return;
    await load(signal);
  },[load,scopeKey]);

  useEffect(() => {
    const refresher=createEventCoalescer(40,() => {
      void genericLoad().catch(() => undefined);
    });
    eventRefreshRef.current=refresher;
    return () => {
      refresher.cancel();
      if (eventRefreshRef.current===refresher) eventRefreshRef.current=undefined;
    };
  },[genericLoad]);
  const channel = useExecutionEventChannel(targetId,(event:ExecutionEvent) => {
    if (event.entityType!==WORKFLOW_RUNTIME_ENTITY_TYPE
      || !isWorkflowRuntimeRunEvent(event.type)) return;
    eventRefreshRef.current?.schedule();
  });

  const previousChannel = useRef({ scopeKey,state:channel.streamState });
  useEffect(() => {
    const previous=previousChannel.current;
    previousChannel.current={ scopeKey,state:channel.streamState };
    if (previous.scopeKey===scopeKey && previous.state!=='connected'
      && channel.streamState==='connected' && snapshot.scopeKey===scopeKey && snapshot.error) {
      eventRefreshRef.current?.schedule();
    }
  },[channel.streamState,scopeKey,snapshot.scopeKey,snapshot.error]);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot((current) => current.scopeKey === scopeKey
      ? { ...current,error:'' }
      : { scopeKey,sessions:EMPTY_SESSIONS,resolved:false,error:'' });
    void genericLoad(controller.signal).catch(() => undefined);
    return () => controller.abort();
  },[genericLoad,scopeKey]);
  useEffect(() => () => {
    const convergence=convergenceRef.current;
    if (convergence?.scopeKey !== scopeKey) return;
    convergence.controller.abort();
    if (convergenceRef.current===convergence) convergenceRef.current=undefined;
  },[scopeKey]);

  const current = snapshot.scopeKey === scopeKey
    ? snapshot
    : { scopeKey,sessions:EMPTY_SESSIONS,resolved:false,error:'' };
  const ids = useMemo(() => {
    const projected = runningExperimentIdsFromSessions(current.sessions);
    return projected.size === 0 ? EMPTY_RUNNING_IDS : projected;
  },[current.sessions]);
  const refresh = useCallback(async () => { await genericLoad(); },[genericLoad]);
  // Stop owns this bounded reconciliation loop. Generic refreshes remain one
  // shot and event-driven; only an accepted Stop waits for its selected
  // Experiment to disappear from the authoritative station-wide live set.
  const convergeStoppedExperiment=useCallback(async (experimentResourceId:string) => {
    const exactExperimentResourceId=experimentResourceId.trim();
    if (!exactExperimentResourceId) throw new Error('Stop Session convergence requires an Experiment resource ID.');
    convergenceRef.current?.controller.abort();
    const controller=new AbortController();
    const convergence={ scopeKey,controller };
    convergenceRef.current=convergence;
    try {
      await convergeStoppedExperimentSession({
        experimentResourceId:exactExperimentResourceId,
        signal:controller.signal,
        readSessions:() => load(controller.signal),
      });
    } finally {
      if (convergenceRef.current===convergence) convergenceRef.current=undefined;
    }
  },[load,scopeKey]);
  return {
    runningExperimentIds:ids,
    sessions:current.sessions,
    resolved:current.resolved,
    error:current.error,
    refresh,
    convergeStoppedExperiment,
  };
}

export function useExperimentListRunningIds(
  targetId:string,
  loadSessions:ExperimentSessionSnapshot = listActiveExperimentSessions,
):ReadonlySet<string> {
  return useStationExperimentOccupancy(targetId,loadSessions).runningExperimentIds;
}

function isAbortError(cause:unknown) {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

function messageOf(cause:unknown) {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : 'Could not load Experiment runtime truth.';
}

function isNetworkFailure(cause:unknown) {
  return cause instanceof TypeError && [
    'Failed to fetch','NetworkError when attempting to fetch resource.','Load failed',
  ].includes(cause.message);
}
