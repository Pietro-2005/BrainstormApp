import { useEffect } from 'react'
import { Link } from 'react-router'
import type { Note } from '../db/db'
import type { Settings } from '../db/settings'
import { currentToken, loadGoogleIdentity } from '../lib/google'
import { sendQueue, useSendState } from '../lib/send'
import { copyText, downloadBlob } from '../lib/files'
import { noteFilename, renderNote } from '../lib/template'
import { showToast } from '../lib/toast'
import { PROJECT_URL_RE, connectGoogle, useGoogleConnection } from './SendSettings'
import { Icon } from './Icon'
import { primaryButton, secondaryButton } from './Form'

/** Send, Copy & open, Share, Copy, Download for one note (with the user's latest edits). */
export function SendActions({ note, settings, disabled }: { note: Note; settings: Settings; disabled: boolean }) {
  const send = useSendState()
  useGoogleConnection() // re-render when the token changes
  const hasGoogle = settings.googleClientId.trim().length > 0
  const projectUrl = PROJECT_URL_RE.test(settings.projectUrl) ? settings.projectUrl : ''
  const canShare = typeof navigator.share === 'function'
  const markdown = () => renderNote(settings.template, note)

  useEffect(() => {
    if (hasGoogle) loadGoogleIdentity().catch(() => {})
  }, [hasGoogle])

  const onSend = async () => {
    // Offline: queue now, it goes out when the connection is back.
    if (!currentToken() && navigator.onLine && !(await connectGoogle(settings.googleClientId))) return
    await sendQueue.enqueue(note.id)
  }

  const onCopyAndOpen = () => {
    // Start the copy and open the tab in the same tap; Safari blocks window.open after an await.
    const copied = copyText(markdown())
    window.open(projectUrl, '_blank', 'noopener')
    copied.then(
      () => showToast({ tone: 'success', message: 'Copied. Paste it into a new chat in your project.' }),
      (err) => showToast({ tone: 'error', message: (err as Error).message }),
    )
  }

  const onShare = async () => {
    try {
      await navigator.share({ title: note.title || 'Voice note', text: markdown() })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showToast({ tone: 'error', message: (err as Error).message })
    }
  }

  const onCopy = async () => {
    try {
      await copyText(markdown())
      showToast({ tone: 'success', message: 'Copied as Markdown.' })
    } catch (err) {
      showToast({ tone: 'error', message: (err as Error).message })
    }
  }

  const onDownload = () => downloadBlob(new Blob([markdown()], { type: 'text/markdown;charset=utf-8' }), noteFilename(note))

  return (
    <div className="space-y-2">
      {hasGoogle ? (
        note.sendPending ? (
          <div className="flex items-center gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950/60 dark:text-sky-100">
            <Icon name="send" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {send.offline
                ? 'Queued. It will send when you are back online.'
                : send.needsAuth
                  ? 'Queued. Connect Google to finish sending.'
                  : 'Sending to your inbox doc…'}
            </span>
            {send.needsAuth && !send.offline ? (
              <button type="button" className="font-semibold underline" onClick={() => void connectGoogle(settings.googleClientId)}>
                Connect
              </button>
            ) : (
              <button type="button" className="underline" onClick={() => void sendQueue.cancel(note.id)}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <button type="button" className={`${primaryButton} w-full py-3 text-base`} disabled={disabled} onClick={() => void onSend()}>
            <Icon name="send" className="size-5" />
            {note.status === 'sent' ? 'Send again to inbox doc' : 'Send to inbox doc'}
          </button>
        )
      ) : (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Set up the Google Doc inbox in{' '}
          <Link to="/settings" className="text-accent underline">
            Settings
          </Link>{' '}
          to send notes to your Claude project automatically.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {projectUrl ? (
          <button type="button" className={secondaryButton} disabled={disabled} onClick={onCopyAndOpen}>
            <Icon name="external" className="size-4" /> Copy &amp; open project
          </button>
        ) : (
          <button type="button" className={secondaryButton} disabled={disabled} onClick={() => void onCopy()}>
            <Icon name="copy" className="size-4" /> Copy
          </button>
        )}
        {canShare ? (
          <button type="button" className={secondaryButton} disabled={disabled} onClick={() => void onShare()}>
            <Icon name="share" className="size-4" /> Share
          </button>
        ) : projectUrl ? (
          <button type="button" className={secondaryButton} disabled={disabled} onClick={() => void onCopy()}>
            <Icon name="copy" className="size-4" /> Copy
          </button>
        ) : null}
        <button type="button" className={`${secondaryButton} ${canShare || projectUrl ? 'col-span-2' : ''}`} disabled={disabled} onClick={onDownload}>
          <Icon name="download" className="size-4" /> Download .md
        </button>
      </div>
    </div>
  )
}
