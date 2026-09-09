import { AUTOMATION_RETURN_KIND } from './automationDefinitionContracts';
import type {
  AutomationEdge,
  AutomationNode,
  AutomationSpec,
} from './automationDefinitionContracts';
import { automationTopologicalOrder } from './automationGraphModel';
import {
  automationNodeGraphSemanticsFromComposition,
  type AutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';

export function validateCalledAutomationReturnPaths(
  trigger: AutomationNode,
  returnNode: AutomationNode,
  spec: AutomationSpec,
  nodeComposition?: AutomationNodeWebComposition,
) {
  const successfulTerminalDescription = [
    'Return',
    ...(nodeComposition?.contributions.flatMap((contribution) => (
      contribution.graphSemantics?.terminalLabel
        ? [contribution.graphSemantics.terminalLabel]
        : []
    )) ?? []),
  ].join(' or ');
  const incoming = new Map<string,AutomationEdge[]>();
  const outgoing = new Map<string,AutomationEdge[]>();
  for (const edge of spec.edges) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []),edge]);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []),edge]);
  }

  const reachable = new Set([trigger.id]);
  const pending = [trigger.id];
  while (pending.length) {
    const nodeID = pending.shift()!;
    for (const edge of outgoing.get(nodeID) ?? []) {
      if (reachable.has(edge.to)) continue;
      reachable.add(edge.to);
      pending.push(edge.to);
    }
  }
  const returnInputs = (incoming.get(returnNode.id) ?? []).filter((edge) => reachable.has(edge.from));
  if (returnInputs.length === 0) {
    return `Return node ${returnNode.id} must have at least one input.`;
  }

  for (const node of spec.nodes) {
    if (!reachable.has(node.id)) continue;
    const semantics = automationNodeGraphSemanticsFromComposition(
      nodeComposition,node.kind,node.typeVersion,
    );
    if (node.kind === AUTOMATION_RETURN_KIND || semantics?.terminalLabel) continue;
    const continuations = calledAutomationSuccessContinuations(outgoing.get(node.id) ?? []);
    if (continuations.length === 0) {
      return `Called Automation successful path ends at node ${node.id} instead of Return.`;
    }
    for (const route of semantics?.calledSuccessRoutes?.(node) ?? []) {
      if (!calledAutomationRouteContinues(route, continuations)) {
        return `Called Automation node ${node.id} route "${route || 'empty'}" does not converge on ${successfulTerminalDescription}.`;
      }
    }
  }

  const constraints = new Map<string,Map<string,string>>();
  for (const nodeID of automationTopologicalOrder(spec.nodes, spec.edges)) {
    if (!reachable.has(nodeID)) continue;
    const combined = new Map<string,string>();
    for (const edge of (incoming.get(nodeID) ?? []).filter((candidate) => reachable.has(candidate.from))) {
      const contribution = calledAutomationEdgeConstraints(edge, constraints.get(edge.from));
      for (const [key,value] of contribution) {
        const existing = combined.get(key);
        if (existing !== undefined && existing !== value) {
          return `Called Automation node ${nodeID} joins mutually exclusive branches from ${edge.from}; keep those branch continuations separate.`;
        }
        combined.set(key, value);
      }
    }
    constraints.set(nodeID, combined);
  }
  return '';
}
function calledAutomationSuccessContinuations(edges: AutomationEdge[]) {
  return edges.filter((edge) => edge.condition !== 'failure' && edge.sourcePort?.trim() !== 'error');
}

function calledAutomationRouteContinues(route: string, edges: AutomationEdge[]) {
  return edges.some((edge) => !edge.route?.trim() || edge.condition === 'always' || edge.route.trim() === route);
}

function calledAutomationEdgeConstraints(edge: AutomationEdge, source?: Map<string,string>) {
  if (edge.condition === 'always') return new Map<string,string>();
  const result = new Map(source ?? []);
  result.set(`status:${edge.from}`, edge.condition === 'failure' || edge.sourcePort?.trim() === 'error' ? 'failure' : 'success');
  const route = edge.route?.trim();
  if (route) result.set(`route:${edge.from}`, route);
  const sourcePort = edge.sourcePort?.trim();
  if (sourcePort) result.set(`port:${edge.from}`, sourcePort);
  return result;
}
