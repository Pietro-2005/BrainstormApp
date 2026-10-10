import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '../db/db'
import { Screen } from '../components/Layout'

export function NotesScreen() {
  const notes = useLiveQuery(() => db.notes.orderBy('createdAt').reverse().toArray())
  return (
    <Screen title="Notes">
      {notes?.length === 0 && (
        <p className="pt-16 text-center text-stone-500 dark:text-stone-400">No notes yet. Record one to get started.</p>
      )}
      <ul className="space-y-2">
        {notes?.map((note) => (
          <li key={note.id}>
            <Link to={`/notes/${note.id}`} className="block rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
              {note.title || 'Untitled note'}
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
