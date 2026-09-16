import { PropsWithChildren, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const TooltipSidebarWrapperButton = ({
  children,
  tooltipContent,
}: PropsWithChildren & { tooltipContent: string }) => {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 6,
        })
        setVisible(true)
      }
    }, 200)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className='flex w-full justify-center'
    >
      {children}
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: 'translateY(-50%)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
            className='box h-fit max-h-56 w-fit min-w-20 max-w-96 overflow-y-auto rounded-md border border-neutral-200 bg-white p-2 shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:text-white'
          >
            <div className='w-full text-center font-caption text-xs'>{tooltipContent}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}
