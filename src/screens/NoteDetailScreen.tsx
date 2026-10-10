import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router'
import { db } from '../db/db'
import { Screen } from '../components/Layout'

export function NoteDetailScreen() {
  const { id = '' } = useParams()
  const note = useLiveQuery(() => db.notes.get(id), [id])
  return (
    <Screen title={note?.title || 'Note'} back>
      <p className="whitespace-pre-wrap">{note?.text}</p>
    </Screen>
  )
}
