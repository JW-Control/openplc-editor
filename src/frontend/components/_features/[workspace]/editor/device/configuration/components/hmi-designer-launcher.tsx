import { isHmiVendorScreen } from '@root/backend/shared/compile/jwplc-hmi'
import type { BoardInfo } from '@root/middleware/shared/ports/types'
import { useDevice } from '@root/middleware/shared/providers/platform-context'
import { useEffect, useRef, useState } from 'react'

import { openPLCStoreBase, useOpenPLCStore } from '../../../../../../../store'
import { Label } from '../../../../../../_atoms/label'
import { openHmiDesigner } from '../../../hmi-designer'
import { VendorScreenRenderer } from '../vendor-screen'

/** Configuration file entry (the device editor's tab). */
const CONFIGURATION_FILE = 'Configuration'

/**
 * "Pantalla HMI" section of a board that declares `capabilities.hmiDisplay`
 * (JWPLC Basic). "Abrir HMI Designer" opens the full Designer in its own
 * window and, back in OpenPLC, the "HMI Designer" tab with the binding view
 * (Alpha14 F3). The HMI's own VPP screen (diagnostics) is shown here instead
 * of as a second HMI entry of the project tree; it is saved with Configuration.
 */
export const HmiDesignerLauncher = ({ boardInfo }: { boardInfo?: BoardInfo }) => {
  const device = useDevice()
  const [error, setError] = useState<string | null>(null)
  const screens = boardInfo?.vpp?.screens ?? {}
  const hmiScreen = Object.values(screens).find((definition) => isHmiVendorScreen(definition)) ?? null
  const moduleSystem = boardInfo?.vpp?.moduleSystem ?? null

  // The diagnostics persist in vendorScreenData: a change marks Configuration as unsaved.
  const ownedKeys = useRef<string[]>([])
  ownedKeys.current = ((hmiScreen as { sections?: Array<{ persistence?: string }> } | null)?.sections ?? [])
    .map((section) => section.persistence)
    .filter((key): key is string => Boolean(key))
  const owned = useOpenPLCStore((s) =>
    JSON.stringify(ownedKeys.current.map((key) => s.deviceDefinitions.configuration.vendorScreenData?.[key] ?? null)),
  )
  const firstOwned = useRef(owned)
  useEffect(() => {
    if (owned === firstOwned.current) return
    firstOwned.current = owned
    const { fileActions, workspaceActions } = openPLCStoreBase.getState()
    if (fileActions.getFile({ name: CONFIGURATION_FILE }).file) {
      fileActions.updateFile({ name: CONFIGURATION_FILE, saved: false })
      workspaceActions.setEditingState('unsaved')
    }
  }, [owned])

  if (!device.prepareHmiDesigner) return null

  const open = async () => {
    setError(null)
    const result = await openHmiDesigner(device)
    if (!result.ok) setError(result.error ?? 'No se pudo abrir el HMI Designer.')
  }

  return (
    <div id='hmi-designer-launcher' className='flex w-full flex-col items-start justify-start gap-2'>
      <Label className='w-fit text-xs text-neutral-950 dark:text-white'>Pantalla HMI</Label>
      <p className='font-caption text-cp-sm font-light text-neutral-600 dark:text-neutral-400'>
        Diseña la pantalla del equipo con JWPLC HMI Designer; se guarda en la carpeta hmi/ del proyecto y se incluye al
        compilar. En la pestaña «HMI Designer» ves la pantalla y enlazas cada objeto a una variable del PLC.
      </p>
      <button
        type='button'
        onClick={() => void open()}
        className='h-[30px] rounded-md bg-brand px-4 py-1 font-caption text-cp-sm font-medium text-white hover:bg-brand-medium-dark'
      >
        Abrir HMI Designer
      </button>
      {error && <p className='text-xs text-red-600 dark:text-red-400'>{error}</p>}
      {hmiScreen !== null && (
        <div className='mt-2 w-full'>
          <VendorScreenRenderer screenDefinition={hmiScreen} moduleSystem={moduleSystem} />
        </div>
      )}
    </div>
  )
}
