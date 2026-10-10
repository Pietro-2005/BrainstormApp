import type { ReactNode } from 'react'

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{title}</h2>
      {description && <p className="px-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      <div className="divide-y divide-stone-200 rounded-xl bg-white shadow-sm ring-1 ring-stone-200/60 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
        {children}
      </div>
    </section>
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5 p-4">
      <div className="text-sm font-medium">{label}</div>
      {children}
      {hint && <div className="text-xs text-stone-500 dark:text-stone-400">{hint}</div>}
    </div>
  )
}

export const inputClass =
  'w-full rounded-lg bg-stone-100 px-3 py-2 text-base outline-none ring-1 ring-stone-200 focus:ring-2 focus:ring-accent dark:bg-stone-800 dark:ring-stone-700'

export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50'

export const primaryButton = `${buttonClass} bg-accent text-white hover:bg-accent-strong`
export const secondaryButton = `${buttonClass} bg-stone-200/80 text-stone-900 hover:bg-stone-300/80 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700`
export const dangerButton = `${buttonClass} bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-950`

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{hint}</div>}
      </div>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-stone-300 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4 dark:bg-stone-700"
      />
    </label>
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 ${className}`}>
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
    </div>
  )
}
