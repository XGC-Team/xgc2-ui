import { useCallback,useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction } from 'react';
import type { ProcessInstance } from '../execution/executionPublic';
import type { AutomationWorkspaceView } from './AutomationDefinitionWorkspace.types';
import type {
  AutomationExecutionHistoryEntry,
  AutomationExecutionRunSummary,
} from './automationHistoryTypes';
import type { AutomationSpec } from './automationDefinitionContracts';
import type { AutomationRun } from './automationRunContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';
import { messageOf } from './automationErrorModel';
import { activeWorkflowRuntimeNodeIds,isAutomationRunActive } from './automationRunModel';

export function useAutomationWorkspaceRuns({
  resourceId,draft,processInstances,historyEntries,preferredRunId,runDetailsById,workspaceView,
  setWorkspaceView,onRefreshRun,onLoadRun,onOpenRelatedRun,onExecutionHistoryVisibilityChange,
  onRetainRunDetail,
  onLoadIngressTransitions,onLoadMoreIngressTransitions,onError,
}: {
  resourceId: string;
  draft: AutomationSpec;
  processInstances: ProcessInstance[];
  historyEntries: AutomationExecutionHistoryEntry[];
  preferredRunId: string;
  runDetailsById: Record<string,AutomationRunDetail>;
  workspaceView: AutomationWorkspaceView;
  setWorkspaceView: Dispatch<SetStateAction<AutomationWorkspaceView>>;
  onRefreshRun: (runId: string) => Promise<unknown>;
  onRetainRunDetail: (runId:string) => () => void;
  onLoadRun?: (runId: string) => Promise<AutomationRun>;
  onOpenRelatedRun?: (run: AutomationExecutionRunSummary) => void | Promise<unknown>;
  onExecutionHistoryVisibilityChange?: (resourceId: string, visible: boolean) => void;
  onLoadIngressTransitions?: (entryId: string, signal?: AbortSignal) => void | Promise<unknown>;
  onLoadMoreIngressTransitions?: (entryId: string, signal?: AbortSignal) => void | Promise<unknown>;
  onError: (message: string) => void;
}) {
  const [selectedRunId,setSelectedRunId] = useState('');
  const [recentRuns,setRecentRuns] = useState<AutomationRun[]>([]);
  const ingressTransitionPageControllerRef = useRef<AbortController | null>(null);
  const definitionHistoryEntries = useMemo(() => {
    const entries = historyEntries.filter((entry) => entry.automationResourceId === resourceId);
    const exactRun = preferredRunId ? runDetailsById[preferredRunId]?.run : undefined;
    // A direct source read can name an older run outside the first history page.
    // Its verified record supplies the missing row; the cursor stays untouched.
    if (exactRun?.automationResourceId === resourceId && !entries.some((entry) => entry.runId === exactRun.id)) {
      entries.push({
        id: exactRun.id,runId: exactRun.id,targetId: exactRun.targetId,
        automationResourceId: resourceId,acceptedAt: exactRun.acceptedAt,phase: 'run',run: exactRun,
      });
    }
    return entries.sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt) || right.id.localeCompare(left.id));
  }, [historyEntries,preferredRunId,resourceId,runDetailsById]);
  const definitionHistoryRuns = useMemo(() => definitionHistoryEntries.flatMap((entry) => entry.run ? [entry.run] : []),
    [definitionHistoryEntries]);
  const definitionRuns = useMemo(() => {
    const authoritativeIDs = new Set(definitionHistoryRuns.map((run) => run.id));
    return [...definitionHistoryRuns,...recentRuns.filter((run) => (
      run.automationResourceId === resourceId && !authoritativeIDs.has(run.id)
    ))].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  }, [definitionHistoryRuns,recentRuns,resourceId]);
  const activeRuns = useMemo(() => definitionRuns.filter(isAutomationRunActive), [definitionRuns]);
  const selectedHistoryEntry = definitionHistoryEntries.find((entry) => entry.id === selectedRunId)
    ?? (selectedRunId ? undefined : definitionHistoryEntries[0]);
  const selectedRun = selectedHistoryEntry?.run;
  const selectedRunDetail = selectedRun ? runDetailsById[selectedRun.id] : undefined;
  const selectedRecentRun = recentRuns.find((run) => run.id === selectedRunId);
  const editorRun = selectedRun ?? selectedRecentRun ?? definitionRuns[0];
  const editorRunDetail = editorRun ? runDetailsById[editorRun.id] : undefined;
  const editorRunActive = Boolean(editorRun && isAutomationRunActive(editorRun));
  const editorActiveRuntimeNodeIds = useMemo(
    () => activeWorkflowRuntimeNodeIds(editorRun, editorRunDetail, draft, processInstances),
    [draft,editorRun,editorRunDetail,processInstances],
  );

  useEffect(() => {
    if (!selectedRunId || (!definitionHistoryEntries.some((entry) => entry.id === selectedRunId)
      && !definitionRuns.some((run) => run.id === selectedRunId))) {
      setSelectedRunId(definitionHistoryEntries[0]?.id ?? definitionRuns[0]?.id ?? '');
    }
  }, [definitionHistoryEntries,definitionRuns,selectedRunId]);

  useEffect(() => {
    const authoritativeIDs = new Set(definitionHistoryRuns.map((run) => run.id));
    setRecentRuns((runs) => {
      const retained = runs.filter((run) => run.automationResourceId === resourceId && !authoritativeIDs.has(run.id));
      return retained.length === runs.length ? runs : retained;
    });
  }, [definitionHistoryRuns,resourceId]);

  useEffect(() => {
    const entry = definitionHistoryEntries.find((item) => item.runId === preferredRunId || item.id === preferredRunId);
    if (!preferredRunId || !entry) return;
    setSelectedRunId(entry.id);
    setWorkspaceView('executions');
  }, [definitionHistoryEntries,preferredRunId,setWorkspaceView]);

  const inspectedRun = workspaceView === 'editor' ? editorRun : selectedHistoryEntry?.run;
  const inspectedRunId = inspectedRun?.id ?? '';
  const inspectedRunRevision = inspectedRun?.revision ?? 0;
  useEffect(() => inspectedRunId
    ? onRetainRunDetail(inspectedRunId)
    : undefined,[inspectedRunId,onRetainRunDetail]);
  useEffect(() => {
    if (!inspectedRunId) return;
    void onRefreshRun(inspectedRunId).catch((cause) => onError(messageOf(cause)));
  }, [inspectedRunId,inspectedRunRevision,onError,onRefreshRun]);

  const selectedHistoryEntryId = selectedHistoryEntry?.id ?? '';
  const selectedHistoryIngressRevision = selectedHistoryEntry?.ingress?.revision;
  const selectedHistoryHasIngress = selectedHistoryEntry?.ingress !== undefined;
  useEffect(() => {
    if (workspaceView !== 'executions' || !selectedHistoryHasIngress || !selectedHistoryEntryId || !onLoadIngressTransitions) return;
    const controller = new AbortController();
    void Promise.resolve(onLoadIngressTransitions(selectedHistoryEntryId, controller.signal))
      .catch((cause) => {
        if (!controller.signal.aborted) onError(messageOf(cause));
      });
    return () => controller.abort();
  }, [onError,onLoadIngressTransitions,selectedHistoryEntryId,selectedHistoryHasIngress,selectedHistoryIngressRevision,workspaceView]);

  useEffect(() => () => {
    ingressTransitionPageControllerRef.current?.abort();
    ingressTransitionPageControllerRef.current = null;
  }, [selectedHistoryEntryId]);

  const loadMoreIngressTransitionPage = useCallback((entryId: string) => {
    if (!onLoadMoreIngressTransitions) return Promise.resolve();
    ingressTransitionPageControllerRef.current?.abort();
    const controller = new AbortController();
    ingressTransitionPageControllerRef.current = controller;
    return Promise.resolve(onLoadMoreIngressTransitions(entryId, controller.signal)).finally(() => {
      if (ingressTransitionPageControllerRef.current === controller) {
        ingressTransitionPageControllerRef.current = null;
      }
    });
  }, [onLoadMoreIngressTransitions]);

  useEffect(() => {
    const visible = workspaceView === 'executions';
    onExecutionHistoryVisibilityChange?.(resourceId, visible);
    return () => {
      if (visible) onExecutionHistoryVisibilityChange?.(resourceId, false);
    };
  }, [onExecutionHistoryVisibilityChange,resourceId,workspaceView]);

  function recordRecentRun(run: AutomationRun) {
    setRecentRuns((runs) => [run,...runs.filter((candidate) => candidate.id !== run.id)]);
    setSelectedRunId(run.id);
  }

  function openRelatedRun(run: AutomationExecutionRunSummary | AutomationRun) {
    if (run.automationResourceId === resourceId) {
      setSelectedRunId(run.id);
      setWorkspaceView('executions');
      return;
    }
    void onOpenRelatedRun?.(run);
  }

  async function openRelatedRunById(runId: string) {
    try {
      const cached = runDetailsById[runId]?.run;
      if (cached) {
        openRelatedRun(cached);
        return;
      }
      if (!onLoadRun) return;
      openRelatedRun(await onLoadRun(runId));
    } catch (cause) {
      onError(messageOf(cause));
    }
  }

  return {
    activeRuns,definitionHistoryEntries,definitionRuns,editorActiveRuntimeNodeIds,editorRun,editorRunActive,
    editorRunDetail,loadMoreIngressTransitionPage,openRelatedRun,openRelatedRunById,recordRecentRun,
    selectedHistoryEntry,selectedRun,selectedRunDetail,setSelectedRunId,
  };
}
