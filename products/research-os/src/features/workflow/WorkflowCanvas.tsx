import {t as tr} from '../../i18n'
import {useMemo, useRef, useState, type ReactNode} from 'react'
import {BookOpen, CheckCheck, FlaskConical, GripVertical, Library, Minus, PenLine, Plus, RotateCcw, Sigma, SquareFunction, X} from 'lucide-react'
import {IconBtn} from '../../components/ui'
import {cn} from '../../lib/cn'
import type {NodeStatus, PlanNode} from './workflow-model'
export const NODE_KINDS: Record<string, string> = {EvidenceRead: '证据研究', DerivationCheck: '推导验证', LiteratureCompare: '文献比较', Compute: '计算', Simulation: '仿真', Review: '独立审查', Synthesis: '综合写作'}
const KIND_ICONS: Record<string, typeof BookOpen> = {EvidenceRead: BookOpen, DerivationCheck: Sigma, LiteratureCompare: Library, Compute: SquareFunction, Simulation: FlaskConical, Review: CheckCheck, Synthesis: PenLine}
export function WorkflowCanvas({
  nodes, selected, onSelect, onLink, empty, statusOf, nowId, liveOf, agentOf, assembling, onAssemble,
}: {
  nodes: PlanNode[]
  selected: string
  onSelect: (id: string) => void
  onLink?: (from: string, to: string) => void
  empty?: ReactNode
  statusOf?: (id: string) => NodeStatus
  nowId?: string
  liveOf?: (id: string) => string
  agentOf?: (id: string) => string
  assembling?: string
  onAssemble?: (id: string) => void
}) {
  const [zoom, setZoom] = useState(.9), [pan, setPan] = useState({x: 0, y: 0}), [positions, setPositions] = useState<Record<string, {x: number; y: number}>>({}), [source, setSource] = useState('')
  const drag = useRef<{id: string; x: number; y: number; ox: number; oy: number} | null>(null)
  const defaults = useMemo(() => {
    const levels = new Map<string, number>(), rows = new Map<number, number>()
    return new Map(nodes.map(n => {
      const level = Math.max(-1, ...n.dependsOn.map(id => levels.get(id) ?? -1)) + 1
      levels.set(n.id, level)
      const row = rows.get(level) || 0
      rows.set(level, row + 1)
      return [n.id, {x: 48 + level * 280, y: 48 + row * 176}] as const
    }))
  }, [nodes])
  const pos = (id: string) => positions[id] || defaults.get(id) || {x: 0, y: 0}
  return <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
    <div className="pointer-events-none absolute right-3 top-3 z-20 hidden items-center gap-1 rounded-full border border-line bg-panel/95 p-1 shadow-soft lg:flex">
      <span className="pointer-events-auto flex items-center"><IconBtn icon={Minus} label={tr('缩小计划')} onClick={() => setZoom(z => Math.max(.4, z - .1))}/><span className="w-9 text-center text-caption tabular-nums">{Math.round(zoom * 100)}%</span><IconBtn icon={Plus} label={tr('放大计划')} onClick={() => setZoom(z => Math.min(1.5, z + .1))}/><IconBtn icon={RotateCcw} label={tr('重置计划视图')} onClick={() => {setZoom(.9); setPan({x: 0, y: 0}); setPositions({})}}/></span>
    </div>
    <div className="dot-grid absolute inset-0 touch-none" onPointerDown={e => {if (e.target !== e.currentTarget) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = {id: 'pan', x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y}}} onPointerMove={e => {if (drag.current?.id === 'pan') {const d = drag.current; setPan({x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y})}}} onPointerUp={() => {drag.current = null}}>
      <div className="pointer-events-none absolute inset-0 origin-top-left" style={{transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}>
        <svg className="absolute inset-0 h-full w-full overflow-visible">{nodes.flatMap(n => n.dependsOn.map(dep => {
          const a = pos(dep), b = pos(n.id)
          const dx = Math.max(70, Math.abs(b.x - a.x - 210) / 2)
          const flowing = nowId === n.id || statusOf?.(n.id) === 'running'
          return <g key={`${dep}-${n.id}`}><path d={`M${a.x + 210} ${a.y + 70} C${a.x + 210 + dx} ${a.y + 70} ${b.x - dx} ${b.y + 70} ${b.x} ${b.y + 70}`} className={flowing ? 'edge-flow' : undefined} stroke="var(--ink)" strokeOpacity={flowing ? .55 : .22} strokeWidth={flowing ? 2 : 1.5} fill="none"/><path d={`M${b.x - 5} ${b.y + 66} L${b.x} ${b.y + 70} L${b.x - 5} ${b.y + 74}`} stroke="var(--ink-3)" fill="none"/></g>
        }))}</svg>
        {nodes.map((n, index) => {
          const p = pos(n.id), Icon = KIND_ICONS[n.kind] || SquareFunction
          const status = statusOf?.(n.id) || 'idle'
          const now = nowId === n.id
          const live = liveOf?.(n.id)
          const agent = agentOf?.(n.id)
          return <div key={n.id} data-node-id={n.id} data-status={status} style={{left: p.x, top: p.y, width: 220}} className={cn('group pointer-events-auto absolute rounded-xl border bg-panel shadow-soft transition-[border-color,box-shadow] duration-200', selected === n.id ? 'border-ink ring-1 ring-ink/20' : 'border-line hover:border-line-strong', status === 'running' && 'wf-node-running', now && 'wf-node-now', status === 'failed' && 'border-ink/70', assembling && 'cursor-copy')} onClick={e => {if (assembling && onAssemble) {e.stopPropagation(); onAssemble(n.id)}; onSelect(n.id)}}>
            <button type="button" aria-label={`${tr('编辑步骤')}: ${n.title}`} aria-current={now || undefined} className="flex w-full cursor-grab touch-none items-center gap-2 px-3 pt-3 text-left active:cursor-grabbing" onClick={() => onSelect(n.id)} onPointerDown={e => {if (assembling) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = {id: n.id, x: e.clientX, y: e.clientY, ox: p.x, oy: p.y}; onSelect(n.id)}} onPointerMove={e => {const d = drag.current; if (d?.id === n.id) setPositions(current => ({...current, [n.id]: {x: d.ox + (e.clientX - d.x) / zoom, y: d.oy + (e.clientY - d.y) / zoom}}))}} onPointerUp={() => {drag.current = null}}>
              <Icon size={15} strokeWidth={1.75} className="shrink-0 text-ink-2"/>
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{n.title}</span>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', status === 'running' || now ? 'bg-ink pulse-dot' : status === 'done' ? 'bg-ink' : status === 'awaiting' ? 'bg-ink attn' : status === 'failed' ? 'bg-ink/80' : status === 'queued' ? 'bg-ink/40' : 'bg-ink/20')} aria-hidden/>
              <GripVertical size={12} className="text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"/>
            </button>
            <div className="relative flex items-center justify-between px-3 pb-1 pt-1.5 text-caption text-ink-3">
              {onLink && index > 0 ? <button type="button" aria-label={`连接到：${n.title}`} disabled={!source || nodes.findIndex(x => x.id === source) >= index} className="absolute -left-1.5 h-3 w-3 rounded-full border border-ink-3 bg-panel disabled:opacity-50" onClick={() => {if (source) {onLink(source, n.id); setSource('')}}}/> : <span className="absolute -left-1 h-2 w-2 rounded-full border border-line-strong bg-panel"/>}
              <span className="truncate">{agent || tr(NODE_KINDS[n.kind])}</span>
              {(n.knowledge?.length || 0) > 0 && <span className="tabular-nums">{n.knowledge!.length}</span>}
              {onLink && index < nodes.length - 1 ? <button type="button" aria-label={`从此步骤连线：${n.title}`} aria-pressed={source === n.id} className={cn('absolute -right-1.5 h-3 w-3 rounded-full border border-ink-3', source === n.id ? 'bg-ink' : 'bg-panel')} onClick={() => setSource(source === n.id ? '' : n.id)}/> : <span className="absolute -right-1 h-2 w-2 rounded-full border border-line-strong bg-panel"/>}
            </div>
            <p className="truncate px-3 pb-3 text-secondary text-ink-2">{now && live ? live : n.objective || tr('填写任务与验收条件')}</p>
          </div>
        })}
      </div>
    </div>
    {source && <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-line bg-panel/95 py-1 pl-4 pr-1 text-secondary shadow-soft">{tr('选择后续步骤的输入端口')}<IconBtn icon={X} label={tr('取消连线')} onClick={() => setSource('')}/></div>}
    {!nodes.length && <div className="pointer-events-none absolute inset-0 grid place-content-center p-6"><div className="pointer-events-auto text-center">{empty}</div></div>}
  </div>
}
