import { tr } from '@root/frontend/locales/tr'
import { trRich } from '@root/frontend/locales/tr-rich'

import { useOpenPLCStore } from '../../../store'
import { toast } from '../../_features/[app]/toast/use-toast'
import { RenameImpactModal } from '.'

/**
 * Store-driven host for the data type delete flow: `datatypeActions.deleteRequest`
 * parks a still-referenced type in `pendingDatatypeDelete`, this renders the
 * impact modal for it, and confirm/cancel go through `respondToPendingDelete`.
 * References are left in place on purpose — the modal is the warning.
 */
export const DataTypeDeleteImpactModal = () => {
  const pending = useOpenPLCStore((s) => s.pendingDatatypeDelete)
  const respondToPendingDelete = useOpenPLCStore((s) => s.datatypeActions.respondToPendingDelete)

  if (!pending) return null

  const { name, impact } = pending
  const count = impact.totalReferences

  const handleConfirm = () => {
    respondToPendingDelete(true)
    toast({
      title: tr('Data type deleted'),
      description:
        count === 1
          ? tr('"{{name}}" was deleted. 1 reference now points to a missing type.', { name })
          : tr('"{{name}}" was deleted. {{count}} references now point to a missing type.', { name, count }),
      variant: 'default',
    })
  }

  return (
    <RenameImpactModal
      open
      title={tr('Data Type Delete: Impact Analysis')}
      impact={impact}
      description={
        <>
          {trRich('Deleting {{name}} will leave these references without a type:', {
            name: <span className='font-semibold'>{name}</span>,
          })}
        </>
      }
      affectedListLabel={tr('Affected locations:')}
      byKindLabel={tr('By reference kind:')}
      confirmLabel={tr('Yes, delete anyway')}
      confirmDescription={tr('The data type is removed and the listed references keep its name until you retype them')}
      cancelLabel={tr('No, keep data type')}
      cancelDescription={tr('Nothing is changed')}
      onConfirm={handleConfirm}
      onCancel={() => respondToPendingDelete(false)}
    />
  )
}
