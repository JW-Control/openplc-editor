import { collectHmiCandidates, describeHmiVariables } from '@root/backend/shared/compile/jwplc-hmi-host'
import { tr } from '@root/frontend/locales/tr'
import type { DevicePort, OpenHmiDesignerArgs } from '@root/middleware/shared/ports/device-port'
import { useDevice } from '@root/middleware/shared/providers/platform-context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { registerHmiDesignerSaver } from '../../../../../services/hmi-designer-save'
import { type OpenPLCStore, useOpenPLCStore, useOpenPLCStoreApi } from '../../../../../store'
import { CreateEditorObjectFromTab, HMI_DESIGNER_TAB_NAME } from '../../../../../store/slices/tabs/utils'

/** Variables the Designer may bind, from the compile-ready project (aliases resolved). */
function currentHmiVariables(store: OpenPLCStore) {
  const projectData = store.getState().projectActions.getCompileReadyProjectData()
  return describeHmiVariables(collectHmiCandidates(projectData))
}

/** What the Designer needs to link to the open project. */
function hmiDesignerArgs(store: OpenPLCStore): OpenHmiDesignerArgs {
  const state = store.getState()
  return {
    projectPath: state.project.meta.path,
    projectName: state.project.meta.name,
    device: state.deviceDefinitions.configuration.deviceBoard,
    variables: currentHmiVariables(store),
  }
}

/** Show the binding view in the "HMI Designer" tab (opening the tab if needed). */
export function openHmiDesignerTab(store: OpenPLCStore): void {
  const { tabsActions, editorActions, workspaceActions } = store.getState()
  const tab = { name: HMI_DESIGNER_TAB_NAME, path: '/hmi-designer', elementType: { type: 'hmi-designer' as const } }
  tabsActions.updateTabs(tab)
  const model = editorActions.getEditorFromEditors(tab.name) ?? CreateEditorObjectFromTab(tab)
  editorActions.addModel(model)
  editorActions.setEditor(model)
  workspaceActions.setSelectedProjectTreeLeaf({ label: tab.name, type: 'hmi-designer' })
}

/**
 * "HMI Designer" of the project tree and of Configuration: the full Designer
 * opens in its own window, and back in OpenPLC the tab shows the binding view.
 */
export async function openHmiDesigner(
  store: OpenPLCStore,
  device: DevicePort,
): Promise<{ ok: boolean; error?: string }> {
  openHmiDesignerTab(store)
  if (!device.openHmiDesignerWindow) return { ok: true }
  const result = await device.openHmiDesignerWindow(hmiDesignerArgs(store))
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

const VARIABLES_DEBOUNCE_MS = 400

type ScriptRunner = { executeJavaScript: (code: string) => Promise<unknown> }

function canRunScript(node: object): node is ScriptRunner {
  return 'executeJavaScript' in node && typeof node.executeJavaScript === 'function'
}

/** The binding view follows OpenPLC's theme (designer-openplc-bindings.js, JWPLCBindingsView). */
function applyDesignerTheme(node: HTMLElement | null, dark: boolean): void {
  if (!node || !canRunScript(node)) return
  const theme = dark ? 'dark' : 'light'
  node.executeJavaScript(`window.JWPLCBindingsView?.setTheme?.('${theme}')`).catch(() => undefined)
}

/**
 * JWPLC HMI Designer tab (Alpha14 F3, bridge 1.4): the Designer's binding view
 * in a `<webview>` (preview, page tabs, object tree and "Variable PLC"),
 * linked to the project's `hmi/` folder. The screen is drawn in the full
 * Designer window ("Editar diseño…"); while it is open this view is read-only
 * and reloads each time the window saves. The main process serves the page
 * and forces its preload (`jwplc-hmi-host/1`). The tab stays mounted while it
 * is open, so switching tabs keeps the view as it was.
 *
 * - Unsaved changes of the design (window or view) mark the tab like any
 *   project file; OpenPLC's Save (Ctrl+S, Save project, compile) writes them
 *   to `hmi/`.
 * - Editing the project's variables updates "Variable PLC" without reopening.
 */
export const HmiDesignerEditor = () => {
  const device = useDevice()
  const store = useOpenPLCStoreApi()
  const projectPath = useOpenPLCStore((s) => s.project.meta.path)
  const [target, setTarget] = useState<{ url: string } | { error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const lastVariables = useRef('')
  const darkMode = useOpenPLCStore((s) => s.workspace.systemConfigs.shouldUseDarkMode)
  const darkModeRef = useRef(darkMode)
  darkModeRef.current = darkMode
  const webviewRef = useRef<HTMLElement | null>(null)

  // Link the Designer to this project (again when the project changes).
  useEffect(() => {
    let cancelled = false
    setTarget(null)
    if (!device.prepareHmiDesigner) {
      setTarget({ error: 'El HMI Designer sólo está disponible en OpenPLC Editor de escritorio.' })
      return
    }
    const args = hmiDesignerArgs(store)
    lastVariables.current = JSON.stringify(args.variables)
    device
      .prepareHmiDesigner(args)
      .then((result) => {
        if (!cancelled) setTarget(result.ok ? { url: result.url } : { error: result.error })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setTarget({ error: caught instanceof Error ? caught.message : String(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [device, store, projectPath, attempt])

  // The design as a project file: dirty mark on the tab and OpenPLC's Save.
  useEffect(() => {
    const { fileActions } = store.getState()
    fileActions.addFile({ name: HMI_DESIGNER_TAB_NAME, type: 'hmi-designer', filePath: '' })
    const unsubscribeDirty = device.onHmiDesignerDirty?.((dirty) => {
      const { fileActions: files, workspaceActions } = store.getState()
      files.updateFile({ name: HMI_DESIGNER_TAB_NAME, saved: !dirty })
      if (dirty) workspaceActions.setEditingState('unsaved')
      else if (files.checkIfAllFilesAreSaved()) workspaceActions.setEditingState('saved')
    })
    const unregisterSaver = registerHmiDesignerSaver(async () => {
      const file = store.getState().files[HMI_DESIGNER_TAB_NAME]
      if (file?.saved) return true
      const result = await device.saveHmiDesigner?.()
      return Boolean(result?.ok)
    })
    return () => {
      unsubscribeDirty?.()
      unregisterSaver()
      store.getState().fileActions.removeFile({ name: HMI_DESIGNER_TAB_NAME })
    }
  }, [device, store])

  // Variables edited in OpenPLC reach "Variable PLC" without reopening the tab.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.project.data === previous.project.data) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const variables = currentHmiVariables(store)
        const text = JSON.stringify(variables)
        if (text === lastVariables.current) return
        lastVariables.current = text
        void device.updateHmiDesignerVariables?.(variables)
      }, VARIABLES_DEBOUNCE_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [device, store])

  // OpenPLC's theme switch reaches the loaded view without reloading it.
  useEffect(() => {
    applyDesignerTheme(webviewRef.current, darkMode)
  }, [darkMode])

  // A theme switch while the view was loading is applied once it is ready.
  const attachWebview = useCallback((node: HTMLElement | null) => {
    webviewRef.current = node
    node?.addEventListener('dom-ready', () => applyDesignerTheme(node, darkModeRef.current))
  }, [])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  // The theme at load time only: a later switch must not change src (it would reload the view).
  const webviewSrc = useMemo(
    () => (target && 'url' in target ? `${target.url}&theme=${darkModeRef.current ? 'dark' : 'light'}` : ''),
    [target],
  )

  if (target && 'error' in target) {
    return (
      <div className='flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center'>
        <p className='max-w-xl text-sm text-neutral-700 dark:text-neutral-300'>{target.error}</p>
        <button
          type='button'
          onClick={retry}
          className='h-[30px] rounded-md bg-brand px-4 py-1 font-caption text-cp-sm font-medium text-white hover:bg-brand-medium-dark'
        >
          {tr('Reintentar')}
        </button>
      </div>
    )
  }
  if (!target) {
    return (
      <div className='flex h-full w-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400'>
        {tr('Abriendo HMI Designer…')}
      </div>
    )
  }
  return (
    <webview
      key={target.url}
      ref={attachWebview}
      src={webviewSrc}
      partition='persist:jwplc-hmi-designer'
      className='h-full w-full'
    />
  )
}
