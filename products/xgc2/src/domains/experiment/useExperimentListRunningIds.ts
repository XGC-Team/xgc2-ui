import type { ExperimentSessionView } from './experimentWorkflowModel';
import { createContext,useContext,useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import { createEventCoalescer,type EventCoalescer } from '../../shared/eventCoalescer';
import {
  useExecutionEventChannel,
  type ExecutionEvent,
} from '../execution/executionPublic';
import {
  isWorkflowRuntimeRunLifecycleEvent,
  WORKFLOW_RUNTIME_ENTITY_TYPE,
} from '../../shared/workflowRuntimeProtocol';
import {
  experimentSessionIsRunning,
  listActiveExperimentSessions,
  listLeftoverExperimentOccupancyIds,
  runningExperimentIdsFromSessions,
} from './experimentWorkflowService';
import { convergeStoppedExperimentSession } from './experimentSessionConvergenceService';
import {
  createExperimentSessionRefresh,
  retainExperimentSessionViews,
  type ExperimentSessionRefresh,
} from './experimentSessionObservation';

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

// The route owns the station snapshot and its SSE subscription. Panels consume
// that same live authority instead of opening their own refresh loops.
const StationExperimentOccupancyContext=createContext<StationExperimentOccupancy|undefined>(undefined);
export const StationExperimentOccupancyProvider=StationExperimentOccupancyContext.Provider;
export function useExperimentStationOccupancy():StationExperimentOccupancy {
  const occupancy=useContext(StationExperimentOccupancyContext);
  if (!occupancy) throw new Error('Experiment panels require the station occupancy provider.');
  return occupancy;
}

export type ExperimentSessionSnapshot = (
  targetId:string,
  experimentResourceId?:string,
  signal?:AbortSignal,
) => Promise<ExperimentSessionView[]>;

export type LeftoverOccupancySnapshot = (
  targetId:string,
  signal?:AbortSignal,
) => Promise<readonly string[]>;

type OccupancyRead = {
  sessions:ExperimentSessionView[];
  leftoverExperimentIds:ReadonlySet<string>;
};

/**
 * Loads one bounded occupancy snapshot: live Sessions plus leftover
 * Experiment-owned System Runner roots that still fence Robot bindings after
 * the Session has canceled. The shared execution SSE invalidates that
 * snapshot on workflow lifecycle changes, including roots started by another
 * browser, an Agent, or the public API. This hook never probes Experiments
 * one-by-one and never refreshes on a timer or visibility change.
 */
export function useStationExperimentOccupancy(
  targetId:string,
  loadSessions:ExperimentSessionSnapshot = listActiveExperimentSessions,
  loadLeftoverExperimentIds:LeftoverOccupancySnapshot = listLeftoverExperimentOccupancyIds,
):StationExperimentOccupancy {
  const scopeKey = targetId;
  const beginLoad = useLatestAsyncRequest(`station-experiment-occupancy:${scopeKey}`);
  const convergenceRef=useRef<{
    scopeKey:string;
    controller:AbortController;
  }|undefined>(undefined);
  const eventRefreshRef=useRef<EventCoalescer|undefined>(undefined);
  const readerRef=useRef<(ExperimentSessionRefresh & { scopeKey:string })|undefined>(undefined);
  const [snapshot,setSnapshot] = useState<{
    scopeKey:string;
    sessions:readonly ExperimentSessionView[];
    leftoverExperimentIds:ReadonlySet<string>;
    resolved:boolean;
    error:string;
  }>(() => ({
    scopeKey,sessions:EMPTY_SESSIONS,leftoverExperimentIds:EMPTY_RUNNING_IDS,resolved:false,error:'',
  }));

  const load = useCallback(async (signal:AbortSignal,isLatest:() => boolean=() => true) => {
    const isCurrent = beginLoad();
    try {
      let read:OccupancyRead;
      try {
        read = await readOccupancy(targetId,loadSessions,loadLeftoverExperimentIds,signal);
      } catch (cause) {
        // This snapshot is a read. Retry a dropped transport once, never an
        // HTTP/validation failure or an Experiment operation with side effects.
        if (!isNetworkFailure(cause) || signal.aborted || !isCurrent() || !isLatest()) throw cause;
        read = await readOccupancy(targetId,loadSessions,loadLeftoverExperimentIds,signal);
      }
      if (signal.aborted || !isCurrent()) return;
      // Reads are serialized. Publish their real intermediate progress even
      // if another read is queued; waiting for a quiet SSE stream can starve
      // startup feedback. Only canceled/superseded scopes may not publish.
      setSnapshot((current) => {
        const retained=current.scopeKey===scopeKey
          ? retainExperimentSessionViews(current.sessions,read.sessions)
          : read.sessions;
        const leftover=read.leftoverExperimentIds.size===0
          ? EMPTY_RUNNING_IDS
          : read.leftoverExperimentIds;
        if (current.scopeKey===scopeKey && current.resolved && !current.error
          && retained===current.sessions
          && sameIdSet(current.leftoverExperimentIds,leftover)) return current;
        return { scopeKey,sessions:retained,leftoverExperimentIds:leftover,resolved:true,error:'' };
      });
      return read;
    } catch (cause) {
      if (signal.aborted || isAbortError(cause) || !isCurrent() || !isLatest()) return;
      setSnapshot({
        scopeKey,sessions:EMPTY_SESSIONS,leftoverExperimentIds:EMPTY_RUNNING_IDS,resolved:false,error:messageOf(cause),
      });
      throw cause;
    }
  },[beginLoad,loadLeftoverExperimentIds,loadSessions,scopeKey,targetId]);
  const genericLoad=useCallback(async () => {
    if (convergenceRef.current?.scopeKey===scopeKey) return;
    const reader=readerRef.current;
    if (reader?.scopeKey===scopeKey) await reader.refresh();
  },[scopeKey]);

  useEffect(() => {
    const reader={ ...createExperimentSessionRefresh(load),scopeKey };
    readerRef.current=reader;
    const refresher=createEventCoalescer(40,() => { void genericLoad().catch(() => undefined); });
    eventRefreshRef.current=refresher;
    return () => {
      refresher.cancel();
      reader.cancel();
      if (readerRef.current===reader) readerRef.current=undefined;
      if (eventRefreshRef.current===refresher) eventRefreshRef.current=undefined;
    };
  },[genericLoad,load,scopeKey]);
  const channel = useExecutionEventChannel(targetId,(event:ExecutionEvent) => {
    if (event.entityType!==WORKFLOW_RUNTIME_ENTITY_TYPE
      || !isWorkflowRuntimeRunLifecycleEvent(event.type)) return;
    eventRefreshRef.current?.schedule();
  });

  const previousChannel = useRef({ scopeKey,state:channel.streamState,streamId:channel.streamId });
  useEffect(() => {
    const previous=previousChannel.current;
    previousChannel.current={ scopeKey,state:channel.streamState,streamId:channel.streamId };
    if (previous.scopeKey===scopeKey && channel.streamState==='connected'
      && (previous.state!=='connected' || previous.streamId!==channel.streamId)) {
      // A successful pre-disconnect snapshot is not proof that no events were
      // missed. Also reconcile when a replacement stream connects directly.
      eventRefreshRef.current?.schedule();
    }
  },[channel.streamState,channel.streamId,scopeKey]);

  useEffect(() => {
    setSnapshot((current) => current.scopeKey === scopeKey
      ? (current.error ? { ...current,error:'' } : current)
      : {
        scopeKey,sessions:EMPTY_SESSIONS,leftoverExperimentIds:EMPTY_RUNNING_IDS,resolved:false,error:'',
      });
    void genericLoad().catch(() => undefined);
  },[genericLoad,load,scopeKey]);
  useEffect(() => () => {
    const convergence=convergenceRef.current;
    if (convergence?.scopeKey !== scopeKey) return;
    convergence.controller.abort();
    if (convergenceRef.current===convergence) convergenceRef.current=undefined;
  },[scopeKey]);

  const current = snapshot.scopeKey === scopeKey
    ? snapshot
    : {
      scopeKey,sessions:EMPTY_SESSIONS,leftoverExperimentIds:EMPTY_RUNNING_IDS,resolved:false,error:'',
    };
  const ids = useMemo(() => {
    const projected = runningExperimentIdsFromSessions(current.sessions);
    if (current.leftoverExperimentIds.size === 0) {
      return projected.size === 0 ? EMPTY_RUNNING_IDS : projected;
    }
    const union = new Set(projected);
    current.leftoverExperimentIds.forEach((id) => union.add(id));
    return union;
  },[current.leftoverExperimentIds,current.sessions]);
  const refresh = useCallback(async () => { await genericLoad(); },[genericLoad]);
  // Stop owns this bounded reconciliation loop. Generic refreshes remain one
  // shot and event-driven; only an accepted Stop waits for its selected
  // Experiment to disappear from the authoritative station-wide live set.
  const convergeStoppedExperiment=useCallback(async (experimentResourceId:string) => {
    const exactExperimentResourceId=experimentResourceId.trim();
    if (!exactExperimentResourceId) throw new Error('Stop Session convergence requires an Experiment resource ID.');
    const reader=readerRef.current;
    if (reader?.scopeKey!==scopeKey) return;
    convergenceRef.current?.controller.abort();
    const controller=new AbortController();
    const convergence={ scopeKey,controller };
    convergenceRef.current=convergence;
    // Stop owns fresh reconciliation now. Abort ordinary reads and discard
    // their queued work instead of competing with this higher-priority path.
    eventRefreshRef.current?.cancel();
    reader.cancel();
    try {
      await convergeStoppedExperimentSession({
        experimentResourceId:exactExperimentResourceId,
        signal:controller.signal,
        readOccupancy:async () => {
          const read = await load(controller.signal);
          if (!read) return undefined;
          return {
            occupied:experimentSessionIsRunning(read.sessions,exactExperimentResourceId)
              || read.leftoverExperimentIds.has(exactExperimentResourceId),
          };
        },
      });
    } finally {
      if (convergenceRef.current===convergence) convergenceRef.current=undefined;
    }
  },[load,scopeKey]);
  return useMemo(() => ({
    runningExperimentIds:ids,
    sessions:current.sessions,
    resolved:current.resolved,
    error:current.error,
    refresh,
    convergeStoppedExperiment,
  }),[ids,current.sessions,current.resolved,current.error,refresh,convergeStoppedExperiment]);
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

async function readOccupancy(
  targetId:string,
  loadSessions:ExperimentSessionSnapshot,
  loadLeftoverExperimentIds:LeftoverOccupancySnapshot,
  signal:AbortSignal,
):Promise<OccupancyRead> {
  const [sessions,leftover]=await Promise.all([
    loadSessions(targetId,'',signal),
    loadLeftoverExperimentIds(targetId,signal),
  ]);
  return {
    sessions,
    leftoverExperimentIds:leftover.length===0 ? EMPTY_RUNNING_IDS : new Set(leftover),
  };
}

function sameIdSet(left:ReadonlySet<string>,right:ReadonlySet<string>) {
  if (left===right) return true;
  if (left.size!==right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}
