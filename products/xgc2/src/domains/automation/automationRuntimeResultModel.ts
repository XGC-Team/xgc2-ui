import type { AutomationNodeExecutionSummary } from './automationExecutionContracts';

export type AutomationRuntimeFailure = {
  className: string;
  message: string;
};

export function automationRuntimeFailure(
  nodeSummary?: Pick<AutomationNodeExecutionSummary,'status' | 'error' | 'errorClass'>,
): AutomationRuntimeFailure | undefined {
  if (!nodeSummary || (nodeSummary.status !== 'failed' && !nodeSummary.error)) return undefined;
  return {
    className: nodeSummary.errorClass ?? 'error',
    message: nodeSummary.error || 'Node execution failed.',
  };
}
