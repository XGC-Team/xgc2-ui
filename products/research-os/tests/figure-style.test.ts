import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
vi.stubGlobal('document', { documentElement: { lang: 'en' } })
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../src/lib/api', async () => ({ ...await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api'), request }))

const { APIError } = await import('../src/lib/api')
const { DEFAULT_SEED_PATHS, FIGURE_STYLE_PACK, FIGURE_STYLE_REF, extractPolicySection, figureStyleBrief, isFigureTalk, isFigureUnit, parseFigstyle, parseTexColors, seedDrift } = await import('../src/features/figures/figure-style')
const { figureStyleContextItem, loadFigureStyleSeed } = await import('../src/features/figures/useFigureStyleSeed')
const { contextManifest, checkContextForSend, restoreContextItems } = await import('../src/features/projects/context-model')
const { resourceKey, resourceTitle, openResourceInLayout, restoreResourceLayout } = await import('../src/features/workbench/resource-model')
const { useWorkbench } = await import('../src/store')
const { FigureStylePage } = await import('../src/features/figures/FigureStylePage')

const POLICY = ['# Inventory', '## 4. Risks', 'old', '## 5. 图件政策（DrawIO / MATLAB 整体退役）', '> **硬约束**：DrawIO 与 MATLAB 整体退役。', '', '### sub', 'only TikZ + figstyle', '## 6. Log', 'later'].join('\n')
const FIGSTYLE = [
  'import matplotlib as mpl', 'COLUMN_IN = 3.5', 'TEXT_IN = 7.16', 'SUBFIG_IN = 0.485 * TEXT_IN  # 2-up', 'BASE_PT = 8',
  "PALETTE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#000000']",
  'def apply(usetex=False):', '    mpl.rcParams.update({', "        'font.size': BASE_PT,", "        'pdf.fonttype': 42,", "        'text.usetex': usetex,", '    })',
].join('\n')
const MACROS = ['% colours', '\\definecolor{mitr}{RGB}{117,0,20}', '\\definecolor{mitSG}{RGB}{139,149,158}', '\\definecolor{mitPurple}{RGB}{153,51,255}', '\\definecolor{mitblue}{RGB}{25,102,255}', '\\definecolor{mitGreen}{RGB}{0,173,0}', '\\definecolor{mitPink}{RGB}{255,20,240}', '% \\definecolor{ghost}{RGB}{1,2,3}'].join('\n')

const serve = (files: Record<string, string>) => request.mockImplementation(async (path: string) => {
  const rel = decodeURIComponent(path.replace(/^\/workspaces\/[^/]+\/files\//, ''))
  if (rel in files) return { content: files[rel], digest: `sha:${rel.length}` }
  throw new APIError('not found', 404)
})

beforeEach(() => { request.mockReset(); useWorkbench.setState({ contextItems: [] }) })

describe('figure style pack (product data)', () => {
  it('is versioned and names exactly two allowed stacks', () => {
    expect(FIGURE_STYLE_PACK.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(FIGURE_STYLE_REF).toBe(`research-os/figure-style@${FIGURE_STYLE_PACK.version}`)
    expect(FIGURE_STYLE_PACK.stack.map(s => s.id)).toEqual(['tikz', 'matplotlib'])
    expect(FIGURE_STYLE_PACK.stack[0].scope).toMatch(/collage/)
  })
  it('bans DrawIO and MATLAB (collages included) and never lists them as allowed', () => {
    const bans = FIGURE_STYLE_PACK.bans.map(b => b.id)
    expect(bans).toEqual(expect.arrayContaining(['drawio', 'matlab', 'private-colour', 'unsourced-bitmap']))
    expect(FIGURE_STYLE_PACK.bans.find(b => b.id === 'drawio')!.detail).toMatch(/collage/)
    expect(FIGURE_STYLE_PACK.stack.some(s => /drawio|matlab/i.test(s.name))).toBe(false)
  })
  it('carries the IEEE sizes, 8 pt body and the checklist', () => {
    expect(FIGURE_STYLE_PACK.layout).toMatchObject({ columnIn: 3.5, textIn: 7.16, bodyPt: 8 })
    expect(FIGURE_STYLE_PACK.layout.subfigIn).toBeCloseTo(0.485 * 7.16, 2)
    expect(FIGURE_STYLE_PACK.checklist.map(c => c.id)).toEqual(['fonts-embedded', 'no-type3', 'width', 'caption', 'single-source', 'provenance'])
  })
  it('mirrors the manuscript mit* ink and figstyle palette: no drift against the seeds, so no third palette', () => {
    expect(seedDrift(FIGURE_STYLE_PACK, { colors: parseTexColors(MACROS), figstyle: parseFigstyle(FIGSTYLE) })).toEqual([])
  })
})

describe('seed parsing', () => {
  it('extracts §5 verbatim up to the next level-2 heading', () => {
    const s = extractPolicySection(POLICY)!
    expect(s.heading).toMatch(/^5\. 图件政策/)
    expect(s.line).toBe(4)
    expect(s.body).toContain('### sub')
    expect(s.body).not.toContain('## 6.')
    expect(extractPolicySection('# nothing\n## 50. no')).toBeNull()
  })
  it('reads figstyle constants and rcParams without executing anything', () => {
    const fs = parseFigstyle(FIGSTYLE)
    expect(fs.constants.map(c => [c.name, c.value])).toContainEqual(['SUBFIG_IN', '0.485 * TEXT_IN'])
    expect(fs.rc.map(r => [r.name, r.value])).toEqual([['font.size', 'BASE_PT'], ['pdf.fonttype', '42'], ['text.usetex', 'usetex']])
  })
  it('reports drift where the paper differs; the paper is not overwritten', () => {
    const colors = parseTexColors(MACROS.replace('117,0,20', '118,0,20').replace(/.*mitPink.*/, '\\definecolor{mitPink}{rgb}{1,0.1,0.9}'))
    const drift = seedDrift(FIGURE_STYLE_PACK, { colors: colors.filter(c => c.name !== 'mitGreen'), figstyle: parseFigstyle(FIGSTYLE.replace('BASE_PT = 8', 'BASE_PT = 9')) })
    expect(drift.map(d => [d.kind, d.token])).toEqual([['value', 'mitr'], ['missing', 'mitGreen'], ['unparsed', 'mitPink'], ['value', 'BASE_PT']])
    expect(parseTexColors(MACROS).some(c => c.name === 'ghost')).toBe(false) // commented out
  })
})

describe('loading the paper seed', () => {
  it('reads policy, figstyle and colours through the workspace file API', async () => {
    serve({ [DEFAULT_SEED_PATHS.policy]: POLICY, [DEFAULT_SEED_PATHS.figstyle]: FIGSTYLE, [DEFAULT_SEED_PATHS.preamble]: MACROS })
    const seed = await loadFigureStyleSeed('paper-dmpc')
    expect(request.mock.calls.map(c => c[0])).toContain('/workspaces/paper-dmpc/files/docs/figure-inventory.md')
    expect(seed.policy).toMatchObject({ status: 'ready', digest: expect.any(String), value: { line: 4 } })
    expect(seed.figstyle.status).toBe('ready')
    expect(seed.colors.status === 'ready' && seed.colors.value).toHaveLength(6)
  })
  it('missing seed is a clear missing state with the expected path — nothing invented', async () => {
    serve({})
    const seed = await loadFigureStyleSeed('paper-dmpc')
    expect(seed).toEqual({ policy: { status: 'missing', path: 'docs/figure-inventory.md' }, figstyle: { status: 'missing', path: 'figures-src/py/figstyle.py' }, colors: { status: 'missing', path: 'manuscript/preamble/macros.tex' } })
  })
  it('a non-404 failure is an error, not a missing file', async () => {
    request.mockRejectedValue(new APIError('boom', 500))
    expect((await loadFigureStyleSeed('p')).policy).toMatchObject({ status: 'error', message: expect.stringContaining('boom') })
  })
})

describe('attach to chat', () => {
  it('with a seed: pinned to the paper policy digest, refreshable, brief names the source', async () => {
    serve({ [DEFAULT_SEED_PATHS.policy]: POLICY })
    const item = figureStyleContextItem('paper-dmpc', await loadFigureStyleSeed('paper-dmpc'))
    expect(item).toMatchObject({ kind: 'source', ref: FIGURE_STYLE_REF, state: 'current', digest: `sha:${DEFAULT_SEED_PATHS.policy.length}`, source: { path: DEFAULT_SEED_PATHS.policy, workspace: 'paper-dmpc' } })
    expect(item.body).toContain('Paper policy: docs/figure-inventory.md § 5. 图件政策')
  })
  it('without a seed: pinned to the pack version and says the seed was not read', () => {
    const item = figureStyleContextItem('paper-dmpc', null)
    expect(item).toMatchObject({ digest: FIGURE_STYLE_REF, state: 'current' })
    expect(item.source).toBeUndefined()
    expect(item.body).toContain('Paper policy seed not read')
  })
  it('the manifest carries the full brief (bans, sizes, render honesty), and one pack per project', () => {
    const item = figureStyleContextItem('paper-dmpc')
    const manifest = contextManifest(checkContextForSend([item], 'paper-dmpc').include, 'paper-dmpc')
    expect(manifest).toContain('Banned: DrawIO; MATLAB')
    expect(manifest).toContain('column 3.5 in, text 7.16 in; body 8 pt')
    expect(manifest).toContain('does not render or check figures')
    useWorkbench.getState().addContextItem(item); useWorkbench.getState().addContextItem(figureStyleContextItem('paper-dmpc'))
    expect(useWorkbench.getState().contextItems.filter(i => i.ref === FIGURE_STYLE_REF)).toHaveLength(1)
    expect(restoreContextItems(JSON.stringify([item]))[0].body).toBe(item.body)
  })
  it('offers the pack only when the draft talks about figures', () => {
    for (const t of ['redo Fig. 5 in TikZ', 'the matplotlib plot is too small', '图 4 的图注不完整', '把拼版改成 TikZ', 'captions for subfigures']) expect(isFigureTalk(t), t).toBe(true)
    for (const t of ['tighten the proof of Lemma 2', 'configure the plotter service', '回复审稿人 R9']) expect(isFigureTalk(t), t).toBe(false)
  })
})

describe('surfacing', () => {
  it('figure-related writing-map units get the link; others do not', () => {
    expect(isFigureUnit({ figure_ids: ['fig:framework'], latex_anchors: [] })).toBe(true)
    expect(isFigureUnit({ figure_ids: [], latex_anchors: [{ file: 'a.tex', label: 'fig:quad' }] })).toBe(true)
    expect(isFigureUnit({ figure_ids: [], latex_anchors: [{ file: 'a.tex', label: 'eq:1' }] })).toBe(false)
  })
  it('is a single resource tab that survives a layout restore', () => {
    expect(resourceKey({ kind: 'figure-style' }, 'p')).toBe(resourceKey({ kind: 'figure-style' }, 'p'))
    expect(resourceTitle({ kind: 'figure-style' }, 'en')).toBe('Figure style')
    const { layout } = openResourceInLayout(restoreResourceLayout(null), { kind: 'figure-style' }, 'p', 'secondary', 'en')
    expect(restoreResourceLayout(JSON.stringify(layout)).tabs.some(t => t.kind === 'figure-style')).toBe(true)
  })
  it('renders the bans and checklist, and never claims a render', () => { // SSR reads the store's initial (zh) locale
    const html = renderToStaticMarkup(createElement(FigureStylePage, { project: '' }))
    expect(html).toContain('data-ban="drawio"')
    expect(html).toContain('data-ban="matlab"')
    expect(html).toContain('pdffonts')
    expect(html).toContain('data-latex="unknown"')
    expect(html).not.toMatch(/Rendered|renders? (ok|succeeded)/i)
    expect(html).toContain('选择论文项目后')
  })
})

const LIVE = resolve(__dirname, '../../../../academic/project/paper-dmpc')
describe.skipIf(!existsSync(resolve(LIVE, 'docs/figure-inventory.md')))('live paper seed (this machine only)', () => {
  it('finds §5 hard retirement and the mit* colours with no drift', () => {
    const s = extractPolicySection(readFileSync(resolve(LIVE, 'docs/figure-inventory.md'), 'utf8'))!
    expect(s.body).toMatch(/DrawIO/)
    expect(s.body).toMatch(/MATLAB/)
    expect(seedDrift(FIGURE_STYLE_PACK, { colors: parseTexColors(readFileSync(resolve(LIVE, 'manuscript/preamble/macros.tex'), 'utf8')) })).toEqual([])
    expect(figureStyleBrief()).toContain('Allowed stack only')
  })
})
