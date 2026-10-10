import type { Note } from '../db/db'
import { formatDateTime, formatDuration } from './format'

export const TEMPLATE_FIELDS = ['title', 'date', 'duration', 'tags', 'text'] as const

/** Fill a Markdown note template. Unknown {placeholders} are left as typed. */
export function renderNote(template: string, note: Pick<Note, 'title' | 'createdAt' | 'durationMs' | 'tags' | 'text'>): string {
  const values: Record<(typeof TEMPLATE_FIELDS)[number], string> = {
    title: note.title.trim() || 'Untitled note',
    date: formatDateTime(note.createdAt),
    duration: formatDuration(note.durationMs),
    tags: note.tags.map((t) => `#${t}`).join(' '),
    text: note.text.trim(),
  }
  return `${template
    .replace(/\{(title|date|duration|tags|text)\}/g, (_, key: keyof typeof values) => values[key])
    .replace(/[ \t]+$/gm, '')
    .trim()}\n`
}

/** "2026-10-11 Call the dentist.md", safe on every OS. */
export function noteFilename(note: Pick<Note, 'title' | 'createdAt'>, extension = 'md'): string {
  const date = formatDateTime(note.createdAt).slice(0, 10)
  const title = (note.title || 'Voice note')
    .replace(/…$/, '')
    .replace(/[\\/:*?"<>|#\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim()
  return `${date} ${title || 'Voice note'}.${extension}`
}

/** Tags are lowercase words; spaces become dashes and a leading # is dropped. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 40)
}
