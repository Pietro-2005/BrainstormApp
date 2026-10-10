import { describe, expect, it } from 'vitest'
import { planWindows, speechSpans, toOriginalTime, windowAudio } from './audio-plan'

const SR = 16000

/** Speech-like tone or near-silent noise, joined in order. */
function audio(parts: [kind: 'speech' | 'silence', seconds: number][]): Float32Array {
  const total = parts.reduce((s, [, sec]) => s + Math.round(sec * SR), 0)
  const out = new Float32Array(total)
  let i = 0
  let seed = 1
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.002
  for (const [kind, sec] of parts) {
    for (let n = 0; n < Math.round(sec * SR); n++, i++) {
      // Syllable-like amplitude wobble keeps it from being a flat tone.
      out[i] = kind === 'speech' ? 0.2 * Math.sin((2 * Math.PI * 180 * n) / SR) * (0.6 + 0.4 * Math.sin(n / 800)) : noise()
    }
  }
  return out
}

const seconds = (n: number) => n / SR

describe('speechSpans', () => {
  it('cuts long silences but keeps padding around speech', () => {
    const spans = speechSpans(audio([['speech', 3], ['silence', 5], ['speech', 3]]), SR)
    expect(spans).toHaveLength(2)
    expect(seconds(spans[0].start)).toBe(0)
    expect(seconds(spans[0].end)).toBeCloseTo(3.3, 1)
    expect(seconds(spans[1].start)).toBeCloseTo(7.7, 1)
    expect(seconds(spans[1].end)).toBeCloseTo(11, 1)
  })

  it('keeps short pauses inside speech', () => {
    expect(speechSpans(audio([['speech', 2], ['silence', 0.8], ['speech', 2]]), SR)).toHaveLength(1)
  })

  it('returns nothing for silence', () => {
    expect(speechSpans(audio([['silence', 20]]), SR)).toEqual([])
    expect(planWindows(audio([['silence', 20]]), SR)).toEqual([])
  })

  it('keeps a short word at the very start', () => {
    const spans = speechSpans(audio([['speech', 0.3], ['silence', 4], ['speech', 2]]), SR)
    expect(spans).toHaveLength(2)
  })
})

describe('planWindows', () => {
  it('splits long continuous speech into windows under 30 s, losing nothing', () => {
    const samples = audio([['speech', 70]])
    const windows = planWindows(samples, SR)
    expect(windows.length).toBe(3)
    for (const w of windows) expect(seconds(w.length)).toBeLessThanOrEqual(28)
    expect(seconds(windows.reduce((s, w) => s + w.length, 0))).toBeCloseTo(70, 3)
    // Windows are contiguous and in order.
    expect(windows[1].spans[0].start).toBe(windows[0].spans.at(-1)!.end)
  })

  it('closes a full window at a silence instead of cutting through speech', () => {
    const windows = planWindows(audio([['speech', 20], ['silence', 2], ['speech', 20]]), SR)
    expect(windows).toHaveLength(2)
    expect(windows[0].spans).toHaveLength(1)
    expect(seconds(windows[0].spans[0].end)).toBeCloseTo(20.3, 1)
  })

  it('packs several short notes into one window and maps time back to the original', () => {
    const samples = audio([['speech', 3], ['silence', 5], ['speech', 3]])
    const [w, ...rest] = planWindows(samples, SR)
    expect(rest).toHaveLength(0)
    expect(windowAudio(samples, w).length).toBe(w.length)
    expect(toOriginalTime(w, 1, SR)).toBeCloseTo(1, 3)
    // 3.3 s of the first span, then 1 s into the second span (which starts at 7.7 s).
    expect(toOriginalTime(w, 4.3, SR)).toBeCloseTo(8.7, 1)
    expect(toOriginalTime(w, 999, SR)).toBeCloseTo(11, 1)
  })
})
