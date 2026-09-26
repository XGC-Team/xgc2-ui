import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CARD, EDGE_TYPES, EDGE_WEIGHT, countCrossings, layoutUnits, parseIndex, parseUnits, parseWritingMap, unitsPathFor, weightedKey, DEFAULT_WRITING_MAP_DIR, ROLE_ROW, type ArgumentUnit, type Placed } from '../src/features/argument/writing-map'

const line = (o: object) => JSON.stringify(o)
const unit = (id: string, extra: object = {}) => ({ id, unit_id: id, title_zh: id, role: 'method', status: 'draft', why: 'w', adversarial_notes: 'a', writing_norms: 'n', formal_checks: [], ...extra })

describe('writing-map import (schema-semantic v0.2)', () => {
  it('reads units with their flesh, links and read-only anchors', () => {
    const map = parseWritingMap(line({ schema_version: '0.2.0', units_count: 2, unit_ids: ['U-A', 'U-B'] }), [
      line(unit('U-A', { role: 'guarantee', status: 'needs-rewrite', formal_checks: 'thm:x', decision_ids: ['D-107'], reply_kb_links: ['review/x.md'], latex_anchors: [{ file: 'manuscript/a.tex', line_start: 3, line_end: 9 }], edges: [{ to: 'U-B', type: 'depends_on' }] })),
      line(unit('U-B')),
    ].join('\n'))
    expect(map.diagnostics).toEqual([])
    const a = map.units[0]
    expect(a).toMatchObject({ id: 'U-A', role: 'guarantee', status: 'needs-rewrite', formal_checks: ['thm:x'], decision_ids: ['D-107'], line: 1 })
    expect(a.latex_anchors).toEqual([{ file: 'manuscript/a.tex', line_start: 3, line_end: 9, label: undefined }])
    expect(map.edges).toEqual([{ from: 'U-A', to: 'U-B', type: 'depends_on' }])
  })
  it('types edges strictly: unknown types, dangling targets and self edges are reported, not drawn', () => {
    const map = parseUnits([
      line(unit('U-A', { edges: [{ to: 'U-B', type: 'supports' }, { to: 'U-B', type: 'contradicts' }, { to: 'U-Z', type: 'refines' }, { to: 'U-A', type: 'refines' }, { to: 'U-B', type: 'supports' }] })),
      line(unit('U-B', { edges: [{ to: 'U-A', type: 'answers_reviewer' }, { to: 'U-A', type: 'conflicts_with' }] })),
    ].join('\n'))
    expect(map.edges.map(e => `${e.from}>${e.to}:${e.type}`)).toEqual(['U-A>U-B:supports', 'U-B>U-A:answers_reviewer', 'U-B>U-A:conflicts_with'])
    expect(map.diagnostics.map(d => d.message).join('\n')).toMatch(/unknown edge type "contradicts"[\s\S]*target unit not found[\s\S]*self edge/)
    expect(EDGE_TYPES).toEqual(['supports', 'depends_on', 'conflicts_with', 'refines', 'answers_reviewer'])
  })
  it('never coerces or invents: bad lines, duplicates, unknown roles and index mismatches become diagnostics', () => {
    const map = parseWritingMap(line({ schema_version: '0.3.1', units_count: 4, unit_ids: ['U-A', 'U-Q'] }), [
      '{not json', line({ title_zh: 'no id' }), line(unit('U-A', { role: 'theorem', status: 'done' })), line(unit('U-A')), '', line({ id: 'U-C', unit_id: 'U-X', role: 'lemma', status: 'open' }),
    ].join('\n'))
    expect(map.units.map(u => [u.id, u.role, u.rawRole, u.status])).toEqual([['U-A', 'unknown', 'theorem', 'unknown'], ['U-C', 'lemma', 'lemma', 'open']])
    const text = map.diagnostics.map(d => `${d.line ?? '-'} ${d.message}`).join('\n')
    expect(text).toMatch(/0\.3\.1/); expect(text).toMatch(/^1 not valid JSON/m); expect(text).toMatch(/^2 unit has neither/m)
    expect(text).toMatch(/unknown role "theorem"/); expect(text).toMatch(/^4 duplicate unit U-A/m); expect(text).toMatch(/"id" \(U-C\) and "unit_id" \(U-X\) differ/)
    expect(text).toMatch(/declares 4 units/); expect(text).toMatch(/missing from units.jsonl: U-Q/); expect(text).toMatch(/not listed in index.json: U-C/)
  })
  it('handles empty and broken inputs calmly', () => {
    expect(parseWritingMap(line({ schema_version: '0.2.0' }), '').units).toEqual([])
    expect(parseIndex('not json').diagnostics[0].message).toMatch(/not valid JSON/)
    expect(parseIndex(line({ schema_version: '0.2.0', units_path: '../escape.jsonl' })).index.units_path).toBeUndefined()
    expect(unitsPathFor(DEFAULT_WRITING_MAP_DIR + '/', {})).toBe(`${DEFAULT_WRITING_MAP_DIR}/units.jsonl`)
  })
  it('lays out argument layers top to bottom without overlaps', () => {
    const map = parseUnits([line(unit('P', { role: 'problem' })), line(unit('C1', { role: 'challenge', edges: [{ to: 'P', type: 'refines' }] })), line(unit('C2', { role: 'challenge' })), line(unit('G', { role: 'guarantee', edges: [{ to: 'C1', type: 'supports' }] }))].join('\n'))
    const pos = layoutUnits(map.units, map.edges)
    expect(pos.get('P')!.y).toBeLessThan(pos.get('C1')!.y); expect(pos.get('C1')!.y).toBeLessThan(pos.get('G')!.y)
    expect(pos.get('C1')!.x).not.toBe(pos.get('C2')!.x)
    expect(ROLE_ROW.lemma).toBe(ROLE_ROW.guarantee)
  })
  it('the bundled sample is clearly labelled and parses cleanly', () => {
    const dir = resolve(__dirname, '../public/fixtures/argument-canvas-sample')
    const map = parseWritingMap(readFileSync(`${dir}/index.json`, 'utf8'), readFileSync(`${dir}/units.jsonl`, 'utf8'))
    expect(map.diagnostics).toEqual([]); expect(map.units).toHaveLength(5); expect(map.index.venue).toMatch(/SAMPLE/)
    expect(map.edges.map(e => e.type).sort()).toEqual(['answers_reviewer', 'conflicts_with', 'depends_on', 'refines', 'supports'])
  })
})

// The paper side's live map, when this machine has it: the same importer must read it without errors.
const LIVE = '/workspace/repos/academic/project/paper-dmpc/review/tro-26-0979-v1/cleaned/reply-kb/writing-map'
import { existsSync } from 'node:fs'
describe.skipIf(!existsSync(`${LIVE}/index.json`))('live writing map (paper-dmpc, if present on this machine)', () => {
  it('imports with no diagnostics and reconciles with index.json', () => {
    const map = parseWritingMap(readFileSync(`${LIVE}/index.json`, 'utf8'), readFileSync(`${LIVE}/units.jsonl`, 'utf8'))
    expect(map.diagnostics.filter(d => d.level === 'error')).toEqual([])
    expect(map.units.length).toBe(map.index.units_count)
    expect(map.units.every(u => u.role !== 'unknown' && u.status !== 'unknown')).toBe(true)
  })
})


/* ---------- layout quality ---------- */
// The naive baseline: each band in input order, centred — what crossing reduction must beat or match.
function naive(units: readonly ArgumentUnit[]): Map<string, Placed> {
  const out = new Map<string, Placed>(), laid = layoutUnits(units, [])
  const bands = new Map<number, string[]>()
  for (const u of units) bands.set(laid.get(u.id)!.y, [...(bands.get(laid.get(u.id)!.y) ?? []), u.id])
  for (const [y, ids] of bands) { const w = ids.length * CARD.w + (ids.length - 1) * CARD.gapX; ids.forEach((id, j) => out.set(id, { id, x: -w / 2 + j * (CARD.w + CARD.gapX), y })) }
  return out
}
const shuffle = <T,>(xs: readonly T[], seed: number) => { const a = [...xs]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

describe('argument layout (Sugiyama-style)', () => {
  const crafted = parseUnits([
    line(unit('P', { role: 'problem' })),
    line(unit('C1', { role: 'challenge', edges: [{ to: 'P', type: 'refines' }] })), line(unit('C2', { role: 'challenge', edges: [{ to: 'P', type: 'refines' }] })), line(unit('C3', { role: 'challenge' })),
    line(unit('M1', { role: 'method', edges: [{ to: 'C3', type: 'supports' }] })), line(unit('M2', { role: 'method', edges: [{ to: 'C2', type: 'supports' }] })), line(unit('M3', { role: 'method', edges: [{ to: 'C1', type: 'supports' }] })),
    line(unit('A1', { role: 'assumption', edges: [{ to: 'M3', type: 'supports' }] })),
    line(unit('G1', { role: 'guarantee', edges: [{ to: 'M3', type: 'depends_on' }, { to: 'A1', type: 'depends_on' }] })), line(unit('G2', { role: 'guarantee', edges: [{ to: 'M1', type: 'depends_on' }] })),
  ].join('\n'))
  it('places every unit, deterministically', () => {
    const a = layoutUnits(crafted.units, crafted.edges), b = layoutUnits(crafted.units, crafted.edges)
    expect([...a.keys()].sort()).toEqual(crafted.units.map(u => u.id).sort())
    expect([...a.entries()]).toEqual([...b.entries()])
  })
  it('does not depend on edge input order', () => {
    const base = layoutUnits(crafted.units, crafted.edges)
    for (const seed of [1, 7, 42]) expect(layoutUnits(crafted.units, shuffle(crafted.edges, seed))).toEqual(base)
  })
  it('untangles what a single naive pass leaves crossed', () => {
    expect(countCrossings(naive(crafted.units), crafted.edges)).toBeGreaterThan(0)
    expect(countCrossings(layoutUnits(crafted.units, crafted.edges), crafted.edges)).toBe(0)
  })
  it('gives assumptions their own sub-band between methods and guarantees, never stacked on a method', () => {
    const pos = layoutUnits(crafted.units, crafted.edges)
    const y = (id: string) => pos.get(id)!.y
    expect(y('A1')).toBeGreaterThan(y('M1') + CARD.h); expect(y('A1') + CARD.h).toBeLessThan(y('G1'))
    for (const m of ['M1', 'M2', 'M3']) expect([pos.get(m)!.x, y(m)]).not.toEqual([pos.get('A1')!.x, y('A1')])
    // without assumptions the band disappears: methods → guarantees is one full pitch
    const noA = parseUnits([line(unit('M', { role: 'method' })), line(unit('G', { role: 'guarantee', edges: [{ to: 'M', type: 'depends_on' }] }))].join('\n'))
    const p2 = layoutUnits(noA.units, noA.edges)
    expect(p2.get('G')!.y - p2.get('M')!.y).toBe(CARD.h + CARD.gapY)
  })
  it('keeps cards in a band apart and bands calmly spaced', () => {
    const pos = layoutUnits(crafted.units, crafted.edges)
    const byY = new Map<number, number[]>()
    for (const p of pos.values()) byY.set(p.y, [...(byY.get(p.y) ?? []), p.x])
    for (const xs of byY.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CARD.w + CARD.gapX) }
    const ys = [...byY.keys()].sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(CARD.h + 30)
  })
  it('keys by weighted median (≥3) or weighted mean (1–2); weights follow relation strength', () => {
    expect(weightedKey([])).toBeUndefined()
    expect(weightedKey([{ x: 10, w: 1 }])).toBe(10)
    expect(weightedKey([{ x: 0, w: 1 }, { x: 30, w: 2 }])).toBe(20)
    expect(weightedKey([{ x: 0, w: 1 }, { x: 5, w: 1 }, { x: 1000, w: 1 }])).toBe(5)
    expect(weightedKey([{ x: 0, w: 0.35 }, { x: 5, w: 0.35 }, { x: 1000, w: 1 }])).toBe(1000)
    expect(EDGE_WEIGHT.supports).toBeGreaterThan(EDGE_WEIGHT.conflicts_with)
    expect(Object.keys(EDGE_WEIGHT).sort()).toEqual([...EDGE_TYPES].sort())
  })
  it('the labelled sample still lays out cleanly', () => {
    const dir = resolve(__dirname, '../public/fixtures/argument-canvas-sample')
    const map = parseWritingMap(readFileSync(`${dir}/index.json`, 'utf8'), readFileSync(`${dir}/units.jsonl`, 'utf8'))
    const pos = layoutUnits(map.units, map.edges)
    expect(pos.size).toBe(5); expect(countCrossings(pos, map.edges)).toBeLessThanOrEqual(countCrossings(naive(map.units), map.edges))
  })
})

describe.skipIf(!existsSync(`${LIVE}/index.json`))('live writing map layout (if present)', () => {
  it('reduces crossings well below the naive ordering and separates the assumption band', () => {
    const map = parseWritingMap(readFileSync(`${LIVE}/index.json`, 'utf8'), readFileSync(`${LIVE}/units.jsonl`, 'utf8'))
    const pos = layoutUnits(map.units, map.edges)
    expect(pos.size).toBe(map.units.length)
    expect(countCrossings(pos, map.edges)).toBeLessThan(countCrossings(naive(map.units), map.edges))
    const methodY = new Set(map.units.filter(u => u.role === 'method').map(u => pos.get(u.id)!.y))
    for (const u of map.units.filter(u => u.role === 'assumption')) expect(methodY.has(pos.get(u.id)!.y)).toBe(false)
  })
})
