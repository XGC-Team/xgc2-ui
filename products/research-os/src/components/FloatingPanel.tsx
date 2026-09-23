import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { GripHorizontal } from 'lucide-react'
import { readPreference, writePreference } from '../lib/storage'

/* 可分离面板（Obsidian 弹出窗格 / VS Code 浮动视图的语法）：面板本身仍是同一个 keyed 节点，
   浮动只把它从 gridArea 换成 position:fixed 的矩形——草稿、消息流、PDF 滚动都不重挂。
   这里只提供几何：矩形持久化、拖动、缩放、视口夹取；内容由调用方原样放入。 */
export type FloatRect = { x: number; y: number; w: number; h: number }
const MIN = { w: 320, h: 240 }

export function clampRect(rect: FloatRect, viewport = { w: typeof window === 'undefined' ? 1440 : window.innerWidth, h: typeof window === 'undefined' ? 900 : window.innerHeight }): FloatRect {
  const w = Math.max(MIN.w, Math.min(rect.w, viewport.w - 16)), h = Math.max(MIN.h, Math.min(rect.h, viewport.h - 16))
  return { w, h, x: Math.max(8, Math.min(rect.x, viewport.w - w - 8)), y: Math.max(8, Math.min(rect.y, viewport.h - h - 8)) }
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
export function FloatGrip({ rect, onRect, label }: { rect: FloatRect; onRect: (rect: FloatRect) => void; label: string }) {
  return <span role="button" tabIndex={-1} aria-label={label} title={label} {...usePointerDrag(rect, onRect, 'move')}
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
