import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GripHorizontal } from 'lucide-react'
import { readPreference, writePreference } from '../lib/storage'

/* 可分离面板（Obsidian 弹出窗格 / VS Code 浮动视图的语法）：面板本身仍是同一个 keyed 节点，
   浮动只把它从 gridArea 换成 position:fixed 的矩形——草稿、消息流、PDF 滚动都不重挂。
   这里只提供几何：矩形持久化、拖动、缩放、视口夹取；内容由调用方原样放入。 */
export type FloatRect = { x: number; y: number; w: number; h: number }
const MIN = { w: 320, h: 240 }

/* 浮动窗口只在工作区内活动：不盖住顶栏（40）、左侧导航 rail（48）和底部状态栏（24），各留 8px 呼吸。
   否则拖到边缘的窗口会挡住 rail 上的导航按钮——这正是浮动面板最容易「卡死」的方式。 */
export const FLOAT_INSETS = { left: 56, top: 48, right: 8, bottom: 32 } as const
export function clampRect(rect: FloatRect, viewport = { w: typeof window === 'undefined' ? 1440 : window.innerWidth, h: typeof window === 'undefined' ? 900 : window.innerHeight }): FloatRect {
  const room = { w: viewport.w - FLOAT_INSETS.left - FLOAT_INSETS.right, h: viewport.h - FLOAT_INSETS.top - FLOAT_INSETS.bottom }
  const w = Math.max(Math.min(MIN.w, room.w), Math.min(rect.w, room.w)), h = Math.max(Math.min(MIN.h, room.h), Math.min(rect.h, room.h))
  return { w, h, x: Math.max(FLOAT_INSETS.left, Math.min(rect.x, viewport.w - w - FLOAT_INSETS.right)), y: Math.max(FLOAT_INSETS.top, Math.min(rect.y, viewport.h - h - FLOAT_INSETS.bottom)) }
}

/** Viewport width, for layouts that only make sense with room (e.g. the three-column dock). */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth)
  useEffect(() => { const on = () => setWidth(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])
  return width
}

export function useFloatRect(key: string, initial: () => FloatRect): [FloatRect, (rect: FloatRect) => void] {
  const [rect, setRect] = useState<FloatRect>(() => {
    try { const raw = JSON.parse(readPreference(key) || 'null'); if (raw && [raw.x, raw.y, raw.w, raw.h].every(Number.isFinite)) return clampRect(raw) } catch { /* fall back */ }
    return clampRect(initial())
  })
  const update = useCallback((next: FloatRect) => { const clamped = clampRect(next); setRect(clamped); writePreference(key, JSON.stringify(clamped)) }, [key])
  useEffect(() => { const fit = () => setRect(r => clampRect(r)); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit) }, [])
  return [rect, update]
}

/** Style for one part of a floating panel: a header strip at the top, or the body below it. */
export function floatPart(rect: FloatRect, part: 'header' | 'body', header: number, z = 40): CSSProperties {
  return part === 'header'
    ? { position: 'fixed', left: rect.x + 1, top: rect.y + 1, width: rect.w - 2, height: header, zIndex: z + 1 }
    : { position: 'fixed', left: rect.x + 1, top: rect.y + 1 + header, width: rect.w - 2, height: rect.h - header - 2, zIndex: z + 1 }
}

/** Pointer-drag helper: moving (grip) or resizing (corner) a rect with pointer capture. */
function usePointerDrag(rect: FloatRect, onRect: (rect: FloatRect) => void, mode: 'move' | 'resize') {
  const start = useRef<{ px: number; py: number; rect: FloatRect } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => { if (e.button !== 0) return; e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); document.body.style.userSelect = 'none'; start.current = { px: e.clientX, py: e.clientY, rect } },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current; if (!s) return
      const dx = e.clientX - s.px, dy = e.clientY - s.py
      onRect(mode === 'move' ? { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy } : { ...s.rect, w: s.rect.w + dx, h: s.rect.h + dy })
    },
    onPointerUp: () => { start.current = null; document.body.style.userSelect = '' },
    onPointerCancel: () => { start.current = null; document.body.style.userSelect = '' },
  }
}

/** Drag handle placed inside whatever header the floating panel already has. */
/** Double-clicking the grip re-docks the window (title-bar grammar of desktop window managers). */
export function FloatGrip({ rect, onRect, label, onDock }: { rect: FloatRect; onRect: (rect: FloatRect) => void; label: string; onDock?: () => void }) {
  return <span role="button" tabIndex={-1} aria-label={label} title={label} onDoubleClick={onDock} {...usePointerDrag(rect, onRect, 'move')}
    className="grid h-6 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink active:cursor-grabbing"><GripHorizontal size={13} strokeWidth={1.75}/></span>
}

/** The window chrome behind a floating panel: paper card, soft shadow, and a resize corner. */
export function FloatFrame({ rect, onRect, label, z = 40, children }: { rect: FloatRect; onRect: (rect: FloatRect) => void; label: string; z?: number; children?: ReactNode }) {
  // The frame sits below the panel parts (z 40 < 41); the resize corner is its own fixed element above both.
  return <>
    <div role="dialog" aria-label={label} data-xgc-role="float-frame" className="fixed rounded-lg border border-line bg-panel shadow-pop" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }}>{children}</div>
    <span aria-hidden {...usePointerDrag(rect, onRect, 'resize')} className="fixed h-4 w-4 cursor-se-resize touch-none" style={{ zIndex: z + 2, left: rect.x + rect.w - 17, top: rect.y + rect.h - 17, background: 'linear-gradient(135deg, transparent 50%, var(--line-strong) 50%, var(--line-strong) 58%, transparent 58%, transparent 70%, var(--line-strong) 70%, var(--line-strong) 78%, transparent 78%)' }}/>
  </>
}

/* 撕下（tear-off）：把标签拖出标签条就变成浮动窗口，落在松手处（VS Code / Obsidian 的拖出语法）。
   短距离拖动仍是普通点击；拖动中显示一个虚线落点框，松手前可拖回取消。 */
export const TEAR_DISTANCE = 56
export function tearOffPoint(start: { x: number; y: number }, now: { x: number; y: number }, strip: { top: number; bottom: number }): boolean {
  // Torn once the pointer has left the tab strip vertically and travelled far enough to be deliberate.
  return Math.hypot(now.x - start.x, now.y - start.y) >= TEAR_DISTANCE && (now.y > strip.bottom + 16 || now.y < strip.top - 16)
}
export function useTearOff(onTear: (point: { x: number; y: number }) => void, size: { w: number; h: number }) {
  const suppress = useRef(false)
  const tearRef = useRef(onTear); tearRef.current = onTear
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const handlers = {
    // The pointer leaves a 28px tab almost at once, so the drag is followed on the window, not on the tab.
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      cleanup.current?.()
      const el = e.currentTarget as HTMLElement
      const box = (el.closest('[role=tablist]') ?? el).getBoundingClientRect()
      const origin = { x: e.clientX, y: e.clientY }, strip = { top: box.top, bottom: box.bottom }
      const move = (ev: PointerEvent) => { const torn = tearOffPoint(origin, { x: ev.clientX, y: ev.clientY }, strip); setGhost(torn ? { x: ev.clientX, y: ev.clientY } : null); if (torn) document.body.style.userSelect = 'none' }
      const up = (ev: PointerEvent) => {
        done()
        if (tearOffPoint(origin, { x: ev.clientX, y: ev.clientY }, strip)) { suppress.current = true; setTimeout(() => { suppress.current = false }, 0); tearRef.current({ x: ev.clientX, y: ev.clientY }) }
      }
      const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', done); setGhost(null); document.body.style.userSelect = ''; cleanup.current = null }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', done)
      cleanup.current = done
    },
    onClickCapture: (e: React.MouseEvent) => { if (suppress.current) { suppress.current = false; e.stopPropagation(); e.preventDefault() } },
  }
  const preview = ghost ? createPortal(<div aria-hidden data-xgc-role="tear-off-ghost" className="pointer-events-none fixed rounded-lg border border-dashed border-line-strong bg-panel/40" style={ghostStyle(tornRect(ghost, size))}/>, document.body) : null
  return { handlers, preview }
}
const ghostStyle = (r: FloatRect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: 60 })
/** Where a torn-off window lands: its header under the pointer, then clamped into the workspace. */
export function tornRect(point: { x: number; y: number }, size: { w: number; h: number }): FloatRect {
  return clampRect({ x: point.x - 80, y: point.y - 16, w: size.w, h: size.h })
}
