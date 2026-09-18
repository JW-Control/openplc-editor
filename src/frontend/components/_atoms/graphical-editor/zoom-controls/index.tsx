import { PointerEvent, useCallback, useRef, useState } from 'react'

type ZoomControlsProps = {
  zoomLevel: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

const DEFAULT_OFFSET_RIGHT = 16
const DEFAULT_OFFSET_BOTTOM = 12

/**
 * Floating +/-/% control for a `useCanvasZoom`-driven canvas. Purely
 * presentational — the caller owns where/how the actual zoom is applied
 * (see `useCanvasZoom` for why it must go through the target's own zoom
 * mechanism rather than an ancestor CSS transform).
 *
 * Draggable by its grip handle: it defaults to the bottom-right corner,
 * which can sit on top of content underneath (e.g. the Ladder editor's
 * "Create new rung" bar) — dragging it elsewhere fixes that per-editor
 * without needing a smarter default position for every layout.
 */
export const ZoomControls = ({ zoomLevel, onZoomIn, onZoomOut, onReset }: ZoomControlsProps) => {
  const widgetRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null>(null)

  const clampToContainer = useCallback((left: number, top: number) => {
    const widget = widgetRef.current
    const container = widget?.offsetParent as HTMLElement | null
    if (!widget || !container) return { left, top }
    const maxLeft = Math.max(container.clientWidth - widget.offsetWidth, 0)
    const maxTop = Math.max(container.clientHeight - widget.offsetHeight, 0)
    return { left: Math.min(Math.max(left, 0), maxLeft), top: Math.min(Math.max(top, 0), maxTop) }
  }, [])

  const handleGripPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const widget = widgetRef.current
    const container = widget?.offsetParent as HTMLElement | null
    if (!widget || !container) return
    const widgetRect = widget.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: widgetRect.left - containerRect.left,
      originTop: widgetRect.top - containerRect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handleGripPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY
      setPosition(clampToContainer(dragState.originLeft + deltaX, dragState.originTop + deltaY))
    },
    [clampToContainer],
  )

  const endDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return
    dragStateRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <div
      ref={widgetRef}
      className='pointer-events-none absolute z-20'
      style={
        position
          ? { left: position.left, top: position.top }
          : { right: DEFAULT_OFFSET_RIGHT, bottom: DEFAULT_OFFSET_BOTTOM }
      }
    >
      <div className='pointer-events-auto flex items-center gap-0.5 rounded-md border border-neutral-200 bg-white/95 px-1 py-0.5 text-xs text-neutral-600 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-300'>
        <button
          type='button'
          aria-label='Move zoom control'
          title='Drag to move'
          className='flex h-6 w-4 cursor-grab touch-none items-center justify-center text-neutral-400 active:cursor-grabbing'
          onPointerDown={handleGripPointerDown}
          onPointerMove={handleGripPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          ⠿
        </button>
        <button
          type='button'
          aria-label='Zoom out'
          title='Zoom out (Ctrl + -)'
          className='flex h-6 w-6 items-center justify-center rounded font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800'
          onClick={onZoomOut}
        >
          −
        </button>
        <button
          type='button'
          aria-label='Reset zoom'
          title='Reset zoom (Ctrl + 0)'
          className='min-w-[3.5ch] px-1 text-center hover:underline'
          onClick={onReset}
        >
          {Math.round(zoomLevel * 100)}%
        </button>
        <button
          type='button'
          aria-label='Zoom in'
          title='Zoom in (Ctrl + +)'
          className='flex h-6 w-6 items-center justify-center rounded font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800'
          onClick={onZoomIn}
        >
          +
        </button>
      </div>
    </div>
  )
}
