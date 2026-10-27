/**
 * Save hook of the JWPLC HMI Designer tab.
 *
 * The design lives in the Designer page (the tab's `<webview>`), not in the
 * store: while the tab is open it registers how to save it, and the save
 * actions call it (Ctrl+S on the tab, Save project, compile auto-save, the
 * save-changes modal).
 */

type HmiDesignerSaver = () => Promise<boolean>

let saver: HmiDesignerSaver | null = null

/** Register the open tab's saver; returns the function that unregisters it. */
export function registerHmiDesignerSaver(next: HmiDesignerSaver): () => void {
  saver = next
  return () => {
    if (saver === next) saver = null
  }
}

/** Save the open design. True when there is nothing to save or it was saved. */
export async function saveHmiDesignerDesign(): Promise<boolean> {
  if (!saver) return true
  try {
    return await saver()
  } catch {
    return false
  }
}
