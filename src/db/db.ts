import Dexie, { type EntityTable } from 'dexie'

export type NoteStatus = 'recording' | 'queued' | 'transcribing' | 'ready' | 'sent' | 'failed'

export type ModelSize = 'base' | 'small'

/** One timestamped line of transcript, in seconds from the start of the audio. */
export interface Segment {
  start: number
  end: number
  text: string
}

export interface Note {
  id: string
  createdAt: number
  updatedAt: number
  title: string
  /** True once the user typed a title, so transcription stops overwriting it. */
  titleEdited: boolean
  text: string
  segments: Segment[]
  tags: string[]
  status: NoteStatus
  /** 0..1 while transcribing. */
  progress: number
  error?: string
  durationMs: number
  mimeType: string
  source: 'recording' | 'import'
  hasAudio: boolean
  /** Set when an unfinished recording was rescued after the app closed. */
  recovered?: boolean
  /** Model requested for the next transcription; falls back to Settings. */
  requestedModel?: ModelSize
  /** Status to return to if a re-transcription fails, so old text stays usable. */
  statusBeforeRetry?: NoteStatus
  transcribeAttempts: number
  model?: string
  language?: string
  sentAt?: number
  /** True while a Google Doc send is queued for this note. */
  sendPending?: boolean
}

/** Audio is stored as the recorder's 1-second chunks so nothing is lost if the tab dies. */
export interface AudioChunk {
  id?: number
  noteId: string
  seq: number
  data: Blob
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface SendQueueItem {
  id?: number
  noteId: string
  createdAt: number
  attempts: number
  lastError?: string
}

export class VoiceNotesDB extends Dexie {
  notes!: EntityTable<Note, 'id'>
  audioChunks!: EntityTable<AudioChunk, 'id'>
  settings!: EntityTable<SettingRow, 'key'>
  sendQueue!: EntityTable<SendQueueItem, 'id'>

  constructor(name = 'voice-notes') {
    super(name)
    this.version(1).stores({
      notes: 'id, createdAt, status, *tags',
      audioChunks: '++id, noteId, [noteId+seq]',
      settings: 'key',
      sendQueue: '++id, noteId, createdAt',
    })
  }
}

export const db = new VoiceNotesDB()

export function newNote(fields: Partial<Note> & Pick<Note, 'mimeType' | 'source'>): Note {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    title: '',
    titleEdited: false,
    text: '',
    segments: [],
    tags: [],
    status: 'recording',
    progress: 0,
    durationMs: 0,
    hasAudio: true,
    transcribeAttempts: 0,
    ...fields,
  }
}

export async function updateNote(id: string, changes: Partial<Note>) {
  await db.notes.update(id, { ...changes, updatedAt: Date.now() })
}

/** Reassemble a note's audio from its chunks, in recording order. */
export async function getNoteAudio(noteId: string): Promise<Blob | null> {
  const chunks = await db.audioChunks.where('[noteId+seq]').between([noteId, Dexie.minKey], [noteId, Dexie.maxKey]).toArray()
  if (chunks.length === 0) return null
  const note = await db.notes.get(noteId)
  return new Blob(
    chunks.map((c) => c.data),
    { type: note?.mimeType || chunks[0].data.type },
  )
}

export async function deleteNoteAudio(noteId: string) {
  await db.transaction('rw', db.audioChunks, db.notes, async () => {
    await db.audioChunks.where('noteId').equals(noteId).delete()
    await updateNote(noteId, { hasAudio: false })
  })
}

export async function deleteNote(noteId: string) {
  await db.transaction('rw', db.audioChunks, db.notes, db.sendQueue, async () => {
    await db.audioChunks.where('noteId').equals(noteId).delete()
    await db.sendQueue.where('noteId').equals(noteId).delete()
    await db.notes.delete(noteId)
  })
}
