import type { Segment } from '../db/db'
import { normalize } from './search'

/** Non-speech tags and caption credits Whisper produces from silence or music. */
const NON_SPEECH = [
  /^[[(][^\])]*[\])]$/, // [Music], (silence), [BLANK_AUDIO]
  /amara\.org/i,
  /^(sottotitoli|subtitles|sous-titres|untertitel|subtítulos)\b.*\b(by|da|par|von|por|creati|réalisés)\b/i,
]

function isNonSpeech(text: string): boolean {
  const t = text.trim()
  return t === '' || NON_SPEECH.some((re) => re.test(t))
}

/** Collapse a phrase repeated 4+ times in a row ("I think I think I think I think") to one copy. */
export function collapseRepeats(text: string, minRepeats = 4): string {
  let words = text.split(/\s+/).filter(Boolean)
  for (let n = 1; n <= 8; n++) {
    const out: string[] = []
    let i = 0
    while (i < words.length) {
      const phrase = words.slice(i, i + n)
      const key = normalize(phrase.join(' ')).replace(/[^\p{L}\p{N} ]/gu, '')
      let reps = 1
      while (
        i + (reps + 1) * n <= words.length &&
        normalize(words.slice(i + reps * n, i + (reps + 1) * n).join(' ')).replace(/[^\p{L}\p{N} ]/gu, '') === key
      )
        reps++
      if (phrase.length === n && reps >= minRepeats && key) {
        out.push(...phrase)
        i += reps * n
      } else {
        out.push(words[i])
        i++
      }
    }
    words = out
  }
  return words.join(' ')
}

/** Drop hallucinated filler and identical consecutive lines, and fix repeated phrases. */
export function cleanSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  let previousKey = ''
  for (const seg of segments) {
    const text = collapseRepeats(seg.text.trim())
    if (isNonSpeech(text)) continue
    const key = normalize(text).replace(/[^\p{L}\p{N}]/gu, '')
    if (!key || key === previousKey) continue
    previousKey = key
    out.push({ start: seg.start, end: Math.max(seg.end, seg.start), text })
  }
  return out
}

/** Plain text from segments, with a paragraph break wherever the speaker paused for a while. */
export function segmentsToText(segments: Segment[], paragraphGapSeconds = 2.5): string {
  let text = ''
  segments.forEach((seg, i) => {
    if (i > 0) text += seg.start - segments[i - 1].end >= paragraphGapSeconds ? '\n\n' : ' '
    text += seg.text
  })
  return text.trim()
}
