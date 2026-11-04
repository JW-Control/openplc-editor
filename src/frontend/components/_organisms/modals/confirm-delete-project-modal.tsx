/**
 * Confirmation modal for the start-screen 3-dot menu's "Delete
 * project" action. Distinct from `confirm-delete-element` (per-POU /
 * datatype / server deletion inside an open project) because:
 *
 *  1. The data shape is different — this one carries `{ projectName,
 *     projectPath }` straight off the recents list, no live store
 *     element to look up.
 *  2. The blast radius is bigger — `confirm-delete-element` removes a
 *     single file inside the open project; this one recursively wipes
 *     the entire project directory. The copy emphasises permanence
 *     and shows the full path so the user can sanity-check before
 *     committing.
 *  3. There's no save flow afterwards — the file map is gone, so the
 *     post-action work is just refreshing the recents list.
 *
 * The sibling "Remove from list" action runs immediately without
 * surfacing this modal — disk is untouched there, so no confirmation
 * is warranted.
 */

import { tr } from '@root/frontend/locales/tr'

import { useProject } from '../../../../middleware/shared/providers'
import { WarningIcon } from '../../../assets/icons/interface/Warning'
import { useOpenPLCStore } from '../../../store'
import { toast } from '../../_features/[app]/toast/use-toast'
import { Modal, ModalContent } from '../../_molecules/modal'

type ConfirmDeleteProjectModalProps = {
  isOpen: boolean
}

interface ConfirmDeleteProjectData {
  projectName: string
  projectPath: string
}

function resolveDeleteTarget(data: unknown): ConfirmDeleteProjectData | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Partial<ConfirmDeleteProjectData>
  if (typeof d.projectName !== 'string' || typeof d.projectPath !== 'string') return null
  return { projectName: d.projectName, projectPath: d.projectPath }
}

const ConfirmDeleteProjectModal = ({ isOpen, ...rest }: ConfirmDeleteProjectModalProps) => {
  const projectPort = useProject()
  const {
    modals,
    modalActions: { onOpenChange, closeModal },
    workspaceActions: { setRecent },
  } = useOpenPLCStore()

  const target = resolveDeleteTarget(modals['confirm-delete-project']?.data)

  const handleConfirm = async () => {
    if (!target) {
      closeModal()
      return
    }
    const result = await projectPort.deleteProject(target.projectPath)
    closeModal()

    if (!result.success) {
      toast({
        title: tr('Could not delete the project'),
        description: result.error ?? `Failed to delete "${target.projectName}".`,
        variant: 'fail',
      })
    } else {
      toast({
        title: tr('Project deleted'),
        description: tr('"{{projectName}}" was removed from disk.', { projectName: target.projectName }),
        variant: 'default',
      })
    }

    // Refresh the recents list either way: success removed the entry,
    // failure-due-to-missing-project-json ALSO removed the entry (see
    // ProjectService.deleteProject's stale-entry branch), and other
    // failures left it in place — re-reading reflects whichever state
    // landed without the renderer needing to mirror the service's
    // gate logic.
    const refreshed = await projectPort.getRecentProjects()
    setRecent(refreshed)
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeModal()
        onOpenChange('confirm-delete-project', open)
      }}
      {...rest}
    >
      <ModalContent className='flex w-[340px] select-none flex-col items-center justify-evenly rounded-lg'>
        <div className='flex select-none flex-col items-center gap-5'>
          <WarningIcon className='mt-2 h-[73px] w-[73px]' />
          <div className='flex flex-col gap-2'>
            <p className='text-m w-full text-center font-bold text-gray-600 dark:text-neutral-100'>
              {tr('Delete this project permanently?')}
            </p>
            <p className='w-full break-all text-center text-xs text-gray-500 dark:text-neutral-400'>
              {target?.projectName ?? 'project'}
            </p>
            <p className='w-full break-all text-center text-[10px] text-gray-400 dark:text-neutral-500'>
              {target?.projectPath ?? ''}
            </p>
            <p className='w-full text-center text-xs text-gray-500 dark:text-neutral-400'>
              {tr('The entire project directory will be removed from disk. This cannot be undone.')}
            </p>
          </div>
          <div className='flex w-[220px] flex-col gap-1 space-y-2 text-sm'>
            <button
              onClick={() => void handleConfirm()}
              className='w-full rounded-lg bg-brand px-4 py-2 text-center font-medium text-white'
            >
              {tr('Delete project')}
            </button>
            <button
              onClick={() => closeModal()}
              className='w-full rounded-md bg-neutral-100 px-4 py-2 font-medium dark:bg-neutral-850 dark:text-neutral-100'
            >
              {tr('Cancel')}
            </button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}

export { ConfirmDeleteProjectModal }
