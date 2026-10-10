import { db, newNote, updateNote } from '../db/db'
import { isIOS, isWebKit } from './device'

export type RecorderPhase = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopping'

export interface RecorderState {
  phase: RecorderPhase
  noteId: string | null
  elapsedMs: number
  /** False when the screen could not be kept awake (unsupported or refused). */
  wakeLock: boolean
  error: string | null
  warning: string | null
  /** The last finished recording, for the "Saved" link. */
  lastSaved: { noteId: string; durationMs: number } | null
}

const TIMESLICE_MS = 1000

/** Safari records MP4/AAC; Chrome and Firefox record WebM/Opus. */
export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = isWebKit
    ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t))
}

export function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return micBlockedHelp()
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found on this device.'
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'The microphone is busy (another app or a call is using it). Close that and try again.'
  return `Could not start the microphone: ${err instanceof Error ? err.message : String(err)}`
}

export function micBlockedHelp(): string {
  if (isIOS)
    return 'Microphone access is blocked. In Safari, tap “aA” in the address bar → Website Settings → Microphone → Allow, then reload. For the home-screen app, open the Settings app → Apps → Safari → Microphone.'
  if (/Android/.test(navigator.userAgent))
    return 'Microphone access is blocked. Tap the icon left of the address bar → Permissions → Microphone → Allow, then reload the page.'
  return 'Microphone access is blocked. Click the icon left of the address bar → Site settings → Microphone → Allow, then reload the page.'
}

class Recorder {
  private state: RecorderState = {
    phase: 'idle',
    noteId: null,
    elapsedMs: 0,
    wakeLock: true,
    error: null,
    warning: null,
    lastSaved: null,
  }
  private listeners = new Set<() => void>()

  private stream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private seq = 0
  private writes: Promise<unknown> = Promise.resolve()
  private writeFailed = false
  private accumulatedMs = 0
  private resumedAt = 0
  private ticker = 0
  private wakeLockSentinel: WakeLockSentinel | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private levelBuffer: Float32Array<ArrayBuffer> | null = null
  private hiddenAt = 0
  private releaseLock: (() => void) | null = null
  private finalizing: string | null = null

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.state

  private set(patch: Partial<RecorderState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  dismissMessages() {
    this.set({ error: null, warning: null })
  }

  /** Current input level, 0..1, for the meter. Read it every animation frame. */
  getLevel(): number {
    if (!this.analyser || !this.levelBuffer || this.state.phase !== 'recording') return 0
    this.analyser.getFloatTimeDomainData(this.levelBuffer)
    let sum = 0
    for (const v of this.levelBuffer) sum += v * v
    const rms = Math.sqrt(sum / this.levelBuffer.length)
    const db = 20 * Math.log10(rms || 1e-8)
    return Math.min(1, Math.max(0, (db + 60) / 50))
  }

  private elapsed() {
    return this.accumulatedMs + (this.state.phase === 'recording' ? performance.now() - this.resumedAt : 0)
  }

  async start() {
    if (this.state.phase !== 'idle') return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.set({ error: 'This browser cannot record audio. Open the app over HTTPS in Chrome or Safari.' })
      return
    }
    this.set({ phase: 'requesting', error: null, warning: null, lastSaved: null, elapsedMs: 0 })

    // Create the AudioContext inside the tap, before any await, so iOS lets it run.
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.audioCtx = AudioCtx ? new AudioCtx() : null

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      this.cleanup()
      this.set({ phase: 'idle', error: micErrorMessage(err) })
      return
    }

    const mimeType = pickMimeType()
    try {
      this.mediaRecorder = new MediaRecorder(this.stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64_000,
      })
    } catch (err) {
      this.cleanup()
      this.set({ phase: 'idle', error: `Recording is not supported here: ${(err as Error).message}` })
      return
    }

    const note = newNote({
      mimeType: this.mediaRecorder.mimeType || mimeType || 'audio/webm',
      source: 'recording',
      status: 'recording',
    })
    await db.notes.add(note)
    this.seq = 0
    this.writeFailed = false
    this.writes = Promise.resolve()

    // A held lock tells startup recovery (in this or another tab) that this note is live.
    if (navigator.locks) {
      navigator.locks.request(`recording-${note.id}`, () => new Promise<void>((resolve) => (this.releaseLock = resolve)))
    }

    const rec = this.mediaRecorder
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.saveChunk(note.id, e.data)
    }
    rec.onstop = () => void this.finalize(note.id)
    rec.onerror = (e) => {
      const message = (e as Event & { error?: DOMException }).error?.message ?? 'unknown error'
      this.set({ warning: `The recorder reported an error (${message}). Audio saved so far is kept.` })
    }

    const track = this.stream.getAudioTracks()[0]
    track.onended = () => {
      this.set({
        warning:
          'Recording stopped because the microphone was taken away (a call, another app, or the screen locking). Everything up to that point is saved.',
      })
      this.stop()
    }
    track.onmute = () => {
      if (this.state.phase === 'recording')
        this.set({ warning: 'The microphone was interrupted (a call or another app). Recording resumes when it comes back.' })
    }

    this.startMeter()
    rec.start(TIMESLICE_MS)
    this.accumulatedMs = 0
    this.resumedAt = performance.now()
    this.set({ phase: 'recording', noteId: note.id })
    if (rec.mimeType && rec.mimeType !== note.mimeType) await updateNote(note.id, { mimeType: rec.mimeType })

    this.ticker = window.setInterval(() => this.set({ elapsedMs: this.elapsed() }), 250)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    await this.acquireWakeLock()
  }

  private saveChunk(noteId: string, data: Blob) {
    const seq = this.seq++
    const durationMs = Math.round(this.elapsed())
    // Writes are chained so chunks land in order and finalize can wait for all of them.
    this.writes = this.writes.then(async () => {
      try {
        await db.transaction('rw', db.audioChunks, db.notes, async () => {
          await db.audioChunks.add({ noteId, seq, data })
          await db.notes.update(noteId, { durationMs, updatedAt: Date.now() })
        })
      } catch (err) {
        if (this.writeFailed) return
        this.writeFailed = true
        this.set({
          error: `Could not save audio (${(err as Error).name === 'QuotaExceededError' ? 'storage is full' : (err as Error).message}). Recording stopped; audio saved before this point is kept.`,
        })
        this.stop()
      }
    })
  }

  pause() {
    if (this.state.phase !== 'recording' || this.mediaRecorder?.state !== 'recording') return
    this.mediaRecorder.pause()
    // Flush what we have so a crash while paused loses nothing.
    try {
      this.mediaRecorder.requestData()
    } catch {
      // Older Safari: the data arrives with the next chunk instead.
    }
    this.accumulatedMs += performance.now() - this.resumedAt
    this.set({ phase: 'paused', elapsedMs: this.accumulatedMs })
  }

  resume() {
    if (this.state.phase !== 'paused' || this.mediaRecorder?.state !== 'paused') return
    this.mediaRecorder.resume()
    this.resumedAt = performance.now()
    this.set({ phase: 'recording', warning: null })
  }

  stop() {
    const rec = this.mediaRecorder
    if (!rec || this.state.phase === 'stopping' || this.state.phase === 'idle') return
    if (this.state.phase === 'recording') this.accumulatedMs += performance.now() - this.resumedAt
    this.set({ phase: 'stopping', elapsedMs: this.accumulatedMs })
    if (rec.state !== 'inactive') rec.stop()
    else void this.finalize(this.state.noteId!)
  }

  private async finalize(noteId: string) {
    // The recorder can stop on its own (mic lost) and via stop(); finish once.
    if (this.state.noteId !== noteId || this.finalizing === noteId) return
    this.finalizing = noteId
    if (this.state.phase === 'recording') {
      this.accumulatedMs += performance.now() - this.resumedAt
      this.set({ phase: 'stopping' })
    }
    await this.writes
    const durationMs = Math.round(this.accumulatedMs)
    const chunks = await db.audioChunks.where('noteId').equals(noteId).count()
    if (chunks === 0) {
      await db.notes.delete(noteId)
      this.finalizing = null
      this.cleanup()
      this.set({ phase: 'idle', noteId: null, elapsedMs: 0 })
      return
    }
    await updateNote(noteId, { status: 'queued', durationMs })
    this.finalizing = null
    this.cleanup()
    this.set({ phase: 'idle', noteId: null, elapsedMs: 0, lastSaved: { noteId, durationMs } })
  }

  private cleanup() {
    window.clearInterval(this.ticker)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.stream?.getTracks().forEach((t) => {
      t.onended = null
      t.onmute = null
      t.stop()
    })
    this.stream = null
    this.mediaRecorder = null
    this.analyser = null
    this.levelBuffer = null
    void this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
    void this.wakeLockSentinel?.release().catch(() => {})
    this.wakeLockSentinel = null
    this.releaseLock?.()
    this.releaseLock = null
  }

  private startMeter() {
    if (!this.audioCtx || !this.stream) return
    try {
      const source = this.audioCtx.createMediaStreamSource(this.stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 1024
      this.levelBuffer = new Float32Array(this.analyser.fftSize)
      source.connect(this.analyser)
      void this.audioCtx.resume()
    } catch {
      // The meter is a nice-to-have; recording works without it.
      this.analyser = null
    }
  }

  private async acquireWakeLock() {
    if (!('wakeLock' in navigator)) {
      this.set({ wakeLock: false })
      return
    }
    try {
      this.wakeLockSentinel = await navigator.wakeLock.request('screen')
      this.set({ wakeLock: true })
    } catch {
      this.set({ wakeLock: false })
    }
  }

  private onVisibilityChange = () => {
    const active = this.state.phase === 'recording' || this.state.phase === 'paused'
    if (!active) return
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = performance.now()
      return
    }
    // The browser drops the wake lock when the page is hidden; take it again.
    void this.acquireWakeLock()
    void this.audioCtx?.resume()
    const awaySeconds = Math.round((performance.now() - this.hiddenAt) / 1000)
    const track = this.stream?.getAudioTracks()[0]
    if (track?.muted || track?.readyState === 'ended') {
      this.set({ warning: 'The microphone was interrupted while the app was in the background. Audio before that is saved.' })
    } else if (isIOS && awaySeconds >= 2) {
      this.set({
        warning: `The app was in the background for ${awaySeconds}s. On iPhone, recording can pause while the screen is locked or another app is open — keep this screen open.`,
      })
    }
  }
}

export const recorder = new Recorder()

/**
 * Notes still marked "recording" when the app opens were cut off (tab killed, crash, phone off).
 * Their chunks are already in IndexedDB, so queue them for transcription instead of losing them.
 */
export async function recoverUnfinishedRecordings(): Promise<number> {
  const held = new Set<string>()
  if (navigator.locks?.query) {
    const snapshot = await navigator.locks.query()
    for (const lock of snapshot.held ?? []) if (lock.name) held.add(lock.name)
  }
  const orphans = (await db.notes.where('status').equals('recording').toArray()).filter(
    (n) => n.id !== recorder.getSnapshot().noteId && !held.has(`recording-${n.id}`),
  )
  let recovered = 0
  for (const note of orphans) {
    const chunks = await db.audioChunks.where('noteId').equals(note.id).count()
    if (chunks === 0) {
      await db.notes.delete(note.id)
    } else {
      await updateNote(note.id, { status: 'queued', recovered: true })
      recovered++
    }
  }
  return recovered
}

/** Store an imported audio file as a note, queued for transcription. */
export async function importAudioFile(file: File): Promise<string> {
  const mimeType = file.type || guessMimeFromName(file.name)
  const note = newNote({
    mimeType,
    source: 'import',
    status: 'queued',
    title: file.name.replace(/\.[^.]+$/, ''),
    durationMs: await probeDuration(file),
  })
  await db.transaction('rw', db.notes, db.audioChunks, async () => {
    await db.notes.add(note)
    await db.audioChunks.add({ noteId: note.id, seq: 0, data: new Blob([file], { type: mimeType }) })
  })
  return note.id
}

function guessMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    flac: 'audio/flac',
  }
  return map[ext ?? ''] ?? 'audio/mpeg'
}

/** Duration from the media element's metadata; 0 if the browser can't tell (it's fixed after decoding). */
function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio()
    const url = URL.createObjectURL(blob)
    const done = (ms: number) => {
      URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      resolve(Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0)
    }
    const timer = window.setTimeout(() => done(0), 5000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer)
      done(audio.duration * 1000)
    }
    audio.onerror = () => {
      window.clearTimeout(timer)
      done(0)
    }
    audio.src = url
  })
}
