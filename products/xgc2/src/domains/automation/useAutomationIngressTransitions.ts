import { useCallback,useEffect,useRef,useState } from 'react';
import { recordWithoutKey } from '../../shared/recordWithoutKey';
import { mergeAutomationIngressTransitions } from './automationExecutionHistoryModel';
import { listAutomationIngressTransitions,retryAutomationExecutionIngress } from './automationExecutionHistoryService';
import { messageOf } from './automationErrorModel';
import type {
  AutomationExecutionHistoryEntry,
  AutomationIngressTransitionLedger,
} from './automationHistoryTypes';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';

type CurrentRef<T> = { current: T };
type UseAutomationIngressTransitionsOptions = {
  targetId: string;
  historyEntriesRef: CurrentRef<AutomationExecutionHistoryEntry[]>;
  selectedResourceIdRef: CurrentRef<string>;
  refreshExecutionHistory: (resourceId: string) => Promise<AutomationExecutionHistoryEntry[]>;
  updateHistoryEntries: (
    update: (current: AutomationExecutionHistoryEntry[]) => AutomationExecutionHistoryEntry[],
  ) => void;
};
type IngressTransitionsSnapshot = {
  scope: AutomationTargetScope;
  retryingEventIds: string[];
  retryErrors: Record<string,string>;
  ledgers: Record<string,AutomationIngressTransitionLedger>;
};
type IngressTransitionRequest = {
  scope: AutomationTargetScope;
  promise: Promise<AutomationIngressTransitionLedger>;
};

export function useAutomationIngressTransitions({
  targetId,
  historyEntriesRef,
  selectedResourceIdRef,
  refreshExecutionHistory,
  updateHistoryEntries,
}: UseAutomationIngressTransitionsOptions) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const [snapshot,setSnapshot] = useState<IngressTransitionsSnapshot>(() => emptyIngressTransitions(targetScope));
  const snapshotRef = useRef(snapshot);
  const requestsRef = useRef(new Map<string,IngressTransitionRequest>());

  const replaceSnapshot = useCallback((
    requestScope: AutomationTargetScope,
    update: (current: IngressTransitionsSnapshot) => IngressTransitionsSnapshot,
  ) => {
    if (targetScopeRef.current !== requestScope) return false;
    const current = snapshotRef.current.scope === requestScope
      ? snapshotRef.current
      : emptyIngressTransitions(requestScope);
    const next = update(current);
    snapshotRef.current = next;
    setSnapshot(next);
    return true;
  }, [targetScopeRef]);

  const resetIngressTransitions = useCallback(() => {
    if (targetScopeRef.current !== targetScope) return;
    requestsRef.current.clear();
    replaceSnapshot(targetScope, () => emptyIngressTransitions(targetScope));
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  useEffect(() => {
    requestsRef.current.clear();
    replaceSnapshot(targetScope, () => emptyIngressTransitions(targetScope));
  }, [replaceSnapshot,targetScope]);

  const retryExecutionIngress = useCallback(async (entryId: string) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const entry = historyEntriesRef.current.find((candidate) => candidate.id === entryId);
    const ingress = entry?.ingress;
    if (!entry || !ingress || ingress.status !== 'dead_letter'
      || entry.automationResourceId !== selectedResourceIdRef.current) {
      throw new Error('Only the selected workflow\'s current dead-letter ingress can be retried.');
    }
    replaceSnapshot(requestScope, (current) => ({
      ...current,
      retryingEventIds: current.retryingEventIds.includes(ingress.eventId)
        ? current.retryingEventIds
        : [...current.retryingEventIds,ingress.eventId],
      retryErrors: recordWithoutKey(current.retryErrors, ingress.eventId),
    }));
    try {
      const retried = await retryAutomationExecutionIngress(
        requestScope.targetId,
        ingress.eventId,
        ingress.revision,
      );
      if (retried.runId !== entry.runId) throw new Error('The retried ingress changed its preallocated Run identity.');
      if (targetScopeRef.current === requestScope) {
        updateHistoryEntries((items) => items.map((candidate) => candidate.id === entry.id
          ? { ...candidate,ingress: retried }
          : candidate));
        try {
          await refreshExecutionHistory(entry.automationResourceId);
        } catch {
          // The exact retry response remains authoritative until polling reconnects.
        }
      }
      return retried;
    } catch (cause) {
      replaceSnapshot(requestScope, (current) => ({
        ...current,retryErrors: { ...current.retryErrors,[ingress.eventId]: messageOf(cause) },
      }));
      throw cause;
    } finally {
      replaceSnapshot(requestScope, (current) => ({
        ...current,retryingEventIds: current.retryingEventIds.filter((eventId) => eventId !== ingress.eventId),
      }));
    }
  }, [historyEntriesRef,refreshExecutionHistory,replaceSnapshot,selectedResourceIdRef,targetScope,targetScopeRef,updateHistoryEntries]);

  const loadIngressTransitionLedger = useCallback((
    entryId: string,
    loadMore: boolean,
    signal?: AbortSignal,
  ): Promise<AutomationIngressTransitionLedger> => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) {
      return Promise.reject(new Error('Automation execution target changed.'));
    }
    const entry = historyEntriesRef.current.find((candidate) => candidate.id === entryId);
    const ingress = entry?.ingress;
    if (!entry || !ingress) return Promise.reject(new Error('The selected execution has no ingress transition ledger.'));
    const activeRequest = requestsRef.current.get(entryId);
    if (activeRequest?.scope === requestScope) return activeRequest.promise;
    const current = snapshotRef.current.scope === requestScope
      ? snapshotRef.current
      : emptyIngressTransitions(requestScope);
    const cached = current.ledgers[entryId];
    const retained = cached?.eventId === ingress.eventId
      && cached.automationResourceId === entry.automationResourceId
      ? cached
      : undefined;
    const lastRevision = retained?.transitions.at(-1)?.revision ?? 0;
    if (loadMore) {
      if (!retained) return Promise.reject(new Error('Load the ingress transition ledger before requesting another page.'));
      if (retained.nextAfterRevision === undefined) return Promise.resolve(retained);
    }
    if (!loadMore && retained && lastRevision >= ingress.revision && !retained.error) return Promise.resolve(retained);
    const afterRevision = loadMore ? retained!.nextAfterRevision! : lastRevision;
    const pending: AutomationIngressTransitionLedger = {
      runId: entry.runId,
      automationResourceId: entry.automationResourceId,
      eventId: ingress.eventId,
      transitions: retained?.transitions ?? [],
      ...(retained?.nextAfterRevision === undefined ? {} : { nextAfterRevision: retained.nextAfterRevision }),
      complete: retained?.complete ?? true,
      ...(retained?.unavailableSources === undefined ? {} : { unavailableSources: retained.unavailableSources }),
      loading: !loadMore,
      loadingMore: loadMore,
      error: '',
    };
    replaceSnapshot(requestScope, (state) => ({
      ...state,ledgers: { ...state.ledgers,[entryId]: pending },
    }));
    const promise = listAutomationIngressTransitions(requestScope.targetId, entry.runId, {
      automationResourceId: entry.automationResourceId,
      eventId: ingress.eventId,
      afterRevision,
      signal,
    }).then((page) => {
      if (signal?.aborted || targetScopeRef.current !== requestScope) return pending;
      const latestSnapshot = snapshotRef.current.scope === requestScope
        ? snapshotRef.current
        : emptyIngressTransitions(requestScope);
      const latest = latestSnapshot.ledgers[entryId];
      const previousTransitions = latest?.eventId === ingress.eventId ? latest.transitions : [];
      const ledger: AutomationIngressTransitionLedger = {
        runId: entry.runId,
        automationResourceId: entry.automationResourceId,
        eventId: ingress.eventId,
        transitions: mergeAutomationIngressTransitions(previousTransitions, page.transitions),
        ...(page.nextAfterRevision === undefined ? {} : { nextAfterRevision: page.nextAfterRevision }),
        complete: page.complete,
        ...(page.unavailableSources === undefined ? {} : { unavailableSources: page.unavailableSources }),
        loading: false,
        loadingMore: false,
        error: '',
      };
      replaceSnapshot(requestScope, (state) => ({
        ...state,ledgers: { ...state.ledgers,[entryId]: ledger },
      }));
      return ledger;
    }).catch((cause) => {
      replaceSnapshot(requestScope, (state) => ({
        ...state,
        ledgers: {
          ...state.ledgers,
          [entryId]: { ...pending,loading: false,loadingMore: false,error: signal?.aborted ? '' : messageOf(cause) },
        },
      }));
      throw cause;
    }).finally(() => {
      const activeRequest = requestsRef.current.get(entryId);
      if (activeRequest?.scope === requestScope && activeRequest.promise === promise) {
        requestsRef.current.delete(entryId);
      }
    });
    requestsRef.current.set(entryId, { scope: requestScope,promise });
    return promise;
  }, [historyEntriesRef,replaceSnapshot,targetScope,targetScopeRef]);

  const loadIngressTransitions = useCallback((entryId: string, signal?: AbortSignal) => (
    loadIngressTransitionLedger(entryId, false, signal)
  ), [loadIngressTransitionLedger]);

  const loadMoreIngressTransitions = useCallback((entryId: string, signal?: AbortSignal) => (
    loadIngressTransitionLedger(entryId, true, signal)
  ), [loadIngressTransitionLedger]);

  const active = snapshot.scope === targetScope ? snapshot : emptyIngressTransitions(targetScope);
  return {
    retryingIngressEventIds: active.retryingEventIds,
    ingressRetryErrors: active.retryErrors,
    ingressTransitionLedgers: active.ledgers,
    resetIngressTransitions,
    retryExecutionIngress,
    loadIngressTransitions,
    loadMoreIngressTransitions,
  };
}

function emptyIngressTransitions(scope: AutomationTargetScope): IngressTransitionsSnapshot {
  return { scope,retryingEventIds: [],retryErrors: {},ledgers: {} };
}

function assertCurrentTargetScope(
  reference: { current: AutomationTargetScope },
  scope: AutomationTargetScope,
) {
  if (reference.current !== scope) throw new Error('Automation execution target changed.');
}
