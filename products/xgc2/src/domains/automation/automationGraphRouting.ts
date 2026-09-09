import type { Node } from '@xyflow/react';
import type { AutomationEdge } from './automationDefinitionContracts';
import { AUTOMATION_GRAPH_NODE_HEADER_HEIGHT,AUTOMATION_GRAPH_NODE_WIDTH,AUTOMATION_GRAPH_PORT_HEIGHT,automationGraphOutputPorts } from './automationGraphLayout';
import type { GraphCanvasNodeData,GraphNodeData,GraphPoint } from './automationGraphTypes';

type Bounds = { id: string;left: number;right: number;top: number;bottom: number };
type Segment = { from: GraphPoint;to: GraphPoint };
const ROUTE_CLEARANCE = 24;
const OUTPUT_CONTROL_CLEARANCE = 52;

export function automationGraphRoutes(nodes: Array<Node<GraphCanvasNodeData>>,edges: AutomationEdge[]) {
  const workflowNodes = nodes.filter((node) => node.data.canvasKind === 'automation');
  const byID = new Map(workflowNodes.map((node) => [node.id,node]));
  const bounds: Bounds[] = workflowNodes.map((node) => ({
    id: node.id,left: node.position.x - 16,right: node.position.x + AUTOMATION_GRAPH_NODE_WIDTH + 48,
    top: node.position.y - 16,bottom: node.position.y + (node.initialHeight ?? AUTOMATION_GRAPH_NODE_HEADER_HEIGHT) + 16,
  }));
  const routes: Record<string,GraphPoint[]> = {};
  const occupied: Segment[] = [];
  for (const edge of [...edges].sort((a,b) => a.id.localeCompare(b.id))) {
    const source = byID.get(edge.from);
    const target = byID.get(edge.to);
    if (!source || !target) continue;
    const sourceData = source.data as GraphNodeData;
    const ports = automationGraphOutputPorts(sourceData.catalog,sourceData.connectedOutputPorts);
    const port = Math.max(0,ports?.findIndex((candidate) => candidate.id === (edge.sourcePort || edge.route || 'main')) ?? 0);
    const outputY = ports?.length ? AUTOMATION_GRAPH_NODE_HEADER_HEIGHT + (port + 0.5) * AUTOMATION_GRAPH_PORT_HEIGHT : AUTOMATION_GRAPH_NODE_HEADER_HEIGHT / 2;
    // Handles sit on the shared surface border. The renderer substitutes its
    // measured endpoints; these points plan only the intervening corridors.
    const from = { x: source.position.x + AUTOMATION_GRAPH_NODE_WIDTH + 3,y: source.position.y + outputY + 1 };
    const to = { x: target.position.x - 3,y: target.position.y + AUTOMATION_GRAPH_NODE_HEADER_HEIGHT / 2 + 1 };
    const route = routeBetween(from,to,edge,bounds,occupied);
    if (!route) continue;
    routes[edge.id] = route;
    occupied.push(...segments(route));
  }
  return routes;
}

function routeBetween(from: GraphPoint,to: GraphPoint,edge: AutomationEdge,bounds: Bounds[],occupied: Segment[]) {
  const exitX = from.x + OUTPUT_CONTROL_CLEARANCE;
  const entryX = to.x - ROUTE_CLEARANCE;
  const candidates: GraphPoint[][] = [];
  if (exitX <= entryX) for (const x of [(exitX + entryX) / 2,exitX,entryX]) {
    candidates.push([from,{ x,y: from.y },{ x,y: to.y },to]);
  }
  const crossingBounds = bounds.filter((bound) => bound.right >= Math.min(exitX,entryX) && bound.left <= Math.max(exitX,entryX));
  const lanes = new Set(crossingBounds.flatMap((bound) => [bound.top - ROUTE_CLEARANCE,bound.bottom + ROUTE_CLEARANCE]));
  for (const y of lanes) candidates.push([from,{ x: exitX,y: from.y },{ x: exitX,y },{ x: entryX,y },{ x: entryX,y: to.y },to]);
  let best: GraphPoint[] | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const points = simplifyPoints(candidate);
    const parts = segments(points);
    if (parts.some((part,index) => bounds.some((bound) => {
      if ((index === 0 && bound.id === edge.from) || (index === parts.length - 1 && bound.id === edge.to)) return false;
      return segmentIntersectsBounds(part,bound);
    }))) continue;
    const score = parts.reduce((sum,part) => sum + distance(part.from,part.to) + occupied.reduce((cost,other) => cost + overlapCost(part,other),0),0) + parts.length * 24;
    if (score < bestScore) { best = points;bestScore = score; }
  }
  return best;
}

function segments(points: GraphPoint[]): Segment[] {
  return points.slice(1).map((to,index) => ({ from: points[index],to }));
}

function distance(a: GraphPoint,b: GraphPoint) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function segmentIntersectsBounds({ from,to }: Segment,bounds: Bounds) {
  return from.x === to.x
    ? from.x > bounds.left && from.x < bounds.right && Math.max(from.y,to.y) > bounds.top && Math.min(from.y,to.y) < bounds.bottom
    : from.y > bounds.top && from.y < bounds.bottom && Math.max(from.x,to.x) > bounds.left && Math.min(from.x,to.x) < bounds.right;
}

function overlapCost(a: Segment,b: Segment) {
  const aVertical = a.from.x === a.to.x;
  const bVertical = b.from.x === b.to.x;
  if (aVertical !== bVertical) return 0;
  const axis = aVertical ? 'y' : 'x';
  const fixed = aVertical ? 'x' : 'y';
  if (Math.abs(a.from[fixed] - b.from[fixed]) > 1) return 0;
  return Math.max(0,Math.min(Math.max(a.from[axis],a.to[axis]),Math.max(b.from[axis],b.to[axis])) - Math.max(Math.min(a.from[axis],a.to[axis]),Math.min(b.from[axis],b.to[axis]))) * 4;
}

function simplifyPoints(points: GraphPoint[]) {
  const result: GraphPoint[] = [];
  for (const point of points) {
    if (result.length && distance(result.at(-1)!,point) === 0) continue;
    const previous = result.at(-1);
    const before = result.at(-2);
    if (before && previous && ((before.x === previous.x && previous.x === point.x) || (before.y === previous.y && previous.y === point.y))) result.pop();
    result.push(point);
  }
  return result;
}

export function automationRoutedEdgePath(points: GraphPoint[],source: GraphPoint,target: GraphPoint): [string,number,number] {
  const route = points.map((point,index) => index === 0 ? source : index === points.length - 1 ? target : { ...point });
  if (route.length > 2) { route[1].y = source.y;route[route.length - 2].y = target.y; }
  let path = `M${source.x},${source.y}`;
  for (let index = 1;index < route.length - 1;index += 1) {
    const before = route[index - 1];
    const point = route[index];
    const after = route[index + 1];
    const radius = Math.min(12,distance(before,point) / 2,distance(point,after) / 2);
    const entry = { x: point.x + Math.sign(before.x - point.x) * radius,y: point.y + Math.sign(before.y - point.y) * radius };
    const exit = { x: point.x + Math.sign(after.x - point.x) * radius,y: point.y + Math.sign(after.y - point.y) * radius };
    path += `L${entry.x},${entry.y}Q${point.x},${point.y} ${exit.x},${exit.y}`;
  }
  path += `L${target.x},${target.y}`;
  // Put labels/actions on the longest free segment, clear of node surfaces.
  const longest = segments(route).sort((a,b) => distance(b.from,b.to) - distance(a.from,a.to))[0];
  return [path,(longest.from.x + longest.to.x) / 2,(longest.from.y + longest.to.y) / 2];
}
