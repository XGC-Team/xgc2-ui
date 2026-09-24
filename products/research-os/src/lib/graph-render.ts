import type { GraphCamera } from './graph-camera'

/* Pure helpers behind the knowledge-graph renderer: hit testing, label selection, camera flights, level of detail. */

/** Uniform grid over world coordinates: O(1) pointer hit tests instead of scanning every node per mousemove. */
export class PointGrid {
  private cells = new Map<string, number[]>()
  constructor(private cell = 48) {}
  build(points: readonly { id: number; x: number; y: number }[]) {
    this.cells.clear()
    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      const key = `${Math.floor(p.x / this.cell)}:${Math.floor(p.y / this.cell)}`
      const list = this.cells.get(key); if (list) list.push(p.id); else this.cells.set(key, [p.id])
    }
  }
  /** Nearest point within `radius(id)` of (x, y); radius is in world units. */
  nearest(x: number, y: number, points: readonly { x: number; y: number }[], radius: (id: number) => number): number {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell)
    let best = -1, bestD = Infinity
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const id of this.cells.get(`${i}:${j}`) ?? []) {
      const p = points[id], d = (p.x - x) ** 2 + (p.y - y) ** 2, r = radius(id)
      if (d <= r * r && d < bestD) { bestD = d; best = id }
    }
    return best
  }
}

/** How many ordinary labels to show: few when zoomed out (cluster names speak instead), all visible when close. */
export function labelBudget(k: number): number {
  // Below 0.75 the folder names speak; note titles fade in as the regions fade out.
  if (k >= 1.6) return 400
  return Math.round(Math.max(0, Math.min(180, (k - 0.75) * 210)))
}

/** Edge ink scales down with density so ten thousand links read as texture, not a black mass. */
export function edgeAlpha(edgeCount: number): number {
  return Math.max(0.045, Math.min(0.16, 0.16 - Math.log10(Math.max(1, edgeCount)) * 0.028))
}

/** Candidates at or above this priority are always placed (the focused note). Everything else respects collisions. */
export const PINNED = 2.5e6
export type LabelCandidate = { id: number; x: number; y: number; w: number; h: number; priority: number }
/** Greedy placement in priority order with a screen-space grid; a label that would collide is skipped, never overlapped. */
export function placeLabels(candidates: LabelCandidate[], max: number, cell = 64): number[] {
  const taken = new Map<string, { x0: number; x1: number; y0: number; y1: number }[]>()
  const out: number[] = []
  for (const c of [...candidates].sort((a, b) => b.priority - a.priority)) {
    if (out.length >= max && c.priority < PINNED) break
    const box = { x0: c.x - c.w / 2 - 3, x1: c.x + c.w / 2 + 3, y0: c.y - c.h, y1: c.y + 2 }
    const keys: string[] = []
    for (let i = Math.floor(box.x0 / cell); i <= Math.floor(box.x1 / cell); i++) for (let j = Math.floor(box.y0 / cell); j <= Math.floor(box.y1 / cell); j++) keys.push(`${i}:${j}`)
    const hit = keys.some(k => taken.get(k)?.some(b => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1))
    if (hit && c.priority < PINNED) continue
    for (const k of keys) { const l = taken.get(k); if (l) l.push(box); else taken.set(k, [box]) }
    out.push(c.id)
  }
  return out
}

export const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

/** A camera flight: duration grows gently with the on-screen distance, capped so it never drags. */
export function flight(from: GraphCamera, to: GraphCamera, view: { w: number; h: number }): number {
  const dx = (to.x - from.x) * Math.min(from.k, to.k), dy = (to.y - from.y) * Math.min(from.k, to.k)
  const screens = Math.hypot(dx / view.w, dy / view.h) + Math.abs(Math.log(to.k / from.k)) * 0.6
  return Math.round(Math.min(700, 260 + screens * 260))
}
export function cameraAt(from: GraphCamera, to: GraphCamera, t: number): GraphCamera {
  const e = easeInOutCubic(Math.max(0, Math.min(1, t)))
  // Zoom interpolates in log space so a large zoom change feels uniform.
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e) }
}

/** Camera that fits a set of points in the view with a margin (weighted toward dense regions). */
export function fitCamera(points: readonly { x: number; y: number; degree: number }[], view: { w: number; h: number }, margin = 80): GraphCamera {
  if (!points.length) return { x: 0, y: 0, k: 1 }
  const xs = points.map(p => p.x).sort((a, b) => a - b), ys = points.map(p => p.y).sort((a, b) => a - b)
  // Trim the outer 1% so a few stray leaves don't shrink the whole atlas.
  const lo = (a: number[]) => a[Math.floor(a.length * 0.01)], hi = (a: number[]) => a[Math.ceil(a.length * 0.99) - 1]
  const minX = lo(xs), maxX = hi(xs), minY = lo(ys), maxY = hi(ys)
  const k = Math.min((view.w - margin * 2) / Math.max(1, maxX - minX), (view.h - margin * 2) / Math.max(1, maxY - minY), 1.6)
  return { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2, k: Math.max(0.05, k) }
}

/** World-space node radius: past 1× zoom nodes grow only with √k on screen, so a close view stays readable, not blobby. */
export const worldRadius = (r: number, k: number) => k > 1 ? r / Math.sqrt(k) : r

/** Client-side ranking of search hits: exact title, title prefix, all words in title, path, then connectedness. */
export function rankMatches<T extends { title: string; path?: string; unresolved?: boolean }>(nodes: readonly T[], query: string, degree: (node: T) => number = () => 0): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/).filter(Boolean)
  const score = (n: T) => {
    const title = n.title.toLowerCase(), path = (n.path ?? '').toLowerCase()
    let s = 0
    if (title === q) s += 1000
    else if (title.startsWith(q)) s += 600
    else if (new RegExp(`(^|[^\\p{L}\\p{N}])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(title)) s += 450
    else if (title.includes(q)) s += 300
    if (words.every(w => title.includes(w))) s += 150
    if (words.every(w => path.includes(w))) s += 40
    return s + Math.min(30, degree(n))
  }
  return nodes.filter(n => !n.unresolved).map(n => ({ n, s: score(n) })).sort((a, b) => b.s - a.s || a.n.title.localeCompare(b.n.title)).map(x => x.n)
}
