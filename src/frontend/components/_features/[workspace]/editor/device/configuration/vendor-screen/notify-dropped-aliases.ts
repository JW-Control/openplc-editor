import { toast } from '@root/frontend/components/_features/[app]/toast/use-toast'
import { tr } from '@root/frontend/locales/tr'
import type { DroppedAlias } from '@root/frontend/utils/vpp/allocate-module-slots'

function notifyDroppedAliases(dropped: DroppedAlias[]) {
  if (dropped.length === 0) return
  toast({
    title: tr('Aliases removed'),
    description: tr('The channels of {{value}} no longer exist, so their aliases were removed.', {
      value: dropped.map((d) => d.alias).join(', '),
    }),
    variant: 'warn',
  })
}

export { notifyDroppedAliases }
