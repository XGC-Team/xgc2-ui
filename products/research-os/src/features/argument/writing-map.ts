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

/* ---------- layout: argument layers, top to bottom ---------- */

/** Rows follow the argument: problem → challenges → methods (+ assumptions) → lemmas/guarantees → evidence/revision/roadblocks. */
export const ROLE_ROW: Record<UnitRole | 'unknown', number> = { problem: 0, challenge: 1, method: 2, assumption: 2, lemma: 3, guarantee: 3, evidence: 4, revision: 4, roadblock: 4, unknown: 5 }
export const CARD = { w: 204, h: 80, gapX: 20, gapY: 84 }

export type Placed = { id: string; x: number; y: number }
/** Deterministic layered layout; within a row, units are ordered by the mean position of their neighbours in earlier rows. */
export function layoutUnits(units: readonly ArgumentUnit[], edges: readonly ArgumentEdge[]): Map<string, Placed> {
  const rows = new Map<number, ArgumentUnit[]>()
  for (const u of units) { const r = ROLE_ROW[u.role]; rows.set(r, [...(rows.get(r) ?? []), u]) }
  const pos = new Map<string, Placed>()
  const neighbours = (id: string) => edges.flatMap(e => e.from === id ? [e.to] : e.to === id ? [e.from] : [])
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(r)!
    const order = row.map((u, i) => {
      const xs = neighbours(u.id).map(n => pos.get(n)?.x).filter((x): x is number => x !== undefined)
      return { u, key: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY, i }
    }).sort((a, b) => a.key - b.key || a.i - b.i)
    const width = row.length * CARD.w + (row.length - 1) * CARD.gapX
    order.forEach(({ u }, i) => pos.set(u.id, { id: u.id, x: -width / 2 + i * (CARD.w + CARD.gapX), y: r * (CARD.h + CARD.gapY) }))
  }
  return pos
}
