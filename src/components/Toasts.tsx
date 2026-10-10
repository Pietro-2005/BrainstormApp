import { Link } from 'react-router'
import { dismissToast, useToasts } from '../lib/toast'
import { Banner } from './Banner'

export function Toasts() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto max-w-2xl space-y-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto shadow-lg">
          <Banner
            tone={t.tone}
            message={t.message}
            onDismiss={() => dismissToast(t.id)}
            action={
              t.link && (
                <Link to={t.link.to} onClick={() => dismissToast(t.id)} className="font-semibold underline">
                  {t.link.label}
                </Link>
              )
            }
          />
        </div>
      ))}
    </div>
  )
}
