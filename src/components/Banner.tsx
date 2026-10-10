import type { ReactNode } from 'react'
import { Icon } from './Icon'

const tones = {
  error: 'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/60 dark:text-red-100 dark:ring-red-900',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-900',
  info: 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-100 dark:ring-sky-900',
  success: 'bg-green-50 text-green-900 ring-green-200 dark:bg-green-950/60 dark:text-green-100 dark:ring-green-900',
}

export function Banner({
  tone,
  message,
  onDismiss,
  action,
}: {
  tone: keyof typeof tones
  message: ReactNode
  onDismiss?: () => void
  action?: ReactNode
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl p-3 text-sm ring-1 ${tones[tone]}`}>
      <Icon name={tone === 'success' ? 'check' : 'alert'} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>{message}</div>
        {action}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 rounded p-1 opacity-70 hover:opacity-100">
          <Icon name="x" className="size-4" />
        </button>
      )}
    </div>
  )
}
