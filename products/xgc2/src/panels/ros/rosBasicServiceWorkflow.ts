import {
  automationActionById,
  automationActionWorkNodes,
  type AutomationSpec,
} from '../../domains/automation/automationPublic';
import type { RosBasicServiceId } from './rosBasicServicesPanelModel';

export type RosBasicServiceWorkflowCall = {
  nodeId:string;
  automationResourceId:string;
  actionId:string;
};

/** Resolve a service Action to its unique reachable child Automation call. */
export function resolveRosBasicServiceWorkflowCall(
  spec:AutomationSpec,
  panelActionId:RosBasicServiceId,
):RosBasicServiceWorkflowCall|undefined {
  const action = automationActionById(spec,panelActionId);
  if (!action) return undefined;
  const reachableIds = reachableNodeIds(spec,action.entryNodeId);
  const callNodeIds = new Set(automationActionWorkNodes(spec,action)
    .filter((node) => reachableIds.has(node.id) && node.kind === 'automation.call')
    .map((node) => node.id));
  if (callNodeIds.size !== 1) return undefined;
  const call = spec.nodes.find((node) => callNodeIds.has(node.id) && node.kind === 'automation.call');
  if (!call) return undefined;
  const automationId = call.parameters.automationId;
  const actionId = call.parameters.actionId;
  if (typeof automationId !== 'string' || !automationId.trim()
    || typeof actionId !== 'string' || !actionId.trim()) return undefined;
  return { nodeId:call.id,automationResourceId:automationId,actionId };
}

function reachableNodeIds(spec:AutomationSpec,entryNodeId:string) {
  const outgoing = new Map<string,string[]>();
  for (const edge of spec.edges) {
    outgoing.set(edge.from,[...(outgoing.get(edge.from) ?? []),edge.to]);
  }
  const reachable = new Set<string>();
  const pending = [entryNodeId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    pending.push(...outgoing.get(nodeId) ?? []);
  }
  return reachable;
}
