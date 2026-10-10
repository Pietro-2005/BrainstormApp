import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  tone: 'info' | 'success' | 'warning' | 'error'
  message: string
  link?: { to: string; label: string }
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function showToast(toast: Omit<Toast, 'id'>, durationMs = toast.tone === 'error' ? 8000 : 4000) {
  const id = nextId++
  toasts = [...toasts, { ...toast, id }]
  emit()
  if (durationMs > 0) window.setTimeout(() => dismissToast(id), durationMs)
  return id
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
