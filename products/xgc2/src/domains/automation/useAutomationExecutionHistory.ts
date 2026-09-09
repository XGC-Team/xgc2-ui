import { useCallback,useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction } from 'react';
import { mergeAutomationExecutionHistoryEntries } from './automationExecutionHistoryModel';
import { listAutomationExecutionHistory } from './automationExecutionHistoryService';
import { messageOf } from './automationErrorModel';
import type {
  AutomationExecutionHistoryEntry,
  AutomationExecutionRunSummary,
} from './automationHistoryTypes';
import {
  automationExecutionRunSummaries,
  parseAutomationExecutionEventRunSummary,
} from './automationRunSummaryModel';
import {
  projectAutomationRunLifecycleEvent,
  type AutomationRunLifecycleEventApplication,
} from './automationRunEventProjection';
import type { ExecutionEvent } from '../execution/executionPublic';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';
import { SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID } from '../../shared/workflowRuntimeProtocol';
import { useProductRouteVisible } from '../../shared/routeReady';

type CurrentRef<T> = { current: T };
type ExecutionHistoryPage = Awaited<ReturnType<typeof listAutomationExecutionHistory>>;
type AutomationRunHistoryState = {
  automationResourceId: string;
  nextCursor: string;
  complete: boolean;
  unavailableSources: 'agent'[];
};
type ExecutionHistorySnapshot = {
  scope: AutomationTargetScope;
  entries: AutomationExecutionHistoryEntry[];
  runHistory: AutomationRunHistoryState;
  runsLoadingMore: boolean;
  visibleResourceId: string;
  error: string;
};
type HistoryRefreshRequest = {
  scope: AutomationTargetScope;
  controller: AbortController;
  promise: Promise<AutomationExecutionHistoryEntry[]>;
};

const executionHistoryPageLimit = 25;

const emptyAutomationRunHistory = (): AutomationRunHistoryState => ({
  automationResourceId: '',nextCursor: '',complete: true,unavailableSources: [],
});

type UseAutomationExecutionHistoryOptions = {
  targetId: string;
  selectedResourceIdRef: CurrentRef<string>;
  setError: Dispatch<SetStateAction<string>>;
};

export function useAutomationExecutionHistory({
  targetId,
  selectedResourceIdRef,
  setError,
}: UseAutomationExecutionHistoryOptions) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const routeVisible = useProductRouteVisible();
  const routeVisibleRef = useRef(routeVisible);
  routeVisibleRef.current = routeVisible;
  const [background] = useState(createHistoryRefreshQueue);
  const [snapshot,setSnapshot] = useState<ExecutionHistorySnapshot>(() => emptyExecutionHistory(targetScope));
  const snapshotRef = useRef(snapshot);
  const historyEntriesRef = useRef<AutomationExecutionHistoryEntry[]>([]);
  const runHistoryRef = useRef<AutomationRunHistoryState>(emptyAutomationRunHistory());
  const runsLoadingMoreRef = useRef(false);
  const paginationRequestRef = useRef<object | null>(null);
  const refreshesRef = useRef(new Map<string,HistoryRefreshRequest>());
  const revalidationsRef = useRef(new Map<string,HistoryRefreshRequest & { generation:number }>());
  const observedRef = useRef<{ scope: AutomationTargetScope;resourceIds: Set<string> }>({
    scope: targetScope,resourceIds: new Set(),
  });
  const historyGenerationRef = useRef(0);
  const visibilityRefreshControllerRef = useRef<{
    scope: AutomationTargetScope;
    controller: AbortController;
  } | null>(null);

  if (snapshotRef.current.scope !== targetScope) {
    historyEntriesRef.current = [];
    runHistoryRef.current = emptyAutomationRunHistory();
    runsLoadingMoreRef.current = false;
  }
  if (observedRef.current.scope !== targetScope) {
    observedRef.current = { scope: targetScope,resourceIds: new Set() };
  }

  const replaceSnapshot = useCallback((
    requestScope: AutomationTargetScope,
    update: (current: ExecutionHistorySnapshot) => ExecutionHistorySnapshot,
  ) => {
    if (targetScopeRef.current !== requestScope) return false;
    const current = snapshotRef.current.scope === requestScope
      ? snapshotRef.current
      : emptyExecutionHistory(requestScope);
    const next = update(current);
    snapshotRef.current = next;
    historyEntriesRef.current = next.entries;
    runHistoryRef.current = next.runHistory;
    runsLoadingMoreRef.current = next.runsLoadingMore;
    setSnapshot(next);
    return true;
  }, [targetScopeRef]);

  const updateHistoryEntries = useCallback((
    update: (current: AutomationExecutionHistoryEntry[]) => AutomationExecutionHistoryEntry[],
  ) => {
    replaceSnapshot(targetScope, (current) => ({ ...current,entries: update(current.entries) }));
  }, [replaceSnapshot,targetScope]);

  const resetExecutionHistory = useCallback(() => {
    if (targetScopeRef.current !== targetScope) return;
    historyGenerationRef.current += 1;
    refreshesRef.current.clear();
    observedRef.current = { scope: targetScope,resourceIds: new Set() };
    const visibilityRefresh = visibilityRefreshControllerRef.current;
    if (visibilityRefresh?.scope === targetScope) visibilityRefresh.controller.abort();
    if (visibilityRefreshControllerRef.current === visibilityRefresh) {
      visibilityRefreshControllerRef.current = null;
    }
    replaceSnapshot(targetScope, () => emptyExecutionHistory(targetScope));
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  useEffect(() => {
    resetExecutionHistory();
  }, [resetExecutionHistory]);

  useEffect(() => {
    if (!routeVisible) background.cancel();
    return () => background.cancel();
  }, [background,routeVisible,targetScope]);

  const markExecutionHistoryObserved = useCallback((resourceId: string) => {
    if (targetScopeRef.current !== targetScope) return;
    const automationResourceId = resourceId.trim();
    if (!automationResourceId) return;
    if (observedRef.current.scope !== targetScope) {
      observedRef.current = { scope: targetScope,resourceIds: new Set() };
    }
    observedRef.current.resourceIds.add(automationResourceId);
  }, [targetScope,targetScopeRef]);

  const isExecutionHistoryObserved = useCallback((resourceId: string) => (
    targetScopeRef.current===targetScope
      && observedRef.current.scope===targetScope
      && observedRef.current.resourceIds.has(resourceId.trim())
  ),[targetScope,targetScopeRef]);

  const applyRunLifecycleEvent = useCallback((event:ExecutionEvent):AutomationRunLifecycleEventApplication => {
    const existing=historyEntriesRef.current.find((entry) => entry.id===event.entityId && entry.run);
    const summary=runSummaryFromExecutionEvent(event,targetScope.targetId);
    if (summary) {
      if (!existing && systemExperimentRunnerSummaryNeedsHistoryEnrichment(summary)) return 'unresolved';
      const incoming:AutomationExecutionHistoryEntry={
        id:summary.id,runId:summary.id,targetId:summary.targetId,
        automationResourceId:summary.automationResourceId,acceptedAt:summary.acceptedAt,
        phase:'run',run:summary,
      };
      if (!existing && !isExecutionHistoryObserved(summary.automationResourceId)) return 'unobserved';
      updateHistoryEntries((entries) => mergeAutomationExecutionHistoryEntries(entries,[incoming]));
      return 'applied';
    }
    if (!existing?.run) return 'unresolved';
    const projected=projectAutomationRunLifecycleEvent(existing.run,event);
    if (!projected) return 'unresolved';
    if (projected!==existing.run) {
      updateHistoryEntries((entries) => entries.map((entry) => (
        entry.id===event.entityId && entry.run ? { ...entry,run:projected } : entry
      )));
    }
    return 'applied';
  },[isExecutionHistoryObserved,targetScope,updateHistoryEntries]);

  const fetchExecutionHistoryPage = useCallback((resourceId: string, signal?: AbortSignal) => (
    listAutomationExecutionHistory(targetScope.targetId, {
      automationResourceId: resourceId,limit: executionHistoryPageLimit,signal,
    })
  ), [targetScope]);

  const replaceOpenedExecutionHistory = useCallback((resourceId: string, page: ExecutionHistoryPage) => {
    replaceSnapshot(targetScope, (current) => ({
      ...current,
      // A keyset page is not a deletion ledger. Keep already-observed runs and
      // let revision-aware merging retain SSE facts newer than this snapshot.
      entries: mergeAutomationExecutionHistoryEntries(current.entries,page.entries),
      runHistory: {
        automationResourceId: resourceId,
        nextCursor: page.nextCursor ?? '',
        complete: page.complete,
        unavailableSources: page.unavailableSources ?? [],
      },
    }));
  }, [replaceSnapshot,targetScope]);

  const openExecutionHistory = useCallback(async (resourceId: string, signal?: AbortSignal) => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) return [];
    const requestGeneration = historyGenerationRef.current;
    markExecutionHistoryObserved(resourceId);
    replaceSnapshot(requestScope, (current) => ({ ...current,error: '' }));
    try {
      const page = await fetchExecutionHistoryPage(resourceId, signal);
      if (signal?.aborted
        || targetScopeRef.current !== requestScope
        || historyGenerationRef.current !== requestGeneration
        || selectedResourceIdRef.current !== resourceId) return [];
      replaceOpenedExecutionHistory(resourceId, page);
      return page.entries;
    } catch (cause) {
      if (!signal?.aborted
        && targetScopeRef.current === requestScope
        && historyGenerationRef.current === requestGeneration
        && selectedResourceIdRef.current === resourceId) {
        replaceSnapshot(requestScope, (current) => ({ ...current,error: messageOf(cause) }));
      }
      throw cause;
    }
  }, [fetchExecutionHistoryPage,markExecutionHistoryObserved,replaceOpenedExecutionHistory,replaceSnapshot,selectedResourceIdRef,targetScope,targetScopeRef]);

  const refreshExecutionHistory = useCallback((
    resourceId = selectedResourceIdRef.current,
    signal?: AbortSignal,
  ) => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope || !routeVisibleRef.current || signal?.aborted) return Promise.resolve([]);
    const automationResourceId = resourceId.trim();
    if (!automationResourceId) return Promise.resolve([]);
    markExecutionHistoryObserved(automationResourceId);
    const active = refreshesRef.current.get(automationResourceId);
    if (active?.scope === requestScope && !active.controller.signal.aborted) return active.promise;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort',abort,{ once:true });
    const requestGeneration = historyGenerationRef.current;
    const promise = background.enqueue(() => fetchExecutionHistoryPage(automationResourceId, controller.signal),controller)
      .then((page) => {
        if (!page || controller.signal.aborted
          || targetScopeRef.current !== requestScope
          || historyGenerationRef.current !== requestGeneration) return [];
        replaceSnapshot(requestScope, (current) => ({
          ...current,
          entries: mergeAutomationExecutionHistoryEntries(current.entries, page.entries),
          runHistory: selectedResourceIdRef.current === automationResourceId
            ? {
              automationResourceId,
              nextCursor: current.runHistory.automationResourceId === automationResourceId
                && current.runHistory.nextCursor
                ? current.runHistory.nextCursor
                : page.nextCursor ?? '',
              complete: page.complete,
              unavailableSources: page.unavailableSources ?? [],
            }
            : current.runHistory,
        }));
        return page.entries;
      })
      .finally(() => {
        signal?.removeEventListener('abort',abort);
        const activeRequest = refreshesRef.current.get(automationResourceId);
        if (activeRequest?.scope === requestScope && activeRequest.promise === promise) {
          refreshesRef.current.delete(automationResourceId);
        }
      });
    refreshesRef.current.set(automationResourceId, { scope: requestScope,controller,promise });
    return promise;
  }, [background,fetchExecutionHistoryPage,markExecutionHistoryObserved,replaceSnapshot,selectedResourceIdRef,targetScope,targetScopeRef]);

  const refreshObservedExecutionHistories = useCallback(async () => {
    if (targetScopeRef.current !== targetScope || observedRef.current.scope !== targetScope) return [];
    const generation = historyGenerationRef.current;
    const pages = await Promise.all([...observedRef.current.resourceIds].map((resourceId) => {
      const activeRequest = refreshesRef.current.get(resourceId);
      const pending = revalidationsRef.current.get(resourceId);
      if (pending?.scope === targetScope && pending.generation === generation
        && !pending.controller.signal.aborted
        && (!activeRequest || activeRequest.controller === pending.controller)) return pending.promise;
      if (activeRequest?.scope !== targetScope || activeRequest.controller.signal.aborted) {
        return refreshExecutionHistory(resourceId);
      }
      // The invalidation is newer than this request's snapshot. Share one
      // trailing read across callers waiting for the same older request. Once
      // that trailing read starts, a later invalidation needs its own successor.
      const promise = activeRequest.promise.catch(() => []).then(() => {
        if (activeRequest.controller.signal.aborted || !routeVisibleRef.current
          || targetScopeRef.current !== targetScope || historyGenerationRef.current !== generation) return [];
        return refreshExecutionHistory(resourceId);
      }).finally(() => {
        if (revalidationsRef.current.get(resourceId)?.promise === promise) revalidationsRef.current.delete(resourceId);
      });
      revalidationsRef.current.set(resourceId,{ scope:targetScope,generation,controller:activeRequest.controller,promise });
      return promise;
    }));
    return pages.flat();
  }, [refreshExecutionHistory,targetScope,targetScopeRef]);

  const wasRouteVisibleRef = useRef(routeVisible);
  useEffect(() => {
    const wasVisible = wasRouteVisibleRef.current;
    wasRouteVisibleRef.current = routeVisible;
    if (routeVisible && !wasVisible) {
      void refreshObservedExecutionHistories().catch((cause) => setError(messageOf(cause)));
    }
  }, [refreshObservedExecutionHistories,routeVisible,setError]);

  const hasExecutionHistoryRefresh = useCallback((resourceId?: string) => {
    if (targetScopeRef.current !== targetScope) return false;
    if (resourceId) {
      const request = refreshesRef.current.get(resourceId);
      return request?.scope === targetScope && !request.controller.signal.aborted;
    }
    if (observedRef.current.scope !== targetScope) return false;
    return [...observedRef.current.resourceIds]
      .some((observedResourceId) => {
        const request = refreshesRef.current.get(observedResourceId);
        return request?.scope === targetScope && !request.controller.signal.aborted;
      });
  }, [targetScope,targetScopeRef]);

  const loadMoreRuns = useCallback(async () => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) return [];
    const history = runHistoryRef.current;
    if (!history.automationResourceId || !history.nextCursor || runsLoadingMoreRef.current) return [];
    const generation = historyGenerationRef.current;
    const paginationRequest = {};
    paginationRequestRef.current = paginationRequest;
    replaceSnapshot(requestScope, (current) => ({ ...current,runsLoadingMore: true }));
    try {
      const page = await listAutomationExecutionHistory(requestScope.targetId, {
        automationResourceId: history.automationResourceId,
        cursor: history.nextCursor,
        limit: executionHistoryPageLimit,
      });
      if (targetScopeRef.current !== requestScope
        || historyGenerationRef.current !== generation
        || paginationRequestRef.current !== paginationRequest
        || selectedResourceIdRef.current !== history.automationResourceId
        || runHistoryRef.current.automationResourceId !== history.automationResourceId
        || runHistoryRef.current.nextCursor !== history.nextCursor) return [];
      replaceSnapshot(requestScope, (current) => ({
        ...current,
        entries: mergeAutomationExecutionHistoryEntries(current.entries, page.entries),
        runHistory: {
          automationResourceId: history.automationResourceId,
          nextCursor: page.nextCursor ?? '',
          complete: page.complete,
          unavailableSources: page.unavailableSources ?? [],
        },
      }));
      return page.entries;
    } finally {
      if (historyGenerationRef.current === generation && paginationRequestRef.current === paginationRequest) {
        paginationRequestRef.current = null;
        replaceSnapshot(requestScope, (current) => ({ ...current,runsLoadingMore: false }));
      }
    }
  }, [replaceSnapshot,selectedResourceIdRef,targetScope,targetScopeRef]);

  const setExecutionHistoryVisible = useCallback((resourceId: string, visible: boolean) => {
    replaceSnapshot(targetScope, (current) => ({
      ...current,
      visibleResourceId: visible
        ? selectedResourceIdRef.current === resourceId ? resourceId : ''
        : current.visibleResourceId === resourceId ? '' : current.visibleResourceId,
    }));
  }, [replaceSnapshot,selectedResourceIdRef,targetScope]);

  const active = snapshot.scope === targetScope ? snapshot : emptyExecutionHistory(targetScope);
  const executionHistoryVisible = Boolean(active.visibleResourceId)
    && active.visibleResourceId === selectedResourceIdRef.current;
  const refreshVisibleExecutionHistory = useCallback(async () => {
    const requestScope = targetScope;
    const visibleResourceId = snapshotRef.current.scope === requestScope
      ? snapshotRef.current.visibleResourceId
      : '';
    if (targetScopeRef.current !== requestScope
      || !visibleResourceId
      || visibleResourceId !== selectedResourceIdRef.current
      || globalThis.document?.visibilityState !== 'visible') return;
    if (visibilityRefreshControllerRef.current?.scope === requestScope) return;
    const controller = new AbortController();
    const visibilityRefresh = { scope: requestScope,controller };
    visibilityRefreshControllerRef.current = visibilityRefresh;
    try {
      await refreshExecutionHistory(visibleResourceId, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted
        && targetScopeRef.current === requestScope
        && selectedResourceIdRef.current === visibleResourceId) {
        setError(messageOf(cause));
      }
    } finally {
      if (visibilityRefreshControllerRef.current === visibilityRefresh) {
        visibilityRefreshControllerRef.current = null;
      }
    }
  }, [refreshExecutionHistory,selectedResourceIdRef,setError,targetScope,targetScopeRef]);

  useEffect(() => {
    if (!executionHistoryVisible) return;
    const onVisibilityChange = () => {
      if (globalThis.document.visibilityState === 'visible') void refreshVisibleExecutionHistory();
    };
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      globalThis.document.removeEventListener('visibilitychange', onVisibilityChange);
      const visibilityRefresh = visibilityRefreshControllerRef.current;
      if (visibilityRefresh?.scope === targetScope) visibilityRefresh.controller.abort();
      if (visibilityRefreshControllerRef.current === visibilityRefresh) {
        visibilityRefreshControllerRef.current = null;
      }
    };
  }, [executionHistoryVisible,refreshVisibleExecutionHistory,targetScope]);

  const clearSelectedExecutionHistory = useCallback(() => {
    replaceSnapshot(targetScope, (current) => ({
      ...current,
      entries: [],
      runHistory: emptyAutomationRunHistory(),
      runsLoadingMore: false,
      visibleResourceId: '',
      error: '',
    }));
  }, [replaceSnapshot,targetScope]);

  const resetExecutionHistoryForStream = useCallback(() => {
    if (targetScopeRef.current !== targetScope) return;
    historyGenerationRef.current += 1;
    background.cancel();
    refreshesRef.current.clear();
    replaceSnapshot(targetScope, (current) => ({
      ...current,entries: [],runHistory: emptyAutomationRunHistory(),runsLoadingMore: false,
    }));
  }, [background,replaceSnapshot,targetScope,targetScopeRef]);

  const runSummaries = useMemo(() => automationExecutionRunSummaries(active.entries), [active.entries]);

  return {
    historyEntries: active.entries,
    historyEntriesRef,
    historyError: active.error,
    runHistory: active.runHistory,
    runSummaries,
    runsLoadingMore: active.runsLoadingMore,
    updateHistoryEntries,
    markExecutionHistoryObserved,
    isExecutionHistoryObserved,
    applyRunLifecycleEvent,
    openExecutionHistory,
    refreshExecutionHistory,
    refreshObservedExecutionHistories,
    hasExecutionHistoryRefresh,
    loadMoreRuns,
    setExecutionHistoryVisible,
    clearSelectedExecutionHistory,
    resetExecutionHistoryForStream,
  };
}

/** Every background history caller, including replay recovery, shares this owner. */
function createHistoryRefreshQueue() {
  type Task = { start: () => void;controller: AbortController };
  const queued: Task[] = [];
  const running = new Set<Task>();
  let cancelling = false;
  const advance = () => {
    while (!cancelling && running.size < 2 && queued.length) {
      const next = queued.shift()!;
      running.add(next);
      next.start();
    }
  };
  return {
    enqueue(read: () => Promise<ExecutionHistoryPage>,controller: AbortController) {
      return new Promise<ExecutionHistoryPage | undefined>((resolve,reject) => {
        let settled = false;
        const finish = (page?: ExecutionHistoryPage,cause?: unknown) => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener('abort',abort);
          const index = queued.indexOf(task);
          if (index !== -1) queued.splice(index,1);
          running.delete(task);
          if (cause !== undefined) reject(cause);
          else resolve(page);
          advance();
        };
        const abort = () => finish();
        const task: Task = { controller,start: () => {
          if (controller.signal.aborted) { finish();return; }
          try { void read().then((page) => finish(page),(cause) => finish(undefined,cause)); }
          catch (cause) { finish(undefined,cause); }
        } };
        controller.signal.addEventListener('abort',abort,{ once:true });
        queued.push(task);
        if (controller.signal.aborted) finish();
        else advance();
      });
    },
    cancel() {
      cancelling = true;
      for (const task of [...queued,...running]) task.controller.abort();
      cancelling = false;
    },
  };
}

function emptyExecutionHistory(scope: AutomationTargetScope): ExecutionHistorySnapshot {
  return {
    scope,
    entries: [],
    runHistory: emptyAutomationRunHistory(),
    runsLoadingMore: false,
    visibleResourceId: '',
    error: '',
  };
}

function runSummaryFromExecutionEvent(event:ExecutionEvent,targetId:string) {
  const value=event.payload.run;
  if (!value || typeof value!=='object' || Array.isArray(value)) return undefined;
  try {
    return parseAutomationExecutionEventRunSummary(value,'executionEvent.payload.run',{
      runId:event.entityId,targetId,
    });
  } catch {
    return undefined;
  }
}

function systemExperimentRunnerSummaryNeedsHistoryEnrichment(
  summary:AutomationExecutionRunSummary,
) {
  return summary.automationResourceId===SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID
    && !summary.parentRunId
    && (summary.sourceKind!=='experiment' || summary.sourceRef?.domain!=='experiment'
      || !summary.experimentSelector);
}
