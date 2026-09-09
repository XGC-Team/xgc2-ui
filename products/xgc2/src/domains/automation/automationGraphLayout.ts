import type {
  AutomationEdge,
  AutomationNode,
  AutomationNodeCatalogEntry,
} from './automationDefinitionContracts';

export type AutomationGraphPositions = Record<string,{ x: number;y: number }>;

export const AUTOMATION_GRAPH_NODE_WIDTH = 216;
export const AUTOMATION_GRAPH_NODE_HEADER_HEIGHT = 80;
export const AUTOMATION_GRAPH_PORT_HEIGHT = 32;
export const AUTOMATION_LAYOUT_COLUMN_GAP = 324;
const AUTOMATION_LAYOUT_ROW_CLEARANCE = 72;
const AUTOMATION_LAYOUT_COMPONENT_CLEARANCE = 96;

type LayoutVertex = {
  id: string;
  depth: number;
  height: number;
  dummy: boolean;
  y: number;
  parents: Array<{ vertex: LayoutVertex;port: number }>;
  children: Array<{ vertex: LayoutVertex;port: number }>;
};

export function tidyAutomationGraphPositions(
  nodes: AutomationNode[],
  edges: AutomationEdge[],
  catalog: AutomationNodeCatalogEntry[] = [],
): AutomationGraphPositions {
  const catalogByKind = new Map(catalog.map((entry) => [entry.kind,entry]));
  const catalogByVersion = new Map(catalog.map((entry) => [`${entry.kind}@${entry.typeVersion}`,entry]));
  const nodeCatalog = (node: AutomationNode) => catalogByVersion.get(`${node.kind}@${node.typeVersion}`) ?? catalogByKind.get(node.kind);
  const positions: AutomationGraphPositions = {};
  let bottom: number | undefined;
  for (const component of connectedNodeGroups(nodes,edges)) {
    const ids = new Set(component.map((node) => node.id));
    const componentEdges = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    const layers = expandedNodeLayers(component,componentEdges,nodeCatalog);
    orderLayers(layers);
    alignLayers(layers);
    const vertices = layers.flat().filter((vertex) => !vertex.dummy);
    const top = Math.min(...vertices.map((vertex) => vertex.y));
    const offset = bottom === undefined ? -layers.find((layer) => layer.length)![0].y : bottom + AUTOMATION_LAYOUT_COMPONENT_CLEARANCE - top;
    for (const vertex of vertices) positions[vertex.id] = { x: vertex.depth * AUTOMATION_LAYOUT_COLUMN_GAP,y: Math.round(vertex.y + offset) };
    bottom = Math.max(...vertices.map((vertex) => positions[vertex.id].y + vertex.height));
  }
  return positions;
}

export function automationGraphOutputPorts(catalog: AutomationNodeCatalogEntry | undefined,connectedPorts: readonly string[]) {
  if (Array.isArray(catalog?.outputPorts)) return catalog.outputPorts;
  const ports = [...new Set(connectedPorts)].filter((port) => port !== 'main').map((id) => {
    const label = id.replaceAll('-', ' ');
    return { id,label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
  return ports.length ? ports : undefined;
}

export function automationGraphNodeHeight(node: AutomationNode,catalog?: AutomationNodeCatalogEntry,edges: AutomationEdge[] = []) {
  const ports = automationGraphOutputPorts(catalog,edges.filter((edge) => edge.from === node.id)
    .map((edge) => edge.sourcePort || edge.route || 'main'));
  return automationGraphNodeHeightForPorts(ports?.length ?? 0);
}

export function automationGraphNodeHeightForPorts(outputCount: number) {
  return AUTOMATION_GRAPH_NODE_HEADER_HEIGHT + (outputCount > 0 ? outputCount * AUTOMATION_GRAPH_PORT_HEIGHT + 8 : 0);
}

// Each independent entrypoint chain owns a band. Column population must never
// pull a short, unrelated chain into the middle of a longer workflow.
function connectedNodeGroups(nodes: AutomationNode[],edges: AutomationEdge[]) {
  const byID = new Map(nodes.map((node) => [node.id,node]));
  const neighbors = new Map(nodes.map((node) => [node.id,[] as string[]]));
  for (const edge of edges) {
    if (!byID.has(edge.from) || !byID.has(edge.to)) continue;
    neighbors.get(edge.from)!.push(edge.to);
    neighbors.get(edge.to)!.push(edge.from);
  }
  const visited = new Set<string>();
  const groups: AutomationNode[][] = [];
  for (const node of [...nodes].sort((a,b) => a.id.localeCompare(b.id))) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    visited.add(node.id);
    for (const id of queue) for (const neighbor of neighbors.get(id)!) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
    groups.push(queue.map((id) => byID.get(id)!));
  }
  return groups;
}

function expandedNodeLayers(
  nodes: AutomationNode[],edges: AutomationEdge[],catalog: (node: AutomationNode) => AutomationNodeCatalogEntry | undefined,
) {
  const depths = nodeDepths(nodes,edges);
  const layers: LayoutVertex[][] = Array.from({ length: Math.max(0,...depths.values()) + 1 },() => []);
  const vertices = new Map(nodes.map((node) => {
    const vertex: LayoutVertex = { id: node.id,depth: depths.get(node.id)!,height: automationGraphNodeHeight(node,catalog(node),edges),dummy: false,y: 0,parents: [],children: [] };
    layers[vertex.depth].push(vertex);
    return [node.id,vertex];
  }));
  const ports = new Map(nodes.map((node) => [node.id,automationGraphOutputPorts(catalog(node),edges.filter((edge) => edge.from === node.id).map((edge) => edge.sourcePort || edge.route || 'main'))]));
  const connect = (from: LayoutVertex,to: LayoutVertex,port: number) => {
    from.children.push({ vertex: to,port });
    to.parents.push({ vertex: from,port });
  };
  for (const edge of [...edges].sort((a,b) => a.id.localeCompare(b.id))) {
    let from = vertices.get(edge.from)!;
    const to = vertices.get(edge.to)!;
    if (to.depth <= from.depth) continue;
    const sourcePorts = ports.get(edge.from);
    const portIndex = Math.max(0,sourcePorts?.findIndex((port) => port.id === (edge.sourcePort || edge.route || 'main')) ?? 0);
    let port = sourcePorts?.length ? (portIndex + 1) / (sourcePorts.length + 1) : 0;
    // Long edges participate in every crossed rank, reserving space instead of
    // silently running through the nodes placed in those ranks.
    for (let depth = from.depth + 1;depth < to.depth;depth += 1) {
      const dummy: LayoutVertex = { id: edge.id,depth,height: 0,dummy: true,y: 0,parents: [],children: [] };
      layers[depth].push(dummy);
      connect(from,dummy,port);
      from = dummy;
      port = 0;
    }
    connect(from,to,port);
  }
  for (const layer of layers) layer.sort((a,b) => Number(a.dummy) - Number(b.dummy) || a.id.localeCompare(b.id));
  return layers;
}

function orderLayers(layers: LayoutVertex[][]) {
  const sweep = (forward: boolean) => {
    const ranks = forward ? layers.slice(1) : layers.slice(0,-1).reverse();
    for (const layer of ranks) {
      const rows = new Map(layers.flatMap((rank) => rank.map((vertex,index) => [vertex,index] as const)));
      const score = (vertex: LayoutVertex) => {
        const neighbors = forward ? vertex.parents : vertex.children;
        return neighbors.length ? neighbors.reduce((sum,neighbor) => sum + rows.get(neighbor.vertex)! + (forward ? neighbor.port : 0),0) / neighbors.length : rows.get(vertex)!;
      };
      // Stable ties retain port ordering learned by the opposite sweep.
      layer.sort((a,b) => score(a) - score(b));
    }
  }
  for (let pass = 0;pass < 4;pass += 1) { sweep(true);sweep(false); }
}

function alignLayers(layers: LayoutVertex[][]) {
  for (const layer of layers) compactLayer(layer,layer.map(() => 0));
  for (let pass = 0;pass < 8;pass += 1) {
    for (const forward of [true,false]) for (const layer of forward ? layers : [...layers].reverse()) {
      const desired = layer.map((vertex) => {
        const neighbors = forward ? vertex.parents : vertex.children;
        return neighbors.length ? neighbors.reduce((sum,neighbor) => sum + neighbor.vertex.y,0) / neighbors.length : vertex.y;
      });
      compactLayer(layer,desired);
    }
  }
}

// Isotonic compaction preserves branch order while aligning chain headers. It
// distributes the necessary separation, rather than re-centering each column.
function compactLayer(layer: LayoutVertex[],desired: number[]) {
  const offsets: number[] = [];
  const blocks: Array<{ start: number;end: number;sum: number;count: number }> = [];
  layer.forEach((vertex,index) => {
    const previous = layer[index - 1];
    offsets[index] = index ? offsets[index - 1] + previous.height + AUTOMATION_LAYOUT_ROW_CLEARANCE : 0;
    blocks.push({ start: index,end: index,sum: desired[index] - offsets[index],count: 1 });
    while (blocks.length > 1) {
      const right = blocks.at(-1)!;
      const left = blocks.at(-2)!;
      if (left.sum / left.count <= right.sum / right.count) break;
      blocks.splice(-2,2,{ start: left.start,end: right.end,sum: left.sum + right.sum,count: left.count + right.count });
    }
    vertex.y = desired[index];
  });
  for (const block of blocks) for (let index = block.start;index <= block.end;index += 1) layer[index].y = block.sum / block.count + offsets[index];
}

function nodeDepths(nodes: AutomationNode[],edges: AutomationEdge[]) {
  const result = new Map(nodes.map((node) => [node.id,0]));
  const incoming = new Map(nodes.map((node) => [node.id,0]));
  const outgoing = new Map(nodes.map((node) => [node.id,[] as string[]]));
  for (const edge of edges) {
    outgoing.get(edge.from)!.push(edge.to);
    incoming.set(edge.to,incoming.get(edge.to)! + 1);
  }
  const queue = [...incoming].filter(([,count]) => !count).map(([id]) => id).sort();
  for (const id of queue) for (const target of outgoing.get(id)!) {
    result.set(target,Math.max(result.get(target)!,result.get(id)! + 1));
    incoming.set(target,incoming.get(target)! - 1);
    if (!incoming.get(target)) queue.push(target);
  }
  // Authoring rejects cycles; malformed imported drafts still need a bounded,
  // usable fallback, not repeated depth inflation or a stalled canvas.
  let fallback = Math.max(0,...result.values());
  for (const [id,count] of [...incoming].sort(([a],[b]) => a.localeCompare(b))) if (count) result.set(id,++fallback);
  return result;
}
