import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { Icon, type IconName } from './Icon'

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Record', icon: 'mic' },
  { to: '/notes', label: 'Notes', icon: 'list' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
]

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-stone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  isActive ? 'text-accent' : 'text-stone-500 dark:text-stone-400'
                }`
              }
            >
              <Icon name={tab.icon} className="size-6" />
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Screen({
  title,
  back,
  actions,
  children,
}: {
  title: ReactNode
  back?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <header className="mb-4 flex min-h-11 items-center gap-2">
        {back && (
          <button
            type="button"
            onClick={() => (history.length > 1 ? navigate(-1) : navigate('/notes'))}
            className="-ml-2 rounded-full p-2 text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label="Back"
          >
            <Icon name="back" className="size-6" />
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  )
}
