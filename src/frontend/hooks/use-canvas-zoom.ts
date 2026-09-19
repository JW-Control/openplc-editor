import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_MIN_ZOOM = 0.25
const DEFAULT_MAX_ZOOM = 1.25
const DEFAULT_ZOOM_STEP = 0.05
const DEFAULT_ZOOM = 1

type UseCanvasZoomOptions = {
  min?: number
  max?: number
  step?: number
}

const readStoredZoom = (storageKey: string | undefined, clamp: (value: number) => number): number => {
  if (!storageKey) return DEFAULT_ZOOM
  try {
    const stored = window.localStorage.getItem(storageKey)
    const parsed = stored ? Number(stored) : NaN
    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_ZOOM
  } catch {
    return DEFAULT_ZOOM
  }
}

/**
 * Drives a shared zoom level (25%–125% by default, step 5%) for a
 * graphical-editor canvas, with persistence, Ctrl+Scroll and Ctrl +/-/0
 * wired in.
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
 *
 * Pass `{ min }` to raise the floor for a target with its own hard lower
 * bound — e.g. Monaco clamps `fontSize` to 6px minimum internally
 * (`EditorFloatOption.clamp(fontSize, 6, 100)` in `editorOptions.js`), so a
 * 12px baseline can't visually shrink below 50%; every step from 25%–45%
 * would render identically at the 6px floor, looking "stuck".
 */
export const useCanvasZoom = (storageKey?: string, options?: UseCanvasZoomOptions) => {
  const min = options?.min ?? DEFAULT_MIN_ZOOM
  const max = options?.max ?? DEFAULT_MAX_ZOOM
  const step = options?.step ?? DEFAULT_ZOOM_STEP

  const clampZoom = useCallback(
    (value: number) => Math.min(max, Math.max(min, Math.round(value * 100) / 100)),
    [min, max],
  )

  const [zoomLevel, setZoomLevel] = useState(() => readStoredZoom(storageKey, clampZoom))
  const hoveringRef = useRef(false)
  const containerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, String(zoomLevel))
    } catch {
      // Best-effort persistence only — a private-browsing quota error shouldn't block zooming.
    }
  }, [zoomLevel, storageKey])

  const zoomIn = useCallback(() => setZoomLevel((z) => clampZoom(z + step)), [clampZoom, step])
  const zoomOut = useCallback(() => setZoomLevel((z) => clampZoom(z - step)), [clampZoom, step])
  const zoomReset = useCallback(() => setZoomLevel(clampZoom(DEFAULT_ZOOM)), [clampZoom])

  // Scoped to hover instead of a global listener so Ctrl+= in an unrelated
  // tab doesn't also drive this canvas.
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

  // React's synthetic `onWheel`/`onWheelCapture` props are always attached
  // as PASSIVE listeners (a framework-wide default for scroll performance),
  // so calling `preventDefault()` from one is a silent no-op that also logs
  // "Unable to preventDefault inside passive event listener invocation" —
  // harmless, but noisy, and it means the browser's own Ctrl+Scroll
  // page-zoom never actually gets suppressed. A manually attached native
  // listener can opt out of that default via `{ passive: false }`, which is
  // why this uses a ref + effect instead of a JSX event prop. Capture phase
  // still applies, so this fires before any inner widget's own wheel
  // handling (e.g. Monaco's internal scroll, attached natively on its own
  // DOM node).
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      if (event.deltaY < 0) zoomIn()
      else if (event.deltaY > 0) zoomOut()
    }
    element.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => element.removeEventListener('wheel', handleWheel, { capture: true })
  }, [zoomIn, zoomOut])

  const onMouseEnter = useCallback(() => {
    hoveringRef.current = true
  }, [])
  const onMouseLeave = useCallback(() => {
    hoveringRef.current = false
  }, [])

  return {
    zoomLevel,
    zoomIn,
    zoomOut,
    zoomReset,
    /** Attach to the same element as `hoverHandlers` (`ref={containerRef}`) — needed for the native, non-passive wheel listener. */
    containerRef,
    hoverHandlers: { onMouseEnter, onMouseLeave },
  }
}
