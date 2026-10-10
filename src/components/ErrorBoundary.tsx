import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const storage = /IndexedDB|DatabaseClosed|OpenFailed|QuotaExceeded|InvalidState/i.test(`${error.name} ${error.message}`)
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 pt-16">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-stone-600 dark:text-stone-300">
          {storage
            ? 'The app could not open its on-device storage. Private browsing modes and full disks can cause this. Your saved notes are not deleted.'
            : 'An unexpected error stopped this screen. Your notes and recordings are saved on this device.'}
        </p>
        <pre className="overflow-auto rounded-lg bg-stone-100 p-3 text-xs dark:bg-stone-900">{error.message}</pre>
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong"
        >
          Reload
        </button>
      </div>
    )
  }
}
