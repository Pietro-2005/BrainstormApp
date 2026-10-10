import { useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// Chrome fires this once, early; keep it so Settings can offer an Install button later.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  emit()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  emit()
})

export function useInstallPrompt() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => deferred,
  )
}

export async function promptInstall() {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice
  deferred = null
  emit()
}
