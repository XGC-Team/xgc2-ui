import {
  AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH,
  AUTOMATION_RETURN_KIND,
  type AutomationEdge,
  type AutomationNode,
  type AutomationNodeLibraryItem,
  type AutomationSpec,
  type AutomationStickyNote,
} from './automationDefinitionContracts';
import { isAutomationTriggerKind } from './automationTriggerContracts';
import { uniqueEdgeId,uniqueNodeId } from './automationDefinitionEditorModel';
import { graphHasCycle } from './automationGraphModel';
import type { AutomationGraphPositions } from './automationGraphLayout';
import { limitAutomationNodeDisplayName,newAutomationNode,newAutomationStickyNote } from './automationSpecModel';

export type AutomationPoint = { x: number;y: number };
export type AutomationElementSelection = { nodeIds: string[];edgeIds: string[];stickyNoteIds: string[] };
export type AutomationGraphClipboard = { nodes: AutomationNode[];edges: AutomationEdge[] };

export function useAutomationGraphCommands({ draft,canEdit,selectedNodeId,selectedEdgeId,edgeInsertion,outputInsertion,hasCallTrigger,hasReturnNode,commitChange,defaultPosition,onError,onSelectNode,onNodeAdded,onClearSelection }: {
  draft: AutomationSpec;
  canEdit: boolean;
  selectedNodeId: string;
  selectedEdgeId: string;
  edgeInsertion: { edgeId: string;position: AutomationPoint } | null;
  outputInsertion: { nodeId: string;sourcePort: string;position: AutomationPoint } | null;
  hasCallTrigger: boolean;
  hasReturnNode: boolean;
  commitChange: (change: (current: AutomationSpec) => AutomationSpec) => void;
  defaultPosition: () => AutomationPoint;
  onError: (message: string) => void;
  onSelectNode: (node: AutomationNode) => void;
  onNodeAdded: (node: AutomationNode) => void;
  onClearSelection: () => void;
}) {
  function addNode(entry: AutomationNodeLibraryItem, position?: AutomationPoint) {
    if (!canEdit) return;
    const insertionEdge = edgeInsertion ? draft.edges.find((edge) => edge.id === edgeInsertion.edgeId) : undefined;
    const outputSource = outputInsertion ? draft.nodes.find((node) => node.id === outputInsertion.nodeId) : undefined;
    if (entry.runtimeKind === AUTOMATION_RETURN_KIND) {
      if (!hasCallTrigger) {
        onError('Return can only be added to an Automation started by When called.');
        return;
      }
      if (hasReturnNode) {
        onError('A called Automation can contain only one Return node.');
        return;
      }
    }
    if (outputSource && isAutomationTriggerKind(entry.runtimeKind)) {
      onError('A trigger cannot be added after another node.');
      return;
    }
    if (insertionEdge && Array.isArray(entry.outputPorts) && entry.outputPorts.length === 0) {
      onError('A node without an output cannot be inserted into an existing connection.');
      return;
    }
    const node = newAutomationNode(entry.runtimeKind, entry.initialParameters, entry.label, entry.runtimeTypeVersion);
    const definitionId = typeof entry.initialParameters.definitionId === 'string' ? entry.initialParameters.definitionId : '';
    node.id = uniqueNodeId(draft.nodes, definitionId || entry.runtimeKind);
    node.position = position ?? edgeInsertion?.position ?? outputInsertion?.position ?? defaultPosition();
    const insertion = edgeInsertion;
    const append = outputSource ? outputInsertion : null;
    commitChange((current) => {
      const replacedEdge = insertion ? current.edges.find((edge) => edge.id === insertion.edgeId) : undefined;
      if (!replacedEdge && append) {
        const output = edgeOutputForHandle(append.sourcePort);
        const appendedEdge: AutomationEdge = {
          id: uniqueEdgeId(current.edges, append.nodeId, node.id),from: append.nodeId,to: node.id,...output,
          condition: output.sourcePort === 'error' ? 'failure' : 'success',
        };
        return { ...current,nodes: [...current.nodes,node],edges: [...current.edges,appendedEdge] };
      }
      if (!replacedEdge) return { ...current,nodes: [...current.nodes,node] };
      const remainingEdges = current.edges.filter((edge) => edge.id !== replacedEdge.id);
      const inboundEdge: AutomationEdge = {
        ...replacedEdge,id: uniqueEdgeId(remainingEdges, replacedEdge.from, node.id),to: node.id,
      };
      const firstOutput = edgeOutputForHandle(entry.outputPorts?.[0]?.id);
      const outboundEdge: AutomationEdge = {
        id: uniqueEdgeId([...remainingEdges,inboundEdge], node.id, replacedEdge.to),from: node.id,to: replacedEdge.to,...firstOutput,
        condition: firstOutput.sourcePort === 'error' ? 'failure' : 'success',
      };
      return { ...current,nodes: [...current.nodes,node],edges: [...remainingEdges,inboundEdge,outboundEdge] };
    });
    onNodeAdded(node);
  }

  function connect(from: string, to: string, sourcePort = '') {
    if (!canEdit || from === to) return;
    const output = edgeOutputForHandle(sourcePort);
    const normalizedHandle = edgeHandle(output);
    if (draft.edges.some((edge) => edge.from === from && edge.to === to && edgeHandle(edge) === normalizedHandle)) return;
    const edge: AutomationEdge = {
      id: uniqueEdgeId(draft.edges, from, to),from,to,...output,
      condition: output.sourcePort === 'error' ? 'failure' : 'success',
    };
    if (graphHasCycle(draft.nodes, [...draft.edges,edge])) {
      onError('That connection would create a cycle. Automation graphs must remain acyclic.');
      return;
    }
    commitChange((current) => ({ ...current,edges: [...current.edges,edge] }));
  }

  function moveNode(id: string, position: AutomationPoint) {
    if (!canEdit) return;
    commitChange((current) => ({ ...current,nodes: current.nodes.map((node) => node.id === id ? { ...node,position } : node) }));
  }

  function tidyNodes(nextPositions: AutomationGraphPositions) {
    if (!canEdit) return;
    commitChange((current) => ({ ...current,nodes: current.nodes.map((node) => ({ ...node,position: nextPositions[node.id] ?? node.position })) }));
  }

  function duplicateNode(id: string) {
    const source = copyNode(id);
    if (source) pasteNode(source);
  }

  function copyNode(id: string) {
    return copyElements([id])?.nodes[0];
  }

  function pasteNode(source: AutomationNode) {
    return pasteElements({ nodes: [source],edges: [] })?.[0];
  }

  function copyElements(nodeIds: string[]): AutomationGraphClipboard | undefined {
    if (!canEdit) return undefined;
    const selected = new Set(nodeIds);
    const nodes = draft.nodes.filter((node) => selected.has(node.id));
    if (nodes.length === 0) return undefined;
    const copiedNodeIDs = new Set(nodes.map((node) => node.id));
    return structuredClone({
      nodes,
      edges: draft.edges.filter((edge) => copiedNodeIDs.has(edge.from) && copiedNodeIDs.has(edge.to)),
    });
  }

  function pasteElements(source: AutomationGraphClipboard) {
    if (!canEdit || source.nodes.length === 0) return undefined;
    let pastedNodes: AutomationNode[] = [];
    commitChange((current) => {
      const nextNodes = [...current.nodes];
      const nodeIDs = new Map<string,string>();
      pastedNodes = source.nodes.map((sourceNode) => {
        const duplicate = structuredClone(sourceNode);
        duplicate.id = uniqueNodeId(nextNodes, sourceNode.kind);
        nodeIDs.set(sourceNode.id, duplicate.id);
        const copySuffix = ' copy';
        duplicate.displayName = `${[...sourceNode.displayName].slice(0, AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH - [...copySuffix].length).join('')}${copySuffix}`;
        const origin = sourceNode.position ?? defaultPosition();
        duplicate.position = { x: origin.x + 36,y: origin.y + 36 };
        nextNodes.push(duplicate);
        return duplicate;
      });
      const nextEdges = [...current.edges];
      for (const sourceEdge of source.edges) {
        const from = nodeIDs.get(sourceEdge.from);
        const to = nodeIDs.get(sourceEdge.to);
        if (!from || !to) continue;
        const duplicate = structuredClone(sourceEdge);
        duplicate.id = uniqueEdgeId(nextEdges, from, to);
        duplicate.from = from;
        duplicate.to = to;
        nextEdges.push(duplicate);
      }
      return { ...current,nodes: nextNodes,edges: nextEdges };
    });
    if (pastedNodes[0]) onSelectNode(pastedNodes[0]);
    return pastedNodes;
  }

  function changeNodeDisplayName(id: string, displayName: string) {
    if (!canEdit) return;
    commitChange((current) => ({ ...current,nodes: current.nodes.map((node) => node.id === id ? { ...node,displayName: limitAutomationNodeDisplayName(displayName) } : node) }));
  }

  function addStickyNote() {
    if (!canEdit) return;
    const center = defaultPosition();
    const note = newAutomationStickyNote(uniqueStickyNoteId(draft.stickyNotes), { x: center.x - 120,y: center.y - 80 });
    commitChange((current) => ({ ...current,stickyNotes: [...current.stickyNotes,note] }));
  }

  function changeStickyNote(id: string, patch: Partial<Omit<AutomationStickyNote,'id'>>) {
    if (!canEdit) return;
    commitChange((current) => ({
      ...current,
      stickyNotes: current.stickyNotes.map((note) => nodePatch(note, id, patch)),
    }));
  }

  function deleteElements(selection: AutomationElementSelection) {
    if (!canEdit) return;
    const removedNodes = new Set(selection.nodeIds);
    const removedEdges = new Set(selection.edgeIds);
    const removedStickyNotes = new Set(selection.stickyNoteIds);
    if (removedNodes.size === 0 && removedEdges.size === 0 && removedStickyNotes.size === 0) return;
    commitChange((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !removedNodes.has(node.id)),
      edges: current.edges.filter((edge) => !removedEdges.has(edge.id) && !removedNodes.has(edge.from) && !removedNodes.has(edge.to)),
      stickyNotes: current.stickyNotes.filter((note) => !removedStickyNotes.has(note.id)),
    }));
    if (removedNodes.has(selectedNodeId) || removedEdges.has(selectedEdgeId)) onClearSelection();
  }

  return {
    addNode,connect,moveNode,tidyNodes,copyNode,pasteNode,copyElements,pasteElements,duplicateNode,changeNodeDisplayName,
    addStickyNote,changeStickyNote,
    deleteStickyNote: (id: string) => deleteElements({ nodeIds: [],edgeIds: [],stickyNoteIds: [id] }),
    deleteNodes: (ids: string[]) => deleteElements({ nodeIds: ids,edgeIds: [],stickyNoteIds: [] }),
    deleteEdges: (ids: string[]) => deleteElements({ nodeIds: [],edgeIds: ids,stickyNoteIds: [] }),
    deleteElements,
  };
}

export function edgeOutputForHandle(handle = ''): Pick<AutomationEdge,'sourcePort' | 'route'> {
  if (!handle || handle === 'main') return {};
  if (handle === 'ready' || handle === 'stopped' || handle === 'error') return { sourcePort: handle };
  return { route: handle };
}

export function edgeHandle(edge: Pick<AutomationEdge,'sourcePort' | 'route'>) {
  return edge.sourcePort ?? edge.route ?? 'main';
}

function nodePatch(note: AutomationStickyNote, id: string, patch: Partial<Omit<AutomationStickyNote,'id'>>) {
  return note.id === id ? { ...note,...patch,position: patch.position ? { ...patch.position } : note.position } : note;
}

function uniqueStickyNoteId(notes: AutomationStickyNote[]) {
  const ids = new Set(notes.map((note) => note.id));
  let index = 1;
  while (ids.has(`sticky-note-${index}`)) index += 1;
  return `sticky-note-${index}`;
}
