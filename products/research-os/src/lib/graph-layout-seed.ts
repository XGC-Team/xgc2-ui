import type { GraphData, GNode } from './graph'

/* Layout seeding and memory for the knowledge graph.
   - Nodes start near their folder's cluster centre (hubs innermost), so a large vault opens close to its final
     shape instead of exploding out of one phyllotaxis spiral — the simulation only has to relax, not discover.
   - Positions are remembered by resource identity. Filtering, local graphs, refreshes and returning to the page
     re-use them ("warm" layout): nothing re-blooms, nodes stay where the reader last saw them. */

export type Point = { x: number; y: number }
export const positionCache = new Map<string, Point>()

/** Cluster = the note's folder (memory/bulk/control/a.md → "control"); attachments and unresolved targets by kind. */
export function clusterKey(node: { path?: string; unresolved?: boolean; kind?: string }): string {
  if (node.unresolved || !node.path) return node.kind === 'attachment' ? 'attachments' : 'unresolved'
  const parts = node.path.replace(/^memory\//, '').split('/')
  return parts.length > 1 ? parts[parts.length - 2] : 'memory'
}

const GOLDEN = 2.399963229728653

/** Assigns `cluster` indices and seeds positions in place. Returns whether the layout is warm (mostly remembered). */
export function seedLayout(data: GraphData, cache: Map<string, Point> = positionCache): { warm: boolean; clusters: string[]; centers: Point[] } {
  const keys = new Map<string, number>(), clusters: string[] = []
  for (const n of data.nodes) {
    const key = clusterKey(n)
    let i = keys.get(key)
    if (i === undefined) { i = clusters.length; keys.set(key, i); clusters.push(key) }
    n.cluster = i
  }
  const members: number[][] = clusters.map(() => [])
  for (const n of data.nodes) members[n.cluster!].push(n.id)
  // Larger clusters nearer the middle; each cluster's disc area follows its size.
  const order = members.map((m, i) => i).sort((a, b) => members[b].length - members[a].length)
  const centers: Point[] = Array(clusters.length)
  let ring = 0
  order.forEach((c, rank) => {
    const radius = Math.sqrt(members[c].length) * 16
    const dist = rank === 0 ? 0 : ring + radius
    centers[c] = { x: Math.cos(rank * GOLDEN) * dist, y: Math.sin(rank * GOLDEN) * dist }
    ring = Math.max(ring, dist * 0.55 + radius)
  })
  let remembered = 0
  for (const n of data.nodes) { const p = n.resourceId ? cache.get(n.resourceId) : undefined; if (p) { n.x = p.x; n.y = p.y; remembered++ } else n.x = n.y = NaN }
  // New nodes: beside a remembered neighbour if there is one, else inside their cluster disc (hubs first).
  for (const c of order) {
    const list = members[c].map(id => data.nodes[id]).filter(n => Number.isNaN(n.x)).sort((a, b) => b.degree - a.degree)
    list.forEach((n, i) => {
      const anchor = (data.adj.get(n.id) ?? []).map(id => data.nodes[id]).find(m => !Number.isNaN(m.x) && m.resourceId && cache.has(m.resourceId))
      if (anchor) { const a = n.id * GOLDEN; n.x = anchor.x + Math.cos(a) * 24; n.y = anchor.y + Math.sin(a) * 24; return }
      const r = 11 * Math.sqrt(i + 0.5)
      n.x = centers[c].x + Math.cos(i * GOLDEN) * r
      n.y = centers[c].y + Math.sin(i * GOLDEN) * r
    })
  }
  for (const n of data.nodes) { n.vx = 0; n.vy = 0 }
  return { warm: data.nodes.length > 0 && remembered / data.nodes.length >= 0.8, clusters, centers }
}

export function rememberPositions(nodes: readonly GNode[], cache: Map<string, Point> = positionCache) {
  for (const n of nodes) if (n.resourceId && Number.isFinite(n.x) && Number.isFinite(n.y)) cache.set(n.resourceId, { x: n.x, y: n.y })
  // Bound memory: a vault is thousands of notes, not millions; drop the oldest entries past the cap.
  const cap = 50_000
  if (cache.size > cap) { let drop = cache.size - cap; for (const key of cache.keys()) { if (drop-- <= 0) break; cache.delete(key) } }
}

/** Force parameters scaled to graph size: dense vaults need weaker, shorter-range repulsion and shorter links. */
export function forceParams(nodeCount: number, edgeCount: number) {
  const big = nodeCount > 800
  return {
    charge: big ? -30 : -150, distanceMax: big ? 160 : 900, theta: big ? 0.95 : 0.9,
    linkDistance: big ? 34 : 80, linkStrength: edgeCount / Math.max(1, nodeCount) > 2.5 ? 0.12 : 0.2,
    collide: big ? 2.5 : 9, cluster: big ? 0.14 : 0.02, alphaDecay: big ? 0.045 : 0.035, velocityDecay: 0.42,
  }
}
