import type { Edge,Node,ReactFlowInstance,Viewport } from '@xyflow/react';
import type {
  AutomationEdge,
  AutomationNode,
  AutomationNodeCatalogEntry,
  AutomationSpec,
  AutomationStickyNote,
} from './automationDefinitionContracts';
import type {
  AutomationNodeExecutionSummary,
  AutomationNodeOccurrenceAggregate,
} from './automationExecutionContracts';
import type { AutomationGraphPositions } from './automationGraphLayout';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';

export type GraphPoint = { x: number;y: number };

export type GraphNodeRuntimeFact = {
  status: string;
  observed?: string;
  readiness?: string;
};

export type GraphNodeData = Record<string,unknown> & {
  canvasKind: 'automation';
  definition: AutomationNode;
  catalog?: AutomationNodeCatalogEntry;
  nodeComposition?: AutomationNodeWebComposition;
  status?: AutomationNodeExecutionSummary['status'];
  occurrence?: AutomationNodeOccurrenceAggregate;
  runtimeState?: 'active';
  runtimeFact?: GraphNodeRuntimeFact;
  selected: boolean;
  editable: boolean;
  hovered: boolean;
  onHover: (id: string, active: boolean) => void;
  onOpen: (id: string) => void;
  canRunToNode: boolean;
  onRunToNode?: (id: string) => void;
  onDisplayNameChange: (id: string, displayName: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  connectedOutputPorts: string[];
  outputAddPosition: GraphPoint;
  onOutputAdd: (id: string, sourcePort: string, position: GraphPoint) => void;
};

export type StickyNoteNodeData = Record<string,unknown> & {
  canvasKind: 'sticky-note';
  note: AutomationStickyNote;
  editable: boolean;
  onChange: (id: string, patch: Partial<Omit<AutomationStickyNote,'id'>>) => void;
  onDelete: (id: string) => void;
};

export type GraphCanvasNodeData = GraphNodeData | StickyNoteNodeData;

export type GraphEdgeData = Record<string,unknown> & {
  condition: NonNullable<AutomationEdge['condition']>;
  runSucceeded: boolean;
  selected: boolean;
  route?: string;
  routePoints?: GraphPoint[];
  editable: boolean;
  hovered: boolean;
  onHover: (id: string, active: boolean) => void;
  onInsert: (id: string, position: GraphPoint) => void;
  onDelete: (id: string) => void;
};

export type GraphEdge = Edge<GraphEdgeData>;
export type AutomationGraphInstance = ReactFlowInstance<Node<GraphCanvasNodeData>,GraphEdge>;
export type AutomationGraphSelection = { nodeIds: string[];edgeIds: string[];stickyNoteIds: string[] };

export type AutomationGraphProps = {
  definition: Pick<AutomationSpec,'nodes' | 'edges'> & { stickyNotes?: AutomationStickyNote[] };
  catalog: AutomationNodeCatalogEntry[];
  nodeComposition?: AutomationNodeWebComposition;
  nodeSummaries?: AutomationNodeExecutionSummary[];
  nodeAggregates?: Record<string,AutomationNodeOccurrenceAggregate>;
  nodeRuntimeFacts?: Record<string,GraphNodeRuntimeFact>;
  activeRuntimeNodeIds?: readonly string[];
  selectedNodeId?: string;
  selectedEdgeId?: string;
  editable?: boolean;
  autoLayout?: boolean;
  onNodeSelect?: (id: string) => void;
  onNodeOpen?: (id: string) => void;
  canRunToNode?: boolean;
  onNodeRunTo?: (id: string) => void;
  onNodeDisplayNameChange?: (id: string, displayName: string) => void;
  onNodeDuplicate?: (id: string) => void;
  onEdgeSelect?: (id: string) => void;
  onEdgeInsert?: (id: string, position: GraphPoint) => void;
  onOutputAdd?: (id: string, sourcePort: string, position: GraphPoint) => void;
  onSelectionChange?: (selection: AutomationGraphSelection) => void;
  onSelectionClear?: () => void;
  onConnect?: (from: string, to: string, sourcePort?: string) => void;
  positions?: AutomationGraphPositions;
  onNodePositionChange?: (id: string, position: GraphPoint) => void;
  onReady?: (instance: AutomationGraphInstance) => void;
  onLibraryDrop?: (libraryItemId: string, position: GraphPoint) => void;
  onViewportChange?: (viewport: Viewport) => void;
  onTidyUp?: (positions: AutomationGraphPositions) => void;
  onOpenLibrary?: () => void;
  onAddStickyNote?: () => void;
  onStickyNoteChange?: (id: string, patch: Partial<Omit<AutomationStickyNote,'id'>>) => void;
  onStickyNoteDelete?: (id: string) => void;
  onElementsDelete?: (selection: AutomationGraphSelection) => void;
  libraryOpen?: boolean;
  controlsId?: string;
  onNodesDelete?: (ids: string[]) => void;
  onEdgesDelete?: (ids: string[]) => void;
};
