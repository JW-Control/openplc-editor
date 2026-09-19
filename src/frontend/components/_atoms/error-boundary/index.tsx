import { Component, ErrorInfo, ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

/**
 * Catches render-time crashes in the wrapped subtree (e.g. the recurring
 * "Maximum update depth exceeded" documented in UPDATE.md) so they surface as
 * a recoverable screen instead of a frozen/blank renderer window. Class
 * component because React only supports error boundaries via
 * componentDidCatch/getDerivedStateFromError — there is no hook equivalent.
 *
 * Deliberately mounted OUTSIDE the boundary in app-layout.tsx: Toaster, the
 * modal stack and AcceleratorHandler, so they keep working (and any
 * keyboard-shortcut save flow stays reachable) even if the workspace content
 * itself crashed. Zustand state lives outside React, so the project data
 * itself survives this boundary catching a crash — only the crashed
 * component tree needs to remount.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render crash:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className='flex h-full w-full flex-col items-center justify-center gap-4 bg-neutral-50 p-8 text-center dark:bg-neutral-950'>
        <p className='font-display text-lg font-medium text-neutral-950 dark:text-white'>
          Something went wrong rendering the workspace
        </p>
        <p className='max-w-md text-sm text-neutral-600 dark:text-neutral-400'>
          Your project data is safe — this only affects the current view. Reload to recover.
        </p>
        <pre className='max-h-32 max-w-lg overflow-auto rounded-md bg-neutral-100 p-3 text-left text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'>
          {error.message}
        </pre>
        <button
          type='button'
          onClick={this.handleReload}
          className='rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-medium-dark'
        >
          Reload
        </button>
      </div>
    )
  }
}

export { ErrorBoundary }
