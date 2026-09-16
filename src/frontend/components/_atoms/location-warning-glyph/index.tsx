/**
 * Amber warning triangle shown in a variable's location cell.
 * Uses the native `title` attribute instead of Radix Tooltip to avoid
 * compose-refs loops when the table re-renders on store updates.
 */
function LocationWarningGlyph({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span
      tabIndex={0}
      aria-label={label}
      title={tooltip}
      className='pointer-events-auto inline-flex cursor-help items-center text-amber-500 focus:outline-none dark:text-amber-400'
    >
      <svg viewBox='0 0 16 16' fill='currentColor' className='h-3.5 w-3.5' aria-hidden='true'>
        <path d='M8 1.5 1 14h14L8 1.5Zm0 4.25 5.13 9.13H2.87L8 5.75Zm-.75 3v3h1.5v-3h-1.5Zm0 4v1.25h1.5V12.75h-1.5Z' />
      </svg>
    </span>
  )
}

export { LocationWarningGlyph }

