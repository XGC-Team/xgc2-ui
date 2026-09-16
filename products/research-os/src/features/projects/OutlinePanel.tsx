import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Crosshair, EyeOff, Plus } from 'lucide-react'
import { Button, IconBtn } from '../../components/ui'
import { cn } from '../../lib/cn'
import { workspaceCopy } from './workspace-copy'
import { draftIdFromAnchor } from './draft-model'
import {
  PRIMARY_OUTLINE, arrangeNode, ensureArrangement, flatOutline, getArrangement, indentOutlineItem,
  moveOutlineItem, outdentOutlineItem, removeNodeFromArrangement, setNodeCollapsed, unarrangedNodeIds,
  type ThinkingCanvasV2,
} from './canvas-model'

/** The linear outline is a second view of the same canvas document: same nodes, explicit
 * hierarchy and writing order per arrangement. Moving a card on the canvas never touches this. */
export function OutlinePanel({ canvas, artifact, selected, onArtifact, onSelect, onLocate, apply, locale }: {
  canvas: ThinkingCanvasV2
  artifact: string
  selected: string | null
  onArtifact: (artifact: string) => void
  onSelect: (nodeId: string) => void
  onLocate: (nodeId: string) => void
  apply: (update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2, coalesceKey?: string) => void
  locale: 'zh' | 'en'
}) {
  const copy = workspaceCopy[locale]
  const byId = new Map(canvas.nodes.map(n => [n.id, n]))
  const arrangement = getArrangement(canvas, artifact)
  const flat = flatOutline(arrangement)
  const collapsedIds = new Set(canvas.nodes.filter(n => n.collapsed).map(n => n.id))
  const childrenOf = new Map<string, number>()
  const countChildren = (items: typeof arrangement.items): void => items.forEach(item => {
    childrenOf.set(item.node, item.children?.length ?? 0)
    if (item.children) countChildren(item.children)
  })
  countChildren(arrangement.items)
  // Hide rows below a collapsed ancestor.
  const visible: { node: string; depth: number }[] = []
  const walk = (items: typeof arrangement.items, depth: number, hidden: boolean) => items.forEach(item => {
    if (!hidden) visible.push({ node: item.node, depth })
    if (item.children) walk(item.children, depth + 1, hidden || collapsedIds.has(item.node))
  })
  walk(arrangement.items, 0, false)
  const unarranged = unarrangedNodeIds(canvas, artifact)
  const anchorTitles = new Map<string, string>()
  for (const node of canvas.nodes) {
    if (!node.anchor) continue
    const draftId = draftIdFromAnchor(node.anchor)
    if (draftId) anchorTitles.set(draftId, node.title.replace(/^↗\s*/, ''))
  }
  const artifactLabel = (id: string) => id === PRIMARY_OUTLINE ? copy.primaryOutline : (anchorTitles.get(id) ?? id)
  const creatable = [...anchorTitles.keys()].filter(id => !canvas.outlines.some(outline => outline.artifact === id))
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected) listRef.current?.querySelector(`[data-outline-node="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected, artifact])
  return <div className="flex h-full min-h-0 flex-col" data-outline-view={artifact}>
    <div className="flex h-9 shrink-0 flex-wrap items-center gap-1 border-b border-line px-2">
      <label className="text-caption text-ink-3">{copy.arrangement}
        <select className="ui-input ml-1 h-6" value={artifact} onChange={event => onArtifact(event.target.value)}>
          {[PRIMARY_OUTLINE, ...canvas.outlines.map(outline => outline.artifact).filter(id => id !== PRIMARY_OUTLINE)].map(id => <option key={id} value={id}>{artifactLabel(id)}</option>)}
        </select>
      </label>
      {creatable.map(id => <Button key={id} size="xs" icon={Plus} onClick={() => { apply(c => ensureArrangement(c, id)); onArtifact(id) }}>{copy.newArrangement} · {artifactLabel(id)}</Button>)}
      {artifact !== PRIMARY_OUTLINE && <span className="text-caption text-ink-3">{copy.arrangementHint}</span>}
    </div>
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
      {visible.map(({ node, depth }) => {
        const item = byId.get(node)
        if (!item) return null
        const index = flat.findIndex(row => row.node === node)
        const sameDepth = flat.filter(row => row.depth === depth)
        return <div key={node} data-outline-node={node} className={cn('flex items-center gap-0.5 rounded-md py-0.5 pr-1', selected === node && 'bg-hover')} style={{ paddingLeft: 4 + depth * 18 }}>
          {childrenOf.get(node) ? <IconBtn icon={ChevronRight} label={copy.collapsed} className={cn('transition-transform', !collapsedIds.has(node) && 'rotate-90')} onClick={() => apply(c => setNodeCollapsed(c, node, !collapsedIds.has(node)))}/> : <span className="w-6 shrink-0"/>}
          <button type="button" className="grid h-6 w-4 shrink-0 place-items-center text-ink-3" onClick={() => onSelect(node)} aria-label={item.title}>
            {item.kind === 'chapter' ? <span className="h-2 w-2 rounded-sm border border-current"/> : <span className="h-1.5 w-1.5 rounded-full bg-current"/>}
          </button>
          <input aria-label={copy.outline} className={cn('min-w-0 flex-1 bg-transparent outline-none', item.kind === 'chapter' ? 'font-display text-[14px] tracking-tight' : 'text-secondary text-ink-2')} value={item.title}
            onFocus={() => onSelect(node)} onChange={event => apply(c => ({ ...c, nodes: c.nodes.map(n => n.id === node ? { ...n, title: event.target.value } : n) }), `outline-title:${node}`)}/>
          <IconBtn icon={Crosshair} label={copy.locateCanvas} onClick={() => onLocate(node)}/>
          <IconBtn icon={ArrowUp} label={`${copy.outline} ↑`} disabled={index <= 0 || flat[index - 1].depth !== depth} onClick={() => apply(c => moveOutlineItem(c, artifact, node, -1))}/>
          <IconBtn icon={ArrowDown} label={`${copy.outline} ↓`} disabled={index >= flat.length - 1 || flat[index + 1]?.depth !== depth} onClick={() => apply(c => moveOutlineItem(c, artifact, node, 1))}/>
          <IconBtn icon={ChevronRight} label={copy.indent} disabled={sameDepth.findIndex(row => row.node === node) <= 0} onClick={() => apply(c => indentOutlineItem(c, artifact, node))}/>
          <IconBtn icon={ChevronLeft} label={copy.outdent} disabled={depth === 0} onClick={() => apply(c => outdentOutlineItem(c, artifact, node))}/>
          <IconBtn icon={EyeOff} label={copy.removeFromOutline} onClick={() => apply(c => removeNodeFromArrangement(c, artifact, node))}/>
        </div>
      })}
      {unarranged.length > 0 && <>
        <p className="mt-3 px-1 text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{copy.unarranged}</p>
        {unarranged.map(id => {
          const item = byId.get(id)
          if (!item) return null
          return <div key={id} data-outline-node={id} className={cn('flex items-center gap-1 rounded-md py-0.5 pl-1 pr-1', selected === id && 'bg-hover')}>
            <button type="button" className="min-w-0 flex-1 truncate text-left text-secondary text-ink-2" onClick={() => onSelect(id)}>{item.title}</button>
            <IconBtn icon={Crosshair} label={copy.locateCanvas} onClick={() => onLocate(id)}/>
            <Button size="xs" onClick={() => apply(c => arrangeNode(c, artifact, id))}>{copy.arrange}</Button>
          </div>
        })}
      </>}
      {!visible.length && !unarranged.length && <p className="p-3 text-secondary text-ink-3">{copy.unarranged} · 0</p>}
    </div>
  </div>
}
