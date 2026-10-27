import { collectHmiCandidates, describeHmiVariables } from '@root/backend/shared/compile/jwplc-hmi-host'
import { useDevice } from '@root/middleware/shared/providers/platform-context'
import { useCallback, useEffect, useRef, useState } from 'react'

import { registerHmiDesignerSaver } from '../../../../../services/hmi-designer-save'
import { openPLCStoreBase, useOpenPLCStore } from '../../../../../store'
import { HMI_DESIGNER_TAB_NAME } from '../../../../../store/slices/tabs/utils'

/** Variables the Designer may bind, from the compile-ready project (aliases resolved). */
function currentHmiVariables() {
  const projectData = openPLCStoreBase.getState().projectActions.getCompileReadyProjectData()
  return describeHmiVariables(collectHmiCandidates(projectData))
}

const VARIABLES_DEBOUNCE_MS = 400

/**
 * JWPLC HMI Designer tab (Alpha14 F3): the Designer itself in a `<webview>`,
 * linked to the project's `hmi/` folder. The main process serves the page
 * and forces its preload (`jwplc-hmi-host/1`). The tab stays mounted while it
 * is open, so switching tabs keeps the design and its undo history.
 *
 * - Unsaved changes of the design mark the tab like any project file; OpenPLC's
 *   Save (Ctrl+S, Save project, compile) writes the design to `hmi/`.
 * - Editing the project's variables updates "Variable PLC" in the Designer.
 */
export const HmiDesignerEditor = () => {
  const device = useDevice()
  const projectPath = useOpenPLCStore((s) => s.project.meta.path)
  const [target, setTarget] = useState<{ url: string } | { error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const lastVariables = useRef('')

  // Link the Designer to this project (again when the project changes).
  useEffect(() => {
    let cancelled = false
    setTarget(null)
    if (!device.prepareHmiDesigner) {
      setTarget({ error: 'El HMI Designer sólo está disponible en OpenPLC Editor de escritorio.' })
      return
    }
    const state = openPLCStoreBase.getState()
    const variables = currentHmiVariables()
    lastVariables.current = JSON.stringify(variables)
    device
      .prepareHmiDesigner({
        projectPath,
        projectName: state.project.meta.name,
        device: state.deviceDefinitions.configuration.deviceBoard,
        variables,
      })
      .then((result) => {
        if (!cancelled) setTarget(result.ok ? { url: result.url } : { error: result.error })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setTarget({ error: caught instanceof Error ? caught.message : String(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [device, projectPath, attempt])

  // The design as a project file: dirty mark on the tab and OpenPLC's Save.
  useEffect(() => {
    const { fileActions } = openPLCStoreBase.getState()
    fileActions.addFile({ name: HMI_DESIGNER_TAB_NAME, type: 'hmi-designer', filePath: '' })
    const unsubscribeDirty = device.onHmiDesignerDirty?.((dirty) => {
      const { fileActions: files, workspaceActions } = openPLCStoreBase.getState()
      files.updateFile({ name: HMI_DESIGNER_TAB_NAME, saved: !dirty })
      if (dirty) workspaceActions.setEditingState('unsaved')
      else if (files.checkIfAllFilesAreSaved()) workspaceActions.setEditingState('saved')
    })
    const unregisterSaver = registerHmiDesignerSaver(async () => {
      const file = openPLCStoreBase.getState().files[HMI_DESIGNER_TAB_NAME]
      if (file?.saved) return true
      const result = await device.saveHmiDesigner?.()
      return Boolean(result?.ok)
    })
    return () => {
      unsubscribeDirty?.()
      unregisterSaver()
      openPLCStoreBase.getState().fileActions.removeFile({ name: HMI_DESIGNER_TAB_NAME })
    }
  }, [device])

  // Variables edited in OpenPLC reach "Variable PLC" without reopening the tab.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = openPLCStoreBase.subscribe((state, previous) => {
      if (state.project.data === previous.project.data) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const variables = currentHmiVariables()
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
  }, [device])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  if (target && 'error' in target) {
    return (
      <div className='flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center'>
        <p className='max-w-xl text-sm text-neutral-700 dark:text-neutral-300'>{target.error}</p>
        <button
          type='button'
          onClick={retry}
          className='h-[30px] rounded-md bg-brand px-4 py-1 font-caption text-cp-sm font-medium text-white hover:bg-brand-medium-dark'
        >
          Reintentar
        </button>
      </div>
    )
  }
  if (!target) {
    return (
      <div className='flex h-full w-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400'>
        Abriendo HMI Designer…
      </div>
    )
  }
  return <webview key={target.url} src={target.url} partition='persist:jwplc-hmi-designer' className='h-full w-full' />
}
