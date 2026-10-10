import { useCallback, useEffect, useRef, useState } from 'react'
import { updateNote, type Note } from '../db/db'

/**
 * Debounced saving of note edits. Pending changes are flushed when the user stops typing,
 * leaves the screen, or the page is hidden (so closing the app mid-edit keeps the edit).
 */
export function useAutosave(noteId: string, delayMs = 500) {
  const pending = useRef<Partial<Note>>({})
  const timer = useRef(0)
  const [state, setState] = useState<'idle' | 'pending' | 'saved'>('idle')

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const changes = pending.current
    if (Object.keys(changes).length === 0) return
    pending.current = {}
    void updateNote(noteId, changes).then(() => setState('saved'))
  }, [noteId])

  const save = useCallback(
    (changes: Partial<Note>) => {
      pending.current = { ...pending.current, ...changes }
      setState('pending')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, delayMs)
    },
    [flush, delayMs],
  )

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  return { save, flush, state }
}
