import { useCallback, useRef, useState } from 'react'
import { cn } from '../lib/cn'

/**
 * 细线拖拽手柄：常态 1px，hover/拖拽时亮起。
 * 双击可折叠/展开面板。
 */
export function ResizeHandle({
  orientation,
  onDelta,
  onDoubleClick,
  onDraggingChange,
}: {
  orientation: 'v' | 'h'
  onDelta: (delta: number) => void
  onDoubleClick?: () => void
  onDraggingChange?: (dragging: boolean) => void
}) {
  const [dragging, setDragging] = useState(false)
  const last = useRef(0)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      last.current = orientation === 'v' ? e.clientX : e.clientY
      setDragging(true)
      onDraggingChange?.(true)
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      document.body.style.cursor = orientation === 'v' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [orientation, onDraggingChange],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      const pos = orientation === 'v' ? e.clientX : e.clientY
      const delta = pos - last.current
      last.current = pos
      onDelta(delta)
    },
    [dragging, orientation, onDelta],
  )

  const end = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      setDragging(false)
      onDraggingChange?.(false)
      e.currentTarget.releasePointerCapture(e.pointerId)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    [dragging, onDraggingChange],
  )

  return (
    <div
      role="separator"
      aria-orientation={orientation === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onDoubleClick}
      className={cn(
        'group relative z-20 shrink-0 touch-none',
        orientation === 'v' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
      )}
    >
      {/* 可见的 1px 线 */}
      <div
        className={cn(
          'absolute transition-colors duration-200',
          orientation === 'v' ? 'inset-y-0 left-0 w-px' : 'inset-x-0 top-0 h-px',
          dragging ? 'bg-ink/60' : 'bg-line group-hover:bg-ink/30',
        )}
      />
      {/* 加宽命中区域 */}
      <div className={cn('absolute', orientation === 'v' ? '-left-1.5 -right-1.5 inset-y-0' : '-top-1.5 -bottom-1.5 inset-x-0')} />
    </div>
  )
}
