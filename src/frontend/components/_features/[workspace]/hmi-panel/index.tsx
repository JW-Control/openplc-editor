import { collectHmiCandidates, describeHmiVariables } from '@root/backend/shared/compile/jwplc-hmi-host'
import { useDevice } from '@root/middleware/shared/providers/platform-context'
import { useCallback, useState } from 'react'

import { useOpenPLCStore, useOpenPLCStoreApi } from '../../../../store'
import { openHmiDesigner, openHmiDesignerTab } from '../editor/hmi-designer'

interface HmiSidePanelProps {
  onClose: () => void
}

/**
 * JWPLC HMI Designer right-side task card / panel (Option A - TIA Portal style).
 *
 * Provides a dedicated, always-accessible panel on the right side of the workspace
 * for the JWPLC Basic integrated TFT display (ST7789 320x170).
 */
export const HmiSidePanel = ({ onClose }: HmiSidePanelProps) => {
  const device = useDevice()
  const store = useOpenPLCStoreApi()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const projectName = useOpenPLCStore((s) => s.project.meta.name)
  const deviceBoard = useOpenPLCStore((s) => s.deviceDefinitions.configuration.deviceBoard)

  const handleOpenWindow = useCallback(async () => {
    setOpening(true)
    setError(null)
    try {
      const result = await openHmiDesigner(store, device)
      if (!result.ok && result.error) {
        setError(result.error)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setOpening(false)
    }
  }, [device, store])

  const handleOpenTab = useCallback(() => {
    openHmiDesignerTab(store)
  }, [store])

  // Calculate available candidate variables for binding
  const candidatesCount = (() => {
    try {
      const state = store.getState()
      const projectData = state.projectActions.getCompileReadyProjectData()
      const vars = describeHmiVariables(collectHmiCandidates(projectData))
      return vars.length
    } catch {
      return 0
    }
  })()

  return (
    <div
      id='hmi-side-panel'
      className='flex h-full w-full flex-col gap-3 overflow-y-auto font-caption text-xs text-neutral-800 dark:text-neutral-200'
    >
      {/* Panel Header */}
      <div className='flex items-center justify-between border-b border-neutral-200 pb-2.5 dark:border-neutral-800'>
        <div className='flex items-center gap-2'>
          <span className='flex h-6 w-6 items-center justify-center rounded-md bg-blue-600/10 text-base text-blue-600 dark:bg-blue-400/10 dark:text-blue-400'>
            🖥️
          </span>
          <div>
            <h3 className='font-display text-sm font-semibold tracking-tight text-neutral-900 dark:text-white'>
              HMI Designer
            </h3>
            <p className='text-[10px] text-neutral-500 dark:text-neutral-400'>
              {deviceBoard || 'JWPLC Basic'} · TFT ST7789
            </p>
          </div>
        </div>
        <button
          type='button'
          onClick={onClose}
          title='Cerrar panel lateral HMI'
          className='flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
        >
          ✕
        </button>
      </div>

      {/* TFT Display Representation Card */}
      <div className='flex flex-col gap-1.5 rounded-lg border border-neutral-300 bg-neutral-950 p-2.5 text-neutral-300 shadow-inner dark:border-neutral-800'>
        <div className='flex items-center justify-between border-b border-neutral-800 pb-1 font-mono text-[9px] text-neutral-400'>
          <span>TFT 320 × 170 px</span>
          <span className='flex items-center gap-1 text-green-400'>
            <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-green-400'></span>
            RGB565
          </span>
        </div>
        <div className='flex h-20 w-full flex-col items-center justify-center rounded border border-neutral-800/80 bg-neutral-900 p-2 text-center'>
          <span className='text-xs font-bold tracking-wide text-neutral-100'>JWPLC DISPLAY</span>
          <span className='font-mono text-[10px] text-blue-400'>hmi/JWPLC_HMI.jwhmi</span>
          <span className='mt-1 text-[9px] text-neutral-500'>6 teclas: LEFT, UP, RIGHT, ESC, OK, DOWN</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className='flex flex-col gap-2'>
        <button
          type='button'
          onClick={() => void handleOpenWindow()}
          disabled={opening}
          className='flex h-9 w-full items-center justify-center gap-2 rounded-md bg-brand px-3 font-caption text-xs font-semibold text-white shadow transition-colors hover:bg-brand-medium-dark disabled:opacity-50'
        >
          <span>✏️</span>
          <span>{opening ? 'Abriendo Diseñador…' : 'Abrir Diseñador HMI'}</span>
        </button>

        <button
          type='button'
          onClick={handleOpenTab}
          className='flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-neutral-50 px-3 font-caption text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
        >
          <span>📄</span>
          <span>Ver pestaña de enlaces</span>
        </button>
      </div>

      {error && (
        <div className='rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400'>
          <p className='font-semibold'>Error:</p>
          <p>{error}</p>
        </div>
      )}

      {/* Variables for Binding Status */}
      <div className='flex flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-50/50 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/40'>
        <div className='flex items-center justify-between text-[11px] font-semibold text-neutral-800 dark:text-neutral-200'>
          <span>Variables PLC disponibles</span>
          <span className='rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300'>
            {candidatesCount}
          </span>
        </div>
        <p className='text-[10px] text-neutral-500 dark:text-neutral-400'>
          Variables ubicadas (%IX, %QX, %MW, %MD) y variables internas del programa seleccionables en el HMI Designer.
        </p>
      </div>

      {/* Footer Info */}
      <div className='mt-auto border-t border-neutral-200 pt-2 text-[10px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400'>
        <p>
          Proyecto: <span className='font-mono font-medium text-neutral-700 dark:text-neutral-300'>{projectName}</span>
        </p>
        <p className='mt-0.5'>
          La pantalla se guarda en <code className='text-neutral-700 dark:text-neutral-300'>hmi/</code> y se compila
          directamente en el firmware.
        </p>
      </div>
    </div>
  )
}
