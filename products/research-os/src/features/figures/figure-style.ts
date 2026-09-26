/* Figure Style Foundation — the academic figure style pack as versioned product data.
   Norms + hooks, not figure sources: the paper keeps its `.tikz` / `.py` under `figures-src/`, and the
   policy text stays authoritative in the paper repo (`docs/figure-inventory.md` §5). This module mirrors
   the pack values (sizes, tokens, bans, checklist) and reads the paper's own files, when present, only to
   show them verbatim and report drift. It never renders, converts or checks a figure. */

import type { ArgumentUnit } from '../argument/writing-map'

export const FIGURE_STYLE_VERSION = '1.0.0'
/** Stable id carried into Chat context; the version is part of the reference, never inferred. */
export const FIGURE_STYLE_REF = `research-os/figure-style@${FIGURE_STYLE_VERSION}`

export type StackEntry = { id: 'tikz' | 'matplotlib'; name: string; scope: string; source: string; rules: string[] }
export type Ban = { id: string; name: string; detail: string }
export type ColorToken = { name: string; hex: string; rgb: [number, number, number] }
export type CheckItem = { id: string; text: string; how?: string }

export const FIGURE_STYLE_PACK = {
  version: FIGURE_STYLE_VERSION,
  decided: '2026-09-25',
  lineage: 'IEEEtran journal (T-RO 26-0979): Times text, Computer Modern math',
  stack: [
    { id: 'tikz', name: 'TikZ', scope: 'Schematics, block diagrams, constraint geometry, and the layout of photo / RViz / video-frame collages.',
      source: 'figures-src/tikz/<fig>.tex|.tikz, \\input into the manuscript',
      rules: ['Bitmaps only under figures-src/raster/assets/, each with provenance; TikZ lays them out and annotates them.', 'Math in CM, size set by the body text.', 'Colours come from the shared preamble; no per-figure \\definecolor.'] },
    { id: 'matplotlib', name: 'Python matplotlib + figstyle.py', scope: 'Every data plot.',
      source: 'figures-src/py/<fig>.py (one script per figure; input path + data sha in the header), styled by figures-src/py/figstyle.py',
      rules: ['Draw at the printed size (3.5 in column / 7.16 in text); never draw large and let LaTeX shrink it.', 'Body 8 pt; text Times, math CM (or text.usetex).', 'Save PDF directly with embedded fonts (Type 42).'] },
  ] as StackEntry[],
  bans: [
    { id: 'drawio', name: 'DrawIO', detail: 'Retired for new and revised figures, including photo / RViz collages. Legacy .drawio is read-only migration input, deleted once migrated and regression-checked.' },
    { id: 'matlab', name: 'MATLAB', detail: 'Retired for figure output. Legacy .m plots are rewritten in Python with figstyle.py before the plot/matlab path is removed.' },
    { id: 'legacy-source', name: 'plot/drawio · plot/matlab as editable source', detail: 'Never maintain them as the source of truth.' },
    { id: 'private-colour', name: 'Per-figure \\definecolor', detail: 'Colour tokens live in the shared preamble / style only.' },
    { id: 'unsourced-bitmap', name: 'Hot-linked or unsourced bitmaps', detail: 'No retailer CDN images; every raster asset carries its provenance.' },
  ] as Ban[],
  layout: { columnIn: 3.5, textIn: 7.16, subfigIn: 3.47, bodyPt: 8, smallPt: 7, axesLinePt: 0.6, linePt: 1.0, gridLinePt: 0.4 },
  /** Schematic ink (TikZ): the manuscript's own mit* colours — mirrored, not a new palette. */
  ink: [
    { name: 'mitr', hex: '#750014', rgb: [117, 0, 20] },
    { name: 'mitSG', hex: '#8B959E', rgb: [139, 149, 158] },
    { name: 'mitPurple', hex: '#9933FF', rgb: [153, 51, 255] },
    { name: 'mitblue', hex: '#1966FF', rgb: [25, 102, 255] },
    { name: 'mitGreen', hex: '#00AD00', rgb: [0, 173, 0] },
    { name: 'mitPink', hex: '#FF14F0', rgb: [255, 20, 240] },
  ] as ColorToken[],
  /** Data series (matplotlib): figstyle.py PALETTE, Okabe-Ito, colour-blind safe; one colour per method across figures. */
  series: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#000000'],
  checklist: [
    { id: 'fonts-embedded', text: 'All fonts embedded.', how: 'pdffonts <fig>.pdf: every row emb = yes' },
    { id: 'no-type3', text: 'No Type 3 fonts.', how: 'pdffonts: no "Type 3" in the type column' },
    { id: 'width', text: 'Width equals the column (3.5 in) or text width (7.16 in); no scaling of data plots.' },
    { id: 'caption', text: 'Caption complete (R15): every subfigure names its quantity, unit and legend meaning.' },
    { id: 'single-source', text: 'Single source under figures-src/; manuscript/figures/ holds generated output only.' },
    { id: 'provenance', text: 'Raster assets and data inputs carry provenance (path + sha).' },
  ] as CheckItem[],
  /** Owned elsewhere; named here so nobody expects the OS to do it. */
  deferred: ['Pixel regression before retiring a legacy source (T13, on the paper side).', 'Rendering or previewing figures; the OS shows norms and never claims a render.'],
} as const

export type FigureStylePack = typeof FIGURE_STYLE_PACK

/* ── Seed from the paper repository (all paths project-relative, configurable) ── */

export type SeedPaths = { policy: string; figstyle: string; preamble: string }
export const DEFAULT_SEED_PATHS: SeedPaths = { policy: 'docs/figure-inventory.md', figstyle: 'figures-src/py/figstyle.py', preamble: 'manuscript/preamble/macros.tex' }

export type PolicySection = { heading: string; body: string; line: number }
/** The paper's §5 (figure policy), verbatim, from its level-2 heading up to the next level-2 heading. */
export function extractPolicySection(markdown: string, section = '5'): PolicySection | null {
  const lines = markdown.split('\n')
  const head = new RegExp(`^##\\s+${section.replace('.', '\\.')}(?:[.．、\\s]|$)`)
  const start = lines.findIndex(l => head.test(l))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break }
  return { heading: lines[start].replace(/^##\s+/, '').trim(), body: lines.slice(start + 1, end).join('\n').trim(), line: start + 1 }
}

export type PyParam = { name: string; value: string; line: number }
/** Drop a trailing `# comment`, but not a `#` inside a string literal (hex colours). */
function stripPyComment(line: string): string {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = '' }
    else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#') return line.slice(0, i).trimEnd()
  }
  return line.trimEnd()
}
export type Figstyle = { constants: PyParam[]; rc: PyParam[] }
/** Read-only view of figstyle.py: top-level UPPER_CASE constants and the rcParams it sets. Nothing is executed. */
export function parseFigstyle(source: string): Figstyle {
  const constants: PyParam[] = [], rc: PyParam[] = []
  let inRc = false
  source.split('\n').forEach((text, i) => {
    const line = i + 1, raw = stripPyComment(text)
    const constant = /^([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/.exec(raw)
    if (constant) { constants.push({ name: constant[1], value: constant[2], line }); return }
    if (/rcParams\.update\(\s*\{/.test(raw)) { inRc = true; return }
    if (inRc && /^\s*\}\s*\)/.test(raw)) { inRc = false; return }
    const entry = inRc ? /^\s*['"]([\w.]+)['"]\s*:\s*(.+?),?$/.exec(raw) : null
    if (entry) rc.push({ name: entry[1], value: entry[2], line })
  })
  return { constants, rc }
}

export type TexColor = { name: string; model: string; spec: string; hex?: string; line: number }
export function parseTexColors(source: string): TexColor[] {
  const out: TexColor[] = []
  source.split('\n').forEach((raw, i) => {
    if (/^\s*%/.test(raw)) return
    for (const m of raw.matchAll(/\\definecolor\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}/g)) {
      const [, name, model, spec] = m
      let hex: string | undefined
      if (model === 'RGB') { const v = spec.split(',').map(s => Number(s.trim())); if (v.length === 3 && v.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) hex = `#${v.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()}` }
      else if (model === 'HTML' && /^[0-9a-f]{6}$/i.test(spec.trim())) hex = `#${spec.trim().toUpperCase()}`
      out.push({ name, model, spec, hex, line: i + 1 })
    }
  })
  return out
}

export type Drift = { kind: 'value' | 'missing' | 'unparsed'; token: string; pack: string; seed: string; line?: number }
/** Where the paper's files disagree with the pack. The paper wins; the pack only reports. */
export function seedDrift(pack: FigureStylePack, seed: { figstyle?: Figstyle | null; colors?: TexColor[] | null }): Drift[] {
  const out: Drift[] = []
  if (seed.colors) for (const token of pack.ink) {
    const found = seed.colors.find(c => c.name === token.name)
    if (!found) out.push({ kind: 'missing', token: token.name, pack: token.hex, seed: '—' })
    else if (!found.hex) out.push({ kind: 'unparsed', token: token.name, pack: token.hex, seed: `{${found.model}}{${found.spec}}`, line: found.line })
    else if (found.hex !== token.hex) out.push({ kind: 'value', token: token.name, pack: token.hex, seed: found.hex, line: found.line })
  }
  if (seed.figstyle) {
    const num = (name: string, expected: number, list: PyParam[]) => {
      const p = list.find(x => x.name === name)
      if (!p) out.push({ kind: 'missing', token: name, pack: String(expected), seed: '—' })
      else if (Number(p.value) !== expected) out.push({ kind: Number.isFinite(Number(p.value)) ? 'value' : 'unparsed', token: name, pack: String(expected), seed: p.value, line: p.line })
    }
    num('COLUMN_IN', pack.layout.columnIn, seed.figstyle.constants)
    num('TEXT_IN', pack.layout.textIn, seed.figstyle.constants)
    num('BASE_PT', pack.layout.bodyPt, seed.figstyle.constants)
    num('pdf.fonttype', 42, seed.figstyle.rc)
    const palette = seed.figstyle.constants.find(c => c.name === 'PALETTE')
    if (palette) {
      const hexes = [...palette.value.matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0].toUpperCase())
      if (hexes.join() !== pack.series.join()) out.push({ kind: 'value', token: 'PALETTE', pack: pack.series.join(' '), seed: hexes.join(' ') || palette.value, line: palette.line })
    }
  }
  return out
}

/* ── Hooks into Chat and the Argument Canvas ── */

const FIGURE_TALK = /\b(?:fig(?:ure)?s?\.?|tikz|pgfplots|matplotlib|figstyle|plots?|plotting|drawio|matlab|subfig(?:ure)?s?|captions?|pdffonts)\b|图件|作图|画图|出图|配图|图注|子图|示意图|数据图|框图|拼版/i
/** Does this draft talk about figures? Used only to offer (never auto-attach) the style pack. */
export const isFigureTalk = (text: string) => FIGURE_TALK.test(text)

/** A unit is figure-related when the paper links a figure to it (figure_ids or a fig: LaTeX label). */
export const isFigureUnit = (unit: Pick<ArgumentUnit, 'figure_ids' | 'latex_anchors'>) =>
  unit.figure_ids.length > 0 || unit.latex_anchors.some(a => a.label?.startsWith('fig:'))

export type SeedSummary = { path: string; digest?: string; heading?: string } | null
/** The compact brief an agent receives with the context item. States what was and was not seeded. */
export function figureStyleBrief(pack: FigureStylePack = FIGURE_STYLE_PACK, seed: SeedSummary = null): string {
  const l = pack.layout
  return [
    `Figure style pack v${pack.version} (${pack.lineage}).`,
    `Allowed stack only: ${pack.stack.map(s => `${s.name} — ${s.scope}`).join(' ')}`,
    `Banned: ${pack.bans.map(b => b.name).join('; ')}.`,
    `Size: column ${l.columnIn} in, text ${l.textIn} in; body ${l.bodyPt} pt, ticks/legend ${l.smallPt} pt; draw at print size.`,
    `Ink (TikZ, shared preamble): ${pack.ink.map(c => `${c.name} ${c.hex}`).join(', ')}. Series (figstyle PALETTE): ${pack.series.join(' ')}.`,
    `Checklist: ${pack.checklist.map(c => c.text).join(' ')}`,
    seed ? `Paper policy: ${seed.path}${seed.heading ? ` § ${seed.heading}` : ''}${seed.digest ? ` @ ${seed.digest}` : ''} is authoritative.` : 'Paper policy seed not read; norms above are the pack mirror.',
    'Research OS does not render or check figures; report pdffonts / build results only when actually run.',
  ].join('\n')
}
