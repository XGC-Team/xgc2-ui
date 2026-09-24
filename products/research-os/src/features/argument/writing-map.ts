/* Design Argument Canvas — importer for the paper side's writing map (schema-semantic.md, v0.2).
   Authority lives with the paper: `index.json` + `units.jsonl` under the project's writing-map folder.
   Units are semantic argument blocks (not sentences); `mapping-seed.jsonl` is a subordinate locator layer
   and is never read as canvas nodes. Parsing is tolerant: a bad line or unknown value becomes a visible
   diagnostic with its line number — nothing is invented, renamed or silently dropped. */

export const DEFAULT_WRITING_MAP_DIR = 'review/tro-26-0979-v1/cleaned/reply-kb/writing-map'
export const UNIT_ROLES = ['problem', 'challenge', 'method', 'guarantee', 'lemma', 'assumption', 'evidence', 'revision', 'roadblock'] as const
export const UNIT_STATUSES = ['stable', 'draft', 'needs-rewrite', 'blocked', 'open'] as const
export const EDGE_TYPES = ['supports', 'depends_on', 'conflicts_with', 'refines', 'answers_reviewer'] as const
export type UnitRole = typeof UNIT_ROLES[number]
export type UnitStatus = typeof UNIT_STATUSES[number]
export type EdgeType = typeof EDGE_TYPES[number]

export type LatexAnchor = { file: string; line_start?: number; line_end?: number; label?: string }
export type ArgumentUnit = {
  id: string; title_zh: string; title_en: string
  /** Unknown values are kept verbatim (and reported), never coerced into a known role/status. */
  role: UnitRole | 'unknown'; rawRole: string
  status: UnitStatus | 'unknown'; rawStatus: string
  why: string; adversarial_notes: string; writing_norms: string; formal_checks: string[]
  vault_links: string[]; reply_kb_links: string[]; decision_ids: string[]; figure_ids: string[]
  theory_links: string[]; claim_ids: string[]; sentence_ids: string[]; scheme_ids: string[]; thrust_ids: string[]
  latex_anchors: LatexAnchor[]; blocked_by: string | null; last_synced: string
  line: number
}
export type ArgumentEdge = { from: string; to: string; type: EdgeType }
export type WritingMapIndex = { paper_id?: string; project?: string; venue?: string; schema_version?: string; units_path?: string; units_count?: number; unit_ids?: string[]; generated_at?: string }
export type Diagnostic = { level: 'error' | 'warning'; line?: number; message: string }
export type WritingMap = { index: WritingMapIndex; units: ArgumentUnit[]; edges: ArgumentEdge[]; diagnostics: Diagnostic[] }

const str = (v: unknown): string => typeof v === 'string' ? v : ''
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : typeof v === 'string' && v.trim() ? [v] : []

export function parseIndex(text: string): { index: WritingMapIndex; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  let raw: unknown
  try { raw = JSON.parse(text) } catch (error) { return { index: {}, diagnostics: [{ level: 'error', message: `index.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }] } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { index: {}, diagnostics: [{ level: 'error', message: 'index.json must be a JSON object.' }] }
  const r = raw as Record<string, unknown>
  const index: WritingMapIndex = {
    paper_id: str(r.paper_id) || undefined, project: str(r.project) || undefined, venue: str(r.venue) || undefined,
    schema_version: str(r.schema_version) || undefined, units_path: str(r.units_path) || undefined, generated_at: str(r.generated_at) || undefined,
    units_count: typeof r.units_count === 'number' ? r.units_count : undefined, unit_ids: Array.isArray(r.unit_ids) ? strings(r.unit_ids) : undefined,
  }
  if (!index.schema_version) diagnostics.push({ level: 'warning', message: 'index.json has no schema_version.' })
  else if (!/^0\.2(\.|$)/.test(index.schema_version)) diagnostics.push({ level: 'warning', message: `schema_version ${index.schema_version} — this canvas reads 0.2; unknown fields are ignored, known ones shown as-is.` })
  if (index.units_path && (index.units_path.startsWith('/') || index.units_path.split('/').includes('..'))) {
    diagnostics.push({ level: 'error', message: `units_path "${index.units_path}" must stay inside the writing-map folder.` }); index.units_path = undefined
  }
  return { index, diagnostics }
}

export function parseUnits(text: string, index: WritingMapIndex = {}): WritingMap {
  const diagnostics: Diagnostic[] = [], units: ArgumentUnit[] = [], pending: { from: string; to: string; type: string; line: number }[] = []
  const seen = new Set<string>()
  text.split('\n').forEach((source, i) => {
    const line = i + 1, trimmed = source.trim()
    if (!trimmed) return
    let raw: unknown
    try { raw = JSON.parse(trimmed) } catch { diagnostics.push({ level: 'error', line, message: 'not valid JSON; line skipped.' }); return }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { diagnostics.push({ level: 'error', line, message: 'a unit must be a JSON object; line skipped.' }); return }
    const r = raw as Record<string, unknown>
    const id = str(r.id) || str(r.unit_id)
    if (!id) { diagnostics.push({ level: 'error', line, message: 'unit has neither "id" nor "unit_id"; line skipped.' }); return }
    if (r.id && r.unit_id && r.id !== r.unit_id) diagnostics.push({ level: 'warning', line, message: `"id" (${r.id}) and "unit_id" (${r.unit_id}) differ; using "id".` })
    if (seen.has(id)) { diagnostics.push({ level: 'error', line, message: `duplicate unit ${id}; later line skipped.` }); return }
    seen.add(id)
    const rawRole = str(r.role), rawStatus = str(r.status)
    const role = (UNIT_ROLES as readonly string[]).includes(rawRole) ? rawRole as UnitRole : 'unknown'
    const status = (UNIT_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus as UnitStatus : 'unknown'
    if (role === 'unknown') diagnostics.push({ level: 'warning', line, message: `${id}: unknown role "${rawRole}".` })
    if (status === 'unknown') diagnostics.push({ level: 'warning', line, message: `${id}: unknown status "${rawStatus}".` })
    const latex_anchors: LatexAnchor[] = Array.isArray(r.latex_anchors) ? r.latex_anchors.flatMap(a => {
      const x = a as Record<string, unknown>
      if (!x || typeof x !== 'object' || !str(x.file)) { diagnostics.push({ level: 'warning', line, message: `${id}: a latex anchor without "file" was ignored.` }); return [] }
      return [{ file: str(x.file), line_start: typeof x.line_start === 'number' ? x.line_start : undefined, line_end: typeof x.line_end === 'number' ? x.line_end : undefined, label: str(x.label) || undefined }]
    }) : []
    units.push({
      id, title_zh: str(r.title_zh), title_en: str(r.title_en), role, rawRole, status, rawStatus,
      why: str(r.why), adversarial_notes: str(r.adversarial_notes), writing_norms: str(r.writing_norms), formal_checks: strings(r.formal_checks),
      vault_links: strings(r.vault_links), reply_kb_links: strings(r.reply_kb_links), decision_ids: strings(r.decision_ids), figure_ids: strings(r.figure_ids),
      theory_links: strings(r.theory_links), claim_ids: strings(r.claim_ids), sentence_ids: strings(r.sentence_ids), scheme_ids: strings(r.scheme_ids), thrust_ids: strings(r.thrust_ids),
      latex_anchors, blocked_by: str(r.blocked_by) || null, last_synced: str(r.last_synced), line,
    })
    if (r.edges !== undefined && !Array.isArray(r.edges)) diagnostics.push({ level: 'warning', line, message: `${id}: "edges" is not a list; ignored.` })
    for (const e of Array.isArray(r.edges) ? r.edges : []) {
      const x = e as Record<string, unknown>
      pending.push({ from: id, to: str(x?.to), type: str(x?.type), line })
    }
  })
  const ids = new Set(units.map(u => u.id))
  const edges: ArgumentEdge[] = []
  for (const e of pending) {
    if (!(EDGE_TYPES as readonly string[]).includes(e.type)) { diagnostics.push({ level: 'warning', line: e.line, message: `${e.from} → ${e.to || '?'}: unknown edge type "${e.type}"; edge not drawn.` }); continue }
    if (!ids.has(e.to)) { diagnostics.push({ level: 'warning', line: e.line, message: `${e.from} → ${e.to || '?'}: target unit not found; edge not drawn.` }); continue }
    if (e.to === e.from) { diagnostics.push({ level: 'warning', line: e.line, message: `${e.from}: self edge ignored.` }); continue }
    if (edges.some(x => x.from === e.from && x.to === e.to && x.type === e.type)) continue
    edges.push({ from: e.from, to: e.to, type: e.type as EdgeType })
  }
  if (index.units_count !== undefined && index.units_count !== units.length) diagnostics.push({ level: 'warning', message: `index.json declares ${index.units_count} units; units.jsonl has ${units.length} readable units.` })
  if (index.unit_ids) {
    const missing = index.unit_ids.filter(id => !ids.has(id)), extra = units.filter(u => !index.unit_ids!.includes(u.id)).map(u => u.id)
    if (missing.length) diagnostics.push({ level: 'warning', message: `listed in index.json but missing from units.jsonl: ${missing.join(', ')}` })
    if (extra.length) diagnostics.push({ level: 'warning', message: `in units.jsonl but not listed in index.json: ${extra.join(', ')}` })
  }
  return { index, units, edges, diagnostics }
}

export function parseWritingMap(indexText: string, unitsText: string): WritingMap {
  const { index, diagnostics } = parseIndex(indexText)
  const map = parseUnits(unitsText, index)
  return { ...map, diagnostics: [...diagnostics, ...map.diagnostics] }
}

/** Where units.jsonl lives: index.units_path relative to the writing-map folder (default "units.jsonl"). */
export function unitsPathFor(dir: string, index: WritingMapIndex): string {
  return `${dir.replace(/\/+$/, '')}/${index.units_path || 'units.jsonl'}`
}

/* ---------- layout: argument layers, top to bottom ----------
   Sugiyama-style, deterministic, pure:
   1. Bands by role (argument order). Assumptions get their own half-pitch sub-band between methods and
      lemmas/guarantees ("the method assumes …"), so they never stack on a method card; the band disappears
      when a map has no assumptions.
   2. Crossing reduction: alternating down/up sweeps. A unit's key is the weighted median (weighted mean for
      1–2 neighbours) of its neighbours' x in the bands already fixed in that sweep direction. Neighbours are
      weighted by edge type (supports/depends_on pull hardest, conflicts_with least) and by 1/band-span, so
      long edges pull less than adjacent ones. Units without such neighbours keep their slot.
   3. The ordering with the fewest measured crossings over all sweeps wins; ties keep the earlier ordering.
   4. For writing-map-sized graphs, a transpose pass swaps adjacent units while that strictly reduces crossings.
   Edges are normalised and sorted first, so the result does not depend on edge input order. */

/** Band rank per role; fractional ranks are sub-bands (assumption sits between method and lemma/guarantee). */
export const ROLE_ROW: Record<UnitRole | 'unknown', number> = { problem: 0, challenge: 1, method: 2, assumption: 2.5, lemma: 3, guarantee: 3, evidence: 4, revision: 4, roadblock: 4, unknown: 5 }
export const CARD = { w: 204, h: 80, gapX: 24, gapY: 96 }
/** Soft pull of each relation when ordering a band. Unknown or missing types fall back to 1 (unweighted). */
export const EDGE_WEIGHT: Record<EdgeType, number> = { supports: 1, depends_on: 1, answers_reviewer: 0.8, refines: 0.6, conflicts_with: 0.35 }
const SWEEPS = 8
const TRANSPOSE_MAX_EDGES = 300

export type Placed = { id: string; x: number; y: number }

/** Straight-line crossings between card centres (the measure the ordering minimises; also used by tests). */
export function countCrossings(pos: ReadonlyMap<string, Placed>, edges: readonly ArgumentEdge[]): number {
  const seg = edges.flatMap(e => { const a = pos.get(e.from), b = pos.get(e.to); return a && b ? [{ e, x1: a.x + CARD.w / 2, y1: a.y + CARD.h / 2, x2: b.x + CARD.w / 2, y2: b.y + CARD.h / 2 }] : [] })
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
  let n = 0
  for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) {
    const p = seg[i], q = seg[j]
    if (p.e.from === q.e.from || p.e.from === q.e.to || p.e.to === q.e.from || p.e.to === q.e.to) continue
    if (side(p.x1, p.y1, p.x2, p.y2, q.x1, q.y1) * side(p.x1, p.y1, p.x2, p.y2, q.x2, q.y2) < 0 && side(q.x1, q.y1, q.x2, q.y2, p.x1, p.y1) * side(q.x1, q.y1, q.x2, q.y2, p.x2, p.y2) < 0) n++
  }
  return n
}

/** Weighted median (≥3 neighbours) or weighted mean (1–2): the classic crossing-reduction key. */
export function weightedKey(values: readonly { x: number; w: number }[]): number | undefined {
  const v = values.filter(x => x.w > 0)
  if (!v.length) return undefined
  const total = v.reduce((a, b) => a + b.w, 0)
  if (v.length <= 2) return v.reduce((a, b) => a + b.x * b.w, 0) / total
  const sorted = [...v].sort((a, b) => a.x - b.x)
  let acc = 0
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i].w
    if (acc * 2 === total && i + 1 < sorted.length) return (sorted[i].x + sorted[i + 1].x) / 2
    if (acc * 2 > total) return sorted[i].x
  }
  return sorted[sorted.length - 1].x
}

export function layoutUnits(units: readonly ArgumentUnit[], edges: readonly ArgumentEdge[]): Map<string, Placed> {
  // bands in argument order; y accumulates so a sub-band takes a shorter pitch than a full band
  const ranks = [...new Set(units.map(u => ROLE_ROW[u.role]))].sort((a, b) => a - b)
  const bands = ranks.map(rank => units.filter(u => ROLE_ROW[u.role] === rank).map(u => u.id))
  const bandOf = new Map<string, number>()
  bands.forEach((band, i) => band.forEach(id => bandOf.set(id, i)))
  const ys: number[] = []
  ranks.forEach((rank, i) => {
    if (!i) { ys.push(0); return }
    const step = rank - ranks[i - 1]
    // a full band step: card + gap; a half step (sub-band): card + a narrower gap
    ys.push(ys[i - 1] + (step >= 1 ? CARD.h + CARD.gapY : CARD.h + CARD.gapY * 0.45))
  })

  // normalised, sorted adjacency (independent of edge input order); weight = relation × 1/span
  const norm = [...edges].filter(e => bandOf.has(e.from) && bandOf.has(e.to) && e.from !== e.to)
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type))
  const adj = new Map<string, { id: string; w: number }[]>()
  for (const e of norm) {
    const span = Math.max(1, Math.abs(ranks[bandOf.get(e.from)!] - ranks[bandOf.get(e.to)!]))
    const w = (EDGE_WEIGHT[e.type] ?? 1) / span
    adj.set(e.from, [...(adj.get(e.from) ?? []), { id: e.to, w }])
    adj.set(e.to, [...(adj.get(e.to) ?? []), { id: e.from, w }])
  }

  const pitch = CARD.w + CARD.gapX
  const place = (order: string[][]): Map<string, Placed> => {
    const pos = new Map<string, Placed>()
    order.forEach((band, i) => {
      const width = band.length * CARD.w + (band.length - 1) * CARD.gapX
      band.forEach((id, j) => pos.set(id, { id, x: -width / 2 + j * pitch, y: ys[i] }))
    })
    return pos
  }
  const reorder = (order: string[][], i: number, fixed: (band: number) => boolean) => {
    const pos = place(order)
    const keyed = order[i].map((id, slot) => {
      const key = weightedKey((adj.get(id) ?? []).filter(n => fixed(bandOf.get(n.id)!)).map(n => ({ x: pos.get(n.id)!.x, w: n.w })))
      return { id, key: key ?? pos.get(id)!.x, slot }
    })
    keyed.sort((a, b) => a.key - b.key || a.slot - b.slot)
    order[i] = keyed.map(k => k.id)
  }

  const order = bands.map(b => [...b])
  let best = order.map(b => [...b]), bestCrossings = countCrossings(place(order), norm)
  let quiet = 0
  for (let sweep = 0; sweep < SWEEPS && quiet < 2; sweep++) {
    const before = JSON.stringify(order)
    if (sweep % 2 === 0) for (let i = 1; i < order.length; i++) reorder(order, i, b => b < i)
    else for (let i = order.length - 2; i >= 0; i--) reorder(order, i, b => b > i)
    const crossings = countCrossings(place(order), norm)
    if (crossings < bestCrossings) { bestCrossings = crossings; best = order.map(b => [...b]) }
    quiet = JSON.stringify(order) === before ? quiet + 1 : 0 // stop once a down and an up sweep both change nothing
  }
  // 4. Transpose (local refinement): swap neighbouring units in a band while that strictly lowers the count.
  //    Each check is O(E²), so it runs only for maps of writing-map size, not for bulk imports.
  if (norm.length <= TRANSPOSE_MAX_EDGES) {
    let improved = true, rounds = 0
    while (improved && rounds++ < 6) {
      improved = false
      for (const band of best) for (let j = 0; j + 1 < band.length; j++) {
        ;[band[j], band[j + 1]] = [band[j + 1], band[j]]
        const crossings = countCrossings(place(best), norm)
        if (crossings < bestCrossings) { bestCrossings = crossings; improved = true } else [band[j], band[j + 1]] = [band[j + 1], band[j]]
      }
    }
  }
  return place(best)
}
