/** Product-neutral, immutable graph projection. No scientific relations are inferred here. */
export type RelationState = 'confirmed' | 'proposed';
export type Point = Readonly<{ x: number; y: number }>;
export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly revision: string;
  readonly summary?: string;
  readonly group?: string;
  readonly position?: Point;
  readonly importance?: number;
}
export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly state: RelationState;
  readonly evidenceRefs: readonly string[];
}
export interface GraphSnapshot {
  readonly id: string;
  readonly scope: string;
  readonly complete: boolean;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
export interface GraphFilter {
  readonly query?: string;
  readonly kinds?: readonly string[];
  readonly includeProposed?: boolean;
  /** Null keeps the atlas visible; an ID shows its bounded neighbourhood. */
  readonly focusId?: string | null;
  readonly depth?: number;
}
export interface GraphIndex {
  readonly snapshot: GraphSnapshot;
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: ReadonlyMap<string, GraphEdge>;
  readonly adjacency: ReadonlyMap<string, readonly GraphEdge[]>;
}
export interface SelectionContext {
  readonly schema: 'xgc.graph.selection/v1';
  readonly snapshotId: string;
  readonly scope: string;
  readonly complete: boolean;
  readonly nodeRefs: readonly Readonly<{ id: string; revision: string }>[];
  readonly edgeRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
}
const text = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}`);
  return value;
};

/** Reject malformed/dangling graphs instead of silently turning them into visible truth. */
export function indexGraph(input: GraphSnapshot): GraphIndex {
  text(input.id, 'snapshot ID'); text(input.scope, 'scope');
  if (typeof input.complete !== 'boolean' || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new Error('Invalid graph envelope');
  }
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const adjacency = new Map<string, GraphEdge[]>();
  for (const node of input.nodes) {
    text(node.id, 'node ID'); text(node.label, 'node label'); text(node.kind, 'node kind'); text(node.revision, 'node revision');
    if (nodes.has(node.id)) throw new Error(`Duplicate node: ${node.id}`);
    if (node.position && (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) throw new Error(`Invalid position: ${node.id}`);
    if (node.importance !== undefined && (!Number.isFinite(node.importance) || node.importance < 0 || node.importance > 1)) throw new Error(`Invalid importance: ${node.id}`);
    const copy = Object.freeze({ ...node, position: node.position && Object.freeze({ ...node.position }) });
    nodes.set(node.id, copy); adjacency.set(node.id, []);
  }
  for (const edge of input.edges) {
    text(edge.id, 'edge ID'); text(edge.label, 'edge label');
    if (edges.has(edge.id)) throw new Error(`Duplicate edge: ${edge.id}`);
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) throw new Error(`Dangling edge: ${edge.id}`);
    if (edge.state !== 'confirmed' && edge.state !== 'proposed') throw new Error(`Invalid relation state: ${edge.id}`);
    if (!Array.isArray(edge.evidenceRefs) || edge.evidenceRefs.some((ref: unknown) => typeof ref !== 'string' || !ref.trim())) throw new Error(`Invalid evidence references: ${edge.id}`);
    const copy = Object.freeze({ ...edge, evidenceRefs: Object.freeze([...edge.evidenceRefs]) });
    edges.set(edge.id, copy); adjacency.get(edge.source)!.push(copy);
    if (edge.source !== edge.target) adjacency.get(edge.target)!.push(copy);
  }
  const snapshot = Object.freeze({ ...input, nodes: Object.freeze([...nodes.values()]), edges: Object.freeze([...edges.values()]) });
  for (const values of adjacency.values()) Object.freeze(values);
  return { snapshot, nodes, edges, adjacency };
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();
export function searchNodes(index: GraphIndex, query: string, limit = 30): GraphNode[] {
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  return [...index.nodes.values()].map(node => {
    const label = normalize(node.label);
    const haystack = normalize(`${node.label} ${node.kind} ${node.summary ?? ''}`);
    const score = terms.every(term => haystack.includes(term)) ? terms.reduce((sum, term) => sum + (label.startsWith(term) ? 3 : label.includes(term) ? 2 : 1), 0) : 0;
    return { node, score };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
    .slice(0, Math.max(0, Math.floor(limit))).map(hit => hit.node);
}

/** A graph neighbourhood is not a proof path. The host owns the interpretation. */
export function neighbourhood(index: GraphIndex, seeds: readonly string[], depth = 1, includeProposed = false): Set<string> {
  if (!Number.isInteger(depth) || depth < 0 || depth > 4) throw new Error('Depth must be an integer between 0 and 4');
  const visited = new Set(seeds.filter(id => index.nodes.has(id)));
  let frontier = [...visited];
  for (let hop = 0; hop < depth; hop++) {
    const next: string[] = [];
    for (const id of frontier) for (const edge of index.adjacency.get(id) ?? []) {
      if (!includeProposed && edge.state === 'proposed') continue;
      const other = edge.source === id ? edge.target : edge.source;
      if (!visited.has(other)) { visited.add(other); next.push(other); }
    }
    frontier = next;
  }
  return visited;
}
export function projectGraph(index: GraphIndex, filter: GraphFilter = {}): GraphSnapshot {
  const focus = filter.focusId ? neighbourhood(index, [filter.focusId], filter.depth ?? 1, filter.includeProposed) : null;
  const kinds = filter.kinds ? new Set(filter.kinds) : null;
  const terms = normalize(filter.query ?? '').split(/\s+/u).filter(Boolean);
  const nodes = index.snapshot.nodes.filter(node => (!focus || focus.has(node.id)) && (!kinds || kinds.has(node.kind)) && terms.every(term => normalize(`${node.label} ${node.summary ?? ''}`).includes(term)));
  const ids = new Set(nodes.map(node => node.id));
  return Object.freeze({ ...index.snapshot, nodes: Object.freeze(nodes), edges: Object.freeze(index.snapshot.edges.filter(edge => (filter.includeProposed || edge.state === 'confirmed') && ids.has(edge.source) && ids.has(edge.target))) });
}
export function selectionContext(index: GraphIndex, selectedIds: readonly string[], filter: GraphFilter = {}): SelectionContext {
  const visible = projectGraph(index, filter);
  const allowed = new Set(visible.nodes.map(node => node.id));
  const ids = [...new Set(selectedIds)].filter(id => allowed.has(id)).sort();
  const selected = new Set(ids);
  const edges = visible.edges.filter(edge => selected.has(edge.source) && selected.has(edge.target));
  return Object.freeze({
    schema: 'xgc.graph.selection/v1', snapshotId: index.snapshot.id, scope: index.snapshot.scope, complete: index.snapshot.complete,
    nodeRefs: Object.freeze(ids.map(id => Object.freeze({ id, revision: index.nodes.get(id)!.revision }))),
    edgeRefs: Object.freeze(edges.map(edge => edge.id).sort()),
    evidenceRefs: Object.freeze([...new Set(edges.flatMap(edge => edge.evidenceRefs))].sort()),
  });
}
export function reconcileSelection(index: GraphIndex, ids: readonly string[], filter: GraphFilter = {}): string[] {
  const visible = new Set(projectGraph(index, filter).nodes.map(node => node.id));
  return [...new Set(ids)].filter(id => visible.has(id));
}

/** Deterministic initial placement only. Positions and grouping do not assert a relation. */
export function initialPositions(index: GraphIndex, previous: ReadonlyMap<string, Point> = new Map()): Map<string, Point> {
  const result = new Map<string, Point>();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const ordered = [...index.nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach((node, i) => {
    const old = previous.get(node.id);
    if (old) { result.set(node.id, { ...old }); return; }
    if (node.position) { result.set(node.id, { ...node.position }); return; }
    const radius = 32 * Math.sqrt(i + 1);
    result.set(node.id, { x: Math.cos(i * goldenAngle) * radius, y: Math.sin(i * goldenAngle) * radius });
  });
  return result;
}
