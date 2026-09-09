import { describe,expect,it } from 'vitest';
import type { AutomationEdge,AutomationNode,AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import { AUTOMATION_GRAPH_NODE_WIDTH,automationGraphNodeHeight,tidyAutomationGraphPositions } from './automationGraphLayout';
import { sce1LayoutFixture } from './automationGraphLayoutTestFixtures';
import { graphNodes } from './automationGraphModel';
import { automationGraphRoutes,automationRoutedEdgePath } from './automationGraphRouting';
import type { GraphPoint } from './automationGraphTypes';
import { newAutomationNode } from './automationSpecModel';

const node = (id: string): AutomationNode => ({ ...newAutomationNode('test',{},id),id });
const edge = (from: string,to: string): AutomationEdge => ({ id: `${from}:${to}`,from,to,condition: 'success' });

function layout(nodes: AutomationNode[],edges: AutomationEdge[],catalog: AutomationNodeCatalogEntry[] = []) {
  const positions = tidyAutomationGraphPositions(nodes,edges,catalog);
  const rendered = graphNodes(nodes,edges,[],catalog,[],{},[],undefined,positions);
  return { positions,rendered,routes: automationGraphRoutes(rendered,edges) };
}

function crossesBox(from: GraphPoint,to: GraphPoint,box: { x: number;y: number;width: number;height: number }) {
  return from.x === to.x
    ? from.x > box.x && from.x < box.x + box.width && Math.max(from.y,to.y) > box.y && Math.min(from.y,to.y) < box.y + box.height
    : from.y > box.y && from.y < box.y + box.height && Math.max(from.x,to.x) > box.x && Math.min(from.x,to.x) < box.x + box.width;
}

function expectClearRoutes(result: ReturnType<typeof layout>,edges: AutomationEdge[]) {
  expect(Object.keys(result.routes).sort()).toEqual(edges.map((item) => item.id).sort());
  for (const connection of edges) {
    const points = result.routes[connection.id];
    for (let index = 1;index < points.length;index += 1) {
      expect(points[index].x === points[index - 1].x || points[index].y === points[index - 1].y).toBe(true);
      for (const obstacle of result.rendered) {
        if (obstacle.id === connection.from || obstacle.id === connection.to) continue;
        expect(crossesBox(points[index - 1],points[index],{ ...obstacle.position,width: AUTOMATION_GRAPH_NODE_WIDTH,height: obstacle.initialHeight! }),`${connection.id} crosses ${obstacle.id}`).toBe(false);
      }
    }
  }
}

describe('automation graph layout and routing', () => {
  it('keeps all eight SCE1 action chains in separate bands with aligned headers', () => {
    const fixture = sce1LayoutFixture();
    expect(fixture.nodes).toHaveLength(38);
    expect(fixture.edges).toHaveLength(31);
    const result = layout(fixture.nodes,fixture.edges,fixture.catalog);
    const bands = fixture.groups.map((group) => ({
      top: Math.min(...group.map((id) => result.positions[id].y)),
      bottom: Math.max(...group.map((id) => {
        const definition = fixture.nodes.find((item) => item.id === id)!;
        return result.positions[id].y + automationGraphNodeHeight(definition,fixture.catalog.find((item) => item.kind === definition.kind),fixture.edges);
      })),
    })).sort((a,b) => a.top - b.top);
    for (let index = 1;index < bands.length;index += 1) expect(bands[index].top - bands[index - 1].bottom).toBeGreaterThanOrEqual(72);
    for (const chain of fixture.groups.slice(1)) expect(new Set(chain.map((id) => result.positions[id].y)).size).toBe(1);
    expectClearRoutes(result,fixture.edges);
  });

  it('is deterministic across serialization order and repeated Tidy, without mutating the document', () => {
    const fixture = sce1LayoutFixture();
    const original = structuredClone(fixture);
    const positions = tidyAutomationGraphPositions(fixture.nodes,fixture.edges,fixture.catalog);
    expect(tidyAutomationGraphPositions([...fixture.nodes].reverse(),[...fixture.edges].reverse(),fixture.catalog)).toEqual(positions);
    expect(tidyAutomationGraphPositions(fixture.nodes.map((item) => ({ ...item,position: positions[item.id] })),fixture.edges,fixture.catalog)).toEqual(positions);
    expect(fixture).toEqual(original);
  });

  it('reserves intermediate ranks for several long connections around a tall port surface', () => {
    const nodes = ['start','a','b','c','finish'].map(node);
    nodes[2].kind = 'switch';
    const edges = [edge('start','a'),edge('a','b'),edge('b','c'),edge('c','finish'),edge('start','c'),edge('a','finish')];
    const catalog: AutomationNodeCatalogEntry[] = [{ kind: 'switch',typeVersion: 1,label: 'Switch',category: 'control',traits: [],parameterSchema: {},outputPorts: Array.from({ length: 7 },(_,index) => ({ id: `port-${index}`,label: `Port ${index}` })) }];
    expectClearRoutes(layout(nodes,edges,catalog),edges);
  });

  it('orders seven branches by their actual output ports and gives overlapping fan-out trunks separate paths', () => {
    const branches = ['g','f','e','d','c','b','a'];
    const nodes = ['start',...branches,'finish'].map(node);
    const edges = branches.flatMap((id,index) => [{ ...edge('start',id),sourcePort: `port-${index}` },edge(id,'finish')]);
    const catalog: AutomationNodeCatalogEntry[] = [{ kind: 'test',typeVersion: 1,label: 'Test',category: 'test',traits: [],parameterSchema: {},outputPorts: branches.map((id,index) => ({ id: `port-${index}`,label: id })) }];
    const result = layout(nodes,edges,catalog);
    for (let index = 1;index < branches.length;index += 1) expect(result.positions[branches[index]].y).toBeGreaterThan(result.positions[branches[index - 1]].y);
    expectClearRoutes(result,edges);
  });

  it('keeps the overlapping vertical parts of a shared-port fan-out independently selectable', () => {
    const branches = ['a','b','c','d','e','f','g'];
    const edges = branches.map((id) => edge('start',id));
    const result = layout(['start',...branches].map(node),edges);
    expectClearRoutes(result,edges);
    const trunks = Object.values(result.routes).flatMap((points) => points.slice(1).flatMap((to,index) => {
      const from = points[index];
      return from.x === to.x && from.y !== to.y ? [{ x: from.x,top: Math.min(from.y,to.y),bottom: Math.max(from.y,to.y) }] : [];
    }));
    for (let index = 0;index < trunks.length;index += 1) for (const other of trunks.slice(index + 1)) {
      const trunk = trunks[index];
      if (trunk.x === other.x) expect(Math.min(trunk.bottom,other.bottom) - Math.max(trunk.top,other.top)).toBeLessThanOrEqual(0);
    }
  });

  it('routes a saved long connection around an intervening node and follows a moved obstacle', () => {
    const nodes = ['start','obstacle','finish'].map(node);
    const edges = [edge('start','finish')];
    const rendered = graphNodes(nodes,edges,[],[],[],{},[],undefined,{ start: { x: 0,y: 0 },obstacle: { x: 324,y: 0 },finish: { x: 648,y: 0 } });
    const routes = automationGraphRoutes(rendered,edges);
    expectClearRoutes({ rendered,routes,positions: {} },edges);
    const moved = rendered.map((item) => item.id === 'obstacle' ? { ...item,position: { x: 324,y: 300 } } : item);
    const movedRoutes = automationGraphRoutes(moved,edges);
    expectClearRoutes({ rendered: moved,routes: movedRoutes,positions: {} },edges);
    expect(movedRoutes).not.toEqual(routes);
    const path = automationRoutedEdgePath(routes[edges[0].id],{ x: 219,y: 41 },{ x: 645,y: 41 });
    expect(path[0]).toMatch(/^M219,41.*L645,41$/);
  });

  it('handles empty, isolated and malformed cyclic drafts without losing nodes or producing invalid coordinates', () => {
    expect(tidyAutomationGraphPositions([],[])).toEqual({});
    const nodes = ['a','b','c'].map(node);
    const edges = [edge('a','b'),edge('b','a'),edge('missing','c')];
    const positions = tidyAutomationGraphPositions(nodes,edges);
    expect(Object.keys(positions).sort()).toEqual(['a','b','c']);
    expect(Object.values(positions).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });
});
