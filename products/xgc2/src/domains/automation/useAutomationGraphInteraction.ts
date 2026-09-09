import {
  useNodesState,
  type Connection,
  type Node,
  type NodeMouseHandler,
  type NodePositionChange,
  type OnNodesChange,
  type Viewport,
} from '@xyflow/react';
import { useCallback,useEffect,useMemo,useRef } from 'react';
import { useDelayedHover } from '../../hooks/useDelayedHover';
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
import type { AutomationGraphPositions } from './automationGraphLayout';
import { graphEdges,graphNodes,reconcileGraphNodes,STICKY_NOTE_NODE_PREFIX } from './automationGraphModel';
import { automationGraphRoutes } from './automationGraphRouting';
import type { AutomationGraphSelection,GraphCanvasNodeData,GraphEdge,GraphNodeRuntimeFact,GraphPoint,StickyNoteNodeData } from './automationGraphTypes';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';

export function useAutomationGraphInteraction({
  definitions,
  edgeDefinitions,
  stickyNotes,
  catalog,
  nodeComposition,
  nodeSummaries,
  nodeAggregates,
  nodeRuntimeFacts,
  activeRuntimeNodeIds,
  selectedNodeId,
  selectedEdgeId,
  editable,
  autoLayout,
  positions,
  canRunToNode,
  onNodeSelect,
  onNodeOpen,
  onNodeRunTo,
  onNodeDisplayNameChange,
  onNodeDuplicate,
  onEdgeSelect,
  onEdgeInsert,
  onOutputAdd,
  onSelectionChange,
  onConnect,
  onNodePositionChange,
  onStickyNoteChange,
  onStickyNoteDelete,
  onElementsDelete,
  onNodesDelete,
  onEdgesDelete,
  onViewportChange,
}: {
  definitions: AutomationNode[];
  edgeDefinitions: AutomationEdge[];
  stickyNotes: AutomationStickyNote[];
  catalog: AutomationNodeCatalogEntry[];
  nodeComposition?: AutomationNodeWebComposition;
  nodeSummaries: AutomationNodeExecutionSummary[];
  nodeAggregates: Record<string,AutomationNodeOccurrenceAggregate>;
  nodeRuntimeFacts: Record<string,GraphNodeRuntimeFact>;
  activeRuntimeNodeIds: readonly string[];
  selectedNodeId?: string;
  selectedEdgeId?: string;
  editable: boolean;
  autoLayout: boolean;
  positions: AutomationGraphPositions;
  canRunToNode: boolean;
  onNodeSelect?: (id: string) => void;
  onNodeOpen?: (id: string) => void;
  onNodeRunTo?: (id: string) => void;
  onNodeDisplayNameChange?: (id: string, displayName: string) => void;
  onNodeDuplicate?: (id: string) => void;
  onEdgeSelect?: (id: string) => void;
  onEdgeInsert?: (id: string, position: GraphPoint) => void;
  onOutputAdd?: (id: string, sourcePort: string, position: GraphPoint) => void;
  onSelectionChange?: (selection: AutomationGraphSelection) => void;
  onConnect?: (from: string, to: string, sourcePort?: string) => void;
  onNodePositionChange?: (id: string, position: GraphPoint) => void;
  onStickyNoteChange?: (id: string, patch: Partial<Omit<AutomationStickyNote,'id'>>) => void;
  onStickyNoteDelete?: (id: string) => void;
  onElementsDelete?: (selection: AutomationGraphSelection) => void;
  onNodesDelete?: (ids: string[]) => void;
  onEdgesDelete?: (ids: string[]) => void;
  onViewportChange?: (viewport: Viewport) => void;
}) {
  const [hoveredNodeId,setNodeHover] = useDelayedHover(180);
  const [hoveredEdgeId,setEdgeHover] = useDelayedHover(600);
  const actionsRef = useRef({
    onNodeOpen,onNodeRunTo,onNodeDisplayNameChange,onNodeDuplicate,onNodesDelete,
    onStickyNoteChange,onStickyNoteDelete,onNodePositionChange,onEdgeInsert,
    onOutputAdd,onEdgesDelete,onConnect,onElementsDelete,onViewportChange,
  });
  actionsRef.current = {
    onNodeOpen,onNodeRunTo,onNodeDisplayNameChange,onNodeDuplicate,onNodesDelete,
    onStickyNoteChange,onStickyNoteDelete,onNodePositionChange,onEdgeInsert,
    onOutputAdd,onEdgesDelete,onConnect,onElementsDelete,onViewportChange,
  };
  const openGraphNode = useCallback((id: string) => actionsRef.current.onNodeOpen?.(id), []);
  const runToGraphNode = useCallback((id: string) => actionsRef.current.onNodeRunTo?.(id), []);
  const renameGraphNode = useCallback((id: string, displayName: string) => actionsRef.current.onNodeDisplayNameChange?.(id, displayName), []);
  const duplicateGraphNode = useCallback((id: string) => actionsRef.current.onNodeDuplicate?.(id), []);
  const deleteGraphNodes = useCallback((ids: string[]) => actionsRef.current.onNodesDelete?.(ids), []);
  const changeGraphStickyNote = useCallback((id: string, patch: Partial<Omit<AutomationStickyNote,'id'>>) => actionsRef.current.onStickyNoteChange?.(id, patch), []);
  const deleteGraphStickyNote = useCallback((id: string) => actionsRef.current.onStickyNoteDelete?.(id), []);
  const insertGraphEdge = useCallback((id: string, position: GraphPoint) => actionsRef.current.onEdgeInsert?.(id, position), []);
  const addFromGraphOutput = useCallback((id: string, sourcePort: string, position: GraphPoint) => actionsRef.current.onOutputAdd?.(id, sourcePort, position), []);
  const deleteGraphEdges = useCallback((ids: string[]) => actionsRef.current.onEdgesDelete?.(ids), []);
  const computedNodes = useMemo(
    () => graphNodes(
      definitions,
      edgeDefinitions,
      stickyNotes,
      catalog,
      nodeSummaries,
      nodeAggregates,
      activeRuntimeNodeIds,
      selectedNodeId,
      autoLayout ? {} : positions,
      editable,
      hoveredNodeId,
      setNodeHover,
      openGraphNode,
      canRunToNode,
      onNodeRunTo ? runToGraphNode : undefined,
      renameGraphNode,
      duplicateGraphNode,
      deleteGraphNodes,
      addFromGraphOutput,
      changeGraphStickyNote,
      deleteGraphStickyNote,
      nodeComposition,
      nodeRuntimeFacts,
    ),
    [activeRuntimeNodeIds,addFromGraphOutput,autoLayout,canRunToNode,catalog,changeGraphStickyNote,definitions,deleteGraphNodes,deleteGraphStickyNote,duplicateGraphNode,edgeDefinitions,editable,hoveredNodeId,nodeAggregates,nodeComposition,nodeRuntimeFacts,nodeSummaries,onNodeRunTo,openGraphNode,positions,renameGraphNode,runToGraphNode,selectedNodeId,setNodeHover,stickyNotes],
  );
  const [nodes,setNodes,applyNodeChanges] = useNodesState<Node<GraphCanvasNodeData>>(computedNodes);
  const routes = useMemo(() => automationGraphRoutes(nodes,edgeDefinitions),[nodes,edgeDefinitions]);
  const edges = useMemo(
    () => graphEdges(edgeDefinitions, selectedEdgeId, editable, hoveredEdgeId, setEdgeHover, insertGraphEdge, deleteGraphEdges, nodeSummaries,routes),
    [deleteGraphEdges,editable,edgeDefinitions,hoveredEdgeId,insertGraphEdge,nodeSummaries,routes,selectedEdgeId,setEdgeHover],
  );
  const selectionRef = useRef({ selectedNodeId,selectedEdgeId,onNodeSelect,onEdgeSelect,onSelectionChange });
  selectionRef.current = { selectedNodeId,selectedEdgeId,onNodeSelect,onEdgeSelect,onSelectionChange };
  const reconciledSelectionRef = useRef({ selectedNodeId,selectedEdgeId });

  const handleNodeClick: NodeMouseHandler<Node<GraphCanvasNodeData>> = (_event,node) => {
    if (node.data.canvasKind === 'automation') onNodeSelect?.(node.id);
  };
  const handleNodeDoubleClick: NodeMouseHandler<Node<GraphCanvasNodeData>> = (_event,node) => {
    if (node.data.canvasKind === 'automation') onNodeOpen?.(node.id);
  };
  const handleSelectionChange = useCallback(({ nodes: selectedNodes,edges: selectedEdges }: {
    nodes: Array<Node<GraphCanvasNodeData>>;
    edges: GraphEdge[];
  }) => {
    const selection = selectionRef.current;
    const automationNodes = selectedNodes.filter((node) => node.data.canvasKind === 'automation');
    selection.onSelectionChange?.({
      nodeIds: automationNodes.map((node) => node.id),
      edgeIds: selectedEdges.map((edge) => edge.id),
      stickyNoteIds: selectedNodes
        .filter((node) => node.data.canvasKind === 'sticky-note')
        .map((node) => (node.data as StickyNoteNodeData).note.id),
    });
    if (selectedNodes.length === 1 && automationNodes.length === 1 && selectedEdges.length === 0) {
      if (automationNodes[0].id !== selection.selectedNodeId) selection.onNodeSelect?.(automationNodes[0].id);
    } else if (selectedNodes.length === 0 && selectedEdges.length === 1) {
      if (selectedEdges[0].id !== selection.selectedEdgeId) selection.onEdgeSelect?.(selectedEdges[0].id);
    }
  }, []);
  const handleNodesChange = useCallback<OnNodesChange<Node<GraphCanvasNodeData>>>((changes) => {
    applyNodeChanges(changes);
    changes.forEach((change) => {
      if (change.type !== 'position' || !change.position || change.dragging) return;
      const positionChange = change as NodePositionChange;
      if (positionChange.id.startsWith(STICKY_NOTE_NODE_PREFIX)) {
        actionsRef.current.onStickyNoteChange?.(
          positionChange.id.slice(STICKY_NOTE_NODE_PREFIX.length),
          { position: positionChange.position! },
        );
      } else {
        actionsRef.current.onNodePositionChange?.(positionChange.id, positionChange.position!);
      }
    });
  }, [applyNodeChanges]);
  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) actionsRef.current.onConnect?.(connection.source, connection.target, connection.sourceHandle ?? undefined);
  }, []);
  const handleElementsDelete = useCallback(({ nodes: deletedNodes,edges: deletedEdges }: {
    nodes: Array<Node<GraphCanvasNodeData>>;
    edges: GraphEdge[];
  }) => actionsRef.current.onElementsDelete?.({
    nodeIds: deletedNodes.filter((node) => node.data.canvasKind === 'automation').map((node) => node.id),
    edgeIds: deletedEdges.map((edge) => edge.id),
    stickyNoteIds: deletedNodes
      .filter((node) => node.data.canvasKind === 'sticky-note')
      .map((node) => (node.data as StickyNoteNodeData).note.id),
  }), []);
  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null,viewport: Viewport) => {
    actionsRef.current.onViewportChange?.(viewport);
  }, []);

  useEffect(() => {
    const controlledSelectionChanged = (
      reconciledSelectionRef.current.selectedNodeId !== selectedNodeId
      || reconciledSelectionRef.current.selectedEdgeId !== selectedEdgeId
    );
    reconciledSelectionRef.current = { selectedNodeId,selectedEdgeId };
    setNodes((currentNodes) => reconcileGraphNodes(currentNodes, computedNodes, controlledSelectionChanged));
  }, [computedNodes,selectedEdgeId,selectedNodeId,setNodes]);

  return {
    edges,
    handleConnect,
    handleElementsDelete,
    handleMoveEnd,
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodesChange,
    handleSelectionChange,
    nodes,
    setEdgeHover,
    setNodeHover,
  };
}
