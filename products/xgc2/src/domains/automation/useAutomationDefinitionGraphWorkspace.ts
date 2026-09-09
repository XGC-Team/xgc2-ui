import type { Viewport } from '@xyflow/react';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import type { ProcessInstance } from '../execution/executionPublic';
import type { AutomationWorkspaceView } from './AutomationDefinitionWorkspace.types';
import { automationInputSources } from './automationAuthoringProjection';
import {
  automationExecutionTargetId,
  AUTOMATION_RETURN_KIND,
  type AutomationDocument,
  type AutomationNode,
  type AutomationNodeCatalogEntry,
  type AutomationNodeLibraryItem,
  type AutomationSpec,
} from './automationDefinitionContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';
import type { AutomationRunView } from './automationEditorLogModel';
import type { AutomationGraphInstance,AutomationGraphSelection } from './automationGraphTypes';
import type { MCPConnection,MCPCatalogSnapshot } from './automationMCPContracts';
import {
  automationNodeLibraryItemForNode,
  defaultAutomationNodeLibraryItems,
  PROCESS_RUN_DEFINITION_KIND,
} from './automationNodeLibrary';
import { useAutomationGraphCommands,edgeHandle,type AutomationPoint } from './useAutomationGraphCommands';
import { useAutomationGraphSelection } from './useAutomationGraphSelection';
import { useAutomationNodeDialogOptions } from './useAutomationNodeDialogOptions';
import { useAutomationWorkspaceKeyboardShortcuts } from './useAutomationWorkspaceKeyboardShortcuts';
import { readViewport,viewportCenter,viewportKey,writeViewport } from './automationWorkspaceSupport';
import {
  automationNodeEditorFromComposition,
  type AutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';

type GraphRuntimeContext = {
  targetId: string;
  processInstances: ProcessInstance[];
  workspaceView: AutomationWorkspaceView;
  busy: string;
  runStartedRevision: number;
  editorRun?: AutomationRunView;
  editorRunDetail?: AutomationRunDetail;
  editorActiveRuntimeNodeIds: readonly string[];
  logsExpanded: boolean;
  logsPanelHeight: number;
  setLogsExpanded: (expanded: boolean) => void;
  setLogsPanelHeight: (height: number) => void;
  prepareRun: (throughNodeId?: string) => Promise<void>;
};

type GraphAuthoringContext = {
  catalog: AutomationNodeCatalogEntry[];
  libraryItems: AutomationNodeLibraryItem[];
  automationDocuments: readonly AutomationDocument[];
  mcpConnections: readonly MCPConnection[];
  mcpCatalogs: Readonly<Record<string,MCPCatalogSnapshot>>;
  nodeComposition?: AutomationNodeWebComposition;
};

export function useAutomationDefinitionGraphWorkspace({
  document,draft,canEdit,adoptionRevision,hasCallTrigger,authoring,runtime,
  commitChange,onError,onSave,onUndo,onRedo,
}: {
  document: AutomationDocument;
  draft: AutomationSpec;
  canEdit: boolean;
  adoptionRevision: number;
  hasCallTrigger: boolean;
  authoring: GraphAuthoringContext;
  runtime: GraphRuntimeContext;
  commitChange: (change: (current: AutomationSpec) => AutomationSpec) => void;
  onError: (message: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { catalog,libraryItems } = authoring;
  const [libraryOpen,setLibraryOpen] = useState(false);
  const [edgeInsertion,setEdgeInsertion] = useState<{ edgeId: string;position: AutomationPoint } | null>(null);
  const [outputInsertion,setOutputInsertion] = useState<{
    nodeId: string;
    sourcePort: string;
    position: AutomationPoint;
  } | null>(null);
  const flowRef = useRef<AutomationGraphInstance | null>(null);
  const graphHostRef = useRef<HTMLDivElement>(null);
  const previousAdoptionRevision = useRef(adoptionRevision);
  const previousRunStartedRevision = useRef(runtime.runStartedRevision);
  const {
    selectedNodeId,setSelectedNodeId,selectedEdgeId,setSelectedEdgeId,nodeDialogNodeId,
    selectedElementsRef,closeSelectionDialog,clearSelection,selectNode,openNode,selectEdge,
  } = useAutomationGraphSelection(draft);

  const closeNodeLibrary = useCallback(() => {
    setLibraryOpen(false);
    setEdgeInsertion(null);
    setOutputInsertion(null);
  }, []);
  const {
    saveRef,undoRef,redoRef,addStickyNoteRef,copiedElementsRef,copyNodeRef,pasteNodeRef,
  } = useAutomationWorkspaceKeyboardShortcuts({ closeSelectionDialog,closeNodeLibrary });
  const hasReturnNode = draft.nodes.some((node) => node.kind === AUTOMATION_RETURN_KIND);
  const defaultLibraryItems = useMemo(() => defaultAutomationNodeLibraryItems(libraryItems)
    .filter((item) => item.runtimeKind !== AUTOMATION_RETURN_KIND
      || (hasCallTrigger && !hasReturnNode)), [hasCallTrigger,hasReturnNode,libraryItems]);
  const nodeDialogNode = draft.nodes.find((node) => node.id === nodeDialogNodeId);
  const nodeDialogLibraryItem = nodeDialogNode
    ? automationNodeLibraryItemForNode(libraryItems, nodeDialogNode)
    : undefined;
  const executionTargetId = automationExecutionTargetId(draft.targetPolicy, runtime.targetId);
  const baseNodeDialogParameterOptions = useAutomationNodeDialogOptions({
    node: nodeDialogNode,
    automationDocuments: authoring.automationDocuments,
    currentResourceId: document.head.resourceId,
    executionTargetId,
    mcpConnections: authoring.mcpConnections,
    mcpCatalogs: authoring.mcpCatalogs,
  });
  const positions = useMemo(() => Object.fromEntries(draft.nodes.flatMap((node) => node.position
    ? [[node.id,node.position] as const]
    : [])), [draft.nodes]);

  useEffect(() => {
    if (previousAdoptionRevision.current === adoptionRevision) return;
    previousAdoptionRevision.current = adoptionRevision;
    clearSelection();
    closeNodeLibrary();
  }, [adoptionRevision,clearSelection,closeNodeLibrary]);

  useEffect(() => {
    if (previousRunStartedRevision.current === runtime.runStartedRevision) return;
    previousRunStartedRevision.current = runtime.runStartedRevision;
    clearSelection();
  }, [clearSelection,runtime.runStartedRevision]);

  useEffect(() => {
    if (runtime.workspaceView !== 'executions') return;
    clearSelection();
    closeNodeLibrary();
  }, [clearSelection,closeNodeLibrary,runtime.workspaceView]);

  function toggleNodeLibrary() {
    if (!canEdit) return;
    if (libraryOpen) closeNodeLibrary();
    else {
      setEdgeInsertion(null);
      setOutputInsertion(null);
      setLibraryOpen(true);
    }
  }

  const graphCommands = useAutomationGraphCommands({
    draft,canEdit,selectedNodeId,selectedEdgeId,edgeInsertion,outputInsertion,hasCallTrigger,hasReturnNode,
    commitChange,
    defaultPosition: () => viewportCenter(flowRef.current, graphHostRef.current),
    onError,
    onSelectNode: selectNode,
    onNodeAdded: (node) => {
      closeNodeLibrary();
      openNode(node);
    },
    onClearSelection: clearSelection,
  });
  const {
    addNode,connect,moveNode,tidyNodes,copyElements,pasteElements,duplicateNode,changeNodeDisplayName,
    changeStickyNote,deleteStickyNote,deleteNodes,deleteEdges,deleteElements,
  } = graphCommands;

  saveRef.current = onSave;
  undoRef.current = () => canEdit && onUndo();
  redoRef.current = () => canEdit && onRedo();
  copyNodeRef.current = () => {
    if (runtime.workspaceView !== 'editor') return false;
    const nodeIds = selectedElementsRef.current.nodeIds.length > 0
      ? selectedElementsRef.current.nodeIds
      : selectedNodeId ? [selectedNodeId] : [];
    const copied = copyElements(nodeIds);
    if (!copied) return false;
    copiedElementsRef.current = copied;
    return true;
  };
  pasteNodeRef.current = () => {
    if (runtime.workspaceView !== 'editor' || !copiedElementsRef.current) return false;
    return Boolean(pasteElements(copiedElementsRef.current));
  };
  addStickyNoteRef.current = () => {
    addStickyNote();
  };

  function addStickyNote() {
    graphCommands.addStickyNote();
    closeNodeLibrary();
    closeSelectionDialog();
  }

  function insertNodeOnEdge(edgeId: string, position: AutomationPoint) {
    if (!canEdit || !draft.edges.some((edge) => edge.id === edgeId)) return;
    setEdgeInsertion({ edgeId,position });
    setOutputInsertion(null);
    setLibraryOpen(true);
  }

  function addNodeFromOutput(nodeId: string, sourcePort: string, position: AutomationPoint) {
    if (!canEdit || !draft.nodes.some((node) => node.id === nodeId)) return;
    if (draft.edges.some((edge) => edge.from === nodeId && edgeHandle(edge) === sourcePort)) return;
    setOutputInsertion({ nodeId,sourcePort,position });
    setEdgeInsertion(null);
    setLibraryOpen(true);
  }

  function changeNodeDialog(patch: Partial<AutomationNode>) {
    if (!nodeDialogNode || !nodeDialogNodeId || !canEdit) return;
    const nextNode = { ...nodeDialogNode,...patch,id: nodeDialogNodeId };
    commitChange((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeDialogNodeId ? nextNode : node),
    }));
  }

  function restoreViewport(instance: AutomationGraphInstance) {
    flowRef.current = instance;
    if (document.head.system) {
      requestAnimationFrame(() => void instance.fitView({ padding: 0.18,maxZoom: 1.25,duration: 0 }));
      return;
    }
    const viewport = readViewport(viewportKey(document.head.resourceId));
    if (viewport) void instance.setViewport(viewport, { duration: 0 });
  }

  function saveViewport(viewport: Viewport) {
    writeViewport(viewportKey(document.head.resourceId), viewport);
  }

  function changeGraphSelection(selection: AutomationGraphSelection) {
    selectedElementsRef.current = selection;
  }

  function selectLogNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId('');
    closeSelectionDialog();
  }

  function addLibraryNodeAt(itemId: string, position: AutomationPoint) {
    const entry = defaultLibraryItems.find((item) => item.id === itemId);
    if (entry) addNode(entry, position);
  }

  const nodeDialogParameterSchema = nodeDialogLibraryItem?.editableParameterSchema
    ?? (nodeDialogNode
      ? (
          catalog.find((entry) => entry.kind === nodeDialogNode.kind && entry.typeVersion === nodeDialogNode.typeVersion)
          ?? catalog.find((entry) => entry.kind === nodeDialogNode.kind)
        )?.parameterSchema
      : undefined)
    ?? (nodeDialogNode?.kind === PROCESS_RUN_DEFINITION_KIND ? { type: 'object',properties: {} } : undefined);
  const nodeDialogParameterPath = nodeDialogLibraryItem?.editableParameterPath
    ?? (nodeDialogNode?.kind === PROCESS_RUN_DEFINITION_KIND ? 'parameters' : 'root');
  const nodeDialogInputSources = nodeDialogNode
    ? automationInputSources(draft, nodeDialogNodeId, libraryItems)
    : [];
  const nodeDialogEditor = nodeDialogNode
    ? automationNodeEditorFromComposition(
        authoring.nodeComposition,nodeDialogNode.kind,nodeDialogNode.typeVersion,
      )
    : undefined;
  const nodeDialogParameterOptions = nodeDialogNode && nodeDialogEditor?.parameterOptions
    ? nodeDialogEditor.parameterOptions({
        node: nodeDialogNode,inputSources: nodeDialogInputSources,baseOptions: baseNodeDialogParameterOptions,
      })
    : baseNodeDialogParameterOptions;

  return {
    addLibraryNode: addNode,
    addLibraryNodeAt,
    addNodeFromOutput,
    addStickyNote,
    changeGraphSelection,
    changeNodeDialog,
    changeNodeDisplayName,
    changeStickyNote,
    clearSelection,
    closeNodeDialog: closeSelectionDialog,
    closeNodeLibrary,
    connect,
    defaultLibraryItems,
    deleteEdges,
    deleteElements,
    deleteNodes,
    deleteStickyNote,
    duplicateNode,
    executionTargetId,
    graphHostRef,
    insertNodeOnEdge,
    libraryOpen,
    moveNode,
    nodeDialogCatalog: nodeDialogNode
      ? catalog.find((entry) => entry.kind === nodeDialogNode.kind && entry.typeVersion === nodeDialogNode.typeVersion)
        ?? catalog.find((entry) => entry.kind === nodeDialogNode.kind)
      : undefined,
    nodeDialogInputSources,
    nodeDialogLibraryItem,
    nodeDialogNode,
    nodeDialogNodeId,
    nodeDialogParameterOptions,
    nodeDialogParameterPath,
    nodeDialogParameterSchema,
    openNode,
    positions,
    restoreViewport,
    saveViewport,
    selectEdge,
    selectLogNode,
    selectedEdgeId,
    selectedNodeId,
    selectNode,
    tidyNodes,
    toggleNodeLibrary,
  };
}
