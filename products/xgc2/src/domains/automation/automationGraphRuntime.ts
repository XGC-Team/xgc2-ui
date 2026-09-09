import type {
  AutomationNodeExecutionSummary,
  AutomationRunDetail,
} from './automationExecutionContracts';
import type { GraphNodeRuntimeFact } from './automationGraphTypes';

export type AutomationGraphRuntimeProjection = {
  nodeRuntimeFacts: Record<string,GraphNodeRuntimeFact>;
  activeRuntimeNodeIds: string[];
};

/**
 * Projects a Run execution ledger onto the shared graph runtime contract.
 * Engine completion and a still-live supervised runtime are separate facts.
 * The graph keeps the active runtime readable even after its launch succeeds.
 */
export function projectAutomationGraphRuntime(
  detail?: Pick<AutomationRunDetail,'nodeSummaries' | 'invocations' | 'relations'>,
): AutomationGraphRuntimeProjection {
  const nodeSummaries = detail?.nodeSummaries ?? [];
  return {
    nodeRuntimeFacts: Object.fromEntries(nodeSummaries.map((summary) => [
      summary.nodeId,
      { status: automationGraphOperatorStatus(summary.status) },
    ])),
    activeRuntimeNodeIds: activeAutomationGraphNodeIds(detail,nodeSummaries),
  };
}

export function automationGraphOperatorStatus(status: AutomationNodeExecutionSummary['status']) {
  if (status === 'failed') return 'failing';
  if (status === 'succeeded' || status === 'compensated') return 'passing';
  if (status === 'canceled' || status === 'compensating') return 'stopping';
  if (status === 'running' || status === 'waiting') return 'running';
  return 'idle';
}

function activeAutomationGraphNodeIds(
  detail: Pick<AutomationRunDetail,'invocations' | 'relations'> | undefined,
  summaries: readonly AutomationNodeExecutionSummary[],
): string[] {
  const active = new Set(summaries.flatMap((summary) => (
    summary.status === 'running' || summary.status === 'waiting' || summary.status === 'compensating'
      ? [summary.nodeId]
      : []
  )));
  const nodeByInvocation = new Map(detail?.invocations.map((invocation) => [invocation.id,invocation.nodeId]) ?? []);
  detail?.relations?.runtimes.forEach((relation) => {
    if (relation.state !== 'active') return;
    const nodeId = nodeByInvocation.get(relation.invocationId);
    if (nodeId) active.add(nodeId);
  });
  detail?.relations?.childRuns.forEach((relation) => {
    if (!relation.boundAt || relation.launchAbandonedAt) return;
    const nodeId = nodeByInvocation.get(relation.parentInvocationId);
    if (nodeId) active.add(nodeId);
  });
  return [...active];
}
