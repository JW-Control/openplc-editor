import { collectHmiCandidates, describeHmiVariables } from '@root/backend/shared/compile/jwplc-hmi-host'
import { useDevice } from '@root/middleware/shared/providers/platform-context'
import { useState } from 'react'

import { useOpenPLCStore } from '../../../../../../../store'
import { Label } from '../../../../../../_atoms/label'

/**
 * "Pantalla HMI" section of a board that declares `capabilities.hmiDisplay`
 * (JWPLC Basic). Opens JWPLC HMI Designer linked to the project's `hmi/`
 * folder and hands it the PLC variables it may bind (Alpha14 F3).
 */
export const HmiDesignerLauncher = ({ deviceName }: { deviceName: string }) => {
  const device = useDevice()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!device.openHmiDesigner) return null

  const open = async () => {
    setOpening(true)
    setError(null)
    try {
      const state = useOpenPLCStore.getState()
      const projectData = state.projectActions.getCompileReadyProjectData()
      const result = await device.openHmiDesigner?.({
        projectPath: state.project.meta.path,
        projectName: state.project.meta.name,
        device: deviceName,
        variables: describeHmiVariables(collectHmiCandidates(projectData)),
      })
      if (result && !result.ok) setError(result.error)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div id='hmi-designer-launcher' className='flex w-full flex-col items-start justify-start gap-2'>
      <Label className='w-fit text-xs text-neutral-950 dark:text-white'>Pantalla HMI</Label>
      <p className='font-caption text-cp-sm font-light text-neutral-600 dark:text-neutral-400'>
        Diseña la pantalla del equipo con JWPLC HMI Designer; se guarda en la carpeta hmi/ del proyecto y se incluye al
        compilar.
      </p>
      <button
        type='button'
        onClick={() => void open()}
        disabled={opening}
        className='h-[30px] rounded-md bg-brand px-4 py-1 font-caption text-cp-sm font-medium text-white hover:bg-brand-medium-dark disabled:opacity-50'
      >
        {opening ? 'Abriendo…' : 'Abrir HMI Designer'}
      </button>
      {error && <p className='text-xs text-red-600 dark:text-red-400'>{error}</p>}
    </div>
  )
}
