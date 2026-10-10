import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE } from '../db/settings'
import { normalizeTag, noteFilename, renderNote } from './template'

const note = {
  title: 'Call the dentist',
  createdAt: new Date(2026, 9, 11, 14, 5).getTime(),
  durationMs: 95_000,
  tags: ['todo', 'health'],
  text: 'Call the dentist tomorrow.\n\nAlso buy oat milk.',
}

describe('renderNote', () => {
  it('fills the default template', () => {
    expect(renderNote(DEFAULT_TEMPLATE, note)).toBe(
      '## Call the dentist\n\n*2026-10-11 14:05 · 1:35* #todo #health\n\nCall the dentist tomorrow.\n\nAlso buy oat milk.\n',
    )
  })

  it('leaves no trailing spaces when there are no tags', () => {
    expect(renderNote(DEFAULT_TEMPLATE, { ...note, tags: [] })).toContain('*2026-10-11 14:05 · 1:35*\n')
  })

  it('supports custom templates and repeated or unknown placeholders', () => {
    expect(renderNote('{title} / {title} / {unknown}\n{text}', { ...note, text: 'hi' })).toBe(
      'Call the dentist / Call the dentist / {unknown}\nhi\n',
    )
  })
})

describe('noteFilename / normalizeTag', () => {
  it('makes safe file names', () => {
    expect(noteFilename({ ...note, title: 'Q3: plan / budget?' })).toBe('2026-10-11 Q3 plan budget.md')
    expect(noteFilename({ ...note, title: '' }, 'webm')).toBe('2026-10-11 Voice note.webm')
  })
  it('normalizes tags', () => {
    expect(normalizeTag(' #Work Ideas ')).toBe('work-ideas')
    expect(normalizeTag('perché!')).toBe('perché')
  })
})
