import { useEffect,useState } from 'react';
import { AUTOMATION_CALL_KIND } from './automationDefinitionContracts';
import type { AutomationDocument } from './automationDefinitionContracts';
import type { AutomationRun } from './automationRunContracts';
import type { AutomationRunControl } from './automationHistoryTypes';
import { messageOf } from './automationErrorModel';
import { isAutomationRunActive } from './automationRunModel';
import { automationActionForEntry } from './automationSpecModel';

export function useAutomationRunController({ document,observedRuns,dirty,readOnly,entrypointNodeId,persistDraft,onRun,onStop,onRefreshRun,onRunStarted,onError,onMutationError }: {
  document: AutomationDocument;
  observedRuns: readonly AutomationRunControl[];
  dirty: boolean;
  readOnly: boolean;
  entrypointNodeId?: string;
  persistDraft: (reason: string) => Promise<AutomationDocument>;
  onRun: (document: AutomationDocument, parameters: Record<string,unknown>, throughNodeId?: string, actionId?: string) => Promise<AutomationRun>;
  onStop: (run: AutomationRunControl) => Promise<AutomationRun>;
  onRefreshRun: (runId: string) => Promise<unknown>;
  onRunStarted: (run: AutomationRun) => void;
  onError: (message: string) => void;
  onMutationError: (cause: unknown) => void;
}) {
  const [busy, setBusy] = useState('');
  const [stoppingRunIds,setStoppingRunIds] = useState<string[]>([]);
  const [runDialogDocument, setRunDialogDocument] = useState<AutomationDocument | null>(null);
  const [runThroughNodeId, setRunThroughNodeId] = useState('');

  useEffect(() => {
    const terminalRunIds = new Set(observedRuns
      .filter((run) => !isAutomationRunActive(run))
      .map((run) => run.id));
    if (terminalRunIds.size === 0) return;
    setStoppingRunIds((runIds) => {
      const retained = runIds.filter((runId) => !terminalRunIds.has(runId));
      return retained.length === runIds.length ? runIds : retained;
    });
  },[observedRuns]);

  async function prepareRun(throughNodeId = '') {
    if (busy || readOnly) return;
    setBusy('run');
    onError('');
    try {
      const runnable = dirty ? await persistDraft('Save Automation before run') : document;
      const action = automationActionForEntry(runnable.spec, entrypointNodeId);
      if (!action) throw new Error('Select a public Action before starting this Automation.');
      if (action.inputSchema.fields.length > 0 || runnable.spec.nodes.some((node) => node.kind === AUTOMATION_CALL_KIND)) {
        setRunDialogDocument(runnable);
        setRunThroughNodeId(throughNodeId);
      } else {
        await startPreparedRun(runnable, {}, throughNodeId, action.entryNodeId);
      }
    } catch (cause) {
      onMutationError(cause);
    } finally {
      setBusy('');
    }
  }

  async function startPreparedRun(
    runnable: AutomationDocument,
    parameters: Record<string,unknown>,
    throughNodeId = runThroughNodeId,
    selectedEntrypointNodeId = entrypointNodeId,
  ) {
    const action = automationActionForEntry(runnable.spec,selectedEntrypointNodeId);
    if (!action) throw new Error('Select a public Action before starting this Automation.');
    const run = await onRun(runnable,parameters,throughNodeId || undefined,action.id);
    onRunStarted(run);
    return run;
  }

  async function stopRun(run: AutomationRunControl) {
    if (run.status === 'stopping' || stoppingRunIds.includes(run.id)) return;
    setStoppingRunIds((runIds) => [...runIds,run.id]);
    onError('');
    try {
      await onStop(run);
    } catch (cause) {
      setStoppingRunIds((runIds) => runIds.filter((runId) => runId !== run.id));
      onError(messageOf(cause));
    }
  }

  async function refreshExecutionRun(runId: string) {
    if (busy) return;
    setBusy('refresh-run');
    onError('');
    try {
      await onRefreshRun(runId);
    } catch (cause) {
      onError(messageOf(cause));
    } finally {
      setBusy('');
    }
  }

  return {
    busy,stoppingRunIds,runDialogDocument,setRunDialogDocument,prepareRun,startPreparedRun,stopRun,refreshExecutionRun,
  };
}
