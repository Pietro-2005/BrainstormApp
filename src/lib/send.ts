import { useSyncExternalStore } from 'react'
import { db, updateNote, type Note } from '../db/db'
import { getSettings, saveSettings, type Settings } from '../db/settings'
import { renderNote } from './template'
import { GoogleApiError, appendToDoc, clearToken, createDoc, currentToken, onTokenChange } from './google'
import { showToast } from './toast'

const MAX_ATTEMPTS = 3
const RETRY_MS = 30_000

/** "Voice Notes Inbox", or "Voice Notes Inbox 2026-10" with monthly docs on. */
export function inboxTitle(settings: Pick<Settings, 'inboxName' | 'monthlyInbox'>, now = new Date()): string {
  const base = settings.inboxName.trim() || 'Voice Notes Inbox'
  if (!settings.monthlyInbox) return base
  return `${base} ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** What gets appended to the doc for one note: the template plus a separator line. */
export function inboxEntry(template: string, note: Pick<Note, 'title' | 'createdAt' | 'durationMs' | 'tags' | 'text'>): string {
  return `${renderNote(template, note)}\n---\n\n`
}

export function inboxIntro(title: string): string {
  return `${title}\n\nVoice notes transcribed on-device by the Voice Notes app and appended here automatically. Notes are separated by a line with three dashes; the newest is at the bottom.\n\n---\n\n`
}

export interface SendState {
  sending: boolean
  /** Queued notes are waiting for the user to tap Connect (no valid Google token). */
  needsAuth: boolean
  /** Queued notes are waiting for a connection. */
  offline: boolean
  error: string | null
}

class SendQueue {
  private state: SendState = { sending: false, needsAuth: false, offline: false, error: null }
  private listeners = new Set<() => void>()
  private flushing = false
  private again = false
  private retryTimer = 0
  private started = false

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }
  getSnapshot = () => this.state
  private set(patch: Partial<SendState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  start() {
    if (this.started) return
    this.started = true
    window.addEventListener('online', () => void this.flush())
    onTokenChange(() => {
      if (currentToken()) void this.flush()
    })
    void this.flush()
  }

  /** Queue a note for the Google Doc inbox and try to send right away. */
  async enqueue(noteId: string) {
    await db.transaction('rw', db.sendQueue, db.notes, async () => {
      if ((await db.sendQueue.where('noteId').equals(noteId).count()) === 0)
        await db.sendQueue.add({ noteId, createdAt: Date.now(), attempts: 0 })
      await updateNote(noteId, { sendPending: true })
    })
    await this.flush()
  }

  async cancel(noteId: string) {
    await db.transaction('rw', db.sendQueue, db.notes, async () => {
      await db.sendQueue.where('noteId').equals(noteId).delete()
      await updateNote(noteId, { sendPending: false })
    })
    void this.flush()
  }

  /** Send queued notes in order. Stops (and waits) when offline or when sign-in is needed. */
  async flush() {
    if (this.flushing) {
      this.again = true
      return
    }
    this.flushing = true
    this.again = false
    window.clearTimeout(this.retryTimer)
    try {
      for (;;) {
        const item = await db.sendQueue.orderBy('createdAt').first()
        if (!item) {
          this.set({ needsAuth: false, offline: false, sending: false, error: null })
          break
        }
        if (!navigator.onLine) {
          this.set({ offline: true, sending: false })
          break
        }
        const token = currentToken()
        if (!token) {
          this.set({ needsAuth: true, offline: false, sending: false })
          break
        }
        const note = await db.notes.get(item.noteId)
        if (!note) {
          await db.sendQueue.delete(item.id!)
          continue
        }
        this.set({ sending: true, needsAuth: false, offline: false })
        try {
          const settings = await getSettings()
          const docId = await this.ensureDoc(token, settings)
          await appendToDoc(token, docId, inboxEntry(settings.template, note))
          await db.transaction('rw', db.sendQueue, db.notes, async () => {
            await db.sendQueue.delete(item.id!)
            await updateNote(note.id, { status: 'sent', sentAt: Date.now(), sendPending: false })
          })
          this.set({ error: null })
        } catch (err) {
          if (err instanceof GoogleApiError && err.status === 401) {
            clearToken()
            this.set({ needsAuth: true, sending: false })
            break
          }
          if (!(err instanceof GoogleApiError)) {
            // fetch() failed: flaky network. Try again shortly without counting it against the note.
            this.set({ offline: !navigator.onLine, sending: false, error: 'Network error while sending; retrying.' })
            this.retryTimer = window.setTimeout(() => void this.flush(), RETRY_MS)
            break
          }
          if (err.status === 404) {
            // The inbox doc was deleted (or isn't visible to this app any more): make a new one.
            const settings = await getSettings()
            const docs = { ...settings.inboxDocs }
            delete docs[inboxTitle(settings)]
            await saveSettings({ inboxDocs: docs })
          }
          const attempts = item.attempts + 1
          if (attempts >= MAX_ATTEMPTS) {
            await db.transaction('rw', db.sendQueue, db.notes, async () => {
              await db.sendQueue.delete(item.id!)
              await updateNote(note.id, { sendPending: false })
            })
            showToast({ tone: 'error', message: `Could not send “${note.title || 'note'}” to Google Docs: ${friendlyError(err)}` })
            continue
          }
          await db.sendQueue.update(item.id!, { attempts, lastError: err.message })
          this.set({ error: friendlyError(err), sending: false })
          if (err.status === 404) continue
          this.retryTimer = window.setTimeout(() => void this.flush(), RETRY_MS)
          break
        }
      }
    } finally {
      this.flushing = false
      if (this.again) void this.flush()
      else if (this.state.sending) this.set({ sending: false })
    }
  }

  private async ensureDoc(token: string, settings: Settings): Promise<string> {
    const title = inboxTitle(settings)
    const existing = settings.inboxDocs[title]
    if (existing) return existing
    const id = await createDoc(token, title, inboxIntro(title))
    await saveSettings({ inboxDocs: { ...(await getSettings()).inboxDocs, [title]: id } })
    showToast(
      {
        tone: 'info',
        message: `Created “${title}” in your Google Drive. Add it to your Claude project once: Project → Files → + → Google Drive.`,
      },
      12_000,
    )
    return id
  }
}

export function friendlyError(err: GoogleApiError): string {
  if (err.status === 403)
    return /has not been used|disabled|accessNotConfigured/i.test(err.message)
      ? 'the Google Docs API is not enabled in your Google Cloud project.'
      : `access denied (${err.message})`
  if (err.status === 404) return 'the inbox doc no longer exists; a new one will be created.'
  return err.message
}

export const sendQueue = new SendQueue()

export function useSendState() {
  return useSyncExternalStore(sendQueue.subscribe, sendQueue.getSnapshot)
}
