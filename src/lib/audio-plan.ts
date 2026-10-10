/**
 * Splits 16 kHz mono audio into windows Whisper can handle (≤ 30 s), after cutting
 * out long silences (where Whisper tends to invent text). Every window remembers which
 * stretches of the original audio it contains, so timestamps map back exactly.
 */

export interface Span {
  /** Sample index in the original audio. */
  start: number
  end: number
}

export interface Window {
  spans: Span[]
  /** Total samples across spans. */
  length: number
}

export interface PlanOptions {
  frameSeconds: number
  /** Silences at least this long are cut out. */
  minSilenceSeconds: number
  /** Silence kept on each side of speech so words are not clipped. */
  padSeconds: number
  maxWindowSeconds: number
  /** A window this full is closed at a silence instead of cutting through speech. */
  minFillSeconds: number
  /** How far back from the window limit to look for a quiet cut point inside speech. */
  cutSearchSeconds: number
}

export const DEFAULT_PLAN: PlanOptions = {
  frameSeconds: 0.03,
  minSilenceSeconds: 1.5,
  padSeconds: 0.3,
  maxWindowSeconds: 28,
  minFillSeconds: 18,
  cutSearchSeconds: 8,
}

export function frameRms(samples: Float32Array, frame: number): Float32Array {
  const n = Math.ceil(samples.length / frame)
  const out = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    const start = f * frame
    const end = Math.min(samples.length, start + frame)
    let sum = 0
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    out[f] = Math.sqrt(sum / Math.max(1, end - start))
  }
  return out
}

/** Energy below this counts as silence: a few times the noise floor, within sane bounds. */
export function silenceThreshold(rms: Float32Array): number {
  if (rms.length === 0) return 0
  const sorted = Float32Array.from(rms).sort()
  const noiseFloor = sorted[Math.floor(sorted.length * 0.1)]
  return Math.min(0.015, Math.max(0.004, noiseFloor * 3))
}

/** The parts of the audio worth transcribing, with long silences removed. */
export function speechSpans(samples: Float32Array, sampleRate: number, opts: PlanOptions = DEFAULT_PLAN): Span[] {
  const frame = Math.max(1, Math.round(opts.frameSeconds * sampleRate))
  const rms = frameRms(samples, frame)
  const threshold = silenceThreshold(rms)
  const minSilentFrames = Math.ceil(opts.minSilenceSeconds / opts.frameSeconds)
  const pad = Math.round(opts.padSeconds * sampleRate)

  // Find long silent runs and cut their middles.
  const cuts: Span[] = []
  let runStart = -1
  for (let f = 0; f <= rms.length; f++) {
    const silent = f < rms.length && rms[f] < threshold
    if (silent && runStart < 0) runStart = f
    if (!silent && runStart >= 0) {
      if (f - runStart >= minSilentFrames) {
        const start = runStart === 0 ? 0 : runStart * frame + pad
        const end = f === rms.length ? samples.length : f * frame - pad
        if (end > start) cuts.push({ start, end })
      }
      runStart = -1
    }
  }

  const spans: Span[] = []
  let cursor = 0
  for (const cut of cuts) {
    if (cut.start > cursor) spans.push({ start: cursor, end: cut.start })
    cursor = Math.max(cursor, cut.end)
  }
  if (cursor < samples.length) spans.push({ start: cursor, end: samples.length })

  // Ignore spans with too little sound to be a word (a click, a bump).
  const minVoicedFrames = Math.ceil(0.15 / opts.frameSeconds)
  return spans.filter((s) => {
    let voiced = 0
    for (let f = Math.floor(s.start / frame); f < Math.ceil(s.end / frame) && voiced < minVoicedFrames; f++)
      if (rms[f] >= threshold) voiced++
    return voiced >= minVoicedFrames
  })
}

/** Sample index of the quietest frame between start and end (used to cut inside long speech). */
function quietestPoint(samples: Float32Array, start: number, end: number, frame: number): number {
  let best = end
  let bestEnergy = Infinity
  for (let s = start; s + frame <= end; s += Math.max(1, frame >> 1)) {
    let sum = 0
    for (let i = s; i < s + frame; i++) sum += samples[i] * samples[i]
    if (sum < bestEnergy) {
      bestEnergy = sum
      best = s + (frame >> 1)
    }
  }
  return best
}

export function planWindows(samples: Float32Array, sampleRate: number, opts: PlanOptions = DEFAULT_PLAN): Window[] {
  const maxLen = Math.floor(opts.maxWindowSeconds * sampleRate)
  const minFill = Math.floor(opts.minFillSeconds * sampleRate)
  const search = Math.floor(opts.cutSearchSeconds * sampleRate)
  const cutFrame = Math.round(0.1 * sampleRate)
  const windows: Window[] = []
  let current: Window = { spans: [], length: 0 }
  const close = () => {
    if (current.length > 0) windows.push(current)
    current = { spans: [], length: 0 }
  }

  for (const span of speechSpans(samples, sampleRate, opts)) {
    let start = span.start
    while (start < span.end) {
      const room = maxLen - current.length
      const remaining = span.end - start
      if (remaining <= room) {
        current.spans.push({ start, end: span.end })
        current.length += remaining
        break
      }
      if (current.length >= minFill) {
        // Close at the silence before this span rather than cutting through speech.
        close()
        continue
      }
      const searchFrom = start + Math.max(Math.floor(room / 3), room - search)
      const cut = quietestPoint(samples, searchFrom, start + room, cutFrame)
      current.spans.push({ start, end: cut })
      current.length += cut - start
      close()
      start = cut
    }
  }
  close()
  return windows
}

/** Copy a window's spans into one contiguous buffer for the model. */
export function windowAudio(samples: Float32Array, window: Window): Float32Array {
  const out = new Float32Array(window.length)
  let offset = 0
  for (const span of window.spans) {
    out.set(samples.subarray(span.start, span.end), offset)
    offset += span.end - span.start
  }
  return out
}

/**
 * Map a time (seconds) inside a window back to seconds in the original audio.
 * An end time that lands in the silence padding at the start of a later span really
 * belongs to the speech before the cut, so it maps to the end of the previous span;
 * otherwise a line would seem to last through the whole removed pause.
 */
export function toOriginalTime(
  window: Window,
  seconds: number,
  sampleRate: number,
  edge: 'start' | 'end' = 'start',
  padSeconds = DEFAULT_PLAN.padSeconds,
): number {
  let target = Math.max(0, Math.round(seconds * sampleRate))
  const pad = Math.round(padSeconds * sampleRate)
  for (let i = 0; i < window.spans.length; i++) {
    const span = window.spans[i]
    const len = span.end - span.start
    if (target <= len) {
      if (edge === 'end' && i > 0 && target <= pad) return window.spans[i - 1].end / sampleRate
      return (span.start + target) / sampleRate
    }
    target -= len
  }
  const last = window.spans[window.spans.length - 1]
  return last ? last.end / sampleRate : 0
}
