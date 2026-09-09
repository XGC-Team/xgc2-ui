import { useState } from 'react';
import { AUTOMATION_CALL_KIND,automationTargetPolicyInheritsExperiment,type AutomationDocument } from './automationDefinitionContracts';
import { messageOf } from './automationErrorModel';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';
import type { AutomationRun } from './automationRunContracts';
import { automationPrimaryAction } from './automationSpecModel';

type ExecuteDocument = (
  document: AutomationDocument,
  parameters?: Record<string,unknown>,
  reason?: string,
  throughNodeId?: string,
  actionId?: string,
) => Promise<AutomationRun>;

export function useAutomationListExecutionActions({
  executeDocument,
  stopExecution,
}: {
  executeDocument: ExecuteDocument;
  stopExecution: (run: AutomationExecutionRunSummary) => Promise<unknown>;
}) {
  const [parameterDocument,setParameterDocument] = useState<AutomationDocument | null>(null);
  const [startingResourceIds,setStartingResourceIds] = useState<string[]>([]);
  const [stoppingRunIds,setStoppingRunIds] = useState<string[]>([]);
  const [executionError,setExecutionError] = useState('');

  function run(document: AutomationDocument) {
    setExecutionError('');
    if (automationTargetPolicyInheritsExperiment(document.spec.targetPolicy)) {
      setExecutionError('This Automation inherits its execution target and can run only through an Experiment.');
      return;
    }
    const action = automationPrimaryAction(document.spec);
    if (!action) {
      setExecutionError('This Automation does not publish an invocable Action.');
      return;
    }
    if (action.inputSchema.fields.length > 0
      || document.spec.nodes.some((node) => node.kind === AUTOMATION_CALL_KIND)) {
      setParameterDocument(document);
      return;
    }
    const resourceId = document.head.resourceId;
    setStartingResourceIds((ids) => ids.includes(resourceId) ? ids : [...ids,resourceId]);
    void executeDocument(document, {}, undefined, undefined, action.id)
      .catch((cause) => setExecutionError(messageOf(cause)))
      .finally(() => setStartingResourceIds((ids) => ids.filter((id) => id !== resourceId)));
  }

  function stopLatestRun(runSummary: AutomationExecutionRunSummary) {
    setExecutionError('');
    setStoppingRunIds((ids) => ids.includes(runSummary.id) ? ids : [...ids,runSummary.id]);
    void stopExecution(runSummary)
      .catch((cause) => setExecutionError(messageOf(cause)))
      .finally(() => setStoppingRunIds((ids) => ids.filter((id) => id !== runSummary.id)));
  }

  function runFromWorkspace(
    document: AutomationDocument,
    parameters: Record<string,unknown>,
    throughNodeId = '',
    actionId = '',
  ) {
    if (automationTargetPolicyInheritsExperiment(document.spec.targetPolicy)) {
      return Promise.reject(new Error('This Automation inherits its execution target and can run only through an Experiment.'));
    }
    return executeDocument(
      document,parameters,undefined,throughNodeId,actionId || automationPrimaryAction(document.spec)?.id || '',
    );
  }

  return {
    executionError,
    parameterDocument,
    run,
    runFromWorkspace,
    setParameterDocument,
    startingResourceIds,
    stopLatestRun,
    stoppingRunIds,
  };
}
