import { useCallback,useEffect,useMemo } from 'react';
import type { AutomationDocument } from './automationDefinitionContracts';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';
import { latestAutomationRunsByResource,splitResourceKey } from './automationPageModel';

export function useAutomationListExecutionHistory({
  visible,
  documents,
  runSummaries,
  refreshExecutionHistory,
}: {
  visible: boolean;
  documents: AutomationDocument[];
  runSummaries: readonly AutomationExecutionRunSummary[];
  refreshExecutionHistory: (automationResourceId: string, signal?: AbortSignal) => Promise<unknown>;
}) {
  const documentResourceKey = useMemo(() => documents
    .map((document) => document.head.resourceId)
    .sort()
    .join('\0'), [documents]);
  const latestRunsByResourceId = useMemo(
    () => latestAutomationRunsByResource(runSummaries),
    [runSummaries],
  );
  const refreshHistories = useCallback(async (resourceKey: string, signal?: AbortSignal) => {
    // The history owner controls admission for every caller, including replay.
    // This surface only declares which resources it observes and their lifetime.
    await Promise.allSettled(splitResourceKey(resourceKey).map((resourceId) => (
      refreshExecutionHistory(resourceId,signal)
    )));
  }, [refreshExecutionHistory]);

  useEffect(() => {
    if (!visible || !documentResourceKey) return;
    let controller: AbortController | null = null;
    const refreshVisibleList = () => {
      controller?.abort();
      controller = new AbortController();
      void refreshHistories(documentResourceKey, controller.signal);
    };
    refreshVisibleList();
    const onVisibilityChange = () => {
      if (globalThis.document.visibilityState === 'visible') refreshVisibleList();
      else controller?.abort();
    };
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      globalThis.document.removeEventListener('visibilitychange', onVisibilityChange);
      controller?.abort();
    };
  }, [documentResourceKey,refreshHistories,visible]);

  return latestRunsByResourceId;
}
