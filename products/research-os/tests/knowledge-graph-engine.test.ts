import { describe, expect, it } from 'vitest'
import { clusterKey, forceParams, rememberPositions, seedLayout, type Point } from '../src/lib/graph-layout-seed'
import { cameraAt, edgeAlpha, fitCamera, flight, labelBudget, placeLabels, PointGrid, rankMatches, worldRadius, PINNED } from '../src/lib/graph-render'
import { createSim, stepWithin } from '../src/lib/graph-sim'
import type { GraphData } from '../src/lib/graph'

function vault(clusters: number, per: number): GraphData {
  const nodes: GraphData['nodes'] = [], edges: GraphData['edges'] = [], adj = new Map<number, number[]>()
  for (let c = 0; c < clusters; c++) for (let i = 0; i < per; i++) {
    const id = c * per + i
    nodes.push({ id, label: `t${c}-${i}`, group: 'note', x: 0, y: 0, vx: 0, vy: 0, r: 4, mass: 1, degree: 0, resourceId: `memory/bulk/t${c}/n${i}.md`, path: `memory/bulk/t${c}/n${i}.md` })
    if (i) { edges.push({ s: id, t: c * per }); adj.set(id, [c * per]); adj.set(c * per, [...(adj.get(c * per) ?? []), id]) }
  }
  for (const e of edges) { nodes[e.s].degree++; nodes[e.t].degree++ }
  return { nodes, edges, adj }
}

describe('layout seeding and memory', () => {
  it('clusters by folder, with unresolved targets apart', () => {
    expect(clusterKey({ path: 'memory/bulk/control/a.md' })).toBe('control')
    expect(clusterKey({ path: 'memory/now.md' })).toBe('memory')
    expect(clusterKey({ unresolved: true })).toBe('unresolved')
  })
  it('seeds each folder as a compact region, hubs innermost', () => {
    const data = vault(4, 50)
    const { warm, clusters, centers } = seedLayout(data, new Map())
    expect(warm).toBe(false); expect(clusters).toHaveLength(4)
    const spread = (c: number) => Math.max(...data.nodes.filter(n => n.cluster === c).map(n => Math.hypot(n.x - centers[c].x, n.y - centers[c].y)))
    const gap = Math.hypot(centers[1].x - centers[0].x, centers[1].y - centers[0].y)
    expect(spread(0)).toBeLessThan(gap)
    const hub = data.nodes[0]; expect(Math.hypot(hub.x - centers[0].x, hub.y - centers[0].y)).toBeLessThan(12)
  })
  it('is warm when most positions are remembered, and places new nodes beside a remembered neighbour', () => {
    const cache = new Map<string, Point>(), data = vault(2, 20)
    seedLayout(data, cache); rememberPositions(data.nodes, cache)
    const again = vault(2, 20), newcomer = again.nodes[5]
    cache.delete(newcomer.resourceId!)
    const { warm } = seedLayout(again, cache)
    expect(warm).toBe(true)
    expect(again.nodes[7].x).toBe(cache.get(again.nodes[7].resourceId!)!.x)
    const hub = cache.get(again.nodes[0].resourceId!)!
    expect(Math.hypot(newcomer.x - hub.x, newcomer.y - hub.y)).toBeLessThan(30)
  })
  it('scales forces with size', () => {
    expect(forceParams(3000, 10000).distanceMax).toBeLessThan(forceParams(100, 200).distanceMax)
  })
})

describe('simulation', () => {
  it('converges within wall-clock budgets on the main-thread fallback', () => {
    const data = vault(6, 60)
    const { centers } = seedLayout(data, new Map())
    const { sim, nodes } = createSim({ nodes: data.nodes.map(n => ({ x: n.x, y: n.y, r: n.r, cluster: n.cluster ?? 0 })), links: data.edges.map(e => [e.s, e.t]), centers, alpha: 1 })
    let rounds = 0
    while (stepWithin(sim, 8) && rounds < 500) rounds++
    expect(sim.alpha()).toBeLessThan(sim.alphaMin())
    expect(nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true)
  })
  it('a warm start barely moves remembered nodes', () => {
    const data = vault(3, 40)
    const { centers } = seedLayout(data, new Map())
    const { sim, nodes } = createSim({ nodes: data.nodes.map(n => ({ x: n.x, y: n.y, r: n.r, cluster: n.cluster ?? 0 })), links: data.edges.map(e => [e.s, e.t]), centers, alpha: 1 })
    while (stepWithin(sim, 8)) { /* settle */ }
    const settled = nodes.map(n => ({ x: n.x!, y: n.y! }))
    const warm = createSim({ nodes: settled.map((p, i) => ({ ...p, r: 4, cluster: data.nodes[i].cluster ?? 0 })), links: data.edges.map(e => [e.s, e.t]), centers, alpha: 0.12 })
    while (stepWithin(warm.sim, 8)) { /* relax */ }
    const drift = warm.nodes.reduce((m, n, i) => Math.max(m, Math.hypot(n.x! - settled[i].x, n.y! - settled[i].y)), 0)
    expect(drift).toBeLessThan(40)
  })
})

describe('renderer helpers', () => {
  it('grid hit-testing finds the nearest node within its radius only', () => {
    const pts = [{ id: 0, x: 0, y: 0 }, { id: 1, x: 10, y: 0 }, { id: 2, x: 500, y: 500 }]
    const g = new PointGrid(48); g.build(pts)
    expect(g.nearest(8, 1, pts, () => 5)).toBe(1)
    expect(g.nearest(250, 250, pts, () => 5)).toBe(-1)
    expect(g.nearest(497, 499, pts, () => 5)).toBe(2)
  })
  it('places labels by priority without overlap, except the pinned focus', () => {
    const c = [{ id: 1, x: 100, y: 100, w: 60, h: 12, priority: 5 }, { id: 2, x: 110, y: 100, w: 60, h: 12, priority: 9 }, { id: 3, x: 300, y: 100, w: 60, h: 12, priority: 1 }, { id: 4, x: 100, y: 100, w: 60, h: 12, priority: PINNED }]
    expect(placeLabels(c, 10)).toEqual([4, 3])
    expect(placeLabels(c.slice(0, 3), 1)).toEqual([2])
  })
  it('zoomed out lets folder names speak; close up shows titles', () => {
    expect(labelBudget(0.5)).toBe(0); expect(labelBudget(1.2)).toBeGreaterThan(50); expect(labelBudget(2)).toBe(400)
    expect(edgeAlpha(10000)).toBeLessThan(edgeAlpha(50))
    expect(worldRadius(10, 4)).toBe(5); expect(worldRadius(10, 0.5)).toBe(10)
  })
  it('camera flights ease in log-zoom space and are bounded in time', () => {
    const a = { x: 0, y: 0, k: 0.5 }, b = { x: 100, y: 0, k: 2 }
    expect(cameraAt(a, b, 0)).toEqual(a); expect(cameraAt(a, b, 1)).toEqual(b)
    expect(cameraAt(a, b, 0.5).k).toBeCloseTo(1, 5)
    expect(flight(a, { x: 1e6, y: 0, k: 2 }, { w: 800, h: 600 })).toBeLessThanOrEqual(700)
    const f = fitCamera([{ x: -100, y: -50, degree: 1 }, { x: 100, y: 50, degree: 1 }], { w: 400, h: 300 }, 50)
    expect(f.x).toBeCloseTo(0); expect(f.k).toBeCloseTo(1.5)
  })
  it('ranks exact and prefix title matches above incidental ones', () => {
    const nodes = [{ title: 'Aerial note 11', path: 'memory/bulk/aerial/a.md' }, { title: 'Kalman note 16', path: 'k16' }, { title: 'Kalman note 1', path: 'k1' }, { title: 'missing', unresolved: true }]
    expect(rankMatches(nodes, 'kalman note 1').map(n => n.title)).toEqual(['Kalman note 1', 'Kalman note 16', 'Aerial note 11'])
    expect(rankMatches(nodes, '  ')).toEqual([])
  })
})
