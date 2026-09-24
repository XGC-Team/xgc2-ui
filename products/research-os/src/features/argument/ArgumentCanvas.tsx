import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, MessageSquarePlus, X } from 'lucide-react'
import { Button, RightMore } from '../../components/ui'
import { useWorkbench } from '../../store'
import { cn } from '../../lib/cn'
import { cameraAt, fitCamera, flight } from '../../lib/graph-render'
import type { GraphCamera } from '../../lib/graph-camera'
import { newContextItem } from '../projects/context-model'
import { fileTarget } from '../projects/project-object-model'
import { CARD, DEFAULT_WRITING_MAP_DIR, EDGE_TYPES, layoutUnits, type ArgumentEdge, type ArgumentUnit, type EdgeType, type UnitRole, type UnitStatus } from './writing-map'
import { useWritingMap, type MapState } from './useWritingMap'

/* 论证画布（Design Argument Canvas）：节点是论文的语义论证单元，不是句子。
   数据权威在论文侧的 writing-map（index.json + units.jsonl），这里只读；LaTeX 锚点只作定位，不回写。
   交互语法与知识图谱一致：拖动平移、滚轮缩放、单击选中、双击空白适配、Esc 取消。 */

const ROLE: Record<UnitRole | 'unknown', { zh: string; en: string; glyph: string; border: string }> = {
  problem: { zh: '问题', en: 'Problem', glyph: '◆', border: 'border-[1.5px] border-ink' },
  challenge: { zh: '挑战', en: 'Challenge', glyph: '▲', border: 'border border-dashed border-line-strong' },
  method: { zh: '方法', en: 'Method', glyph: '●', border: 'border border-line-strong' },
  assumption: { zh: '假设', en: 'Assumption', glyph: '◇', border: 'border border-dashed border-line-strong' },
  lemma: { zh: '引理', en: 'Lemma', glyph: '□', border: 'border border-line-strong' },
  guarantee: { zh: '保证', en: 'Guarantee', glyph: '■', border: 'border-[1.5px] border-ink' },
  evidence: { zh: '证据', en: 'Evidence', glyph: '○', border: 'border border-line-strong' },
  revision: { zh: '修订', en: 'Revision', glyph: '↺', border: 'border border-line-strong' },
  roadblock: { zh: '障碍', en: 'Roadblock', glyph: '⊘', border: 'border border-dotted border-ink-3' },
  unknown: { zh: '未知角色', en: 'Unknown role', glyph: '?', border: 'border border-dotted border-line-strong' },
}
const STATUS: Record<UnitStatus | 'unknown', { zh: string; en: string; cls: string }> = {
  stable: { zh: '稳定', en: 'stable', cls: 'text-ink-3' },
  draft: { zh: '草稿', en: 'draft', cls: 'text-ink-2' },
  'needs-rewrite': { zh: '待重写', en: 'needs rewrite', cls: 'text-ink border border-line-strong' },
  blocked: { zh: '阻塞', en: 'blocked', cls: 'bg-ink text-app' },
  open: { zh: '未决', en: 'open', cls: 'border border-ink text-ink' },
  unknown: { zh: '未知状态', en: 'unknown', cls: 'text-ink-3 border border-dotted border-line-strong' },
}
/** Edge types by stroke grammar (monochrome): solid, dashed, dotted, heavy + ×, dash-dot + R. */
const EDGE: Record<EdgeType, { zh: string; en: string; dash?: string; width: number; mark?: string }> = {
  supports: { zh: '支撑', en: 'supports', width: 1 },
  depends_on: { zh: '依赖', en: 'depends on', dash: '6 4', width: 1 },
  refines: { zh: '细化', en: 'refines', dash: '1.5 3.5', width: 1.2 },
  conflicts_with: { zh: '冲突', en: 'conflicts with', width: 1.6, mark: '×' },
  answers_reviewer: { zh: '回应审稿', en: 'answers reviewer', dash: '8 3 2 3', width: 1.1, mark: 'R' },
}
type StatusFilter = 'all' | 'rewrite' | 'blocked'

export function ArgumentCanvas({ project }: { project: string }) {
  const { locale } = useWorkbench(), zh = locale === 'zh'
  const { source, setSource, state, reload } = useWritingMap(project)
  const [dirDraft, setDirDraft] = useState(source.kind === 'project' ? source.dir : DEFAULT_WRITING_MAP_DIR)
  useEffect(() => { if (source.kind === 'project') setDirDraft(source.dir) }, [source])

  const header = <div className="flex min-w-0 items-center gap-2">
    <span className="font-display text-[15px] tracking-tight">{zh ? '论证画布' : 'Design canvas'}</span>
    {state.status === 'ready' && <span className="min-w-0 truncate text-caption text-ink-3" title={state.unitsPath}>{state.sample ? (zh ? '示例数据 · 仅用于界面开发，不是论文内容' : 'Sample data · UI development only, not paper content') : `${state.map.index.paper_id ?? project}${state.map.index.venue ? ` · ${state.map.index.venue}` : ''} · schema ${state.map.index.schema_version ?? '?'}`}</span>}
    <span className="flex-1"/>
    <RightMore label={zh ? '数据来源' : 'Data source'}>
      <label className="block text-caption text-ink-3">{zh ? '写作地图目录（项目相对路径）' : 'Writing-map folder (project-relative)'}
        <input className="ui-input mt-1 h-7 w-full font-mono text-[11px]" value={dirDraft} onChange={e => setDirDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setSource({ kind: 'project', dir: dirDraft }) }}/></label>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="outline" disabled={!dirDraft.trim()} onClick={() => setSource({ kind: 'project', dir: dirDraft })}>{zh ? '读取项目地图' : 'Read project map'}</Button>
        <Button size="xs" onClick={reload}>{zh ? '重新读取' : 'Reload'}</Button>
        {source.kind === 'project' && <Button size="xs" onClick={() => setSource({ kind: 'sample' })}>{zh ? '改用示例数据' : 'Use sample data'}</Button>}
      </div>
      <p className="text-caption text-ink-3">{zh ? '只读：单元来自 index.json + units.jsonl；句级 mapping-seed 不作为画布节点；不回写 LaTeX。' : 'Read-only: units come from index.json + units.jsonl; sentence-level mapping-seed is not drawn as nodes; LaTeX is never written back.'}</p>
    </RightMore>
  </div>

  return <div className="flex h-full min-h-0 flex-col" data-xgc-role="argument-canvas" data-xgc-id={project}>
    <div className="flex h-10 shrink-0 items-center border-b border-line px-3">{header}</div>
    <div className="relative min-h-0 flex-1">
      {state.status === 'loading' && <p role="status" className="p-6 text-secondary text-ink-3">{zh ? '正在读取写作地图…' : 'Reading the writing map…'}</p>}
      {state.status === 'error' && <p role="alert" className="p-6 text-secondary text-ink-2">{state.message}</p>}
      {state.status === 'missing' && <Empty expected={state.expected} zh={zh} onSample={() => setSource({ kind: 'sample' })} onReload={reload}/>}
      {state.status === 'ready' && (state.map.units.length
        ? <Board key={`${state.unitsPath}:${state.unitsDigest ?? ''}`} state={state} project={project} zh={zh} onUseProject={state.sample ? () => setSource({ kind: 'project', dir: DEFAULT_WRITING_MAP_DIR }) : undefined}/>
        : <Empty expected={state.unitsPath} zh={zh} empty onSample={state.sample ? undefined : () => setSource({ kind: 'sample' })} onReload={reload}/>)}
    </div>
  </div>
}

function Empty({ expected, zh, empty, onSample, onReload }: { expected: string; zh: boolean; empty?: boolean; onSample?: () => void; onReload: () => void }) {
  return <div className="grid h-full place-content-center px-6" role="status" data-xgc-role="argument-empty">
    <div className="max-w-md">
      <p className="font-display text-[18px] tracking-tight">{empty ? (zh ? '写作地图还没有单元。' : 'The writing map has no units yet.') : (zh ? '还没有找到写作地图。' : 'No writing map found yet.')}</p>
      <p className="mt-2 text-secondary text-ink-3">{zh ? '期望位置：' : 'Expected at: '}<code className="break-all font-mono text-[11px]">{expected}</code></p>
      <div className="mt-4 flex gap-2">
        <Button onClick={onReload}>{zh ? '重新读取' : 'Reload'}</Button>
        {onSample && <Button variant="outline" onClick={onSample}>{zh ? '查看示例数据（非论文内容）' : 'View sample data (not paper content)'}</Button>}
      </div>
    </div>
  </div>
}

function Board({ state, project, zh, onUseProject }: { state: Extract<MapState, { status: 'ready' }>; project: string; zh: boolean; onUseProject?: () => void }) {
  const { map } = state
  const pos = useMemo(() => layoutUnits(map.units, map.edges), [map])
  const byId = useMemo(() => new Map(map.units.map(u => [u.id, u])), [map])
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [cam, setCam] = useState<GraphCamera>({ x: 0, y: 0, k: 1 })
  const camRef = useRef(cam); camRef.current = cam
  const [hover, setHover] = useState(''), [selected, setSelected] = useState(''), [filter, setFilter] = useState<StatusFilter>('all')
  const fly = useRef(0)
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const flyTo = (to: GraphCamera) => {
    cancelAnimationFrame(fly.current)
    if (reduced) { setCam(to); return }
    const from = camRef.current, start = performance.now(), dur = flight(from, to, size)
    const step = (now: number) => { const t = (now - start) / dur; setCam(cameraAt(from, to, t)); if (t < 1) fly.current = requestAnimationFrame(step) }
    fly.current = requestAnimationFrame(step)
  }
  const fitView = (w = size.w, h = size.h) => fitCamera([...pos.values()].flatMap(p => [{ x: p.x, y: p.y, degree: 1 }, { x: p.x + CARD.w, y: p.y + CARD.h, degree: 1 }]), { w: Math.max(200, w - (selected ? 360 : 0)), h }, 56)
  useEffect(() => {
    const el = wrap.current!
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(measure); ro.observe(el); measure()
    const f = fitView(el.clientWidth, el.clientHeight); setCam({ ...f, k: Math.max(0.8, Math.min(f.k, 1.1)) }) // open legible; double-click fits everything
    return () => { ro.disconnect(); cancelAnimationFrame(fly.current) }
  }, []) // Fit once per mounted map; the board is keyed by map identity, so a new map remounts and refits.
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) setSelected('') }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])

  // pan / zoom (same grammar as the knowledge graph)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { if (e.button !== 0 || (e.target as HTMLElement).closest('[data-argument-unit],[data-argument-inspector]')) return; cancelAnimationFrame(fly.current); drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  const onPointerMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true; setCam(c => ({ ...c, x: d.cx + dx / c.k, y: d.cy + dy / c.k })) }
  const onPointerUp = () => { if (drag.current && !drag.current.moved) setSelected(''); drag.current = null }
  useEffect(() => {
    const el = wrap.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); cancelAnimationFrame(fly.current)
      const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top
      setCam(c => { const wx = (sx - r.width / 2) / c.k - c.x, wy = (sy - r.height / 2) / c.k - c.y, k = Math.min(2.4, Math.max(0.25, c.k * Math.exp(-e.deltaY * 0.0015))); return { k, x: (sx - r.width / 2) / k - wx, y: (sy - r.height / 2) / k - wy } })
    }
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const focusId = hover || selected
  const near = useMemo(() => { if (!focusId) return null; const s = new Set([focusId]); for (const e of map.edges) { if (e.from === focusId) s.add(e.to); if (e.to === focusId) s.add(e.from) } return s }, [focusId, map.edges])
  const matches = (u: ArgumentUnit) => filter === 'all' || (filter === 'rewrite' ? u.status === 'needs-rewrite' : u.status === 'blocked' || u.status === 'open')
  const select = (id: string) => { setSelected(id); const p = pos.get(id); if (!p) return; const c = camRef.current, sx = (p.x + CARD.w / 2 + c.x) * c.k + size.w / 2; if (sx > size.w - 380 || sx < 40) flyTo({ ...c, x: -(p.x + CARD.w / 2) + (size.w / 2 - (size.w - 360) / 2) / c.k }) }
  const errors = map.diagnostics.filter(d => d.level === 'error').length
  const counts = { units: map.units.length, edges: map.edges.length }
  const transform = `translate(${size.w / 2 + cam.x * cam.k}px, ${size.h / 2 + cam.y * cam.k}px) scale(${cam.k})`

  return <div ref={wrap} className="relative h-full w-full touch-none overflow-hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={e => { if (!(e.target as HTMLElement).closest('[data-argument-unit],[data-argument-inspector]')) flyTo(fitView()) }}>
    <div className="absolute left-0 top-0 origin-top-left" style={{ transform }}>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
        <defs><marker id="arg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="currentColor" strokeWidth="1.4"/></marker></defs>
        {map.edges.map((e, i) => <EdgePath key={i} e={e} pos={pos} dim={!!near && !(near.has(e.from) && near.has(e.to) && (e.from === focusId || e.to === focusId))} hot={!!near && (e.from === focusId || e.to === focusId)}/>)}
      </svg>
      {map.units.map(u => { const p = pos.get(u.id)!; const role = ROLE[u.role], status = STATUS[u.status]; const dim = (near && !near.has(u.id)) || !matches(u)
        return <button key={u.id} type="button" data-argument-unit={u.id} data-role={u.role} data-status={u.status} onClick={() => select(u.id)} onPointerEnter={() => setHover(u.id)} onPointerLeave={() => setHover('')}
          className={cn('absolute flex flex-col gap-1 rounded-lg bg-panel px-3 py-2 text-left shadow-soft transition-[opacity,box-shadow] duration-150', role.border, selected === u.id && 'ring-2 ring-ink ring-offset-2 ring-offset-app', dim ? 'opacity-25' : 'opacity-100')}
          style={{ left: p.x, top: p.y, width: CARD.w, height: CARD.h }} title={u.title_en}>
          <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-ink-3"><span aria-hidden className="text-ink-2">{role.glyph}</span>{zh ? role.zh : role.en}<span className="flex-1"/>
            <span className={cn('rounded px-1 py-px text-[10px] normal-case tracking-normal', status.cls)}>{zh ? status.zh : status.en}</span></span>
          <span className="line-clamp-2 text-[13px] leading-snug text-ink">{u.title_zh || u.title_en || u.id}</span>
        </button> })}
    </div>

    {/* quiet legend + counts (bottom-left), status filter (top-left) */}
    <div className="absolute left-3 top-3 flex items-center gap-0.5 rounded-md border border-line bg-panel p-0.5 text-caption shadow-soft" role="radiogroup" aria-label={zh ? '按状态突出' : 'Highlight by status'}>
      {(['all', 'rewrite', 'blocked'] as const).map(f => <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={cn('h-6 rounded px-2', filter === f ? 'bg-active text-ink' : 'text-ink-3 hover:text-ink-2')}>{f === 'all' ? (zh ? '全部' : 'All') : f === 'rewrite' ? (zh ? '待重写' : 'Needs rewrite') : (zh ? '阻塞与未决' : 'Blocked & open')}</button>)}
    </div>
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-app/85 px-2 py-1 text-caption text-ink-3" data-xgc-role="argument-legend">
      <span>{zh ? `${counts.units} 个单元 · ${counts.edges} 条边` : `${counts.units} units · ${counts.edges} edges`}{map.diagnostics.length ? ` · ${zh ? `${map.diagnostics.length} 条导入提示${errors ? `（${errors} 个错误）` : ''}` : `${map.diagnostics.length} import note(s)${errors ? ` (${errors} error)` : ''}`}` : ''}</span>
      {EDGE_TYPES.map(t => <span key={t} className="flex items-center gap-1"><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="currentColor" strokeWidth={EDGE[t].width} strokeDasharray={EDGE[t].dash}/></svg>{zh ? EDGE[t].zh : EDGE[t].en}</span>)}
    </div>
    {(map.diagnostics.length > 0 || onUseProject) && <div className="absolute bottom-3 right-3 flex items-center gap-1">
      {onUseProject && <Button size="xs" onClick={onUseProject}>{zh ? '读取项目地图' : 'Read project map'}</Button>}
      {map.diagnostics.length > 0 && <details className="rounded-md border border-line bg-panel px-2 py-1 text-caption text-ink-2 shadow-soft" data-xgc-role="argument-diagnostics"><summary className="cursor-pointer">{zh ? '导入提示' : 'Import notes'}</summary>
        <ul className="mt-1 max-h-48 max-w-md overflow-auto">{map.diagnostics.map((d, i) => <li key={i} className={d.level === 'error' ? 'text-ink' : 'text-ink-3'}>{d.line ? `units.jsonl:${d.line} · ` : ''}{d.message}</li>)}</ul></details>}
    </div>}

    {selected && byId.get(selected) && <Inspector unit={byId.get(selected)!} map={map} project={project} unitsPath={state.unitsPath} unitsDigest={state.unitsDigest} sample={state.sample} zh={zh} onSelect={select} onClose={() => setSelected('')}/>}
  </div>
}

function EdgePath({ e, pos, dim, hot }: { e: ArgumentEdge; pos: Map<string, { x: number; y: number }>; dim: boolean; hot: boolean }) {
  const a = pos.get(e.from), b = pos.get(e.to)
  if (!a || !b) return null
  const s = EDGE[e.type]
  let d: string, mx: number, my: number
  if (Math.abs(a.y - b.y) < 1) { // same layer: arc above the cards
    const x1 = a.x + CARD.w / 2, x2 = b.x + CARD.w / 2, y = a.y, lift = 38 + Math.abs(x2 - x1) * 0.12
    d = `M ${x1} ${y} C ${x1} ${y - lift}, ${x2} ${y - lift}, ${x2} ${y}`; mx = (x1 + x2) / 2; my = y - lift * 0.75
  } else {
    const down = b.y > a.y, x1 = a.x + CARD.w / 2, y1 = down ? a.y + CARD.h : a.y, x2 = b.x + CARD.w / 2, y2 = down ? b.y : b.y + CARD.h, k = Math.max(40, Math.abs(y2 - y1) * 0.45)
    d = `M ${x1} ${y1} C ${x1} ${y1 + (down ? k : -k)}, ${x2} ${y2 + (down ? -k : k)}, ${x2} ${y2}`; mx = (x1 + x2) / 2; my = (y1 + y2) / 2
  }
  return <g className={cn('text-ink transition-opacity duration-150')} style={{ opacity: dim ? 0.07 : hot ? 0.85 : 0.32 }} data-edge-type={e.type}>
    <path d={d} fill="none" stroke="currentColor" strokeWidth={s.width * (hot ? 1.4 : 1)} strokeDasharray={s.dash} markerEnd="url(#arg-arrow)"/>
    {s.mark && <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" className="fill-current text-[11px]" style={{ paintOrder: 'stroke', stroke: 'var(--bg-app)', strokeWidth: 3 }}>{s.mark}</text>}
  </g>
}

function Inspector({ unit, map, project, unitsPath, unitsDigest, sample, zh, onSelect, onClose }: { unit: ArgumentUnit; map: { units: ArgumentUnit[]; edges: ArgumentEdge[] }; project: string; unitsPath: string; unitsDigest?: string; sample: boolean; zh: boolean; onSelect: (id: string) => void; onClose: () => void }) {
  const { openResource, openDocument, addContextItem } = useWorkbench()
  const [note, setNote] = useState('')
  useEffect(() => setNote(''), [unit.id])
  const titles = new Map(map.units.map(u => [u.id, u.title_zh || u.title_en || u.id]))
  const out = map.edges.filter(e => e.from === unit.id), inn = map.edges.filter(e => e.to === unit.id)
  const replyKbDir = unitsPath.split('/').slice(0, -2).join('/') // writing-map lives inside reply-kb
  const openFile = (path: string) => openResource({ kind: 'file', target: fileTarget(project, project, 'files', path) }, 'secondary')
  const role = ROLE[unit.role], status = STATUS[unit.status]
  const attach = () => {
    addContextItem(newContextItem({ project, kind: 'source', label: `${unit.id} · ${unit.title_zh || unit.title_en}`, ref: `${project}/${unitsPath}#${unit.id}`, digest: unitsDigest, excerpt: [unit.why, unit.adversarial_notes].filter(Boolean).join('\n').slice(0, 400), source: { id: unit.id, path: unitsPath, workspace: project, digest: unitsDigest } }))
    setNote(zh ? '已加入对话上下文（未发送）。' : 'Added to chat context (not sent).')
  }
  return <aside data-argument-inspector={unit.id} aria-label={zh ? '论证单元' : 'Argument unit'} className="absolute bottom-3 right-3 top-3 z-10 flex w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-soft">
    <div className="flex items-center gap-2 px-4 pt-3">
      <span className="min-w-0 flex-1 truncate text-caption uppercase tracking-[0.08em] text-ink-3">{role.glyph} {zh ? role.zh : role.en}{unit.role === 'unknown' ? ` (${unit.rawRole})` : ''}</span>
      <span className={cn('rounded px-1 py-px text-[10px]', status.cls)}>{zh ? status.zh : status.en}{unit.status === 'unknown' ? ` (${unit.rawStatus})` : ''}</span>
      <button type="button" aria-label={zh ? '关闭' : 'Close'} onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><X size={12}/></button>
    </div>
    <div className="px-4 pb-2">
      <h3 className="mt-1 font-display text-[18px] leading-snug tracking-tight">{unit.title_zh || unit.title_en || unit.id}</h3>
      {unit.title_en && unit.title_zh && <p className="mt-0.5 text-caption text-ink-3">{unit.title_en}</p>}
      <div className="mt-2 flex items-center gap-1">
        <code className="text-[11px] text-ink-3" title={`${unitsPath}:${unit.line}`}>{unit.id}</code><span className="flex-1"/>
        {!sample && <Button size="xs" icon={MessageSquarePlus} data-xgc-role="argument-to-context" onClick={attach}>{zh ? '加入对话' : 'Add to chat'}</Button>}
      </div>
      {note && <p role="status" className="mt-1 text-caption text-ink-3">{note}</p>}
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-line px-4 py-3 text-secondary">
      {unit.blocked_by && <Section title={zh ? '阻塞于' : 'Blocked by'}><p className="text-ink">{unit.blocked_by}</p></Section>}
      <Section title={zh ? '为何需要' : 'Why'}><Prose text={unit.why} zh={zh}/></Section>
      <Section title={zh ? '对抗压力' : 'Adversarial notes'}><Prose text={unit.adversarial_notes} zh={zh}/></Section>
      <Section title={zh ? '写作规范' : 'Writing norms'}><Prose text={unit.writing_norms} zh={zh}/></Section>
      {unit.formal_checks.length > 0 && <Section title={zh ? '形式化检查（证明归 T15）' : 'Formal checks (proofs: T15)'}><ul className="list-disc space-y-0.5 pl-4 text-ink-2">{unit.formal_checks.map(c => <li key={c}>{c}</li>)}</ul></Section>}
      <Chips title={zh ? '决定' : 'Decisions'} items={unit.decision_ids} hint={zh ? '打开 reply-kb/decisions-log.md，在其中查找' : 'Opens reply-kb/decisions-log.md; find it there'} onOpen={sample ? undefined : () => openFile(`${replyKbDir}/decisions-log.md`)}/>
      <Links title="reply-kb" items={unit.reply_kb_links} onOpen={sample ? undefined : openFile}/>
      <Links title={zh ? '知识库（vault）' : 'Vault'} items={unit.vault_links} onOpen={sample ? undefined : path => openDocument({ workspace: 'academic', path, title: path.split('/').pop()!.replace(/\.md$/, '') })}/>
      <Chips title={zh ? '理论锚点（T15）' : 'Theory (T15)'} items={unit.theory_links}/>
      <Chips title={zh ? '图（T13）' : 'Figures (T13)'} items={unit.figure_ids}/>
      <Chips title={zh ? '主张' : 'Claims'} items={unit.claim_ids}/>
      <Chips title={zh ? '方案 · 战略' : 'Schemes · thrusts'} items={[...unit.scheme_ids, ...unit.thrust_ids]}/>
      {unit.latex_anchors.length > 0 && <Section title={zh ? 'LaTeX 定位（只读，不回写）' : 'LaTeX locators (read-only)'}>
        <ul className="space-y-0.5">{unit.latex_anchors.map((a, i) => { const loc = `${a.file}${a.line_start ? `:${a.line_start}${a.line_end && a.line_end !== a.line_start ? `–${a.line_end}` : ''}` : ''}`; return <li key={i} className="flex items-center gap-1 font-mono text-[11px] text-ink-2"><span className="min-w-0 flex-1 truncate" title={loc}>{loc}{a.label ? ` · ${a.label}` : ''}</span>
          <button type="button" aria-label={zh ? '复制定位' : 'Copy locator'} className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-3 hover:bg-hover hover:text-ink" onClick={() => void navigator.clipboard?.writeText(loc)}><Copy size={10}/></button></li> })}</ul>
      </Section>}
      {(out.length > 0 || inn.length > 0) && <Section title={zh ? '论证关系' : 'Argument relations'}>
        {[...out.map(e => ({ e, other: e.to, dir: '→' })), ...inn.map(e => ({ e, other: e.from, dir: '←' }))].map(({ e, other, dir }, i) =>
          <button key={i} type="button" onClick={() => onSelect(other)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-hover">
            <span className="w-16 shrink-0 text-caption text-ink-3">{dir} {zh ? EDGE[e.type].zh : EDGE[e.type].en}</span><span className="min-w-0 flex-1 truncate text-ink-2">{titles.get(other)}</span></button>)}
      </Section>}
      <p className="text-caption text-ink-3">{unit.sentence_ids.length ? (zh ? `${unit.sentence_ids.length} 个句级定位（从层，mapping-seed）· ` : `${unit.sentence_ids.length} sentence locator(s) (subordinate) · `) : ''}{unit.last_synced ? `${zh ? '上次对齐' : 'last synced'} ${unit.last_synced} · ` : ''}{unitsPath.split('/').pop()}:{unit.line}</p>
    </div>
  </aside>
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => <section><h4 className="mb-1 text-caption text-ink-3">{title}</h4>{children}</section>
const Prose = ({ text, zh }: { text: string; zh: boolean }) => text ? <p className="whitespace-pre-wrap leading-relaxed text-ink-2">{text}</p> : <p className="text-ink-3">{zh ? '（未填写）' : '(empty)'}</p>
function Chips({ title, items, hint, onOpen }: { title: string; items: string[]; hint?: string; onOpen?: () => void }) {
  if (!items.length) return null
  return <Section title={title}><div className="flex flex-wrap gap-1">{items.map(id => onOpen
    ? <button key={id} type="button" title={hint} onClick={onOpen} className="h-6 rounded-md border border-line px-1.5 font-mono text-[11px] text-ink-2 hover:bg-hover hover:text-ink">{id}</button>
    : <span key={id} className="flex h-6 items-center rounded-md bg-inset px-1.5 font-mono text-[11px] text-ink-2">{id}</span>)}</div></Section>
}
function Links({ title, items, onOpen }: { title: string; items: string[]; onOpen?: (path: string) => void }) {
  if (!items.length) return null
  return <Section title={title}><ul className="space-y-0.5">{items.map(path => <li key={path}>{onOpen
    ? <button type="button" title={path} onClick={() => onOpen(path)} className="w-full truncate rounded px-1 py-0.5 text-left text-ink-2 hover:bg-hover hover:text-ink">{path.split('/').pop()}</button>
    : <span title={path} className="block truncate px-1 text-ink-3">{path}</span>}</li>)}</ul></Section>
}
