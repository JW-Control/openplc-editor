import { useCallback, useEffect, useRef, useState, WheelEvent } from 'react'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 1.25
const ZOOM_STEP = 0.05
const DEFAULT_ZOOM = 1

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))

const readStoredZoom = (storageKey?: string): number => {
  if (!storageKey) return DEFAULT_ZOOM
  try {
    const stored = window.localStorage.getItem(storageKey)
    const parsed = stored ? Number(stored) : NaN
    return Number.isFinite(parsed) ? clampZoom(parsed) : DEFAULT_ZOOM
  } catch {
    return DEFAULT_ZOOM
  }
}

/**
 * Drives a shared zoom level (25%–125%, step 5%) for a graphical-editor
 * canvas, with persistence, Ctrl+Scroll and Ctrl +/-/0 wired in.
 *
 * Do NOT apply the resulting `zoomLevel` as a CSS `zoom` or `transform:
 * scale()` on an ancestor of an interactive @xyflow/react canvas (one with
 * `nodesDraggable`). Both corrupt it, in different ways:
 *  - `zoom` changes descendants' *layout* size, so its ResizeObserver-based
 *    node/handle measurements read the scaled size — edges render skewed.
 *  - `transform: scale()` avoids that (paint-only), but dragging a node
 *    still breaks: React Flow converts pointer position to flow coordinates
 *    using ONLY its own `viewport.zoom`, with no notion of an ancestor's
 *    CSS scale. The mismatch throws the drop position off by the scale
 *    factor and PERMANENTLY corrupts that node's stored position — it does
 *    not self-correct on further zooming, since the bad value is now the
 *    node's actual position.
 *
 * The correct integration for such a canvas is to feed `zoomLevel` into the
 * library's own zoom mechanism — e.g. `reactFlowInstance.setViewport({ x: 0,
 * y: 0, zoom: zoomLevel }, { duration: 0 })` (see `RungBody` in the Ladder
 * editor) — so its internal pointer math always matches what's on screen.
 */
export const useCanvasZoom = (storageKey?: string) => {
  const [zoomLevel, setZoomLevel] = useState(() => readStoredZoom(storageKey))
  const hoveringRef = useRef(false)

  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, String(zoomLevel))
    } catch {
      // Best-effort persistence only — a private-browsing quota error shouldn't block zooming.
    }
  }, [zoomLevel, storageKey])

  const zoomIn = useCallback(() => setZoomLevel((z) => clampZoom(z + ZOOM_STEP)), [])
  const zoomOut = useCallback(() => setZoomLevel((z) => clampZoom(z - ZOOM_STEP)), [])
  const zoomReset = useCallback(() => setZoomLevel(DEFAULT_ZOOM), [])

  // Scoped to hover instead of a global listener so Ctrl+= in an unrelated
  // tab (or Monaco's own mouseWheelZoom) doesn't also drive this canvas.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!hoveringRef.current) return
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomOut()
      } else if (event.key === '0') {
        event.preventDefault()
        zoomReset()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomIn, zoomOut, zoomReset])

  const onMouseEnter = useCallback(() => {
    hoveringRef.current = true
  }, [])
  const onMouseLeave = useCallback(() => {
    hoveringRef.current = false
  }, [])
  // Capture phase: fires before any inner widget's own wheel handling (e.g.
  // Monaco's internal scroll/zoom listeners, attached natively — not
  // reachable via a bubble-phase React `onWheel`), so we can claim
  // Ctrl+Scroll before the widget underneath ever sees it.
  const onWheelCapture = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      if (event.deltaY < 0) zoomIn()
      else if (event.deltaY > 0) zoomOut()
    },
    [zoomIn, zoomOut],
  )

  return {
    zoomLevel,
    zoomIn,
    zoomOut,
    zoomReset,
    hoverHandlers: { onMouseEnter, onMouseLeave, onWheelCapture },
  }
}
