import { ComponentPropsWithoutRef } from 'react'

import { JwplcSimIcon } from '../../../../assets/icons/interface/JwplcSim'
import { ActivityBarButton } from '../../../_atoms/buttons/activity-bar'

export const JwplcSimButton = (props: ComponentPropsWithoutRef<typeof ActivityBarButton>) => (
  <ActivityBarButton aria-label='Simulate in JWPLC Sim' {...props}>
    <JwplcSimIcon />
  </ActivityBarButton>
)
