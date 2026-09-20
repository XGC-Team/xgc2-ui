import type { GraphData, GroupId } from '../../lib/graph'
import type { KnowledgeNode, KnowledgePage } from './knowledge-snapshot'

function groupOf(node: KnowledgeNode): GroupId {
  // Grouping is presentation only. The server's kind and stable identity are
  // retained; filenames are not a second classification authority.
  if (node.kind === 'paper' || node.kind === 'concept' || node.kind === 'project' || node.kind === 'note') return node.kind
  return 'note'
}

/** O(V + E) projection; no edge folding, sampling or per-node edge scans. */
export function academicGraph(page: KnowledgePage): GraphData {
  if (!page.complete) throw new Error('Incomplete knowledge graph cannot be rendered as the library.')
  const index = new Map(page.nodes.map((node, i) => [node.id, i]))
  if (index.size !== page.nodes.length) throw new Error('Duplicate knowledge node.')
  const adj = new Map<number, number[]>(page.nodes.map((_, id) => [id, []]))
  const degrees = new Float64Array(page.nodes.length)
  const edges: GraphData['edges'] = []
  for (const edge of page.edges) {
    const s = index.get(edge.source), t = index.get(edge.target)
    if (s === undefined || t === undefined) throw new Error('Knowledge assertion has a missing endpoint.')
    edges.push({ s, t, self: edge.self, directed: true, kind: edge.kind, resolved: edge.resolved,
      resourceId: edge.id, sourceRevision: edge.sourceRevision, anchor: edge.anchor, targetHint: edge.targetHint })
    degrees[s]++
    if (s !== t) { adj.get(s)!.push(t); adj.get(t)!.push(s); degrees[t]++ }
  }
  return {
    complete: true, snapshot: page.snapshot, edges, adj,
    nodes: page.nodes.map((node, id) => {
      const degree = degrees[id], angle = id * 2.39996323, radius = 45 * Math.sqrt(id + 1)
      return {
        id, label: node.title, group: groupOf(node), degree, hub: degree >= 8,
        x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0,
        r: Math.min(10, 3 + Math.sqrt(degree)), mass: 1,
        unresolved: node.unresolved, resourceId: node.id, path: node.path, kind: node.kind,
      }
    }),
  }
}
