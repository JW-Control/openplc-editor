import { tr } from '@root/frontend/locales/tr'

import { useOpenPLCStore } from '../../../store'
import { RenameImpactModal } from '.'

/**
 * Store-driven host for the data type rename flow: `datatypeActions.rename`
 * parks the awaited confirmation in `pendingDatatypeRename`, this renders the
 * impact modal for it, and confirm/cancel resolve the pending promise via
 * `respondToPendingRename`.
 */
export const DataTypeRenameImpactModal = () => {
  const pending = useOpenPLCStore((s) => s.pendingDatatypeRename)
  const respondToPendingRename = useOpenPLCStore((s) => s.datatypeActions.respondToPendingRename)

  if (!pending) return null

  return (
    <RenameImpactModal
      open
      title={tr('Data Type Rename: Impact Analysis')}
      oldName={pending.oldName}
      newName={pending.newName}
      impact={pending.impact}
      affectedListLabel={tr('Affected locations:')}
      byKindLabel={tr('By reference kind:')}
      cancelLabel={tr('No, cancel rename')}
      cancelDescription={tr('The data type keeps its current name and nothing is changed')}
      onConfirm={() => respondToPendingRename(true)}
      onCancel={() => respondToPendingRename(false)}
    />
  )
}
