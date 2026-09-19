import { PanelBottom, PanelRight } from 'lucide-react'

import type { ConsoleDockPosition } from '../../../../hooks/use-console-dock-position'
import { cn } from '../../../../utils/cn'

type ConsoleDockToggleButtonProps = {
  dockPosition: ConsoleDockPosition
  onToggle: () => void
}

const ConsoleDockToggleButton = ({ dockPosition, onToggle }: ConsoleDockToggleButtonProps) => {
  const label = dockPosition === 'bottom' ? 'Dock to the right' : 'Dock to the bottom'
  const Icon = dockPosition === 'bottom' ? PanelRight : PanelBottom

  return (
    <button
      type='button'
      onClick={onToggle}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-850 dark:hover:bg-neutral-900',
      )}
    >
      <Icon className='h-3.5 w-3.5' />
    </button>
  )
}

export { ConsoleDockToggleButton }
