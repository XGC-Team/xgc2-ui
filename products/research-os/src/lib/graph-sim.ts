import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force'
import { forceParams, type Point } from './graph-layout-seed'

/* The force simulation, shared by the Web Worker and the main-thread fallback so both lay out identically. */
export type SimNode = SimulationNodeDatum & { r: number; cluster: number }
export type SimInit = { nodes: { x: number; y: number; r: number; cluster: number }[]; links: [number, number][]; centers: Point[]; alpha: number }

export function createSim(init: SimInit): { sim: Simulation<SimNode, undefined>; nodes: SimNode[] } {
  const p = forceParams(init.nodes.length, init.links.length)
  const nodes: SimNode[] = init.nodes.map(n => ({ x: n.x, y: n.y, vx: 0, vy: 0, r: n.r, cluster: n.cluster }))
  const sim = forceSimulation(nodes).stop().alpha(init.alpha).alphaMin(0.004).alphaDecay(p.alphaDecay).velocityDecay(p.velocityDecay)
    .force('charge', forceManyBody<SimNode>().strength(p.charge).distanceMax(p.distanceMax).theta(p.theta))
    .force('links', forceLink<SimNode, { source: number; target: number }>(init.links.filter(([s, t]) => s !== t).map(([source, target]) => ({ source, target }))).distance(p.linkDistance).strength(p.linkStrength))
    .force('collide', forceCollide<SimNode>().radius(n => n.r + p.collide).strength(0.7))
    // A gentle pull toward each folder's centre keeps topics legible as regions of the atlas.
    .force('x', forceX<SimNode>(n => init.centers[n.cluster]?.x ?? 0).strength(p.cluster))
    .force('y', forceY<SimNode>(n => init.centers[n.cluster]?.y ?? 0).strength(p.cluster))
  return { sim, nodes }
}

/** Advance within a wall-clock budget; returns true while still moving. */
export function stepWithin(sim: Simulation<SimNode, undefined>, budgetMs: number, now: () => number = () => performance.now()): boolean {
  const start = now()
  let ticks = 0
  do { sim.tick(); ticks++ } while (sim.alpha() >= sim.alphaMin() && now() - start < budgetMs && ticks < 40)
  return sim.alpha() >= sim.alphaMin()
}

export function packPositions(nodes: SimNode[], into?: Float32Array): Float32Array {
  const out = into && into.length === nodes.length * 2 ? into : new Float32Array(nodes.length * 2)
  nodes.forEach((n, i) => { out[i * 2] = n.x!; out[i * 2 + 1] = n.y! })
  return out
}
