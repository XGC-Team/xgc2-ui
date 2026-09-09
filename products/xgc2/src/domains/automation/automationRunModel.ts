import type { ProcessInstance } from '../execution/executionPublic';
import type { AutomationRunStatus } from '../../shared/executionStatusVocabulary';
import type { AutomationSpec } from './automationDefinitionContracts';
import type { AutomationRun } from './automationRunContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';

export type AutomationRunPresentationStatus = AutomationRunStatus | 'active';

export type AutomationRunPresentation = {
  status: AutomationRunPresentationStatus;
  shortLabel: string;
  label: string;
  description: string;
  engineStatus: AutomationRunStatus;
};

const RUN_PHASES: Record<AutomationRunStatus, Omit<AutomationRunPresentation,'status' | 'engineStatus'>> = {
  accepted: { shortLabel: 'Accepted',label: 'Admission accepted',description: 'Waiting for scheduler dispatch.' },
  queued: { shortLabel: 'Queued',label: 'Queued run',description: 'Waiting for an admission slot.' },
  running: { shortLabel: 'Running',label: 'Running now',description: 'Workflow tasks are executing.' },
  waiting: { shortLabel: 'Waiting',label: 'Waiting run',description: 'Suspended until a durable event resumes it.' },
  stopping: { shortLabel: 'Stopping',label: 'Stopping run',description: 'Stop has been requested and is being reconciled.' },
  succeeded: { shortLabel: 'Succeeded',label: 'Succeeded run',description: 'Execution completed successfully.' },
  failed: { shortLabel: 'Failed',label: 'Failed run',description: 'Execution completed with an error.' },
  canceled: { shortLabel: 'Canceled',label: 'Canceled run',description: 'Execution was canceled.' },
  stopped: { shortLabel: 'Stopped',label: 'Stopped run',description: 'Execution was stopped by an explicit operator request.' },
  rejected: { shortLabel: 'Rejected',label: 'Rejected run',description: 'Admission policy rejected this invocation.' },
};

export function automationRunPresentation(
  run: Pick<AutomationRun,'id' | 'status'>,
  detail?: Pick<AutomationRunDetail,'run' | 'relations'>,
): AutomationRunPresentation {
  if (run.status === 'waiting' && detail?.run?.id === run.id && detail.relations?.runtimes.some(
    (runtime) => runtime.relation === 'supervised' && runtime.state === 'active',
  )) {
    return {
      status: 'active',shortLabel: 'Active',label: 'Active supervised runtime',
      description: 'The workflow started its supervised runtime successfully and remains active until stopped.',
      engineStatus: run.status,
    };
  }
  return { status: run.status,...RUN_PHASES[run.status],engineStatus: run.status };
}

export function automationRunPhase(status: AutomationRunStatus) {
  return { status,...RUN_PHASES[status],engineStatus: status } satisfies AutomationRunPresentation;
}

export function activeSupervisedRuntimeNodeIds(detail?: AutomationRunDetail) {
  if (!detail?.relations) return [];
  const nodeByInvocation = new Map(detail.invocations.map((invocation) => [invocation.id,invocation.nodeId]));
  return [...new Set(detail.relations.runtimes.flatMap((runtime) => (
    runtime.relation === 'supervised' && runtime.state === 'active'
      ? [nodeByInvocation.get(runtime.invocationId)]
      : []
  )).filter((nodeId): nodeId is string => Boolean(nodeId)))];
}

export function activeWorkflowRuntimeNodeIds(
  run: Pick<AutomationRun,'id' | 'status'> | undefined,
  detail: AutomationRunDetail | undefined,
  definition: Pick<AutomationSpec,'nodes'>,
  processInstances: readonly ProcessInstance[],
) {
  const activeNodeIds = new Set(activeSupervisedRuntimeNodeIds(detail));
  if (!run || !isAutomationRunActive(run)) return [...activeNodeIds];

  const runtimesByBackendId = new Map(detail?.relations?.runtimes
    .filter((runtime) => runtime.backendKind === 'process-instance')
    .map((runtime) => [runtime.backendId,runtime]));
  const candidatesByDefinitionId = new Map<string,string[]>();
  for (const node of definition.nodes) {
    if (node.kind !== 'process.run-definition' || node.parameters.runtimeLifecycle !== 'supervised') continue;
    const definitionId = typeof node.parameters.definitionId === 'string' ? node.parameters.definitionId : '';
    if (!definitionId) continue;
    candidatesByDefinitionId.set(definitionId,[...(candidatesByDefinitionId.get(definitionId) ?? []),node.id]);
  }

  for (const instance of processInstances) {
    if (instance.ownerType !== 'orchestration-run' || instance.ownerId !== run.id ||
      instance.desiredState !== 'running' || (instance.observedState !== 'starting' && instance.observedState !== 'running')) continue;
    // A returned relation is authoritative, including an explicit release. The
    // process fact is only a fallback while the independently-read relation
    // ledger has not caught up yet.
    if (runtimesByBackendId.has(instance.id)) continue;
    const candidates = candidatesByDefinitionId.get(instance.definitionId) ?? [];
    if (candidates.length === 1) activeNodeIds.add(candidates[0]);
  }
  return [...activeNodeIds];
}

export function isAutomationRunActive(run: Pick<AutomationRun,'status'>) {
  return run.status === 'accepted'
    || run.status === 'queued'
    || run.status === 'running'
    || run.status === 'waiting'
    || run.status === 'stopping';
}
