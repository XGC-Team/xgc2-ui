import { useCallback,type Dispatch,type SetStateAction } from 'react';
import type { ConfigRef } from '../../shared/configResource';
import { createMutationIdentity } from '../../shared/utils/intent';
import type { AutomationRunControl } from './automationHistoryTypes';
import type { AutomationDocument } from './automationDefinitionContracts';
import type {
  AutomationRun,
  AutomationStopRunSetResponse,
} from './automationRunContracts';
import { isAutomationRunActive } from './automationRunModel';
import { automationPrimaryAction } from './automationSpecModel';
import {
  cancelAutomationRun,
  getAutomationRun,
  startAutomationRun,
  stopAutomationRun,
  stopAutomationRunSet,
  type StartAutomationRunInput,
} from './automationRunService';
import { isAutomationRunRevisionConflict,messageOf } from './automationErrorModel';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';

type UseAutomationRunActionsOptions = {
  targetId: string;
  cacheExactRun: (run: AutomationRun, onlyExisting?: boolean) => void;
  refreshExecutionHistory: (resourceId: string) => Promise<unknown>;
  refreshObservedExecutionHistories: () => Promise<unknown>;
  setError: Dispatch<SetStateAction<string>>;
};

export function useAutomationRunActions({
  targetId,
  cacheExactRun,
  refreshExecutionHistory,
  refreshObservedExecutionHistories,
  setError,
}: UseAutomationRunActionsOptions) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const start = useCallback(async (input: StartAutomationRunInput) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const run = await startAutomationRun(requestScope.targetId, input);
    if (targetScopeRef.current === requestScope) {
      cacheExactRun(run);
      void refreshExecutionHistory(run.automationResourceId).catch((cause) => {
        if (targetScopeRef.current === requestScope) setError(messageOf(cause));
      });
    }
    return run;
  }, [cacheExactRun,refreshExecutionHistory,setError,targetScope,targetScopeRef]);

  const runDocument = useCallback(async (
    document: AutomationDocument,
    parameters: Record<string,unknown> = {},
    reason = 'Run Automation definition',
    throughNodeId = '',
    actionId = '',
  ) => start({
    actionId: actionId || automationPrimaryAction(document.spec)?.id || '',
    automationRef: {
      domain: document.head.domain,
      resourceId: document.head.resourceId,
      branch: document.branch.name,
    },
    parameters,
    reason,
    ...(throughNodeId ? { throughNodeId } : {}),
  }), [start]);

  const runBoundAutomation = useCallback(async (
    automationRef: ConfigRef,
    parameters: Record<string,unknown> = {},
    reason = 'Run Experiment configuration',
    throughNodeId = '',
    actionId = '',
    options: { experimentRef?: ConfigRef } = {},
  ) => start({
    actionId,automationRef,parameters,reason,...options,
    ...(throughNodeId ? { throughNodeId } : {}),
  }), [start]);

  const controlRun = useCallback(async (
    run: AutomationRunControl,
    action: 'stop' | 'cancel',
    reason?: string,
  ) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    let current: AutomationRun = 'parameters' in run
      ? run as AutomationRun
      : await getAutomationRun(requestScope.targetId, run.id);
    assertCurrentTargetScope(targetScopeRef, requestScope);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!isAutomationRunActive(current) || current.status === 'stopping') return current;
      try {
        const updated = action === 'stop'
          ? await stopAutomationRun(requestScope.targetId, current, reason)
          : await cancelAutomationRun(requestScope.targetId, current, reason);
        if (targetScopeRef.current === requestScope) {
          cacheExactRun(updated, true);
          void refreshExecutionHistory(updated.automationResourceId).catch((cause) => {
            if (targetScopeRef.current === requestScope) setError(messageOf(cause));
          });
        }
        return updated;
      } catch (cause) {
        if (!isAutomationRunRevisionConflict(cause) || attempt === 2) throw cause;
        assertCurrentTargetScope(targetScopeRef, requestScope);
        current = await getAutomationRun(requestScope.targetId, run.id);
        assertCurrentTargetScope(targetScopeRef, requestScope);
        cacheExactRun(current, true);
      }
    }
    throw new Error(`Automation ${action} retry exhausted.`);
  }, [cacheExactRun,refreshExecutionHistory,setError,targetScope,targetScopeRef]);

  const stop = useCallback((run: AutomationRunControl, reason?: string) => (
    controlRun(run, 'stop', reason)
  ), [controlRun]);

  const stopRunSet = useCallback(async (
    anchor: AutomationRunControl,
    options: { includeAnchor: boolean;includeDetached: boolean;reason?: string },
  ): Promise<AutomationStopRunSetResponse> => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    let current = anchor;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        const refreshed = await getAutomationRun(requestScope.targetId,anchor.id);
        current = refreshed;
        assertCurrentTargetScope(targetScopeRef, requestScope);
        cacheExactRun(refreshed,true);
      }
      try {
        const response = await stopAutomationRunSet(requestScope.targetId, current.id, {
          expectedRevision: current.revision,
          includeAnchor: options.includeAnchor,
          includeDetached: options.includeDetached,
          reason: options.reason?.trim() || 'Stop Automation run set',
          ...createMutationIdentity('automation.run-set.stop'),
        });
        if (targetScopeRef.current === requestScope) {
          void refreshObservedExecutionHistories().catch((cause) => {
            if (targetScopeRef.current === requestScope) setError(messageOf(cause));
          });
        }
        return response;
      } catch (cause) {
        if (!isAutomationRunRevisionConflict(cause) || attempt === 2) throw cause;
        assertCurrentTargetScope(targetScopeRef, requestScope);
      }
    }
    throw new Error('Automation stop-set retry exhausted.');
  }, [cacheExactRun,refreshObservedExecutionHistories,setError,targetScope,targetScopeRef]);

  const cancel = useCallback((run: AutomationRunControl, reason?: string) => (
    controlRun(run, 'cancel', reason)
  ), [controlRun]);

  return { start,runDocument,runBoundAutomation,stop,stopRunSet,cancel };
}

function assertCurrentTargetScope(
  reference: { current: AutomationTargetScope },
  scope: AutomationTargetScope,
) {
  if (reference.current !== scope) throw new Error('Automation execution target changed.');
}
