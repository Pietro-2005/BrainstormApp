import { describe, expect, it } from 'vitest'
import { cleanSegments, collapseRepeats, segmentsToText } from './transcript'

describe('transcript cleanup', () => {
  it('collapses a phrase repeated many times', () => {
    expect(collapseRepeats('so I think I think I think I think we should go')).toBe('so I think we should go')
    expect(collapseRepeats('no no no no no')).toBe('no')
    expect(collapseRepeats('very very good')).toBe('very very good')
  })

  it('drops identical consecutive lines and non-speech tags', () => {
    const out = cleanSegments([
      { start: 0, end: 2, text: ' Hello there. ' },
      { start: 2, end: 4, text: 'Hello there.' },
      { start: 4, end: 5, text: '[Music]' },
      { start: 5, end: 6, text: 'Sottotitoli creati dalla comunità Amara.org' },
      { start: 6, end: 8, text: 'General Kenobi.' },
      { start: 8, end: 9, text: 'Hello there!' },
    ])
    expect(out.map((s) => s.text)).toEqual(['Hello there.', 'General Kenobi.', 'Hello there!'])
  })

  it('joins segments and breaks paragraphs at long pauses', () => {
    expect(
      segmentsToText([
        { start: 0, end: 2, text: 'One.' },
        { start: 2.2, end: 4, text: 'Two.' },
        { start: 9, end: 10, text: 'Three.' },
      ]),
    ).toBe('One. Two.\n\nThree.')
  })

  it('skips lines the user emptied', () => {
    expect(
      segmentsToText([
        { start: 0, end: 1, text: 'Keep.' },
        { start: 1, end: 2, text: '  ' },
        { start: 2, end: 3, text: 'This.' },
      ]),
    ).toBe('Keep. This.')
  })
})
