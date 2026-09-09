import { useEffect,useRef,useState } from 'react';
import type {
  AutomationDefinitionExecutionCapability,
  AutomationWorkspaceView,
} from './AutomationDefinitionWorkspace.types';
import type {
  AutomationDocument,
  AutomationSpec,
} from './automationDefinitionContracts';
import type { AutomationTriggerKind } from './automationTriggerContracts';
import { useAutomationRunController } from './useAutomationRunController';
import { useAutomationWorkspaceRuns } from './useAutomationWorkspaceRuns';

export function useAutomationDefinitionRuntimeWorkspace({
  document,draft,dirty,canEdit,archived,adoptionRevision,entrypointNodeId,triggerNodeCount,
  triggerKind,saving,triggerBusy,capability,persistDraft,onError,onMutationError,
}: {
  document: AutomationDocument;
  draft: AutomationSpec;
  dirty: boolean;
  canEdit: boolean;
  archived: boolean;
  adoptionRevision: number;
  entrypointNodeId: string;
  triggerNodeCount: number;
  triggerKind: AutomationTriggerKind | '';
  saving: boolean;
  triggerBusy: string;
  capability: AutomationDefinitionExecutionCapability;
  persistDraft: (reason: string) => Promise<AutomationDocument>;
  onError: (message: string) => void;
  onMutationError: (cause: unknown) => void;
}) {
  const {
    targetId = 'local',processInstances = [],preferredRunId = '',historyEntries = [],historyComplete = true,
    historyUnavailableSources = [],retryingIngressEventIds = [],ingressRetryErrors = {},
    ingressTransitionLedgers = {},hasMoreRuns = false,runsLoadingMore = false,runDetailsById,streamState,
    onRun,onStop,onRefreshRun,onRetainRunDetail,onLoadMoreRuns,onLoadRun,onOpenRelatedRun,onExecutionHistoryVisibilityChange,
    onRetryExecutionIngress,onLoadIngressTransitions,onLoadMoreIngressTransitions,
  } = capability;
  const [workspaceView,setWorkspaceView] = useState<AutomationWorkspaceView>('editor');
  const [logsExpanded,setLogsExpanded] = useState(false);
  const [logsPanelHeight,setLogsPanelHeight] = useState(300);
  const [runStartedRevision,setRunStartedRevision] = useState(0);
  const previousAdoptionRevision = useRef(adoptionRevision);

  const runs = useAutomationWorkspaceRuns({
    resourceId: document.head.resourceId,draft,processInstances,historyEntries,preferredRunId,runDetailsById,
    workspaceView,setWorkspaceView,onRefreshRun,onLoadRun,onOpenRelatedRun,onExecutionHistoryVisibilityChange,
    onRetainRunDetail,
    onLoadIngressTransitions,onLoadMoreIngressTransitions,onError,
  });
  const runController = useAutomationRunController({
    document,
    observedRuns: runs.definitionRuns,
    dirty: canEdit && dirty,
    readOnly: archived,
    entrypointNodeId: triggerNodeCount > 1 && triggerKind === 'trigger.manual'
      ? entrypointNodeId
      : undefined,
    persistDraft,
    onRun,
    onStop,
    onRefreshRun,
    onRunStarted: (run) => {
      runs.recordRecentRun(run);
      setRunStartedRevision((revision) => revision + 1);
    },
    onError,
    onMutationError,
  });
  const setRunDialogDocument = runController.setRunDialogDocument;

  useEffect(() => {
    if (previousAdoptionRevision.current === adoptionRevision) return;
    previousAdoptionRevision.current = adoptionRevision;
    setWorkspaceView('editor');
    setLogsExpanded(false);
    setRunDialogDocument(null);
  }, [adoptionRevision,setRunDialogDocument]);

  useEffect(() => {
    if (workspaceView === 'executions') setRunDialogDocument(null);
  }, [setRunDialogDocument,workspaceView]);

  function changeWorkspaceView(next: AutomationWorkspaceView) {
    if (next !== workspaceView) setWorkspaceView(next);
  }

  const editorRunStopping = Boolean(runs.editorRun && (
    runs.editorRun.status === 'stopping'
    || runController.stoppingRunIds.includes(runs.editorRun.id)
  ));
  const workspaceBusy = saving ? 'save' : triggerBusy || runController.busy;
  const selectedIngressTransitionLedger = runs.selectedHistoryEntry
    ? ingressTransitionLedgers[runs.selectedHistoryEntry.id]
    : undefined;

  return {
    activeRuns: runs.activeRuns,
    busy: workspaceBusy,
    changeWorkspaceView,
    closeRunDialog: () => setRunDialogDocument(null),
    definitionHistoryEntries: runs.definitionHistoryEntries,
    definitionRuns: runs.definitionRuns,
    editorActiveRuntimeNodeIds: runs.editorActiveRuntimeNodeIds,
    editorRun: runs.editorRun,
    editorRunActive: runs.editorRunActive,
    editorRunDetail: runs.editorRunDetail,
    editorRunStopping,
    hasMoreRuns,
    historyComplete,
    historyUnavailableSources,
    ingressRetryErrors,
    loadMoreIngressTransitions: onLoadMoreIngressTransitions
      ? runs.loadMoreIngressTransitionPage
      : undefined,
    loadMoreRuns: onLoadMoreRuns,
    logsExpanded,
    logsPanelHeight,
    openRelatedRun: runs.openRelatedRun,
    openRelatedRunById: runs.openRelatedRunById,
    prepareRun: runController.prepareRun,
    processInstances,
    refreshExecutionRun: runController.refreshExecutionRun,
    retryExecutionIngress: onRetryExecutionIngress,
    retryingIngressEventIds,
    runBusy: runController.busy,
    runDetailsById,
    runDialogDocument: runController.runDialogDocument,
    runStartedRevision,
    runsLoadingMore,
    selectedHistoryEntry: runs.selectedHistoryEntry,
    selectedIngressTransitionLedger,
    selectedRun: runs.selectedRun,
    selectedRunDetail: runs.selectedRunDetail,
    selectRun: runs.setSelectedRunId,
    setLogsExpanded,
    setLogsPanelHeight,
    startPreparedRun: runController.startPreparedRun,
    stopRun: runController.stopRun,
    streamState,
    targetId,
    workspaceView,
  };
}
