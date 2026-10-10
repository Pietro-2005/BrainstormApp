import { useLayoutEffect, useRef } from 'react'
import type { Segment } from '../db/db'
import { formatDuration } from '../lib/format'

/** A textarea that grows with its content, so lines read like plain text. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

/**
 * The transcript as timestamped lines. Tapping a time plays the audio from there;
 * each line can be corrected in place, so fixes stay next to the audio they came from.
 */
export function TranscriptEditor({
  segments,
  currentTime,
  canSeek,
  readOnly,
  onSeek,
  onChange,
}: {
  segments: Segment[]
  currentTime: number | null
  canSeek: boolean
  readOnly: boolean
  onSeek: (seconds: number) => void
  onChange: (segments: Segment[]) => void
}) {
  const activeIndex =
    currentTime === null ? -1 : segments.findLastIndex((s) => s.start <= currentTime + 0.05 && s.text.trim() !== '')

  return (
    <ol className="space-y-1">
      {segments.map((seg, i) => {
        const active = i === activeIndex
        const newParagraph = i > 0 && seg.start - segments[i - 1].end >= 2.5
        return (
          <li
            key={i}
            className={`flex gap-2 rounded-lg px-1 transition-colors ${newParagraph ? 'mt-3' : ''} ${
              active ? 'bg-accent-soft/70 dark:bg-accent/15' : ''
            }`}
          >
            <button
              type="button"
              disabled={!canSeek}
              onClick={() => onSeek(seg.start)}
              className="mt-1 shrink-0 self-start rounded px-1.5 py-0.5 text-xs font-medium tabular-nums text-accent hover:bg-accent-soft disabled:text-stone-400 disabled:hover:bg-transparent dark:hover:bg-accent/20"
              aria-label={`Play from ${formatDuration(seg.start * 1000)}`}
            >
              {formatDuration(seg.start * 1000)}
            </button>
            <AutoTextarea
              value={seg.text}
              readOnly={readOnly}
              onChange={(e) => onChange(segments.map((s, j) => (j === i ? { ...s, text: e.target.value.replace(/\n/g, ' ') } : s)))}
              className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-0.5 leading-relaxed outline-none focus:rounded focus:bg-white focus:ring-1 focus:ring-stone-300 dark:focus:bg-stone-900 dark:focus:ring-stone-700"
              aria-label={`Transcript line at ${formatDuration(seg.start * 1000)}`}
            />
          </li>
        )
      })}
    </ol>
  )
}
