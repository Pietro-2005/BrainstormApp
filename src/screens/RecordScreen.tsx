import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { Screen } from '../components/Layout'
import { Icon } from '../components/Icon'
import { Banner } from '../components/Banner'
import { micBlockedHelp, recorder } from '../lib/recorder'
import { formatDuration } from '../lib/format'
import { isIOS } from '../lib/device'

const BARS = 32

function LevelMeter({ active }: { active: boolean }) {
  const barsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bars = barsRef.current ? Array.from(barsRef.current.children as HTMLCollectionOf<HTMLElement>) : []
    const history = new Array<number>(BARS).fill(0)
    let smoothed = 0
    let frame = 0
    let last = 0
    const draw = (t: number) => {
      frame = requestAnimationFrame(draw)
      if (t - last < 50) return
      last = t
      const level = recorder.getLevel()
      smoothed = Math.max(level, smoothed * 0.7)
      history.shift()
      history.push(smoothed)
      bars.forEach((bar, i) => {
        bar.style.transform = `scaleY(${Math.max(0.06, history[i])})`
      })
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div
      ref={barsRef}
      className={`flex h-14 w-full max-w-xs items-center justify-center gap-1 transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}
      aria-hidden="true"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <div key={i} className="h-full w-1.5 origin-center rounded-full bg-accent" style={{ transform: 'scaleY(0.06)' }} />
      ))}
    </div>
  )
}

function useMicPermission() {
  const [state, setState] = useState<PermissionState | 'unknown'>('unknown')
  useEffect(() => {
    let status: PermissionStatus | null = null
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s
        setState(s.state)
        s.onchange = () => setState(s.state)
      })
      .catch(() => {})
    return () => {
      if (status) status.onchange = null
    }
  }, [])
  return state
}

export function RecordScreen() {
  const state = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot)
  const permission = useMicPermission()
  const { phase } = state
  const active = phase === 'recording' || phase === 'paused'
  const busy = phase === 'requesting' || phase === 'stopping'

  const onMainButton = () => {
    if (phase === 'idle') void recorder.start()
    else if (active) recorder.stop()
  }

  return (
    <Screen title="Record">
      <div className="space-y-3">
        {state.error && <Banner tone="error" message={state.error} onDismiss={() => recorder.dismissMessages()} />}
        {!state.error && permission === 'denied' && phase === 'idle' && <Banner tone="error" message={micBlockedHelp()} />}
        {state.warning && <Banner tone="warning" message={state.warning} onDismiss={() => recorder.dismissMessages()} />}
      </div>

      <div className="flex flex-col items-center gap-6 pt-10">
        <div
          className={`text-6xl font-light tabular-nums tracking-tight ${phase === 'paused' ? 'animate-pulse text-stone-400' : ''}`}
          role="timer"
          aria-live="off"
        >
          {formatDuration(state.elapsedMs)}
        </div>

        <LevelMeter active={phase === 'recording'} />

        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={onMainButton}
            disabled={busy}
            aria-label={active ? 'Stop and save' : 'Start recording'}
            className={`flex size-36 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-60 ${
              active ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:bg-accent-strong'
            }`}
          >
            {active ? <Icon name="stop" className="size-14 fill-current" /> : <Icon name="mic" className="size-16" />}
          </button>
          {active && (
            <button
              type="button"
              onClick={() => (phase === 'paused' ? recorder.resume() : recorder.pause())}
              aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
              className="absolute left-full ml-6 flex size-16 items-center justify-center rounded-full bg-stone-200 text-stone-800 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
            >
              <Icon name={phase === 'paused' ? 'play' : 'pause'} className="size-7" />
            </button>
          )}
        </div>

        <p className="max-w-xs text-center text-sm text-stone-500 dark:text-stone-400">
          {phase === 'idle' && 'Tap to record. Your browser will ask for the microphone; audio stays on this device.'}
          {phase === 'requesting' && 'Waiting for microphone permission…'}
          {phase === 'recording' && 'Recording. Tap the square to stop and save.'}
          {phase === 'paused' && 'Paused. Tap play to continue, or the square to save.'}
          {phase === 'stopping' && 'Saving…'}
        </p>

        {active && (
          <p className="max-w-xs text-center text-xs text-stone-500 dark:text-stone-400">
            {state.wakeLock ? 'The screen stays on while recording.' : 'Keep the screen on: this browser could not do it for you.'}
            {isIOS && ' On iPhone, locking the phone or switching apps can stop the recording.'}
          </p>
        )}

        {phase === 'idle' && state.lastSaved && (
          <Link
            to={`/notes/${state.lastSaved.noteId}`}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium shadow-sm dark:bg-stone-900"
          >
            <Icon name="check" className="size-4 text-green-600" />
            Saved {formatDuration(state.lastSaved.durationMs)}. Open note
          </Link>
        )}
      </div>
    </Screen>
  )
}
