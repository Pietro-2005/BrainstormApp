import type { Note } from '../db/db'

/** Lowercase and strip accents so "perche" finds "perché". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export interface NoteFilter {
  query: string
  tag: string | null
  unsentOnly: boolean
}

export function filterNotes(notes: Note[], { query, tag, unsentOnly }: NoteFilter): Note[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  return notes.filter((note) => {
    if (tag && !note.tags.includes(tag)) return false
    if (unsentOnly && note.status === 'sent') return false
    if (terms.length === 0) return true
    const haystack = normalize(`${note.title}\n${note.text}\n${note.tags.join(' ')}`)
    return terms.every((t) => haystack.includes(t))
  })
}

export function allTags(notes: Note[]): string[] {
  const set = new Set<string>()
  for (const n of notes) for (const t of n.tags) set.add(t)
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** The part of the transcript around the first match, for the list preview. */
export function snippet(text: string, query: string, length = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const term = normalize(query).split(/\s+/).find(Boolean)
  if (!term) return flat.slice(0, length)
  // normalize() maps each precomposed letter to one letter (é → e), so indexes line up with the original.
  const at = normalize(flat).indexOf(term)
  if (at < 0 || flat.length <= length) return flat.slice(0, length)
  const start = Math.max(0, at - 40)
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + length)}`
}
