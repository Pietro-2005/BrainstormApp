import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { db, deleteNote, deleteNoteAudio, getNoteAudio, type ModelSize, type Note, type Segment } from '../db/db'
import { useSettings } from '../db/settings'
import { Screen } from '../components/Layout'
import { AudioPlayer, type AudioPlayerHandle } from '../components/AudioPlayer'
import { StatusBadge } from '../components/StatusBadge'
import { Banner } from '../components/Banner'
import { Icon } from '../components/Icon'
import { TagEditor } from '../components/TagEditor'
import { AutoTextarea, TranscriptEditor } from '../components/TranscriptEditor'
import { ProgressBar, dangerButton, inputClass, secondaryButton } from '../components/Form'
import { fileExtensionForMime, formatDateTime, formatDuration } from '../lib/format'
import { segmentsToText } from '../lib/transcript'
import { transcription, useTranscriptionState } from '../lib/transcription'
import { useAutosave } from '../lib/useAutosave'
import { noteFilename } from '../lib/template'
import { downloadBlob } from '../lib/files'
import { SendActions } from '../components/SendActions'
import { sendQueue, usesAppsScript } from '../lib/send'
import { languageName } from '../lib/languages'
import { allTags } from '../lib/search'
import { showToast } from '../lib/toast'

export function NoteDetailScreen() {
  const { id = '' } = useParams()
  const note = useLiveQuery(async () => (await db.notes.get(id)) ?? null, [id], 'loading' as const)
  if (note === 'loading') return <Screen title="" back>{null}</Screen>
  if (note === null)
    return (
      <Screen title="Note not found" back>
        <p className="text-stone-500 dark:text-stone-400">This note was deleted.</p>
      </Screen>
    )
  // Remount the editor when a (re)transcription lands, so it starts from the new text.
  return <NoteEditor key={`${note.id}:${note.transcribedAt ?? 0}`} note={note} />
}

function NoteEditor({ note }: { note: Note }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const engine = useTranscriptionState()
  const everyNote = useLiveQuery(() => db.notes.toArray(), [])
  const tagSuggestions = useMemo(() => allTags(everyNote ?? []), [everyNote])
  const { save, flush, state: saveState } = useAutosave(note.id)
  const player = useRef<AudioPlayerHandle>(null)

  const [title, setTitle] = useState(note.title)
  const [segments, setSegments] = useState<Segment[]>(note.segments)
  const [text, setText] = useState(note.text)
  const [tags, setTags] = useState(note.tags)
  const [currentTime, setCurrentTime] = useState<number | null>(null)
  const [retryModel, setRetryModel] = useState<ModelSize>(note.model === 'whisper-base' ? 'small' : 'base')

  const busy = note.status === 'queued' || note.status === 'transcribing' || note.status === 'recording'
  const live = engine.live?.noteId === note.id ? engine.live.segments : null
  const currentText = segments.length ? segmentsToText(segments) : text
  const exportable = { ...note, title, tags, text: currentText }

  const onTitle = (value: string) => {
    setTitle(value)
    save({ title: value, titleEdited: value.trim().length > 0 })
  }
  const onSegments = (next: Segment[]) => {
    setSegments(next)
    save({ segments: next, text: segmentsToText(next) })
  }
  const onTags = (next: string[]) => {
    setTags(next)
    save({ tags: next })
  }
  const onText = (value: string) => {
    setText(value)
    save({ text: value })
  }

  const onDownloadAudio = async () => {
    const blob = await getNoteAudio(note.id)
    if (blob) downloadBlob(blob, noteFilename(exportable, fileExtensionForMime(blob.type)))
  }
  const onRetry = async () => {
    if (currentText.trim() && !confirm(`Transcribe again with whisper-${retryModel}? The new text replaces the current one (including your edits) once it finishes.`))
      return
    flush()
    await transcription.retry({ ...note, text: currentText }, retryModel)
  }
  const onDeleteAudio = async () => {
    if (!confirm('Delete the audio for this note? The transcript stays.')) return
    await deleteNoteAudio(note.id)
    showToast({ tone: 'success', message: 'Audio deleted.' })
  }
  const onDeleteNote = async () => {
    const inDoc = !!note.sentAt && !!settings && usesAppsScript(settings)
    const question = inDoc
      ? 'Delete this note and its audio? It will also be removed from your Google Doc inbox. This cannot be undone.'
      : 'Delete this note and its audio? This cannot be undone.'
    if (!confirm(question)) return
    await deleteNote(note.id)
    if (inDoc) void sendQueue.enqueueDelete(note.id, note.sentDocId)
    navigate('/notes', { replace: true })
  }

  return (
    <Screen
      title={
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={busy ? 'Title appears after transcription' : 'Untitled note'}
          aria-label="Title"
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-stone-400"
        />
      }
      back
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500 dark:text-stone-400">
          <StatusBadge note={note} />
          <span>{formatDateTime(note.createdAt)}</span>
          <span>· {formatDuration(note.durationMs)}</span>
          {note.language && <span>· {languageName(note.language)}</span>}
          {note.sentAt && <span>· Sent {formatDateTime(note.sentAt)}</span>}
          <span className="ml-auto text-xs" aria-live="polite">
            {saveState === 'pending' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
          </span>
        </div>

        {note.error && (
          <Banner
            tone={note.status === 'failed' ? 'error' : 'warning'}
            message={note.error}
            action={
              note.status === 'failed' &&
              note.hasAudio && (
                <button type="button" className={secondaryButton} onClick={() => void transcription.retry(note)}>
                  <Icon name="refresh" className="size-4" /> Retry transcription
                </button>
              )
            }
          />
        )}

        {note.hasAudio && (
          <AudioPlayer ref={player} noteId={note.id} durationMs={note.durationMs} onTime={setCurrentTime} />
        )}

        <TagEditor tags={tags} suggestions={tagSuggestions} onChange={onTags} />

        {busy && (
          <div className="space-y-2">
            <ProgressBar value={note.progress} />
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {note.status === 'recording'
                ? 'Still recording…'
                : note.status === 'queued'
                  ? 'Waiting to transcribe…'
                  : engine.status === 'loading' && engine.download
                    ? `Loading the speech model… ${Math.round((engine.download.loaded / Math.max(1, engine.download.total)) * 100)}%`
                    : `Transcribing on this device… ${Math.round(note.progress * 100)}%. You can leave this screen.`}
            </p>
          </div>
        )}

        <section aria-label="Transcript">
          {busy && live && !note.statusBeforeRetry ? (
            <p className="leading-relaxed whitespace-pre-wrap text-stone-500 dark:text-stone-400">{segmentsToText(live)}</p>
          ) : segments.length > 0 ? (
            <TranscriptEditor
              segments={segments}
              currentTime={currentTime}
              canSeek={note.hasAudio}
              readOnly={busy}
              onSeek={(t) => player.current?.seek(t)}
              onChange={onSegments}
            />
          ) : (
            !busy && (
              <AutoTextarea
                value={text}
                onChange={(e) => onText(e.target.value)}
                placeholder="No transcript. Type a note here."
                className={`${inputClass} min-h-24 resize-none leading-relaxed`}
              />
            )
          )}
        </section>

        {settings && <SendActions note={exportable} settings={settings} disabled={busy} />}

        <details className="group rounded-xl bg-white shadow-sm ring-1 ring-stone-200/60 dark:bg-stone-900 dark:ring-stone-800">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-medium">
            More actions
            <Icon name="back" className="size-4 -rotate-90 transition group-open:rotate-90" />
          </summary>
          <div className="space-y-4 border-t border-stone-200 p-4 dark:border-stone-800">
            <div className="space-y-2">
              <div className="text-sm font-medium">Retry transcription</div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {note.model ? `Transcribed with ${note.model}. ` : ''}The current text stays until the new transcript succeeds.
              </p>
              <div className="flex gap-2">
                <select
                  className={`${inputClass} flex-1`}
                  value={retryModel}
                  onChange={(e) => setRetryModel(e.target.value as ModelSize)}
                  aria-label="Model for retry"
                >
                  <option value="base">whisper-base (faster)</option>
                  <option value="small">whisper-small (more accurate)</option>
                </select>
                <button type="button" onClick={() => void onRetry()} disabled={busy || !note.hasAudio} className={secondaryButton}>
                  <Icon name="refresh" className="size-4" /> Retry
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {note.hasAudio && (
                <>
                  <button type="button" onClick={() => void onDownloadAudio()} className={secondaryButton}>
                    <Icon name="download" className="size-4" /> Download audio
                  </button>
                  <button type="button" onClick={() => void onDeleteAudio()} disabled={busy} className={dangerButton}>
                    <Icon name="trash" className="size-4" /> Delete audio
                  </button>
                </>
              )}
              <button type="button" onClick={() => void onDeleteNote()} disabled={note.status === 'recording'} className={dangerButton}>
                <Icon name="trash" className="size-4" /> Delete note
              </button>
            </div>
          </div>
        </details>
      </div>
    </Screen>
  )
}
