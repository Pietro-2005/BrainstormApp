import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { getNoteAudio } from '../db/db'
import { formatDuration } from '../lib/format'
import { Icon } from './Icon'

export interface AudioPlayerHandle {
  seek(seconds: number, play?: boolean): void
}

/**
 * Plays a note's stored audio. Uses the recorded duration for the scrubber because
 * MediaRecorder WebM files report an unknown (Infinity) duration in Chrome.
 */
export function AudioPlayer({
  noteId,
  durationMs,
  chunkCount,
  onTime,
  ref,
}: {
  noteId: string
  durationMs: number
  /** Changes when new audio is saved, so the player reloads. */
  chunkCount?: number
  onTime?: (seconds: number) => void
  ref?: Ref<AudioPlayerHandle>
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    void getNoteAudio(noteId).then((blob) => {
      if (cancelled) return
      if (!blob) {
        setMissing(true)
        return
      }
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [noteId, chunkCount])

  const duration = mediaDuration || durationMs / 1000

  useImperativeHandle(ref, () => ({
    seek(seconds, play = true) {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = Math.max(0, seconds)
      setTime(audio.currentTime)
      if (play) void audio.play().catch(() => {})
    },
  }))

  if (missing) return <p className="text-sm text-stone-500 dark:text-stone-400">Audio deleted.</p>

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-200/60 dark:bg-stone-900 dark:ring-stone-800">
      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime)
          onTime?.(e.currentTarget.currentTime)
        }}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setMediaDuration(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setMediaDuration(e.currentTarget.duration)}
        onError={() => setError('This browser cannot play this audio format. The transcript is unaffected.')}
      />
      <button
        type="button"
        disabled={!url}
        onClick={() => {
          const a = audioRef.current
          if (!a) return
          if (a.paused) void a.play().catch((err) => setError(`Playback failed: ${err.message}`))
          else a.pause()
        }}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-50"
      >
        <Icon name={playing ? 'pause' : 'play'} className={`size-5 ${playing ? '' : 'fill-current'}`} />
      </button>
      <div className="min-w-0 flex-1">
        {error ? (
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.1)}
              step={0.1}
              value={Math.min(time, duration || time)}
              onChange={(e) => {
                const a = audioRef.current
                if (a) a.currentTime = Number(e.target.value)
                setTime(Number(e.target.value))
              }}
              aria-label="Position"
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs tabular-nums text-stone-500 dark:text-stone-400">
              <span>{formatDuration(time * 1000)}</span>
              <span>{formatDuration(duration * 1000)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
