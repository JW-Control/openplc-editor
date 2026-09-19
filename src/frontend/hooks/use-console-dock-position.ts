import { useCallback, useEffect, useState } from 'react'

export type ConsoleDockPosition = 'bottom' | 'right'

const STORAGE_KEY = 'openplc-console-dock-position'

// Default to 'right' on first launch (no stored preference yet). Once the
// user picks a side via the dock-toggle button, that explicit choice is
// persisted and wins from then on — this default only applies before any
// choice has ever been saved.
const readStoredPosition = (): ConsoleDockPosition => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'bottom' ? 'bottom' : 'right'
  } catch {
    return 'right'
  }
}

/**
 * Persists whether the Console/Debugger panel is docked under the editor
 * (`'bottom'`, the original layout) or beside it (`'right'`, so the ladder
 * canvas can stay full height while debugging). localStorage-persisted the
 * same way `useCanvasZoom` persists zoom level — a per-viewer layout
 * preference, not project state, so it doesn't belong in the Zustand store.
 */
export const useConsoleDockPosition = () => {
  const [dockPosition, setDockPosition] = useState<ConsoleDockPosition>(readStoredPosition)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, dockPosition)
    } catch {
      // Best-effort persistence only.
    }
  }, [dockPosition])

  const toggleDockPosition = useCallback(() => {
    setDockPosition((prev) => (prev === 'bottom' ? 'right' : 'bottom'))
  }, [])

  return { dockPosition, setDockPosition, toggleDockPosition }
}
