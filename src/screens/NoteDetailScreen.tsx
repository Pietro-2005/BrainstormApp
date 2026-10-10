import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router'
import { db } from '../db/db'
import { Screen } from '../components/Layout'
import { AudioPlayer } from '../components/AudioPlayer'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, formatDuration } from '../lib/format'

export function NoteDetailScreen() {
  const { id = '' } = useParams()
  const note = useLiveQuery(() => db.notes.get(id), [id])
  if (note === undefined) return <Screen title="" back>{null}</Screen>
  return (
    <Screen title={note.title || 'Untitled note'} back>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          <StatusBadge note={note} />
          <span>{formatDateTime(note.createdAt)}</span>
          <span>· {formatDuration(note.durationMs)}</span>
        </div>
        {note.hasAudio && <AudioPlayer noteId={note.id} durationMs={note.durationMs} />}
        <p className="whitespace-pre-wrap">{note.text}</p>
      </div>
    </Screen>
  )
}
