import { useSyncExternalStore } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { recorder } from '../lib/recorder'
import { Banner } from './Banner'

/** Offers a reload when a new version is downloaded; hidden while recording so nothing interrupts it. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) window.setInterval(() => void registration.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
  const { phase } = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot)
  if (!needRefresh || phase !== 'idle') return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-2xl px-4">
      <div className="shadow-lg">
        <Banner
          tone="info"
          message="A new version of Voice Notes is ready."
          onDismiss={() => setNeedRefresh(false)}
          action={
            <button type="button" className="font-semibold underline" onClick={() => void updateServiceWorker(true)}>
              Reload to update
            </button>
          }
        />
      </div>
    </div>
  )
}
