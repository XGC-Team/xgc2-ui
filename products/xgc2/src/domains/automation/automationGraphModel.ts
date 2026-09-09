import { MarkerType,type Node } from '@xyflow/react';
import type {
  AutomationEdge,
  AutomationNode,
  AutomationNodeCatalogEntry,
  AutomationStickyNote,
} from './automationDefinitionContracts';
import type {
  AutomationNodeExecutionSummary,
  AutomationNodeOccurrenceAggregate,
} from './automationExecutionContracts';
import { AUTOMATION_GRAPH_NODE_WIDTH,AUTOMATION_LAYOUT_COLUMN_GAP,automationGraphNodeHeight,tidyAutomationGraphPositions,type AutomationGraphPositions } from './automationGraphLayout';
import type { GraphCanvasNodeData,GraphEdge,GraphNodeRuntimeFact,GraphPoint } from './automationGraphTypes';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';

export const STICKY_NOTE_NODE_PREFIX = 'sticky-note:';

export function graphHasCycle(nodes: AutomationNode[], edges: AutomationEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id,0]));
  const outgoing = new Map<string,string[]>();
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []),edge.to]);
  }
  const queue = [...indegree].filter(([,count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    visited += 1;
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return visited !== nodes.length;
}

export function automationTopologicalOrder(nodes: AutomationNode[], edges: AutomationEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id,0]));
  const outgoing = new Map<string,string[]>();
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []),edge.to]);
  }
  const queue = [...indegree].filter(([,count]) => count === 0).map(([id]) => id).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }
  return order;
}

export function graphNodes(
  definitions: AutomationNode[],
  edges: AutomationEdge[],
  stickyNotes: AutomationStickyNote[],
  catalog: AutomationNodeCatalogEntry[],
  nodeSummaries: AutomationNodeExecutionSummary[],
  nodeAggregates: Record<string,AutomationNodeOccurrenceAggregate>,
  activeRuntimeNodeIds: readonly string[],
  selectedNodeId?: string,
  positions: AutomationGraphPositions = {},
  editable = false,
  hoveredNodeId = '',
  onNodeHover: (id: string, active: boolean) => void = () => undefined,
  onNodeOpen: (id: string) => void = () => undefined,
  canRunToNode = false,
  onNodeRunTo?: (id: string) => void,
  onNodeDisplayNameChange: (id: string, displayName: string) => void = () => undefined,
  onNodeDuplicate: (id: string) => void = () => undefined,
  onNodesDelete: (ids: string[]) => void = () => undefined,
  onOutputAdd: (id: string, sourcePort: string, position: GraphPoint) => void = () => undefined,
  onStickyNoteChange: (id: string, patch: Partial<Omit<AutomationStickyNote,'id'>>) => void = () => undefined,
  onStickyNoteDelete: (id: string) => void = () => undefined,
  nodeComposition?: AutomationNodeWebComposition,
  nodeRuntimeFacts: Record<string,GraphNodeRuntimeFact> = {},
): Array<Node<GraphCanvasNodeData>> {
  const tidyPositions = tidyAutomationGraphPositions(definitions, edges, catalog);
  const statuses = new Map(nodeSummaries.map((node) => [node.nodeId,node.status]));
  const activeRuntimeNodes = new Set(activeRuntimeNodeIds);
  const catalogByKind = new Map(catalog.map((entry) => [entry.kind,entry]));
  const catalogByKindAndVersion = new Map(catalog.map((entry) => [`${entry.kind}@${entry.typeVersion}`,entry]));

  const executionNodes: Array<Node<GraphCanvasNodeData>> = definitions.map((definition) => {
    const catalogEntry = catalogByKindAndVersion.get(`${definition.kind}@${definition.typeVersion}`)
      ?? catalogByKind.get(definition.kind);
    const initialHeight = automationGraphNodeHeight(definition, catalogEntry, edges);
    const position = positions[definition.id] ?? tidyPositions[definition.id];
    const connectedOutputPorts = edges
      .filter((edge) => edge.from === definition.id)
      .map(graphEdgeSourceHandle);
    return {
      id: definition.id,
      type: 'automation',
      position,
      initialWidth: AUTOMATION_GRAPH_NODE_WIDTH,
      initialHeight,
      zIndex: 1,
      selected: definition.id === selectedNodeId,
      data: {
        canvasKind: 'automation' as const,
        definition,
        catalog: catalogEntry,
        nodeComposition,
        status: statuses.get(definition.id),
        ...(activeRuntimeNodes.has(definition.id) ? { runtimeState: 'active' as const } : {}),
        ...(nodeRuntimeFacts[definition.id] ? { runtimeFact: nodeRuntimeFacts[definition.id] } : {}),
        occurrence: nodeAggregates[definition.id],
        selected: definition.id === selectedNodeId,
        editable,
        hovered: definition.id === hoveredNodeId,
        onHover: onNodeHover,
        onOpen: onNodeOpen,
        canRunToNode,
        onRunToNode: onNodeRunTo,
        onDisplayNameChange: onNodeDisplayNameChange,
        onDuplicate: onNodeDuplicate,
        onDelete: (id: string) => onNodesDelete([id]),
        connectedOutputPorts,
        outputAddPosition: { x: position.x + AUTOMATION_LAYOUT_COLUMN_GAP,y: position.y },
        onOutputAdd,
      },
    };
  });
  const noteNodes: Array<Node<GraphCanvasNodeData>> = stickyNotes.map((note) => ({
    id: `${STICKY_NOTE_NODE_PREFIX}${note.id}`,
    type: 'stickyNote',
    position: note.position,
    style: { width: note.width,height: note.height },
    connectable: false,
    zIndex: 0,
    data: { canvasKind: 'sticky-note' as const,note,editable,onChange: onStickyNoteChange,onDelete: onStickyNoteDelete },
  }));
  return [...noteNodes,...executionNodes];
}

function graphEdgeSourceHandle(edge: Pick<AutomationEdge,'sourcePort' | 'route'>) {
  return edge.sourcePort || edge.route || 'main';
}

export function reconcileGraphNodes(
  currentNodes: Array<Node<GraphCanvasNodeData>>,
  nextNodes: Array<Node<GraphCanvasNodeData>>,
  controlledSelectionChanged: boolean,
) {
  const currentByID = new Map(currentNodes.map((node) => [node.id,node]));
  return nextNodes.map((nextNode) => {
    const currentNode = currentByID.get(nextNode.id);
    if (!currentNode) return nextNode;
    const interacting = Boolean(currentNode.dragging || currentNode.resizing);
    return {
      ...nextNode,
      position: interacting ? currentNode.position : nextNode.position,
      dragging: currentNode.dragging,
      resizing: currentNode.resizing,
      measured: currentNode.measured,
      ...(interacting ? { width: currentNode.width,height: currentNode.height } : {}),
      selected: controlledSelectionChanged ? nextNode.selected : currentNode.selected,
    };
  });
}

export function graphEdges(
  definitions: AutomationEdge[],
  selectedEdgeId = '',
  editable = false,
  hoveredEdgeId = '',
  onEdgeHover: (id: string, active: boolean) => void = () => undefined,
  onEdgeInsert: (id: string, position: GraphPoint) => void = () => undefined,
  onEdgesDelete: (ids: string[]) => void = () => undefined,
  nodeSummaries: AutomationNodeExecutionSummary[] = [],
  routes: Record<string,GraphPoint[]> = {},
): GraphEdge[] {
  const nodeStatuses = new Map(nodeSummaries.map((node) => [node.nodeId,node.status]));
  return definitions.map((edge) => {
    const condition = edge.condition ?? 'success';
    const sourceStatus = nodeStatuses.get(edge.from);
    const targetStatus = nodeStatuses.get(edge.to);
    const runSucceeded = sourceStatus === 'succeeded' && targetStatus === 'succeeded';
    // Named routes are labelled at their source handle, including inferred ports.
    const label = condition === 'success' ? '' : condition;
    return {
      id: edge.id,
      type: 'automation',
      source: edge.from,
      target: edge.to,
      sourceHandle: edge.sourcePort || edge.route || undefined,
      label: label || undefined,
      className: 'automation-graph-edge',
      animated: false,
      interactionWidth: 40,
      markerEnd: { type: MarkerType.ArrowClosed,color: edge.id === selectedEdgeId ? 'var(--color-accent)' : runSucceeded ? 'var(--color-text-muted)' : 'var(--color-border-strong)' },
      selected: edge.id === selectedEdgeId,
      data: {
        condition,
        runSucceeded,
        selected: edge.id === selectedEdgeId,
        route: edge.route,
        routePoints: routes[edge.id],
        editable,
        hovered: edge.id === hoveredEdgeId,
        onHover: onEdgeHover,
        onInsert: onEdgeInsert,
        onDelete: (id: string) => onEdgesDelete([id]),
      },
    };
  });
}

export function edgeLabelTransform(labelX: number, labelY: number) {
  return `translate(-50%, 0) translate(${labelX}px, ${labelY + 8}px)`;
}
