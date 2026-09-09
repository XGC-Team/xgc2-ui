import { WorkflowCanvas, type WorkflowCanvasApi } from '@xgc2/ui-workflow';
import type { Node } from '@xyflow/react';
import '../../styles/automation-graph.css';
import { useAutomationCanvasText } from './automationCanvasMessages';
import { AutomationCanvasControls } from './AutomationCanvasControls';
import type { AutomationStickyNote } from './automationDefinitionContracts';
import type {
  AutomationNodeExecutionSummary,
  AutomationNodeOccurrenceAggregate,
} from './automationExecutionContracts';
import { AutomationGraphEdge } from './AutomationGraphEdge';
import { tidyAutomationGraphPositions,type AutomationGraphPositions } from './automationGraphLayout';
import { AutomationGraphNode } from './AutomationGraphNode';
import { AutomationStickyNoteNode } from './AutomationStickyNoteNode';
import type { AutomationGraphProps,GraphCanvasNodeData,GraphEdge,GraphNodeRuntimeFact } from './automationGraphTypes';
import { useAutomationGraphInteraction } from './useAutomationGraphInteraction';

const AUTOMATION_NODE_TYPES = { automation: AutomationGraphNode,stickyNote: AutomationStickyNoteNode };
const AUTOMATION_EDGE_TYPES = { automation: AutomationGraphEdge };
const AUTOMATION_SNAP_GRID: [number,number] = [18,18];

const EMPTY_STICKY_NOTES: AutomationStickyNote[] = [];
const EMPTY_NODE_SUMMARIES: AutomationNodeExecutionSummary[] = [];
const EMPTY_NODE_AGGREGATES: Record<string,AutomationNodeOccurrenceAggregate> = {};
const EMPTY_NODE_RUNTIME_FACTS: Record<string,GraphNodeRuntimeFact> = {};
const EMPTY_ACTIVE_RUNTIME_NODE_IDS: readonly string[] = [];
const EMPTY_POSITIONS: AutomationGraphPositions = {};

export function AutomationGraph({
  definition,
  catalog,
  nodeComposition,
  nodeSummaries = EMPTY_NODE_SUMMARIES,
  nodeAggregates = EMPTY_NODE_AGGREGATES,
  nodeRuntimeFacts = EMPTY_NODE_RUNTIME_FACTS,
  activeRuntimeNodeIds = EMPTY_ACTIVE_RUNTIME_NODE_IDS,
  selectedNodeId,
  selectedEdgeId,
  editable = false,
  autoLayout = false,
  onNodeSelect,
  onNodeOpen,
  canRunToNode = false,
  onNodeRunTo,
  onNodeDisplayNameChange,
  onNodeDuplicate,
  onEdgeSelect,
  onEdgeInsert,
  onOutputAdd,
  onSelectionChange,
  onSelectionClear,
  onConnect,
  positions = EMPTY_POSITIONS,
  onNodePositionChange,
  onReady,
  onLibraryDrop,
  onViewportChange,
  onTidyUp,
  onOpenLibrary,
  onAddStickyNote,
  onStickyNoteChange,
  onStickyNoteDelete,
  onElementsDelete,
  libraryOpen = false,
  controlsId = 'canvas',
  onNodesDelete,
  onEdgesDelete,
}: AutomationGraphProps) {
  const t = useAutomationCanvasText();
  const stickyNotes = definition.stickyNotes ?? EMPTY_STICKY_NOTES;
  const interaction = useAutomationGraphInteraction({
    definitions: definition.nodes,
    edgeDefinitions: definition.edges,
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
  });

  function tidyGraph(api: WorkflowCanvasApi<Node<GraphCanvasNodeData>, GraphEdge>) {
    if (!editable || !onTidyUp || definition.nodes.length < 2) return;
    onTidyUp(tidyAutomationGraphPositions(definition.nodes, definition.edges, catalog));
    requestAnimationFrame(api.fitView);
  }

  return (
    <WorkflowCanvas<Node<GraphCanvasNodeData>, GraphEdge>
      className="automation-graph"
      containerProps={{ 'data-xgc-layout': autoLayout ? 'automatic' : 'persisted' }}
      controls={(api) => (
        <AutomationCanvasControls
          onAdd={onOpenLibrary ?? noop}
          onAddStickyNote={onAddStickyNote ?? noop}
          onZoomToFit={api.fitView}
          onZoomIn={api.zoomIn}
          onZoomOut={api.zoomOut}
          onTidyUp={() => tidyGraph(api)}
          addDisabled={!editable || !onOpenLibrary}
          stickyNoteDisabled={!editable || !onAddStickyNote}
          tidyDisabled={!editable || !onTidyUp || definition.nodes.length < 2}
          libraryOpen={libraryOpen}
          controlsId={controlsId}
        />
      )}
      dataXgcRole="automation-graph" dataXgcId="automation-graph"
      drop={editable && onLibraryDrop ? {
        dataType: 'text/xgc-automation-node-library-item',
        onDrop: (libraryItemId, position) => onLibraryDrop(libraryItemId, position),
      } : undefined}
      editable={editable}
      edges={interaction.edges}
      edgeTypes={AUTOMATION_EDGE_TYPES}
      elementsSelectable={editable || Boolean(onNodeSelect || onEdgeSelect || onSelectionChange)}
      empty={<span className="automation-graph-empty" data-xgc-role="automation-graph-empty" data-xgc-id="automation-graph-empty">{t('Add a trusted node type from the catalog to build this automation.')}</span>}
      emptyWhen={definition.nodes.length === 0}
      nodes={interaction.nodes}
      nodeTypes={AUTOMATION_NODE_TYPES}
      onReady={onReady}
      snapGrid={AUTOMATION_SNAP_GRID}
      onNodeClick={interaction.handleNodeClick}
      onNodeDoubleClick={interaction.handleNodeDoubleClick}
      onNodeMouseEnter={(_event,node) => node.data.canvasKind === 'automation' && interaction.setNodeHover(node.id, true)}
      onNodeMouseLeave={(_event,node) => node.data.canvasKind === 'automation' && interaction.setNodeHover(node.id, false)}
      onEdgeClick={(_event,edge) => onEdgeSelect?.(edge.id)}
      onEdgeMouseEnter={(_event,edge) => interaction.setEdgeHover(edge.id, true)}
      onEdgeMouseLeave={(_event,edge) => interaction.setEdgeHover(edge.id, false)}
      onPaneClick={onSelectionClear}
      onSelectionChange={interaction.handleSelectionChange}
      onSelectionStart={onSelectionClear}
      onConnect={interaction.handleConnect}
      onDelete={interaction.handleElementsDelete}
      onMoveEnd={interaction.handleMoveEnd}
      onNodesChange={interaction.handleNodesChange}
    />
  );
}

function noop() {}
