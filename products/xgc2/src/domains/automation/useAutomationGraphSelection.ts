import { useCallback,useRef,useState } from 'react';
import type {
  AutomationEdge,
  AutomationNode,
  AutomationSpec,
} from './automationDefinitionContracts';
import type { AutomationElementSelection } from './useAutomationGraphCommands';

export function useAutomationGraphSelection(draft: AutomationSpec) {
  const [selectedNodeId,setSelectedNodeId] = useState('');
  const [selectedEdgeId,setSelectedEdgeId] = useState('');
  const [nodeDialogNodeId,setNodeDialogNodeId] = useState('');
  const selectedElementsRef = useRef<AutomationElementSelection>({ nodeIds: [],edgeIds: [],stickyNoteIds: [] });

  const closeSelectionDialog = useCallback(() => setNodeDialogNodeId(''), []);
  const clearSelection = useCallback(() => {
    selectedElementsRef.current = { nodeIds: [],edgeIds: [],stickyNoteIds: [] };
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setNodeDialogNodeId('');
  }, []);
  const selectNode = useCallback((nodeOrID: AutomationNode | string) => {
    const node = typeof nodeOrID === 'string' ? draft.nodes.find((item) => item.id === nodeOrID) : nodeOrID;
    if (!node) return;
    selectedElementsRef.current = { nodeIds: [node.id],edgeIds: [],stickyNoteIds: [] };
    setSelectedNodeId(node.id);
    setSelectedEdgeId('');
    setNodeDialogNodeId('');
  }, [draft.nodes]);
  const openNode = useCallback((nodeOrID: AutomationNode | string) => {
    const node = typeof nodeOrID === 'string' ? draft.nodes.find((item) => item.id === nodeOrID) : nodeOrID;
    if (!node) return;
    selectedElementsRef.current = { nodeIds: [node.id],edgeIds: [],stickyNoteIds: [] };
    setSelectedNodeId(node.id);
    setSelectedEdgeId('');
    setNodeDialogNodeId(node.id);
  }, [draft.nodes]);
  const selectEdge = useCallback((edgeOrID: AutomationEdge | string) => {
    const edge = typeof edgeOrID === 'string' ? draft.edges.find((item) => item.id === edgeOrID) : edgeOrID;
    if (!edge) return;
    selectedElementsRef.current = { nodeIds: [],edgeIds: [edge.id],stickyNoteIds: [] };
    setSelectedEdgeId(edge.id);
    setSelectedNodeId('');
    setNodeDialogNodeId('');
  }, [draft.edges]);

  return {
    selectedNodeId,setSelectedNodeId,selectedEdgeId,setSelectedEdgeId,nodeDialogNodeId,
    selectedElementsRef,closeSelectionDialog,clearSelection,selectNode,openNode,selectEdge,
  };
}
