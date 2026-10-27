import { useDevice } from '@root/middleware/shared/providers/platform-context'

import { useOpenPLCStore } from '../../../../../../../store'
import { CreateEditorObjectFromTab, HMI_DESIGNER_TAB_NAME } from '../../../../../../../store/slices/tabs/utils'
import { Label } from '../../../../../../_atoms/label'

/**
 * "Pantalla HMI" section of a board that declares `capabilities.hmiDisplay`
 * (JWPLC Basic). Opens the "HMI Designer" tab, the Designer linked to the
 * project's `hmi/` folder with the PLC variables it may bind (Alpha14 F3).
 */
export const HmiDesignerLauncher = () => {
  const device = useDevice()

  if (!device.prepareHmiDesigner) return null

  const open = () => {
    const { tabsActions, editorActions, workspaceActions } = useOpenPLCStore.getState()
    const tab = {
      name: HMI_DESIGNER_TAB_NAME,
      path: '/hmi-designer',
      elementType: { type: 'hmi-designer' as const },
    }
    tabsActions.updateTabs(tab)
    const model = editorActions.getEditorFromEditors(tab.name) ?? CreateEditorObjectFromTab(tab)
    editorActions.addModel(model)
    editorActions.setEditor(model)
    workspaceActions.setSelectedProjectTreeLeaf({ label: tab.name, type: 'hmi-designer' })
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
        onClick={open}
        className='h-[30px] rounded-md bg-brand px-4 py-1 font-caption text-cp-sm font-medium text-white hover:bg-brand-medium-dark'
      >
        Abrir HMI Designer
      </button>
    </div>
  )
}
