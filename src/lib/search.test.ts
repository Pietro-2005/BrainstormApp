import { describe, expect, it } from 'vitest'
import { newNote, type Note } from '../db/db'
import { allTags, filterNotes, snippet } from './search'

const note = (fields: Partial<Note>) => ({ ...newNote({ mimeType: 'audio/webm', source: 'recording' }), ...fields })

describe('filterNotes', () => {
  const notes = [
    note({ title: 'Groceries', text: 'Buy oat milk and bread', tags: ['home'], status: 'ready' }),
    note({ title: 'Idea', text: 'Perché non proviamo il nuovo layout?', tags: ['work'], status: 'sent' }),
    note({ title: 'Call', text: 'Call the dentist', tags: [], status: 'ready' }),
  ]

  it('finds a word anywhere in any transcript, ignoring case and accents', () => {
    expect(filterNotes(notes, { query: 'DENTIST', tag: null, unsentOnly: false }).map((n) => n.title)).toEqual(['Call'])
    expect(filterNotes(notes, { query: 'perche', tag: null, unsentOnly: false }).map((n) => n.title)).toEqual(['Idea'])
    expect(filterNotes(notes, { query: 'oat bread', tag: null, unsentOnly: false })).toHaveLength(1)
  })

  it('filters by tag and by not-yet-sent', () => {
    expect(filterNotes(notes, { query: '', tag: 'work', unsentOnly: false }).map((n) => n.title)).toEqual(['Idea'])
    expect(filterNotes(notes, { query: '', tag: null, unsentOnly: true }).map((n) => n.title)).toEqual(['Groceries', 'Call'])
  })

  it('handles 1000 notes quickly', () => {
    const many = Array.from({ length: 1000 }, (_, i) => note({ text: `note number ${i} `.repeat(200) }))
    const t0 = performance.now()
    filterNotes(many, { query: 'number 999', tag: null, unsentOnly: false })
    expect(performance.now() - t0).toBeLessThan(200)
  })

  it('collects tags and makes snippets around the match', () => {
    expect(allTags(notes)).toEqual(['home', 'work'])
    const long = `${'a '.repeat(200)}needle ${'b '.repeat(200)}`
    expect(snippet(long, 'needle')).toContain('needle')
  })
})
