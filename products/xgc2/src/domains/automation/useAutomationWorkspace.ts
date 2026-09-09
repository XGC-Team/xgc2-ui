import { useCallback,useRef,useState,type Dispatch,type SetStateAction } from 'react';
import type { AutomationDocument } from './automationDefinitionContracts';
import { useAutomationAuthoring } from './useAutomationAuthoring';
import { useAutomationDefinitionsCatalog } from './useAutomationDefinitionsCatalog';
import { useAutomationDocumentSelection } from './useAutomationDocumentSelection';
import { useAutomationExecutionEventReconciliation } from './useAutomationExecutionEventReconciliation';
import { useAutomationExecutionHistory } from './useAutomationExecutionHistory';
import { useAutomationIngressTransitions } from './useAutomationIngressTransitions';
import { useAutomationMCPConnections } from './useAutomationMCPConnections';
import { useAutomationNodeCatalog } from './useAutomationNodeCatalog';
import { useAutomationRunActions } from './useAutomationRunActions';
import { useAutomationRunDetails } from './useAutomationRunDetails';
import { useAutomationTriggerLifecycle } from './useAutomationTriggerLifecycle';
import { useAutomationTargetScope } from './useAutomationTargetScope';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';
import type { ExecutionEvent } from '../execution/executionPublic';

export function useAutomationWorkspace(
  targetId: string,
  nodeComposition?: AutomationNodeWebComposition,
) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const [runtimeErrorSnapshot,setRuntimeErrorSnapshot] = useState(() => ({ scope: targetScope,error: '' }));
  const setRuntimeError = useCallback<Dispatch<SetStateAction<string>>>((update) => {
    if (targetScopeRef.current !== targetScope) return;
    setRuntimeErrorSnapshot((current) => {
      const currentError = current.scope === targetScope ? current.error : '';
      return {
        scope: targetScope,
        error: typeof update === 'function' ? update(currentError) : update,
      };
    });
  }, [targetScope,targetScopeRef]);
  const runtimeError = runtimeErrorSnapshot.scope === targetScope ? runtimeErrorSnapshot.error : '';
  const selectedResourceIdRef = useRef('');
  const definitions = useAutomationDefinitionsCatalog();
  const nodeCatalog = useAutomationNodeCatalog(targetId);

  const history = useAutomationExecutionHistory({ targetId,selectedResourceIdRef,setError: setRuntimeError });
  const runDetails = useAutomationRunDetails({
    targetId,
    markExecutionHistoryObserved: history.markExecutionHistoryObserved,
  });
  const triggers = useAutomationTriggerLifecycle(targetId);
  const mcp = useAutomationMCPConnections(targetId);
  const ingress = useAutomationIngressTransitions({
    targetId,
    historyEntriesRef: history.historyEntriesRef,
    selectedResourceIdRef,
    refreshExecutionHistory: history.refreshExecutionHistory,
    updateHistoryEntries: history.updateHistoryEntries,
  });
  const openExecutionHistory = history.openExecutionHistory;
  const clearSelectedExecutionHistory = history.clearSelectedExecutionHistory;
  const resetIngressTransitions = ingress.resetIngressTransitions;
  const dismissResourceActivationCredentials = triggers.dismissResourceActivationCredentials;
  const refreshActivations = triggers.refreshActivations;
  const refreshResourceActivations = triggers.refreshResourceActivations;
  const refreshDefinitionCatalog = definitions.refreshDefinitions;
  const refreshNodeCatalog = nodeCatalog.refreshNodeCatalog;

  const loadSupportingFacts = useCallback(async (document: AutomationDocument, signal: AbortSignal) => {
    await Promise.allSettled([
      openExecutionHistory(document.head.resourceId, signal),
      refreshResourceActivations(document, signal),
    ]);
  }, [openExecutionHistory,refreshResourceActivations]);
  const handleSelectionRequested = useCallback((resourceId: string) => {
    setRuntimeError('');
    dismissResourceActivationCredentials(resourceId);
  }, [dismissResourceActivationCredentials,setRuntimeError]);
  const handleSelectionClosed = useCallback((resourceId: string) => {
    if (resourceId) dismissResourceActivationCredentials(resourceId);
    clearSelectedExecutionHistory();
    resetIngressTransitions();
  }, [clearSelectedExecutionHistory,dismissResourceActivationCredentials,resetIngressTransitions]);
  const selection = useAutomationDocumentSelection({
    targetId,
    selectedResourceIdRef,
    onSelectionRequested: handleSelectionRequested,
    loadSupportingFacts,
    onSelectionClosed: handleSelectionClosed,
  });
  const selectedDocumentRef = useRef(selection);
  selectedDocumentRef.current = selection;
  const openSelectedDocument = selection.open;
  const refreshDefinitionTruth = useCallback(async (signal?:AbortSignal) => {
    const selectedResourceId = selectedResourceIdRef.current;
    const documents = await refreshDefinitionCatalog(signal);
    if (!documents || signal?.aborted || !selectedResourceId
      || selectedResourceIdRef.current !== selectedResourceId) return documents;
    const activeSelection = selectedDocumentRef.current;
    const current = activeSelection.selected;
    if (current?.head.resourceId !== selectedResourceId
      || activeSelection.selectionResourceId !== selectedResourceId) return documents;
    const projected = documents.find((document) => document.head.resourceId === selectedResourceId);
    if (!projected || projected.head.revision !== current.head.revision
      || projected.branch.revision !== current.branch.revision
      || projected.branch.headCommitId !== current.branch.headCommitId) {
      // A missing or changed projection requests exact revalidation. It never
      // erases or replaces a document already obtained from its own endpoint.
      await openSelectedDocument(selectedResourceId).catch(() => undefined);
    }
    return documents;
  }, [openSelectedDocument,refreshDefinitionCatalog]);
  const authoring = useAutomationAuthoring({
    catalog: nodeCatalog.catalog,
    documents: definitions.documents,
    setDocuments: definitions.setDocuments,
    setNamespaces: definitions.setNamespaces,
    setSelected: selection.setSelected,
    clearTriggerResource: triggers.clearTriggerResource,
    nodeComposition,
  });
  const runActions = useAutomationRunActions({
    targetId,
    cacheExactRun: runDetails.cacheExactRun,
    refreshExecutionHistory: history.refreshExecutionHistory,
    refreshObservedExecutionHistories: history.refreshObservedExecutionHistories,
    setError: setRuntimeError,
  });
  const applyHistoryRunLifecycleEvent=history.applyRunLifecycleEvent;
  const applyDetailRunLifecycleEvent=runDetails.applyRunLifecycleEvent;
  const applyRunLifecycleEvent = useCallback((event:ExecutionEvent) => {
    const historyApplied=applyHistoryRunLifecycleEvent(event);
    applyDetailRunLifecycleEvent(event);
    return historyApplied;
  },[applyDetailRunLifecycleEvent,applyHistoryRunLifecycleEvent]);
  const executionStreamState = useAutomationExecutionEventReconciliation({
    targetId,
    historyEntriesRef: history.historyEntriesRef,
    runDetailsByIdRef: runDetails.runDetailsByIdRef,
    hasExecutionHistoryRefresh: history.hasExecutionHistoryRefresh,
    isExecutionHistoryObserved: history.isExecutionHistoryObserved,
    applyRunLifecycleEvent,
    refreshExecutionHistory: history.refreshExecutionHistory,
    refreshObservedExecutionHistories: history.refreshObservedExecutionHistories,
    refreshDefinitions: refreshDefinitionTruth,
    refreshActivations: triggers.refreshActivations,
    loadRunDetail: runDetails.loadRunDetail,
    resetExecutionHistoryForStream: history.resetExecutionHistoryForStream,
    resetRunDetails: runDetails.resetRunDetails,
    setError: setRuntimeError,
  });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setRuntimeError('');
    await Promise.all([
      refreshDefinitionTruth(signal),
      refreshNodeCatalog(signal),
      refreshActivations(signal),
    ]);
  }, [refreshActivations,refreshDefinitionTruth,refreshNodeCatalog,setRuntimeError]);
  const loading = definitions.documentsLoading || nodeCatalog.catalogLoading;
  const error = runtimeError
    || selection.selectionError
    || definitions.documentsError
    || nodeCatalog.catalogError;

  return {
    targetId,
    documents: definitions.documents,
    documentsError: definitions.documentsError,
    documentsLoaded: definitions.documentsLoaded,
    documentsLoading: definitions.documentsLoading,
    namespaces: definitions.namespaces,
    namespacesError: definitions.namespacesError,
    namespacesLoaded: definitions.namespacesLoaded,
    namespacesLoading: definitions.namespacesLoading,
    catalog: nodeCatalog.catalog,
    catalogError: nodeCatalog.catalogError,
    catalogLoaded: nodeCatalog.catalogLoaded,
    catalogLoading: nodeCatalog.catalogLoading,
    runSummaries: history.runSummaries,
    historyEntries: history.historyEntries,
    historyComplete: history.runHistory.complete,
    historyUnavailableSources: history.runHistory.unavailableSources,
    hasMoreRuns: history.runHistory.automationResourceId === selection.selected?.head.resourceId
      && history.runHistory.complete
      && Boolean(history.runHistory.nextCursor),
    runsLoadingMore: history.runsLoadingMore,
    retryingIngressEventIds: ingress.retryingIngressEventIds,
    ingressRetryErrors: ingress.ingressRetryErrors,
    ingressTransitionLedgers: ingress.ingressTransitionLedgers,
    runDetailsById: runDetails.runDetailsById,
    executionStreamState,
    activations: triggers.activations,
    activationsError: triggers.activationsError,
    activationsLoading: triggers.activationsLoading,
    activationCredentials: triggers.activationCredentials,
    testListeners: triggers.testListeners,
    mcpConnections: mcp.mcpConnections,
    mcpCatalogs: mcp.mcpCatalogs,
    mcpConnectionsLoading: mcp.mcpConnectionsLoading,
    selected: selection.selected,
    selectionResourceId: selection.selectionResourceId,
    selectionError: selection.selectionError,
    selectionNotFound: selection.selectionNotFound,
    selectionLoading: selection.selectionLoading,
    historyError: history.historyError,
    loading,
    error,
    refresh,
    refreshExecutionHistory: history.refreshExecutionHistory,
    loadMoreRuns: history.loadMoreRuns,
    setExecutionHistoryVisible: history.setExecutionHistoryVisible,
    retryExecutionIngress: ingress.retryExecutionIngress,
    loadIngressTransitions: ingress.loadIngressTransitions,
    loadMoreIngressTransitions: ingress.loadMoreIngressTransitions,
    refreshMCPConnections: mcp.refreshMCPConnections,
    open: selection.open,
    activate: triggers.activate,
    deactivate: triggers.deactivate,
    dismissActivationCredential: triggers.dismissActivationCredential,
    startTestListener: triggers.startTestListener,
    cancelTestListener: triggers.cancelTestListener,
    submitTestEvent: triggers.submitTestEvent,
    saveMCPConnection: mcp.saveMCPConnection,
    removeMCPConnection: mcp.removeMCPConnection,
    discoverMCPCatalog: mcp.discoverMCPCatalog,
    runOnce: triggers.runOnce,
    create: authoring.create,
    duplicate: authoring.duplicate,
    commit: authoring.commit,
    move: authoring.move,
    archive: authoring.archive,
    restore: authoring.restore,
    addNamespace: authoring.addNamespace,
    renameNamespace: authoring.renameNamespace,
    archiveNamespace: authoring.archiveNamespace,
    start: runActions.start,
    runDocument: runActions.runDocument,
    runBoundAutomation: runActions.runBoundAutomation,
    stop: runActions.stop,
    stopRunSet: runActions.stopRunSet,
    cancel: runActions.cancel,
    loadRunDetail: runDetails.loadRunDetail,
    retainRunDetail:runDetails.retainRunDetail,
    refreshRun: runDetails.refreshRun,
    loadRun: runDetails.loadRun,
    close: selection.close,
  };
}
