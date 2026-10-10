import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '../db/db'
import { Screen } from '../components/Layout'
import { Icon } from '../components/Icon'
import { StatusBadge } from '../components/StatusBadge'
import { allTags, filterNotes, snippet } from '../lib/search'
import { formatDuration, formatRelativeDate } from '../lib/format'
import { importAudioFile } from '../lib/recorder'
import { showToast } from '../lib/toast'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
        active
          ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
          : 'bg-stone-200/70 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
      }`}
    >
      {children}
    </button>
  )
}

export function NotesScreen() {
  const notes = useLiveQuery(() => db.notes.orderBy('createdAt').reverse().toArray())
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [unsentOnly, setUnsentOnly] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)

  const tags = useMemo(() => allTags(notes ?? []), [notes])
  const visible = useMemo(
    () => filterNotes(notes ?? [], { query: deferredQuery, tag, unsentOnly }),
    [notes, deferredQuery, tag, unsentOnly],
  )

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    let ok = 0
    for (const file of Array.from(files)) {
      try {
        await importAudioFile(file)
        ok++
      } catch (err) {
        showToast({ tone: 'error', message: `Could not import ${file.name}: ${(err as Error).message}` })
      }
    }
    setImporting(false)
    if (fileInput.current) fileInput.current.value = ''
    if (ok) showToast({ tone: 'success', message: `Imported ${ok} file${ok > 1 ? 's' : ''}. Transcription is queued.` })
  }

  return (
    <Screen
      title="Notes"
      actions={
        <>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.opus,.aac,.flac"
            multiple
            hidden
            onChange={(e) => void onImport(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-full bg-stone-200/70 px-3 py-1.5 text-sm font-medium hover:bg-stone-300/70 disabled:opacity-60 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            <Icon name="upload" className="size-4" />
            {importing ? 'Importing…' : 'Import audio'}
          </button>
        </>
      }
    >
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-stone-50/95 px-4 pb-3 backdrop-blur dark:bg-stone-950/95">
        <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-accent dark:bg-stone-900 dark:ring-stone-800">
          <Icon name="search" className="size-4 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcripts"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-400"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <Chip active={!unsentOnly && !tag} onClick={() => (setUnsentOnly(false), setTag(null))}>
            All
          </Chip>
          <Chip active={unsentOnly} onClick={() => setUnsentOnly((v) => !v)}>
            Not sent
          </Chip>
          {tags.map((t) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </Chip>
          ))}
        </div>
      </div>

      {notes?.length === 0 && (
        <div className="flex flex-col items-center gap-3 pt-16 text-center text-stone-500 dark:text-stone-400">
          <Icon name="mic" className="size-10 text-stone-300 dark:text-stone-600" />
          <p>No notes yet.</p>
          <p className="text-sm">
            <Link to="/" className="font-medium text-accent">
              Record one
            </Link>{' '}
            or import an audio file.
          </p>
        </div>
      )}
      {notes && notes.length > 0 && visible.length === 0 && (
        <p className="pt-12 text-center text-stone-500 dark:text-stone-400">No notes match.</p>
      )}

      <ul className="space-y-2">
        {visible.map((note) => (
          <li key={note.id}>
            <Link
              to={`/notes/${note.id}`}
              className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200/60 transition active:scale-[0.99] dark:bg-stone-900 dark:ring-stone-800"
            >
              <div className="flex items-start gap-2">
                <h2 className="min-w-0 flex-1 truncate font-medium">{note.title || 'Untitled note'}</h2>
                <StatusBadge note={note} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-500 dark:text-stone-400">
                <span>{formatRelativeDate(note.createdAt)}</span>
                {note.durationMs > 0 && <span>· {formatDuration(note.durationMs)}</span>}
                {note.recovered && <span className="text-amber-700 dark:text-amber-400">· Recovered</span>}
                {note.source === 'import' && <span>· Imported</span>}
              </div>
              {note.text && (
                <p className="mt-2 line-clamp-2 text-sm text-stone-600 dark:text-stone-300">{snippet(note.text, deferredQuery)}</p>
              )}
              {note.status === 'transcribing' && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                  <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${Math.round(note.progress * 100)}%` }} />
                </div>
              )}
              {note.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {note.tags.map((t) => (
                    <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
