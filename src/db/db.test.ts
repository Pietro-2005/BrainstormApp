import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { VoiceNotesDB, newNote } from './db'

describe('database schema', () => {
  it('stores notes and reassembles audio chunks in order', async () => {
    const db = new VoiceNotesDB(`test-${Math.random()}`)
    const note = newNote({ mimeType: 'audio/webm', source: 'recording' })
    await db.notes.add(note)
    await db.audioChunks.bulkAdd([
      { noteId: note.id, seq: 1, data: new Blob(['b']) },
      { noteId: note.id, seq: 0, data: new Blob(['a']) },
      { noteId: 'other', seq: 0, data: new Blob(['x']) },
    ])
    const chunks = await db.audioChunks.where('[noteId+seq]').between([note.id, 0], [note.id, Infinity]).toArray()
    expect(await new Blob(chunks.map((c) => c.data)).text()).toBe('ab')
    expect((await db.notes.get(note.id))?.status).toBe('recording')
    db.close()
  })
})
