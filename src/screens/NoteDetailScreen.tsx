import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router'
import { db } from '../db/db'
import { Screen } from '../components/Layout'
import { AudioPlayer } from '../components/AudioPlayer'
import { StatusBadge } from '../components/StatusBadge'
import { Banner } from '../components/Banner'
import { ProgressBar, secondaryButton } from '../components/Form'
import { formatDateTime, formatDuration } from '../lib/format'
import { segmentsToText } from '../lib/transcript'
import { transcription, useTranscriptionState } from '../lib/transcription'

export function NoteDetailScreen() {
  const { id = '' } = useParams()
  const note = useLiveQuery(() => db.notes.get(id), [id])
  const engine = useTranscriptionState()
  if (note === undefined) return <Screen title="" back>{null}</Screen>

  const live = engine.live?.noteId === note.id ? segmentsToText(engine.live.segments) : ''
  const busy = note.status === 'queued' || note.status === 'transcribing'

  return (
    <Screen title={note.title || 'Untitled note'} back>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          <StatusBadge note={note} />
          <span>{formatDateTime(note.createdAt)}</span>
          <span>· {formatDuration(note.durationMs)}</span>
        </div>
        {note.error && (
          <Banner
            tone={note.status === 'failed' ? 'error' : 'warning'}
            message={note.error}
            action={
              !busy && (
                <button type="button" className={secondaryButton} onClick={() => void transcription.retry(note)}>
                  Retry transcription
                </button>
              )
            }
          />
        )}
        {note.hasAudio && <AudioPlayer noteId={note.id} durationMs={note.durationMs} />}
        {busy && (
          <div className="space-y-2">
            <ProgressBar value={note.progress} />
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {note.status === 'queued'
                ? 'Waiting to transcribe…'
                : engine.status === 'loading' && engine.download
                  ? `Loading the speech model… ${Math.round((engine.download.loaded / Math.max(1, engine.download.total)) * 100)}%`
                  : `Transcribing on this device… ${Math.round(note.progress * 100)}%. You can leave this screen.`}
            </p>
          </div>
        )}
        <p className="whitespace-pre-wrap leading-relaxed">{busy && live ? live : note.text}</p>
      </div>
    </Screen>
  )
}
