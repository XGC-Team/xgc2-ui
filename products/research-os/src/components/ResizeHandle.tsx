import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

/** Existing hairline divider, with optional keyboard resizing for a bounded panel. */
export function ResizeHandle({
  orientation, onDelta, onDoubleClick, onDraggingChange,
  label, value, min, max, onValueChange,
}: {
  orientation: 'v' | 'h'
  onDelta: (delta: number) => void
  onDoubleClick?: () => void
  onDraggingChange?: (dragging: boolean) => void
  label?: string
  value?: number
  min?: number
  max?: number
  onValueChange?: (value: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const pointer = useRef<{ id: number; element: HTMLDivElement; last: number; cursor: string; select: string } | null>(null)
  const draggingCallback = useRef(onDraggingChange)
  draggingCallback.current = onDraggingChange
  const end = useCallback((updateState = true) => {
    const current = pointer.current
    if (!current) return
    pointer.current = null
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id)
    document.body.style.cursor = current.cursor
    document.body.style.userSelect = current.select
    if (updateState) setDragging(false)
    draggingCallback.current?.(false)
  }, [])
  useEffect(() => () => end(false), [end])

  return <div role="separator" aria-label={label}
    aria-orientation={orientation === 'v' ? 'vertical' : 'horizontal'}
    tabIndex={onValueChange ? 0 : undefined}
    aria-valuenow={onValueChange ? value : undefined}
    aria-valuemin={onValueChange ? min : undefined}
    aria-valuemax={onValueChange ? max : undefined}
    onKeyDown={event => {
      if (!onValueChange || value === undefined || min === undefined || max === undefined) return
      const backward = orientation === 'v' ? 'ArrowLeft' : 'ArrowUp'
      const forward = orientation === 'v' ? 'ArrowRight' : 'ArrowDown'
      const step = event.shiftKey ? 48 : 16
      const next = event.key === 'Home' ? min : event.key === 'End' ? max
        : event.key === backward ? value - step : event.key === forward ? value + step : null
      if (next === null) return
      event.preventDefault()
      event.stopPropagation()
      onValueChange(Math.max(min, Math.min(max, next)))
    }}
    onPointerDown={event => {
      if (event.button !== 0 || pointer.current) return
      event.preventDefault()
      const element = event.currentTarget
      element.setPointerCapture(event.pointerId)
      pointer.current = {
        id: event.pointerId, element, last: orientation === 'v' ? event.clientX : event.clientY,
        cursor: document.body.style.cursor, select: document.body.style.userSelect,
      }
      if (onValueChange) element.focus({ preventScroll: true })
      setDragging(true)
      draggingCallback.current?.(true)
      document.body.style.cursor = orientation === 'v' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    }}
    onPointerMove={event => {
      const current = pointer.current
      if (!current || current.id !== event.pointerId) return
      const position = orientation === 'v' ? event.clientX : event.clientY
      const delta = position - current.last
      current.last = position
      onDelta(delta)
    }}
    onPointerUp={event => { if (event.pointerId === pointer.current?.id) end() }}
    onPointerCancel={event => { if (event.pointerId === pointer.current?.id) end() }}
    onLostPointerCapture={event => { if (event.pointerId === pointer.current?.id) end() }}
    onDoubleClick={onDoubleClick}
    className={cn('group relative z-20 shrink-0 touch-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-current',
      orientation === 'v' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize')}>
    <div className={cn('absolute transition-colors duration-200',
      orientation === 'v' ? 'inset-y-0 left-0 w-px' : 'inset-x-0 top-0 h-px',
      dragging ? 'bg-ink/60' : 'bg-line group-hover:bg-ink/30')}/>
    <div className={cn('absolute', orientation === 'v' ? '-left-1.5 -right-1.5 inset-y-0' : '-top-1.5 -bottom-1.5 inset-x-0')}/>
  </div>
}
